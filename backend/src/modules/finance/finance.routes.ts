import { Router, type Request, type RequestHandler } from "express";
import { MemoryStore } from "express-rate-limit";
import { z } from "zod";
import { dateOnly } from "../../dates.ts";
import { HttpError } from "../../errors.ts";
import { EVIDENCE_TYPES, MB, checkUpload, rawUpload } from "../../uploads.ts";
import { requireAuth } from "../identity/auth.ts";
import { limiter } from "../identity/identity.routes.ts";
import type { Permission } from "../rbac/permissions.ts";
import { requirePermission } from "../rbac/rbac.ts";
import { requireEntitlement, type Feature } from "../subscriptions/entitlements.ts";
import { requireActiveOrg, requireOrgStatus, requireTenant } from "../tenancy/tenant.ts";
import { forTenant } from "../tenancy/tenant.ts";
import * as records from "./records.service.ts";
import * as ref from "./reference.service.ts";

export const financeRateLimitStores = { write: new MemoryStore() };
const writeLimit = limiter(300, financeRateLimitStores.write, (req: Request) => `user:${req.auth!.userId}`);

// Permission → entitlement(s) (RBAC-004, ADR-018) → lifecycle (ADR-016 §2: writes ACTIVE; reads also
// while SUSPENDED/ARCHIVED). Budgets also need finance.reporting (ADR-018 §1).
const features = (kind?: records.Kind): Feature[] => (kind === "budget" ? ["finance", "finance.reporting"] : ["finance"]);
const read = (kind?: records.Kind): RequestHandler[] => [
  requireAuth,
  requireTenant,
  requirePermission("finance.read"),
  ...features(kind).map(requireEntitlement),
  requireOrgStatus("ACTIVE", "SUSPENDED", "ARCHIVED"),
];
const write = (key: Permission, kind?: records.Kind): RequestHandler[] => [
  requireAuth,
  writeLimit,
  requireTenant,
  requirePermission(key),
  ...features(kind).map(requireEntitlement),
  requireActiveOrg,
];

const uuid = z.uuid();
// ADR-022 §7 / ADR-011: positive integer minor units, at most 10^13.
const amount = z.number().int().positive().max(10_000_000_000_000);
const currency = z.string().regex(/^[A-Z]{3}$/, "ISO 4217 code, e.g. MYR");
const description = z.string().trim().min(1).max(1000);
const optText = (max: number) => z.string().trim().min(1).max(max).nullable();
const reason = z.string().trim().min(1).max(500);
const page = z.strictObject({ cursor: uuid.optional(), limit: z.coerce.number().int().min(1).max(100).default(50) });

const createBodies = {
  income: z.strictObject({
    amount,
    currency: currency.default("MYR"),
    receivedOn: dateOnly,
    categoryId: uuid,
    collectionId: uuid.nullable().default(null),
    description,
    reference: optText(200).default(null),
  }),
  expense: z.strictObject({
    amount,
    currency: currency.default("MYR"),
    spentOn: dateOnly,
    categoryId: uuid,
    payee: optText(200).default(null),
    description,
    reference: optText(200).default(null),
  }),
  budget: z.strictObject({
    name: z.string().trim().min(1).max(200),
    amount,
    currency: currency.default("MYR"),
    periodStart: dateOnly,
    periodEnd: dateOnly,
    categoryId: uuid,
    description,
  }),
};
const nonEmpty = <T extends z.ZodObject>(s: T) => s.partial().refine((b) => Object.keys(b).length > 0, "Nothing to change");
const patchBodies = {
  income: nonEmpty(createBodies.income.extend({ currency, collectionId: uuid.nullable(), reference: optText(200) })),
  expense: nonEmpty(createBodies.expense.extend({ currency, payee: optText(200), reference: optText(200) })),
  budget: nonEmpty(createBodies.budget.extend({ currency })),
};
const decisionBody = z.strictObject({ reason: reason.optional() }).default({});
const voidBody = z.strictObject({ reason }); // ADR-022 §2: a reason is required to void

