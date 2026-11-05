// Phase 06 — information hub (ADR-021, HUB-001..006). Posts and events share one lifecycle:
// DRAFT → PUBLISHED → ARCHIVED, ARCHIVED → PUBLISHED (republish). Only DRAFTs are edited or deleted.
import type { ContentStatus, Prisma } from "../../../generated/prisma/client.ts";
import { prisma } from "../../db.ts";
import { HttpError } from "../../errors.ts";
import { stripImageMetadata } from "../../image-metadata.ts";
import { deleteObject, newObjectKey, putObject } from "../../storage.ts";
import type { FileType } from "../../uploads.ts";
import { notify } from "../notifications/notifications.service.ts";
import { followedListedOrgs, viewableOrg } from "../public/public.service.ts";
import { audit } from "../rbac/rbac.ts";
import { forTenant, type TenantDb } from "../tenancy/tenant.ts";
import { MAX_IMAGES, parentField, toImage, withImages } from "./images.ts";

export type Kind = "post" | "event";
export type Actor = { organisationId: string; userId: string };

export type PostInput = { title: string; body: string };
export type EventInput = { title: string; description: string; startsAt: Date; endsAt: Date; location: string | null };
type Input<K extends Kind> = K extends "post" ? PostInput : EventInput;

const LABEL: Record<Kind, string> = { post: "Post", event: "Event" };
export const contentNotFound = (kind: Kind) => new HttpError(404, `${kind.toUpperCase()}_NOT_FOUND`, `${LABEL[kind]} not found`);
const invalidTransition = (kind: Kind, from: ContentStatus, to: string) =>
  new HttpError(409, "INVALID_STATE_TRANSITION", `Cannot change a ${kind} from ${from} to ${to}`);

// The two delegates have the same shape for everything used here.
type Row = { id: string; status: ContentStatus; title: string; startsAt?: Date; endsAt?: Date } & Record<string, unknown>;
type Delegate = {
  findUnique(a: object): Promise<Row | null>;
  findMany(a: object): Promise<Row[]>;
  create(a: object): Promise<Row>;
  update(a: object): Promise<Row>;
  updateMany(a: object): Promise<{ count: number }>;
  deleteMany(a: object): Promise<{ count: number }>;
};
const table = (db: TenantDb, kind: Kind) => (kind === "post" ? db.post : db.event) as unknown as Delegate;

const omitInternal = { organisationId: true } as const;

async function load(db: TenantDb, kind: Kind, id: string) {
  const row = await table(db, kind).findUnique({ where: { id }, omit: omitInternal });
  if (!row) throw contentNotFound(kind);
  return (await withImages(db, kind, [row]))[0]!;
}

// ADR-021 §4: members see PUBLISHED and ARCHIVED; drafts only with the matching *.manage key.
export async function list(organisationId: string, kind: Kind, opts: { canSeeDrafts: boolean; status?: ContentStatus; cursor?: string; limit: number }) {
  const statuses: ContentStatus[] = opts.status ? [opts.status] : ["DRAFT", "PUBLISHED", "ARCHIVED"];
  const visible = statuses.filter((s) => s !== "DRAFT" || opts.canSeeDrafts);
  const rows = await table(forTenant(organisationId), kind).findMany({
    where: { status: { in: visible } },
    omit: omitInternal,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: opts.limit + 1,
    ...(opts.cursor && { cursor: { id: opts.cursor }, skip: 1 }),
  });
  const page = rows.slice(0, opts.limit);
  return { items: await withImages(forTenant(organisationId), kind, page), nextCursor: rows.length > opts.limit ? page.at(-1)!.id : null };
}

export async function get(organisationId: string, kind: Kind, id: string, canSeeDrafts: boolean) {
  const row = await load(forTenant(organisationId), kind, id);
  if (row.status === "DRAFT" && !canSeeDrafts) throw contentNotFound(kind);
  return row;
}

const checkTimes = (startsAt: Date, endsAt: Date) => {
  if (endsAt < startsAt) throw new HttpError(400, "VALIDATION_ERROR", "endsAt must not be before startsAt");
};

export async function create<K extends Kind>(actor: Actor, kind: K, input: Input<K>) {
  if (kind === "event") checkTimes((input as EventInput).startsAt, (input as EventInput).endsAt);
  const row = await table(forTenant(actor.organisationId), kind).create({ data: { ...input, createdById: actor.userId }, omit: omitInternal });
  return { ...row, images: [] };
}

// DRAFT only (ADR-015 §1). The update is conditional on DRAFT, so a concurrent publish wins cleanly.
export async function update<K extends Kind>(actor: Actor, kind: K, id: string, change: Partial<Input<K>>) {
  const db = forTenant(actor.organisationId);
  const row = await load(db, kind, id);
  if (row.status !== "DRAFT") throw new HttpError(409, "NOT_EDITABLE", `Only a draft ${kind} can be edited`);
  if (kind === "event") {
    const c = change as Partial<EventInput>;
    checkTimes(c.startsAt ?? row.startsAt!, c.endsAt ?? row.endsAt!);
  }
  const { count } = await table(db, kind).updateMany({ where: { id, status: "DRAFT" }, data: change });
  if (count === 0) throw new HttpError(409, "NOT_EDITABLE", `Only a draft ${kind} can be edited`);
  return load(db, kind, id);
}

