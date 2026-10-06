import { Prisma, type Organisation, type OrganisationStatus, type OrganisationType } from "../../../generated/prisma/client.ts";
import { prisma } from "../../db.ts";
import { HttpError } from "../../errors.ts";
import type { RoleKey } from "../rbac/permissions.ts";
import { audit, platformAudit } from "../rbac/rbac.ts";
import { TRIAL_DAYS, TRIAL_PLAN } from "../subscriptions/entitlements.ts";
import { forTenant, orgNotFound } from "./tenant.ts";

// SPEC-GAP: API_STANDARDS requires bounded lists but defines no pagination contract.
// ponytail: hard cap instead of pagination; add cursors when an org can exceed it.
const LIST_LIMIT = 100;

const isUniqueViolation = (e: unknown) => e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";

const orgView = (o: Organisation, userId: string) => ({
  id: o.id,
  name: o.name,
  isOwner: o.ownerId === userId,
  createdAt: o.createdAt,
  status: o.status,
  type: o.type,
  description: o.description,
  contactEmail: o.contactEmail,
  contactPhone: o.contactPhone,
  addressLine: o.addressLine,
  state: o.state,
  country: o.country,
  links: o.links,
});

// ORG-001: organisation + owner membership in one statement (one transaction).
// SAAS-003 / ADR-018 §2: the 30-day trial subscription is created in the same statement.
export async function createOrganisation(userId: string, name: string) {
  try {
    const trialEndsAt = new Date(Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000);
    const org = await prisma.organisation.create({
      data: {
        name,
        ownerId: userId,
        memberships: { create: { userId } },
        subscription: { create: { planKey: TRIAL_PLAN, status: "TRIAL", trialEndsAt } },
      },
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
  // Sequential, not Promise.all: `db` may be a transaction client (one connection).
  const org = await db.organisation.findUniqueOrThrow({ where: { id: organisationId }, select: { ownerId: true } });
  const users = await db.user.findMany({
    where: { id: { in: rows.map((m) => m.userId) } },
    select: { id: true, displayName: true },
  });
  const roleRows = await forTenant(organisationId, db).membershipRole.findMany({
    where: { membershipId: { in: rows.map((m) => m.id) } },
    select: { membershipId: true, role: true },
    orderBy: { role: "asc" },
  });
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

// ORG-008: the only place the status changes. Conditional update on the current state, so two
// concurrent transitions cannot both win; the audit row commits or rolls back with it.
// Run inside the caller's transaction. `actor.platform` writes PlatformAuditLog, else AuditLog.
export async function transition(
  tx: Prisma.TransactionClient,
  organisationId: string,
  from: OrganisationStatus[],
  to: OrganisationStatus,
  actor: { userId: string; platform?: true },
  reason?: string,
) {
  const org = await tx.organisation.findUnique({ where: { id: organisationId }, select: { status: true } });
  if (!org) throw orgNotFound();
  const { count } = await tx.organisation.updateMany({ where: { id: organisationId, status: { in: from } }, data: { status: to } });
  if (count === 0) throw new HttpError(409, "INVALID_STATE_TRANSITION", `Cannot change an organisation from ${org.status} to ${to}`);
  if (actor.platform) {
    const action = `organisation.${{ SUSPENDED: "suspend", ARCHIVED: "archive", ACTIVE: "reinstate" }[to as string]}`;
    await platformAudit(tx, { actorUserId: actor.userId, action, targetOrganisationId: organisationId, reason });
  } else {
    await audit(tx, organisationId, {
      actorUserId: actor.userId,
      action: "organisation.status.change",
      targetType: "organisation",
      targetId: organisationId,
      before: { status: org.status },
      after: { status: to, ...(reason && { reason }) },
    });
  }
}

export type ProfileChange = {
  name?: string;
  type?: OrganisationType;
  description?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  addressLine?: string | null;
  state?: string;
  country?: string;
  links?: { label: string; url: string }[] | null;
};

// ORG-007/008: profile edit; the first one moves DRAFT → ONBOARDING in the same transaction.
export async function updateProfile(organisationId: string, userId: string, change: ProfileChange) {
  const { links, ...rest } = change;
  return prisma.$transaction(async (tx) => {
    // Conditional on a writable state: a suspension that committed after the guard read still wins.
    const { count } = await tx.organisation.updateMany({
      where: { id: organisationId, status: { in: ["DRAFT", "ONBOARDING", "ACTIVE"] } },
      data: { ...rest, ...(links !== undefined && { links: links ?? Prisma.DbNull }) },
    });
    if (count === 0) throw new HttpError(409, "ORGANISATION_NOT_WRITABLE", "Organisation cannot be changed in its current state");
    // The update above holds the row lock, so this read cannot race another transition.
    const { status } = await tx.organisation.findUniqueOrThrow({ where: { id: organisationId }, select: { status: true } });
    if (status === "DRAFT") await transition(tx, organisationId, ["DRAFT"], "ONBOARDING", { userId });
    return orgView(await tx.organisation.findUniqueOrThrow({ where: { id: organisationId } }), userId);
  });
}

// ORG-008: ONBOARDING → ACTIVE once name, type, state and country are set. The transition runs
// first so a wrong state is 409; a missing field throws and rolls it back.
export async function completeOnboarding(organisationId: string, userId: string) {
  return prisma.$transaction(async (tx) => {
    await transition(tx, organisationId, ["ONBOARDING"], "ACTIVE", { userId });
    const org = await tx.organisation.findUniqueOrThrow({ where: { id: organisationId } });
    const missing = (["name", "type", "state", "country"] as const).filter((k) => !org[k]);
    if (missing.length) throw new HttpError(422, "ONBOARDING_INCOMPLETE", `Missing required fields: ${missing.join(", ")}`);
    return orgView(org, userId);
  });
}

// ORG-008: tenant archive (owner). Platform suspend/reinstate/archive live in platform.routes.ts.
export async function archiveOrganisation(organisationId: string, userId: string, reason?: string) {
  return prisma.$transaction(async (tx) => {
    await transition(tx, organisationId, ["ACTIVE", "SUSPENDED"], "ARCHIVED", { userId }, reason);
    return orgView(await tx.organisation.findUniqueOrThrow({ where: { id: organisationId } }), userId);
  });
}