const actor = (req: Request): records.Actor => ({ ...req.tenant!, userId: req.auth!.userId });
const org = (req: Request) => req.tenant!.organisationId;
const param = (req: Request, name: string, notFound: () => HttpError) => {
  const v = req.params[name];
  if (!uuid.safeParse(v).success) throw notFound();
  return v as string;
};

async function detail(organisationId: string, kind: records.Kind, row: records.Row) {
  const view = records.recordView(row);
  const approvals = await records.approvalsOf(organisationId, kind, row.id);
  const extra =
    kind === "budget" ? await records.budgetUsage(organisationId, row) : kind === "expense" ? { attachments: await ref.listAttachments(organisationId, row.id) } : {};
  return { ...view, ...extra, approvals };
}

export const financeRouter = Router();
const F = "/orgs/:orgId/finance";

// ---- categories ----
financeRouter.get(`${F}/categories`, ...read(), async (req, res) => {
  res.json({ categories: await ref.listCategories(org(req)) });
});
financeRouter.post(`${F}/categories`, ...write("finance.category.manage"), async (req, res) => {
  const body = z.strictObject({ name: z.string().trim().min(1).max(100), kind: z.enum(["INCOME", "EXPENSE"]) }).parse(req.body);
  res.status(201).json({ category: await ref.createCategory(actor(req), body) });
});
financeRouter.patch(`${F}/categories/:id`, ...write("finance.category.manage"), async (req, res) => {
  const id = param(req, "id", ref.categoryNotFound);
  const body = nonEmpty(z.strictObject({ name: z.string().trim().min(1).max(100), active: z.boolean() })).parse(req.body);
  res.json({ category: await ref.updateCategory(actor(req), id, body) });
});

// ---- collections ----
const collectionBody = z.strictObject({
  purpose: z.string().trim().min(1).max(200),
  description: optText(2000).default(null),
  targetAmount: amount.nullable().default(null),
  currency: currency.default("MYR"),
});
financeRouter.get(`${F}/collections`, ...read(), async (req, res) => {
  res.json({ collections: await ref.listCollections(org(req)) });
});
financeRouter.get(`${F}/collections/:id`, ...read(), async (req, res) => {
  res.json({ collection: await ref.getCollection(org(req), param(req, "id", ref.collectionNotFound)) });
});
financeRouter.post(`${F}/collections`, ...write("finance.collection.manage"), async (req, res) => {
  res.status(201).json({ collection: await ref.createCollection(actor(req), collectionBody.parse(req.body)) });
});
financeRouter.patch(`${F}/collections/:id`, ...write("finance.collection.manage"), async (req, res) => {
  const id = param(req, "id", ref.collectionNotFound);
  const body = nonEmpty(
    z.strictObject({ purpose: collectionBody.shape.purpose, description: optText(2000), targetAmount: amount.nullable(), status: z.enum(["OPEN", "CLOSED"]) }),
  ).parse(req.body);
  res.json({ collection: await ref.updateCollection(actor(req), id, body) });
});

