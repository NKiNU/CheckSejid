// Phase 08 — categories, collections (ADR-022 §6), expense evidence (ADR-020) and the finance audit
// log (FIN-014/015). All tenant-scoped through forTenant.
import type { CategoryKind, CollectionStatus, Prisma } from "../../../generated/prisma/client.ts";
import { prisma } from "../../db.ts";
import { HttpError } from "../../errors.ts";
import { DOWNLOAD_URL_TTL_SECONDS, deleteObject, newObjectKey, presignedDownloadUrl, putObject } from "../../storage.ts";
import type { FileType } from "../../uploads.ts";
import { audit } from "../rbac/rbac.ts";
import { forTenant } from "../tenancy/tenant.ts";
import { loadRecord, recordNotFound, type Actor } from "./records.service.ts";

const isUniqueViolation = (e: unknown) => (e as { code?: string })?.code === "P2002";
const LIMIT = 200; // ponytail: reference lists are small; add cursors when an org can exceed it.

// ---- categories ----
export const categoryNotFound = () => new HttpError(404, "CATEGORY_NOT_FOUND", "Category not found");
const categorySelect = { id: true, name: true, kind: true, active: true, createdAt: true } as const;
const duplicate = () => new HttpError(409, "CATEGORY_EXISTS", "A category with this name and kind already exists");

export const listCategories = (organisationId: string) =>
  forTenant(organisationId).financialCategory.findMany({ select: categorySelect, orderBy: [{ kind: "asc" }, { name: "asc" }], take: LIMIT });

export async function createCategory(actor: Actor, input: { name: string; kind: CategoryKind }) {
  try {
    return await prisma.$transaction(async (tx) => {
      const c = await forTenant(actor.organisationId, tx).financialCategory.create({ data: input as Prisma.FinancialCategoryUncheckedCreateInput, select: categorySelect });
      await audit(tx, actor.organisationId, { actorUserId: actor.userId, action: "finance.category.create", targetType: "category", targetId: c.id, after: c });
      return c;
    });
  } catch (e) {
    if (isUniqueViolation(e)) throw duplicate();
    throw e;
  }
}

// Categories are never deleted (records reference them); `active: false` retires one.
export async function updateCategory(actor: Actor, id: string, change: { name?: string; active?: boolean }) {
  try {
    return await prisma.$transaction(async (tx) => {
      const db = forTenant(actor.organisationId, tx);
      const before = await db.financialCategory.findUnique({ where: { id }, select: categorySelect });
      if (!before) throw categoryNotFound();
      const after = await db.financialCategory.update({ where: { id }, data: change, select: categorySelect });
      await audit(tx, actor.organisationId, { actorUserId: actor.userId, action: "finance.category.update", targetType: "category", targetId: id, before, after });
      return after;
    });
  } catch (e) {
    if (isUniqueViolation(e)) throw duplicate();
    throw e;
  }
}

// ---- collections (ADR-022 §6) ----
export const collectionNotFound = () => new HttpError(404, "COLLECTION_NOT_FOUND", "Collection not found");
type CollectionRow = Prisma.CollectionGetPayload<object>;
export type CollectionInput = { purpose: string; description: string | null; targetAmount: number | null; currency: string };

// Progress = approved linked income (a pending void still counts; VOIDED does not).
async function withProgress(organisationId: string, rows: CollectionRow[]) {
  const sums = await forTenant(organisationId).income.groupBy({
    by: ["collectionId"],
    where: { state: "APPROVED", collectionId: { in: rows.map((r) => r.id) } },
    _sum: { amount: true },
  });
  const byId = new Map(sums.map((s) => [s.collectionId, s._sum.amount ?? 0n]));
  return rows.map(({ organisationId: _o, ...c }) => {
    const collected = byId.get(c.id) ?? 0n;
    return {
      ...c,
      targetAmount: c.targetAmount === null ? null : Number(c.targetAmount),
      collected: Number(collected),
      // Whole percent, rounded down, from integers only.
      percent: c.targetAmount ? Number((collected * 100n) / c.targetAmount) : null,
    };
  });
}

export async function listCollections(organisationId: string) {
  const rows = await forTenant(organisationId).collection.findMany({ orderBy: [{ createdAt: "desc" }, { id: "asc" }], take: LIMIT });
  return withProgress(organisationId, rows);
}

async function loadCollection(organisationId: string, id: string, tx?: Prisma.TransactionClient) {
  const c = await forTenant(organisationId, tx).collection.findUnique({ where: { id } });
  if (!c) throw collectionNotFound();
  return c;
}

export const getCollection = async (organisationId: string, id: string) => (await withProgress(organisationId, [await loadCollection(organisationId, id)]))[0]!;

export async function createCollection(actor: Actor, input: CollectionInput) {
  const c = await prisma.$transaction(async (tx) => {
    const row = await forTenant(actor.organisationId, tx).collection.create({
      data: { ...input, targetAmount: input.targetAmount === null ? null : BigInt(input.targetAmount) } as Prisma.CollectionUncheckedCreateInput,
    });
    await audit(tx, actor.organisationId, { actorUserId: actor.userId, action: "finance.collection.create", targetType: "collection", targetId: row.id, after: { purpose: row.purpose, targetAmount: input.targetAmount, currency: row.currency } });
    return row;
  });
  return (await withProgress(actor.organisationId, [c]))[0]!;
}

