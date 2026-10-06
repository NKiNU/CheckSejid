// Phase 05 — public profiles, discovery and following (ADR-019, PUB-001..007).
// Organisation is the tenant root and a global model, so it is read with plain prisma and an
// explicit public-safe select: never ownerId, members, finance or other internal data (PUB-004).
import { z } from "zod";
import { Prisma, type OrganisationType } from "../../../generated/prisma/client.ts";
import { prisma } from "../../db.ts";
import { HttpError } from "../../errors.ts";
import { deleteObject, newObjectKey, publicUrl, putObject } from "../../storage.ts";
import type { FileType } from "../../uploads.ts";
import { audit } from "../rbac/rbac.ts";
import { orgNotFound } from "../tenancy/tenant.ts";

const publicSelect = {
  id: true,
  name: true,
  type: true,
  description: true,
  contactEmail: true,
  contactPhone: true,
  addressLine: true,
  state: true,
  country: true,
  links: true,
  visibility: true,
  logoKey: true,
  coverKey: true,
} as const satisfies Prisma.OrganisationSelect;
type PublicRow = Prisma.OrganisationGetPayload<{ select: typeof publicSelect }>;

export const publicView = ({ logoKey, coverKey, ...o }: PublicRow) => ({ ...o, logoUrl: publicUrl(logoKey), coverUrl: publicUrl(coverKey) });

// ADR-019 §1: only ACTIVE organisations are ever public, and only PUBLIC ones are listed.
export const LISTED = { visibility: "PUBLIC", status: "ACTIVE" } as const satisfies Prisma.OrganisationWhereInput;

export const loginRequired = () => new HttpError(401, "LOGIN_REQUIRED", "Log in to view this organisation");
const uuid = z.uuid();

// ADR-019 §1, the single public-access rule (also used by the hub, HUB-005):
//  PUBLIC   → anyone; UNLISTED → logged-in viewers only (anonymous: 401 LOGIN_REQUIRED);
//  PRIVATE, not ACTIVE, unknown or malformed id → the same 404.
export async function viewableOrg(orgId: string, viewerUserId: string | undefined) {
  if (!uuid.safeParse(orgId).success) throw orgNotFound();
  const org = await prisma.organisation.findFirst({
    where: { id: orgId, status: "ACTIVE", visibility: { in: ["PUBLIC", "UNLISTED"] } },
    select: publicSelect,
  });
  if (!org) throw orgNotFound();
  if (org.visibility === "UNLISTED" && !viewerUserId) throw loginRequired();
  return org;
}

export async function getPublicOrganisation(orgId: string, viewerUserId: string | undefined) {
  const org = await viewableOrg(orgId, viewerUserId);
  const following = viewerUserId
    ? (await prisma.follow.count({ where: { userId: viewerUserId, organisationId: org.id } })) > 0
    : false;
  return { ...publicView(org), following, followable: org.visibility === "PUBLIC" };
}

export type DiscoverQuery = { q?: string; type?: OrganisationType; state?: string; country?: string; cursor?: string; limit: number };

// PUB-001/002: keyword (name), type and location filters; keyset pagination (SEC-006).
export async function discover(query: DiscoverQuery) {
  const rows = await prisma.organisation.findMany({
    where: {
      ...LISTED,
      ...(query.q && { name: { contains: query.q, mode: "insensitive" } }),
      ...(query.type && { type: query.type }),
      ...(query.state && { state: { equals: query.state, mode: "insensitive" } }),
      ...(query.country && { country: query.country }),
    },
    select: publicSelect,
    orderBy: [{ name: "asc" }, { id: "asc" }],
    take: query.limit + 1,
    ...(query.cursor && { cursor: { id: query.cursor }, skip: 1 }),
  });
  const page = rows.slice(0, query.limit);
  return { organisations: page.map(publicView), nextCursor: rows.length > query.limit ? page.at(-1)!.id : null };
}

// PUB-005/006 + ADR-019 §3: following only PUBLIC + ACTIVE organisations. Idempotent. A follow is not a
// membership and grants nothing.
export async function follow(userId: string, orgId: string) {
  const org = await viewableOrg(orgId, userId);
  if (org.visibility !== "PUBLIC") throw new HttpError(409, "NOT_FOLLOWABLE", "Only public organisations can be followed");
  await prisma.follow.upsert({
    where: { userId_organisationId: { userId, organisationId: org.id } },
    create: { userId, organisationId: org.id },
    update: {},
  });
}

// Always allowed, whatever the organisation's state now. Idempotent.
export async function unfollow(userId: string, orgId: string) {
  if (!uuid.safeParse(orgId).success) return;
  await prisma.follow.deleteMany({ where: { userId, organisationId: orgId } });
}

// ADR-019 §3: follows of organisations that are no longer PUBLIC + ACTIVE are kept but hidden.
// ponytail: hard cap instead of pagination, as in tenancy; add cursors when a user can exceed it.
export async function listFollows(userId: string) {
  const follows = await prisma.follow.findMany({ where: { userId }, select: { organisationId: true }, take: 500 });
  const orgs = await prisma.organisation.findMany({
    where: { ...LISTED, id: { in: follows.map((f) => f.organisationId) } },
    select: publicSelect,
    orderBy: [{ name: "asc" }, { id: "asc" }],
  });
  return orgs.map(publicView);
}

// The organisation ids whose published content a user's feed shows (Phase 06).
export async function followedListedOrgs(userId: string) {
  const follows = await prisma.follow.findMany({ where: { userId }, select: { organisationId: true }, take: 500 });
  const orgs = await prisma.organisation.findMany({
    where: { ...LISTED, id: { in: follows.map((f) => f.organisationId) } },
    select: { id: true, name: true },
  });
  return orgs;
}

// ADR-020: logo/cover. The file is already type- and size-checked. The new object is written first,
// then the key is swapped under a writable-state condition (a suspension that committed after the guard
// still wins), then the old object is deleted. Audited.
export async function setProfileImage(organisationId: string, userId: string, field: "logoKey" | "coverKey", file: { bytes: Buffer; type: FileType } | null) {
  const key = file && newObjectKey(`public/org/${organisationId}/${field === "logoKey" ? "logo" : "cover"}`, file.type);
  if (key && file) await putObject(key, file.bytes, file.type);
  const prev: { key: string | null } = { key: null };
  try {
    await prisma.$transaction(async (tx) => {
      const before = await tx.organisation.findUniqueOrThrow({ where: { id: organisationId }, select: { logoKey: true, coverKey: true } });
      prev.key = before[field];
      const { count } = await tx.organisation.updateMany({
        where: { id: organisationId, status: { in: ["DRAFT", "ONBOARDING", "ACTIVE"] } },
        data: { [field]: key },
      });
      if (count === 0) throw new HttpError(409, "ORGANISATION_NOT_WRITABLE", "Organisation cannot be changed in its current state");
      await audit(tx, organisationId, {
        actorUserId: userId,
        action: `organisation.${field === "logoKey" ? "logo" : "cover"}.${key ? "set" : "remove"}`,
        targetType: "organisation",
        targetId: organisationId,
        before: { [field]: prev.key },
        after: { [field]: key },
      });
    });
  } catch (e) {
    if (key) await deleteObject(key);
    throw e;
  }
  if (prev.key) await deleteObject(prev.key);
  return { url: publicUrl(key) };
}
