// Phase 08 — financial records and their state machine (ADR-022, ADR-013, FIN-009..021).
// Income, Expense and Budget share identical workflow columns, so one generic implementation serves
// all three. Every transition is a conditional update on the current state (and void-request flag), so
// two concurrent actions cannot both win; each writes AuditLog (and FinanceApproval for decisions) in
// the same transaction.
import type { FinanceState, Prisma } from "../../../generated/prisma/client.ts";
import { prisma } from "../../db.ts";
import { ymd } from "../../dates.ts";
import { HttpError } from "../../errors.ts";
import { notify } from "../notifications/notifications.service.ts";
import { ROLE_PERMISSIONS, type Permission } from "../rbac/permissions.ts";
import { audit, hasPermission } from "../rbac/rbac.ts";
import { forTenant, type TenantDb } from "../tenancy/tenant.ts";

export type Kind = "income" | "expense" | "budget";
export const KINDS: readonly Kind[] = ["income", "expense", "budget"];
export type Actor = { organisationId: string; membershipId: string; userId: string };
type Tx = Prisma.TransactionClient;

// ADR-022 §1: the key that creates, edits, submits and copies each record type.
export const CREATE_KEY: Record<Kind, Permission> = {
  income: "finance.income.create",
  expense: "finance.expense.create",
  budget: "finance.budget.manage",
};
const LABEL: Record<Kind, string> = { income: "Income record", expense: "Expense", budget: "Budget" };
const CATEGORY_KIND: Record<Kind, "INCOME" | "EXPENSE"> = { income: "INCOME", expense: "EXPENSE", budget: "EXPENSE" };

export const recordNotFound = (kind: Kind) => new HttpError(404, `${kind.toUpperCase()}_NOT_FOUND`, `${LABEL[kind]} not found`);
const invalidTransition = (kind: Kind, from: string, action: string) =>
  new HttpError(409, "INVALID_STATE_TRANSITION", `Cannot ${action} a ${kind} that is ${from}`);
const notCreator = () => new HttpError(403, "FORBIDDEN", "Only the record's creator can do this while it is a draft");

// Kind-specific input fields (validated at the route).
export type IncomeInput = { amount: number; currency: string; receivedOn: Date; categoryId: string; collectionId: string | null; description: string; reference: string | null };
export type ExpenseInput = { amount: number; currency: string; spentOn: Date; categoryId: string; payee: string | null; description: string; reference: string | null };
export type BudgetInput = { name: string; amount: number; currency: string; periodStart: Date; periodEnd: Date; categoryId: string; description: string };
export type Input = IncomeInput | ExpenseInput | BudgetInput;
const DATA_FIELDS: Record<Kind, readonly string[]> = {
  income: ["amount", "currency", "receivedOn", "categoryId", "collectionId", "description", "reference"],
  expense: ["amount", "currency", "spentOn", "categoryId", "payee", "description", "reference"],
  budget: ["name", "amount", "currency", "periodStart", "periodEnd", "categoryId", "description"],
};
const DATE_FIELDS = ["receivedOn", "spentOn", "periodStart", "periodEnd"] as const;

export type Row = {
  id: string;
  state: FinanceState;
  amount: bigint;
  currency: string;
  categoryId: string;
  createdById: string;
  submittedById: string | null;
  voidRequestedById: string | null;
  voidRequestedAt: Date | null;
  collectionId?: string | null;
  periodStart?: Date;
  periodEnd?: Date;
} & Record<string, unknown>;
type Delegate = {
  findUnique(a: object): Promise<Row | null>;
  findMany(a: object): Promise<Row[]>;
  create(a: object): Promise<Row>;
  updateMany(a: object): Promise<{ count: number }>;
};
export const table = (db: TenantDb, kind: Kind) => ({ income: db.income, expense: db.expense, budget: db.budget })[kind] as unknown as Delegate;

// ADR-011: BIGINT minor units travel as JSON integers (bounded to 10^13, so always safe); DATEs as YYYY-MM-DD.
export function recordView(row: Row) {
  const { organisationId: _o, ...r } = row as Row & { organisationId?: string };
  const out: Record<string, unknown> = { ...r, amount: Number(r.amount), voidRequested: r.voidRequestedAt !== null };
  for (const f of DATE_FIELDS) if (r[f] instanceof Date) out[f] = ymd(r[f] as Date);
  return out;
}
const auditSnapshot = (row: Row) => ({ state: row.state, amount: Number(row.amount), currency: row.currency, voidRequested: row.voidRequestedAt !== null });

export async function loadRecord(db: TenantDb, kind: Kind, id: string) {
  const row = await table(db, kind).findUnique({ where: { id } });
  if (!row) throw recordNotFound(kind);
  return row;
}

