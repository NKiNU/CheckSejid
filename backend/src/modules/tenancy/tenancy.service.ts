import { Prisma } from "../../../generated/prisma/client.ts";
import { prisma } from "../../db.ts";
import { HttpError } from "../../errors.ts";
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
const memberSelect = { id: true, userId: true, createdAt: true } as const;
type MemberRow = { id: string; userId: string; createdAt: Date };

async function memberViews(organisationId: string, rows: MemberRow[]) {
  const [org, users] = await Promise.all([
    prisma.organisation.findUniqueOrThrow({ where: { id: organisationId }, select: { ownerId: true } }),
    prisma.user.findMany({ where: { id: { in: rows.map((m) => m.userId) } }, select: { id: true, displayName: true } }),
  ]);
  const names = new Map(users.map((u) => [u.id, u.displayName]));
  return rows.map((m) => ({
    id: m.id,
    userId: m.userId,
    displayName: names.get(m.userId) ?? "",
    isOwner: org.ownerId === m.userId,
    createdAt: m.createdAt,
  }));
}

export async function listMembers(organisationId: string) {
  const rows = await forTenant(organisationId).organisationMembership.findMany({
    select: memberSelect,
    orderBy: { createdAt: "asc" },
    take: LIST_LIMIT,
  });
  return memberViews(organisationId, rows);
}

// SPEC-GAP: no invitation flow is specified. Minimal: the owner adds an existing user by email.
// Only the owner may add (placeholder until Phase 03 permissions). Telling the owner that an
// email has no account is accepted account enumeration, limited to organisation owners.
export async function addMember(organisationId: string, actorUserId: string, email: string) {
  const org = await prisma.organisation.findUniqueOrThrow({ where: { id: organisationId }, select: { ownerId: true } });
  if (org.ownerId !== actorUserId) throw new HttpError(403, "FORBIDDEN", "Only the organisation owner can add members");
  const user = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (!user) throw new HttpError(404, "USER_NOT_FOUND", "No account with this email");
  try {
    const m = await forTenant(organisationId).organisationMembership.create({
      data: { userId: user.id } as Prisma.OrganisationMembershipUncheckedCreateInput, // organisationId stamped by forTenant
      select: memberSelect,
    });
    return (await memberViews(organisationId, [m]))[0]!;
  } catch (e) {
    if (isUniqueViolation(e)) throw new HttpError(409, "ALREADY_MEMBER", "User is already a member");
    throw e;
  }
}