// The currency is fixed once created (linked income must match it).
export async function updateCollection(actor: Actor, id: string, change: { purpose?: string; description?: string | null; targetAmount?: number | null; status?: CollectionStatus }) {
  const c = await prisma.$transaction(async (tx) => {
    const before = await loadCollection(actor.organisationId, id, tx);
    const { targetAmount, ...rest } = change;
    const row = await forTenant(actor.organisationId, tx).collection.update({
      where: { id },
      data: { ...rest, ...(targetAmount !== undefined && { targetAmount: targetAmount === null ? null : BigInt(targetAmount) }) },
    });
    const snap = (r: CollectionRow) => ({ purpose: r.purpose, status: r.status, targetAmount: r.targetAmount === null ? null : Number(r.targetAmount) });
    await audit(tx, actor.organisationId, { actorUserId: actor.userId, action: "finance.collection.update", targetType: "collection", targetId: id, before: snap(before), after: snap(row) });
    return row;
  });
  return (await withProgress(actor.organisationId, [c]))[0]!;
}

// ---- expense evidence (FIN-005, ADR-020) ----
export const MAX_ATTACHMENTS = 5;
export const attachmentNotFound = () => new HttpError(404, "ATTACHMENT_NOT_FOUND", "Attachment not found");
const attachmentSelect = { id: true, contentType: true, sizeBytes: true, uploadedById: true, createdAt: true } as const;

export const listAttachments = (organisationId: string, expenseId: string) =>
  forTenant(organisationId).financeAttachment.findMany({ where: { expenseId }, select: attachmentSelect, orderBy: { createdAt: "asc" } });

// The expense's creator, while it is a DRAFT. The object is written first and removed again if the
// database step fails; the count is checked under the expense row lock.
export async function addAttachment(actor: Actor, expenseId: string, file: { bytes: Buffer; type: FileType }) {
  const expense = await loadRecord(forTenant(actor.organisationId), "expense", expenseId);
  if (expense.createdById !== actor.userId) throw new HttpError(403, "FORBIDDEN", "Only the expense's creator can attach evidence");
  if (expense.state !== "DRAFT") throw new HttpError(409, "NOT_EDITABLE", "Evidence can only be attached to a draft expense");
  const key = newObjectKey(`org/${actor.organisationId}/finance/expenses/${expenseId}`, file.type);
  await putObject(key, file.bytes, file.type);
  try {
    return await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT 1 FROM "Expense" WHERE "id" = ${expenseId}::uuid AND "organisationId" = ${actor.organisationId}::uuid AND "state" = 'DRAFT' FOR UPDATE`;
      const db = forTenant(actor.organisationId, tx);
      const locked = await db.expense.findUnique({ where: { id: expenseId }, select: { state: true } });
      if (locked?.state !== "DRAFT") throw new HttpError(409, "NOT_EDITABLE", "Evidence can only be attached to a draft expense");
      if ((await db.financeAttachment.count({ where: { expenseId } })) >= MAX_ATTACHMENTS) {
        throw new HttpError(409, "TOO_MANY_ATTACHMENTS", `An expense can have at most ${MAX_ATTACHMENTS} attachments`);
      }
      const a = await db.financeAttachment.create({
        data: { expenseId, objectKey: key, contentType: file.type, sizeBytes: file.bytes.length, uploadedById: actor.userId } as Prisma.FinanceAttachmentUncheckedCreateInput,
        select: attachmentSelect,
      });
      await audit(tx, actor.organisationId, { actorUserId: actor.userId, action: "finance.expense.attachment_add", targetType: "expense", targetId: expenseId, after: { attachmentId: a.id, contentType: a.contentType, sizeBytes: a.sizeBytes } });
      return a;
    });
  } catch (e) {
    await deleteObject(key);
    throw e;
  }
}

// finance.read, checked at the route; the URL is short-lived and served as an attachment.
export async function attachmentDownload(organisationId: string, expenseId: string, attachmentId: string) {
  const db = forTenant(organisationId);
  if (!(await db.expense.findUnique({ where: { id: expenseId }, select: { id: true } }))) throw recordNotFound("expense");
  const a = await db.financeAttachment.findUnique({ where: { id: attachmentId }, select: { expenseId: true, objectKey: true } });
  if (!a || a.expenseId !== expenseId) throw attachmentNotFound();
  return { url: await presignedDownloadUrl(a.objectKey), expiresInSeconds: DOWNLOAD_URL_TTL_SECONDS };
}

// ---- audit log (FIN-014/015): finance actions only, read-only, keyset paginated ----
export async function auditLog(organisationId: string, opts: { cursor?: string; limit: number; targetId?: string }) {
  const rows = await forTenant(organisationId).auditLog.findMany({
    where: { action: { startsWith: "finance." }, ...(opts.targetId && { targetId: opts.targetId }) },
    select: { id: true, actorUserId: true, action: true, targetType: true, targetId: true, before: true, after: true, createdAt: true },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: opts.limit + 1,
    ...(opts.cursor && { cursor: { id: opts.cursor }, skip: 1 }),
  });
  const page = rows.slice(0, opts.limit);
  return { entries: page, nextCursor: rows.length > opts.limit ? page.at(-1)!.id : null };
}