// ---- records: incomes, expenses, budgets (ADR-022 §2) ----
for (const kind of records.KINDS) {
  const base = `${F}/${kind === "income" ? "incomes" : `${kind}s`}`;
  const key = records.CREATE_KEY[kind];
  const notFound = () => records.recordNotFound(kind);
  const id = (req: Request) => param(req, "id", notFound);

  financeRouter.get(base, ...read(kind), async (req, res) => {
    const q = page.extend({ state: z.enum(["DRAFT", "PENDING_APPROVAL", "APPROVED", "REJECTED", "VOIDED"]).optional() }).parse(req.query);
    const { rows, nextCursor } = await records.list(org(req), kind, q);
    const items = await Promise.all(rows.map(async (r) => ({ ...records.recordView(r), ...(kind === "budget" && (await records.budgetUsage(org(req), r))) })));
    res.json({ records: items, nextCursor });
  });
  financeRouter.get(`${base}/:id`, ...read(kind), async (req, res) => {
    const row = await records.loadRecord(forTenant(org(req)), kind, id(req));
    res.json({ record: await detail(org(req), kind, row) });
  });
  financeRouter.post(base, ...write(key, kind), async (req, res) => {
    const row = await records.create(actor(req), kind, createBodies[kind].parse(req.body) as records.Input);
    res.status(201).json({ record: await detail(org(req), kind, row) });
  });
  financeRouter.patch(`${base}/:id`, ...write(key, kind), async (req, res) => {
    const target = id(req);
    const row = await records.update(actor(req), kind, target, patchBodies[kind].parse(req.body) as Partial<records.Input>);
    res.json({ record: await detail(org(req), kind, row) });
  });
  financeRouter.post(`${base}/:id/submit`, ...write(key, kind), async (req, res) => {
    res.json({ record: await detail(org(req), kind, await records.submit(actor(req), kind, id(req))) });
  });
  for (const [verb, approve] of [["approve", true], ["reject", false]] as const) {
    financeRouter.post(`${base}/:id/${verb}`, ...write("finance.approve", kind), async (req, res) => {
      const target = id(req);
      const { reason } = decisionBody.parse(req.body ?? {});
      res.json({ record: await detail(org(req), kind, await records.decide(actor(req), kind, target, approve, reason ?? null)) });
    });
  }
  // Direct cancel of a not-yet-approved record: the creator (create key) or finance.void; the service
  // decides which, so the route declares the weakest key every eligible member holds.
  financeRouter.post(`${base}/:id/void`, ...write("finance.read", kind), async (req, res) => {
    const target = id(req);
    const { reason } = voidBody.parse(req.body);
    res.json({ record: await detail(org(req), kind, await records.voidDirect(actor(req), kind, target, reason)) });
  });
  financeRouter.post(`${base}/:id/void-request`, ...write("finance.void", kind), async (req, res) => {
    const target = id(req);
    const { reason } = voidBody.parse(req.body);
    res.json({ record: await detail(org(req), kind, await records.requestVoid(actor(req), kind, target, reason)) });
  });
  for (const [verb, approve] of [["void-approve", true], ["void-reject", false]] as const) {
    financeRouter.post(`${base}/:id/${verb}`, ...write("finance.approve", kind), async (req, res) => {
      const target = id(req);
      const { reason } = decisionBody.parse(req.body ?? {});
      res.json({ record: await detail(org(req), kind, await records.decideVoid(actor(req), kind, target, approve, reason ?? null)) });
    });
  }
  financeRouter.post(`${base}/:id/copy`, ...write(key, kind), async (req, res) => {
    res.status(201).json({ record: await detail(org(req), kind, await records.copy(actor(req), kind, id(req))) });
  });
}

// ---- expense evidence (FIN-005, ADR-020): guards run before the body is read ----
const EVIDENCE_LIMIT = 5 * MB;
financeRouter.post(
  `${F}/expenses/:id/attachments`,
  ...write("finance.expense.create", "expense"),
  rawUpload(EVIDENCE_LIMIT),
  async (req, res) => {
    const expenseId = param(req, "id", () => records.recordNotFound("expense"));
    const file = checkUpload(req.body, EVIDENCE_TYPES);
    res.status(201).json({ attachment: await ref.addAttachment(actor(req), expenseId, file) });
  },
);
financeRouter.get(`${F}/expenses/:id/attachments/:attachmentId/download`, ...read("expense"), async (req, res) => {
  const expenseId = param(req, "id", () => records.recordNotFound("expense"));
  res.json(await ref.attachmentDownload(org(req), expenseId, param(req, "attachmentId", ref.attachmentNotFound)));
});

// ---- audit (FIN-014/015) ----
financeRouter.get(
  `${F}/audit`,
  requireAuth,
  requireTenant,
  requirePermission("finance.audit.read"),
  requireEntitlement("finance"),
  requireOrgStatus("ACTIVE", "SUSPENDED", "ARCHIVED"),
  async (req, res) => {
    res.json(await ref.auditLog(org(req), page.extend({ targetId: uuid.optional() }).parse(req.query)));
  },
);