// TENANT-006 + ADR-022 §8: references must be in this organisation, active/open, and consistent.
async function checkReferences(db: TenantDb, kind: Kind, data: Partial<Input>, current?: Row) {
  const currency = data.currency ?? current?.currency;
  if (data.categoryId !== undefined) {
    const c = await db.financialCategory.findUnique({ where: { id: data.categoryId }, select: { kind: true, active: true } });
    if (!c || !c.active || c.kind !== CATEGORY_KIND[kind]) {
      throw new HttpError(422, "INVALID_CATEGORY", `Choose an active ${CATEGORY_KIND[kind].toLowerCase()} category of this organisation`);
    }
  }
  if (kind === "income") {
    const collectionId = "collectionId" in data ? (data as IncomeInput).collectionId : (current?.collectionId ?? null);
    if (collectionId && ("collectionId" in data || data.currency !== undefined)) {
      const col = await db.collection.findUnique({ where: { id: collectionId }, select: { status: true, currency: true } });
      if (!col || col.status !== "OPEN" || col.currency !== currency) {
        throw new HttpError(422, "INVALID_COLLECTION", "Choose an open collection of this organisation in the same currency");
      }
    }
  }
  if (kind === "budget") {
    const b = data as Partial<BudgetInput>;
    const start = b.periodStart ?? current?.periodStart;
    const end = b.periodEnd ?? current?.periodEnd;
    if (start && end && end < start) throw new HttpError(400, "VALIDATION_ERROR", "periodEnd must not be before periodStart");
  }
}

const pick = (kind: Kind, src: Record<string, unknown>) => Object.fromEntries(DATA_FIELDS[kind].filter((k) => k in src).map((k) => [k, src[k]]));
const action = (kind: Kind, verb: string) => `finance.${kind}.${verb}`;

async function writeAudit(tx: Tx, actor: Actor, kind: Kind, verb: string, id: string, before: object | undefined, after: object) {
  await audit(tx, actor.organisationId, { actorUserId: actor.userId, action: action(kind, verb), targetType: kind, targetId: id, before, after });
}

// ---- reads ----

export async function list(organisationId: string, kind: Kind, opts: { state?: FinanceState; cursor?: string; limit: number }) {
  const rows = await table(forTenant(organisationId), kind).findMany({
    where: opts.state ? { state: opts.state } : {},
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: opts.limit + 1,
    ...(opts.cursor && { cursor: { id: opts.cursor }, skip: 1 }),
  });
  const page = rows.slice(0, opts.limit);
  return { rows: page, nextCursor: rows.length > opts.limit ? page.at(-1)!.id : null };
}