// ADR-033 §6: the item's image rows go with it (cascade) and its files after the commit.
export async function remove(actor: Actor, kind: Kind, id: string) {
  const keys = await prisma.$transaction(async (tx) => {
    const status = await lockStatus(tx, actor.organisationId, kind, id);
    if (status !== "DRAFT") throw new HttpError(409, "NOT_EDITABLE", `Only a draft ${kind} can be deleted (it is ${status})`);
    const db = forTenant(actor.organisationId, tx);
    const images = await db.hubImage.findMany({ where: { [parentField(kind)]: id }, select: { objectKey: true } });
    await table(db, kind).deleteMany({ where: { id } });
    return images.map((i) => i.objectKey);
  });
  for (const key of keys) await deleteObject(key);
}

// ---- images on drafts (ADR-033 §2-4) ----

// Locks the item row, so uploads, removals, publishing and deleting of one item run one at a time.
async function lockStatus(tx: Prisma.TransactionClient, organisationId: string, kind: Kind, id: string): Promise<ContentStatus> {
  const rows =
    kind === "post"
      ? await tx.$queryRaw<{ status: ContentStatus }[]>`SELECT "status" FROM "Post" WHERE "id" = ${id}::uuid AND "organisationId" = ${organisationId}::uuid FOR UPDATE`
      : await tx.$queryRaw<{ status: ContentStatus }[]>`SELECT "status" FROM "Event" WHERE "id" = ${id}::uuid AND "organisationId" = ${organisationId}::uuid FOR UPDATE`;
  if (!rows[0]) throw contentNotFound(kind);
  return rows[0].status;
}

export const imageNotFound = () => new HttpError(404, "IMAGE_NOT_FOUND", "Image not found");

type Change<R> = (db: TenantDb, field: "postId" | "eventId") => Promise<{ result: R; imageId: string }>;
// Runs `change` on a locked DRAFT item, audited.
function changeImages<R>(actor: Actor, kind: Kind, id: string, action: string, change: Change<R>) {
  return prisma.$transaction(async (tx) => {
    const status = await lockStatus(tx, actor.organisationId, kind, id);
    if (status !== "DRAFT") throw new HttpError(409, "INVALID_STATE_TRANSITION", `Images change only while the ${kind} is a draft (it is ${status})`);
    const out = await change(forTenant(actor.organisationId, tx), parentField(kind));
    await audit(tx, actor.organisationId, {
      actorUserId: actor.userId,
      action: `hub.${kind}.image.${action}`,
      targetType: kind,
      targetId: id,
      after: { imageId: out.imageId },
    });
    return out.result;
  });
}

export async function addImage(actor: Actor, kind: Kind, id: string, file: { bytes: Buffer; type: FileType }) {
  const key = newObjectKey(`public/org/${actor.organisationId}/hub`, file.type);
  await putObject(key, stripImageMetadata(file.bytes, file.type), file.type);
  try {
    return await changeImages(actor, kind, id, "add", async (db, field) => {
      const count = await db.hubImage.count({ where: { [field]: id } });
      if (count >= MAX_IMAGES) throw new HttpError(409, "TOO_MANY_IMAGES", `An item can have at most ${MAX_IMAGES} images`);
      const row = await db.hubImage.create({ data: { organisationId: actor.organisationId, postId: kind === "post" ? id : null, eventId: kind === "event" ? id : null, objectKey: key, isMain: count === 0 },
      });
      return { result: toImage(row), imageId: row.id };
    });
  } catch (e) {
    await deleteObject(key);
    throw e;
  }
}

export async function removeImage(actor: Actor, kind: Kind, id: string, imageId: string) {
  const key = await changeImages(actor, kind, id, "remove", async (db, field) => {
    const image = await db.hubImage.findFirst({ where: { id: imageId, [field]: id } });
    if (!image) throw imageNotFound();
    await db.hubImage.deleteMany({ where: { id: imageId } });
    if (image.isMain) {
      const next = await db.hubImage.findFirst({ where: { [field]: id }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] });
      if (next) await db.hubImage.updateMany({ where: { id: next.id }, data: { isMain: true } });
    }
    return { result: image.objectKey, imageId };
  });
  await deleteObject(key);
}

