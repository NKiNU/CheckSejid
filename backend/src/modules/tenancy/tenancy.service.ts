import { Prisma } from "../../../generated/prisma/client.ts";
import { prisma } from "../../db.ts";
import { HttpError } from "../../errors.ts";
import type { RoleKey } from "../rbac/permissions.ts";
import { forTenant, orgNotFound } from "./tenant.ts";

// SPEC-GAP: API_STANDARDS requires bounded lists but defines no pagination contract.
// ponytail: hard cap instead of pagination; add cursors when an org can exceed it.
const LIST_LIMIT = 100;

const isUniqueViolation = (e: unknown) => e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";

const orgView = (o: { id: string; name: string; ownerId: string; createdAt: Date }, userId: string) => ({
  id: o.id,
  name: o.name,
  isOwner: o.ownerId === userId,
  createdAt: o.createdAt,
});

// ORG-001: organisation + owner membership in one statement (one transaction).
export async function createOrganisation(userId: string, name: string) {
  try {
    const org = await prisma.organisation.create({
      data: { name, ownerId: userId, memberships: { create: { userId } } },
      include: { memberships: { select: { id: true } } },
    });
    return { organisation: orgView(org, userId), membership: { id: org.memberships[0]!.id } };
  } catch (e) {
    // ORG-002 / ADR-006: Organisation.ownerId is unique.
    if (isUniqueViolation(e)) throw new HttpError(409, "ORGANISATION_LIMIT", "You already manage an organisation");
    throw e;
  }
}

// Reviewed cross-tenant read: scoped to the user, not a tenant — it lists the tenants they belong to.
export async function listMyOrganisations(userId: string) {
  const memberships = await prisma.organisationMembership.findMany({
    where: { userId },
    include: { organisation: true },
    orderBy: { createdAt: "asc" },
    take: LIST_LIMIT,
  });
  return memberships.map((m) => orgView(m.organisation, userId));
}

export async function getOrganisation(organisationId: string, userId: string) {
  // Organisation is the tenant root: its own id is the tenant scope.
  const org = await prisma.organisation.findUnique({ where: { id: organisationId } });
  if (!org) throw orgNotFound();
  return orgView(org, userId);
}

// forTenant returns scalars only; related User/Organisation data is fetched separately with
// plain prisma and an explicit safe select (never email/passwordHash).
export const memberSelect = { id: true, userId: true, title: true, createdAt: true } as const;
type MemberRow = { id: string; userId: string; title: string | null; createdAt: Date };

export async function memberViews(organisationId: string, rows: MemberRow[], db: Prisma.TransactionClient = prisma) {
  const [org, users, roleRows] = await Promise.all([
    db.organisation.findUniqueOrThrow({ where: { id: organisationId }, select: { ownerId: true } }),
    db.user.findMany({ where: { id: { in: rows.map((m) => m.userId) } }, select: { id: true, displayName: true } }),
    forTenant(organisationId, db).membershipRole.findMany({
      where: { membershipId: { in: rows.map((m) => m.id) } },
      select: { membershipId: true, role: true },
      orderBy: { role: "asc" },
    }),
  ]);
  const names = new Map(users.map((u) => [u.id, u.displayName]));
  return rows.map((m) => {
    const isOwner = org.ownerId === m.userId;
    const stored = roleRows.filter((r) => r.membershipId === m.id).map((r) => r.role as RoleKey);
    return {
      id: m.id,
      userId: m.userId,
      displayName: names.get(m.userId) ?? "",
      isOwner,
      roles: isOwner ? (["owner", ...stored] as RoleKey[]) : stored,
      title: m.title,
      createdAt: m.createdAt,
    };
  });
}

export async function listMembers(organisationId: string) {
  const rows = await forTenant(organisationId).organisationMembership.findMany({
    select: memberSelect,
    orderBy: { createdAt: "asc" },
    take: LIST_LIMIT,
  });
  return memberViews(organisationId, rows);
}

export async function getMember(organisationId: string, membershipId: string, db: Prisma.TransactionClient = prisma) {
  const m = await forTenant(organisationId, db).organisationMembership.findUnique({
    where: { id: membershipId },
    select: memberSelect,
  });
  return m && (await memberViews(organisationId, [m], db))[0]!;
}