export async function approvalsOf(organisationId: string, kind: Kind, id: string) {
  const rows = await forTenant(organisationId).financeApproval.findMany({
    where: { recordType: kind, recordId: id },
    select: { id: true, decision: true, actorUserId: true, reason: true, selfApproved: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });
  return rows;
}

// ---- writes ----

export async function create(actor: Actor, kind: Kind, input: Input, copiedFromId: string | null = null) {
  return prisma.$transaction(async (tx) => {
    const db = forTenant(actor.organisationId, tx);
    await checkReferences(db, kind, input);
    const row = await table(db, kind).create({ data: { ...input, amount: BigInt(input.amount), createdById: actor.userId, copiedFromId } });
    await writeAudit(tx, actor, kind, copiedFromId ? "copy" : "create", row.id, undefined, { ...auditSnapshot(row), ...(copiedFromId && { copiedFromId }) });
    return row;
  });
}

// ADR-022 §8: only the creator edits their own DRAFT; the update is conditional on DRAFT.
export async function update(actor: Actor, kind: Kind, id: string, change: Partial<Input>) {
  return prisma.$transaction(async (tx) => {
    const db = forTenant(actor.organisationId, tx);
    const row = await loadRecord(db, kind, id);
    if (row.state !== "DRAFT") throw new HttpError(409, "NOT_EDITABLE", `Only a draft ${kind} can be edited`);
    if (row.createdById !== actor.userId) throw notCreator();
    await checkReferences(db, kind, change, row);
    const data = { ...change, ...(change.amount !== undefined && { amount: BigInt(change.amount) }) };
    const { count } = await table(db, kind).updateMany({ where: { id, state: "DRAFT" }, data });
    if (count === 0) throw new HttpError(409, "NOT_EDITABLE", `Only a draft ${kind} can be edited`);
    const after = await loadRecord(db, kind, id);
    await writeAudit(tx, actor, kind, "update", id, auditSnapshot(row), { ...auditSnapshot(after), fields: Object.keys(change) });
    return after;
  });
}

type Step = { from: FinanceState[]; voidRequested?: boolean; data: Record<string, unknown> };

// The single place a record's workflow columns change.
async function step(tx: Tx, actor: Actor, kind: Kind, row: Row, verb: string, s: Step, extra: object = {}) {
  const db = forTenant(actor.organisationId, tx);
  const where = {
    id: row.id,
    state: { in: s.from },
    ...(s.voidRequested !== undefined && { voidRequestedAt: s.voidRequested ? { not: null } : null }),
  };
  const { count } = await table(db, kind).updateMany({ where, data: s.data });
  if (count === 0) {
    const now = await loadRecord(db, kind, row.id);
    throw invalidTransition(kind, now.voidRequestedAt ? `${now.state} with a pending void request` : now.state, verb.replace("_", " "));
  }
  const after = await loadRecord(db, kind, row.id);
  await writeAudit(tx, actor, kind, verb, row.id, auditSnapshot(row), { ...auditSnapshot(after), ...extra });
  return after;
}

const approvalRequired = (tx: Tx, actor: Actor, kind: Kind, id: string, title: string) =>
  notify(tx, { organisationId: actor.organisationId, actorUserId: actor.userId, type: "finance.approval_required", title, targetType: kind, targetId: id });

// DRAFT → SUBMITTED → PENDING_APPROVAL in one action (ADR-022 §2), both steps audited.
export async function submit(actor: Actor, kind: Kind, id: string) {
  return prisma.$transaction(async (tx) => {
    const row = await loadRecord(forTenant(actor.organisationId, tx), kind, id);
    if (row.state === "DRAFT" && row.createdById !== actor.userId) throw notCreator();
    const now = new Date();
    const submitted = await step(tx, actor, kind, row, "submit", { from: ["DRAFT"], data: { state: "SUBMITTED", submittedById: actor.userId, submittedAt: now } });
    const pending = await step(tx, actor, kind, submitted, "pending_approval", { from: ["SUBMITTED"], data: { state: "PENDING_APPROVAL" } });
    await approvalRequired(tx, actor, kind, id, `${LABEL[kind]} waiting for approval`); // no amounts (ADR-017 §2)
    return pending;
  });
}

// ADR-013: the approver must not be a requester, unless they are the only active member whose roles
// grant finance.approve; then the decision is recorded with selfApproved = true.
const APPROVER_ROLES = Object.entries(ROLE_PERMISSIONS)
  .filter(([role, keys]) => role !== "owner" && keys.includes("finance.approve"))
  .map(([role]) => role) as ("treasurer" | "admin" | "committee" | "staff")[];

async function approverUserIds(tx: Tx, organisationId: string) {
  const org = await tx.organisation.findUniqueOrThrow({ where: { id: organisationId }, select: { ownerId: true } });
  const db = forTenant(organisationId, tx);
  const roleRows = await db.membershipRole.findMany({ where: { role: { in: APPROVER_ROLES } }, select: { membershipId: true } });
  const members = await db.organisationMembership.findMany({ where: { id: { in: roleRows.map((r) => r.membershipId) } }, select: { userId: true } });
  return new Set([org.ownerId, ...members.map((m) => m.userId)]);
}

async function selfApproval(tx: Tx, actor: Actor, requesters: (string | null)[]) {
  if (!requesters.includes(actor.userId)) return false;
  const approvers = await approverUserIds(tx, actor.organisationId);
  if (approvers.size === 1 && approvers.has(actor.userId)) return true;
  throw new HttpError(403, "SELF_APPROVAL_NOT_ALLOWED", "Another approver must decide on a request you made (ADR-013)");
}

async function recordDecision(tx: Tx, actor: Actor, kind: Kind, id: string, decision: "APPROVED" | "REJECTED" | "VOID_APPROVED" | "VOID_REJECTED", reason: string | null, selfApproved: boolean) {
  await forTenant(actor.organisationId, tx).financeApproval.create({
    data: { recordType: kind, recordId: id, decision, actorUserId: actor.userId, reason, selfApproved } as Prisma.FinanceApprovalUncheckedCreateInput,
  });
}

export async function decide(actor: Actor, kind: Kind, id: string, approve: boolean, reason: string | null) {
  return prisma.$transaction(async (tx) => {
    const row = await loadRecord(forTenant(actor.organisationId, tx), kind, id);
    if (row.state !== "PENDING_APPROVAL") throw invalidTransition(kind, row.state, approve ? "approve" : "reject");
    const selfApproved = await selfApproval(tx, actor, [row.createdById, row.submittedById]);
    const after = await step(tx, actor, kind, row, approve ? "approve" : "reject", {
      from: ["PENDING_APPROVAL"],
      data: { state: approve ? "APPROVED" : "REJECTED", decidedById: actor.userId, decidedAt: new Date() },
    }, { reason, selfApproved });
    await recordDecision(tx, actor, kind, id, approve ? "APPROVED" : "REJECTED", reason, selfApproved);
    return after;
  });
}

// ADR-022 §2: DRAFT / PENDING_APPROVAL → VOIDED directly, with a reason, by the creator (holding the
// create key) or a holder of finance.void.
export async function voidDirect(actor: Actor, kind: Kind, id: string, reason: string) {
  return prisma.$transaction(async (tx) => {
    const row = await loadRecord(forTenant(actor.organisationId, tx), kind, id);
    const allowed =
      (await hasPermission(actor, "finance.void", tx)) || (row.createdById === actor.userId && (await hasPermission(actor, CREATE_KEY[kind], tx)));
    if (!allowed) throw new HttpError(403, "FORBIDDEN", "Only the creator or a member with finance.void can cancel this record");
    if (row.state === "APPROVED") throw new HttpError(409, "VOID_REQUEST_REQUIRED", "An approved record is voided through a void request");
    return step(tx, actor, kind, row, "void", { from: ["DRAFT", "PENDING_APPROVAL"], data: { state: "VOIDED", voidReason: reason, voidedAt: new Date() } }, { reason });
  });
}

// APPROVED → void requested (finance.void, reason required). The record stays APPROVED until decided.
export async function requestVoid(actor: Actor, kind: Kind, id: string, reason: string) {
  return prisma.$transaction(async (tx) => {
    const row = await loadRecord(forTenant(actor.organisationId, tx), kind, id);
    const after = await step(tx, actor, kind, row, "void_request", {
      from: ["APPROVED"],
      voidRequested: false,
      data: { voidRequestedById: actor.userId, voidRequestedAt: new Date(), voidReason: reason },
    }, { reason });
    await approvalRequired(tx, actor, kind, id, `Void request for ${LABEL[kind].toLowerCase()} waiting for approval`);
    return after;
  });
}

// Approve (→ VOIDED) or reject (stays APPROVED, request cleared) a pending void request. ADR-013 applies
// with the void requester as the requester.
export async function decideVoid(actor: Actor, kind: Kind, id: string, approve: boolean, reason: string | null) {
  return prisma.$transaction(async (tx) => {
    const row = await loadRecord(forTenant(actor.organisationId, tx), kind, id);
    if (row.state !== "APPROVED" || !row.voidRequestedAt) throw invalidTransition(kind, row.state, approve ? "approve a void for" : "reject a void for");
    const selfApproved = await selfApproval(tx, actor, [row.voidRequestedById]);
    const after = await step(
      tx,
      actor,
      kind,
      row,
      approve ? "void_approve" : "void_reject",
      approve
        ? { from: ["APPROVED"], voidRequested: true, data: { state: "VOIDED", voidedAt: new Date() } }
        : { from: ["APPROVED"], voidRequested: true, data: { voidRequestedById: null, voidRequestedAt: null, voidReason: null } },
      { reason, selfApproved, requestedReason: row["voidReason"] },
    );
    await recordDecision(tx, actor, kind, id, approve ? "VOID_APPROVED" : "VOID_REJECTED", reason, selfApproved);
    return after;
  });
}

// ADR-022 §3: copy a REJECTED or VOIDED record into a new DRAFT (copiedFromId), re-validating references.
export async function copy(actor: Actor, kind: Kind, id: string) {
  const row = await loadRecord(forTenant(actor.organisationId), kind, id);
  if (row.state !== "REJECTED" && row.state !== "VOIDED") {
    throw new HttpError(409, "NOT_COPYABLE", "Only a rejected or voided record can be copied to a new draft");
  }
  const fields = pick(kind, row) as Record<string, unknown>;
  return create(actor, kind, { ...fields, amount: Number(row.amount) } as Input, row.id);
}

// ---- reporting (ADR-022 §5/§6, FIN-008, TENANT-007) — computed on read, tenant-scoped ----

// Used = approved expenses (a pending void still counts) in the budget's category, currency and period.
export async function budgetUsage(organisationId: string, b: Row) {
  const sum = await forTenant(organisationId).expense.aggregate({
    where: { state: "APPROVED", categoryId: b.categoryId, currency: b.currency, spentOn: { gte: b.periodStart, lte: b.periodEnd } },
    _sum: { amount: true },
  });
  const used = sum._sum.amount ?? 0n;
  return { used: Number(used), remaining: Number(b.amount - used) };
}