export function setMainImage(actor: Actor, kind: Kind, id: string, imageId: string) {
  return changeImages(actor, kind, id, "main", async (db, field) => {
    if (!(await db.hubImage.findFirst({ where: { id: imageId, [field]: id } }))) throw imageNotFound();
    await db.hubImage.updateMany({ where: { [field]: id }, data: { isMain: false } });
    await db.hubImage.updateMany({ where: { id: imageId }, data: { isMain: true } });
    const rows = await db.hubImage.findMany({ where: { [field]: id }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] });
    return { result: rows.map(toImage), imageId };
  });
}

const TRANSITIONS: Record<"publish" | "archive", { from: ContentStatus[]; to: ContentStatus }> = {
  publish: { from: ["DRAFT", "ARCHIVED"], to: "PUBLISHED" }, // ARCHIVED → PUBLISHED: ADR-021 republish
  archive: { from: ["PUBLISHED"], to: "ARCHIVED" },
};

// HUB-002 / ADR-021 §3 and §5. Conditional on the current state; event publication notifies members
// in the same transaction (ADR-017, NOTIF-005).
export async function transition(actor: Actor, kind: Kind, id: string, action: "publish" | "archive") {
  const { from, to } = TRANSITIONS[action];
  return prisma.$transaction(async (tx) => {
    const db = forTenant(actor.organisationId, tx);
    const row = await load(db, kind, id);
    const { count } = await table(db, kind).updateMany({
      where: { id, status: { in: from } },
      data: { status: to, ...(to === "PUBLISHED" && { publishedAt: new Date() }) },
    });
    if (count === 0) throw invalidTransition(kind, row.status, to);
    if (kind === "event" && to === "PUBLISHED") {
      await notify(tx, {
        organisationId: actor.organisationId,
        actorUserId: actor.userId,
        type: "event.published",
        title: `Event published: ${row.title}`.slice(0, 300),
        targetType: "event",
        targetId: id,
      });
    }
    return load(db, kind, id);
  });
}

// ---- public reads (HUB-004/005): PUBLISHED only, behind the ADR-019 visibility rule ----

const publicPostSelect = { id: true, title: true, body: true, publishedAt: true } as const;
const publicEventSelect = { id: true, title: true, description: true, startsAt: true, endsAt: true, location: true, publishedAt: true } as const;

export async function publicPosts(orgId: string, viewerUserId: string | undefined, opts: { cursor?: string; limit: number }) {
  const org = await viewableOrg(orgId, viewerUserId);
  const rows = await forTenant(org.id).post.findMany({
    where: { status: "PUBLISHED" },
    select: publicPostSelect,
    orderBy: [{ publishedAt: "desc" }, { id: "desc" }],
    take: opts.limit + 1,
    ...(opts.cursor && { cursor: { id: opts.cursor }, skip: 1 }),
  });
  const page = rows.slice(0, opts.limit);
  return { posts: await withImages(forTenant(org.id), "post", page), nextCursor: rows.length > opts.limit ? page.at(-1)!.id : null };
}

// Upcoming (not yet ended) published events, soonest first.
export async function publicEvents(orgId: string, viewerUserId: string | undefined, opts: { cursor?: string; limit: number }) {
  const org = await viewableOrg(orgId, viewerUserId);
  const rows = await forTenant(org.id).event.findMany({
    where: { status: "PUBLISHED", endsAt: { gte: new Date() } },
    select: publicEventSelect,
    orderBy: [{ startsAt: "asc" }, { id: "asc" }],
    take: opts.limit + 1,
    ...(opts.cursor && { cursor: { id: opts.cursor }, skip: 1 }),
  });
  const page = rows.slice(0, opts.limit);
  return { events: await withImages(forTenant(org.id), "event", page), nextCursor: rows.length > opts.limit ? page.at(-1)!.id : null };
}

// ADR-019 §3: a follower's feed = published content of followed PUBLIC + ACTIVE organisations.
// Reviewed cross-tenant read: scoped to the user's own follows, published content only.
const FEED_LIMIT = 50;
export async function feed(userId: string) {
  const orgs = await followedListedOrgs(userId);
  const names = new Map(orgs.map((o) => [o.id, o.name]));
  const where = { organisationId: { in: [...names.keys()] }, status: "PUBLISHED" } satisfies Prisma.PostWhereInput;
  const posts = await prisma.post.findMany({
    where,
    select: { ...publicPostSelect, organisationId: true },
    orderBy: [{ publishedAt: "desc" }, { id: "desc" }],
    take: FEED_LIMIT,
  });
  const events = await prisma.event.findMany({
    where: { ...where, endsAt: { gte: new Date() } },
    select: { ...publicEventSelect, organisationId: true },
    orderBy: [{ startsAt: "asc" }, { id: "asc" }],
    take: FEED_LIMIT,
  });
  const withOrg = <T extends { organisationId: string }>({ organisationId, ...r }: T) => ({
    ...r,
    organisation: { id: organisationId, name: names.get(organisationId)! },
  });
  return {
    posts: (await withImages(prisma, "post", posts)).map(withOrg),
    events: (await withImages(prisma, "event", events)).map(withOrg),
  };
}
