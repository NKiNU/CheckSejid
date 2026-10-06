// Membership role management, removal, self-leave and ownership transfer (ADR-015 §6).
// Every mutation runs in one transaction that first locks the organisation row, so ownership
// checks and the change cannot interleave with another membership mutation of the same org.
// ponytail: per-organisation row lock; fine for human-rate member admin.
import { Prisma } from "../../../generated/prisma/client.ts";
import { prisma } from "../../db.ts";
import { HttpError } from "../../errors.ts";
import { getMember, memberSelect, memberViews } from "../tenancy/tenancy.service.ts";
import { notify } from "../notifications/notifications.service.ts";
import { assertQuota } from "../subscriptions/entitlements.ts";
import { forTenant } from "../tenancy/tenant.ts";
import { ASSIGNABLE_ROLES, canGrant, type AssignableRole } from "./permissions.ts";
import { audit, effectivePermissions, forbidden, membershipRoles, roleNotGrantable, type TenantContext } from "./rbac.ts";

export type Actor = TenantContext & { userId: string };

export const memberNotFound = () => new HttpError(404, "MEMBER_NOT_FOUND", "Member not found");
const ownerProtected = () =>
  new HttpError(409, "OWNER_PROTECTED", "The owner's membership changes only through ownership transfer");
const selfChange = () => new HttpError(403, "SELF_CHANGE", "You cannot change your own roles or membership this way");

type Tx = Prisma.TransactionClient;

// ORG-009: the status is re-checked under the lock (requireTenant's read may be stale), so no member
// write lands on an organisation suspended or archived meanwhile. `leave` opts out: allowed in every state.
async function lockedOrg(tx: Tx, organisationId: string, anyStatus = false) {
  await tx.$queryRaw`SELECT 1 FROM "Organisation" WHERE "id" = ${organisationId}::uuid FOR UPDATE`;
  const org = await tx.organisation.findUniqueOrThrow({ where: { id: organisationId }, select: { ownerId: true, status: true } });
  if (!anyStatus && (org.status === "SUSPENDED" || org.status === "ARCHIVED")) {
    throw new HttpError(409, "ORGANISATION_NOT_WRITABLE", `Organisation is ${org.status} and cannot be changed this way`);
  }
  return org;
}

async function target(tx: Tx, organisationId: string, membershipId: string) {
  const m = await forTenant(organisationId, tx).organisationMembership.findUnique({
    where: { id: membershipId },
    select: { id: true, userId: true, title: true },
  });
  if (!m) throw memberNotFound();
  return m;
}

// Actor's permissions re-read under the lock: a concurrent demotion is honoured.
async function actorPermissions(tx: Tx, actor: Actor) {
  const perms = await effectivePermissions(actor, tx);
  if (!perms.has("members.manage")) throw forbidden();
  return perms;
}

// SPEC-GAP: no invitation flow is specified. Minimal: a members.manage holder adds an existing
// user by email. Telling them an email has no account is accepted account enumeration, limited
// to members.manage holders and rate-limited.
// SPEC-GAP: ADR-015 gives no default role for a new member. Default `staff` (least-privileged
// fixed role); the subset rule (RBAC-009) applies to the roles granted here.
export async function addMember(actor: Actor, email: string, roles: AssignableRole[]) {
  const { organisationId } = actor;
  const user = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (!user) throw new HttpError(404, "USER_NOT_FOUND", "No account with this email");
  try {
    return await prisma.$transaction(async (tx) => {
      await lockedOrg(tx, organisationId);
      if (!canGrant(await actorPermissions(tx, actor), roles)) throw roleNotGrantable();
      const db = forTenant(organisationId, tx);
      // ADR-018: members.max counts every membership, owner included. Checked under the org row lock,
      // so concurrent adds cannot both pass at the limit.
      await assertQuota(tx, organisationId, "members.max", await db.organisationMembership.count());
      const m = await db.organisationMembership.create({
        data: { userId: user.id } as Prisma.OrganisationMembershipUncheckedCreateInput, // organisationId stamped by forTenant
        select: memberSelect,
      });
      await db.membershipRole.createMany({
        data: roles.map((role) => ({ membershipId: m.id, role })) as Prisma.MembershipRoleCreateManyInput[],
      });
      await audit(tx, organisationId, {
        actorUserId: actor.userId,
        action: "membership.add",
        targetType: "membership",
        targetId: m.id,
        after: { userId: user.id, roles },
      });
      // NOTIF-005 / ADR-017: same transaction, so a notify failure rolls the add back. Every member sees
      // the title, and members.read (held by all roles, ADR-015) already shows display names.
      const org = await tx.organisation.findUniqueOrThrow({ where: { id: organisationId }, select: { name: true } });
      const joined = await tx.user.findUniqueOrThrow({ where: { id: user.id }, select: { displayName: true } });
      await notify(tx, {
        organisationId,
        actorUserId: actor.userId,
        type: "member.added",
        title: `${joined.displayName} joined ${org.name}`,
        targetType: "membership",
        targetId: m.id,
      });
      return (await memberViews(organisationId, [m], tx))[0]!;
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      throw new HttpError(409, "ALREADY_MEMBER", "User is already a member");
    }
    throw e;
  }
}

// PATCH member. `roles` is the complete new set of assignable roles. `title` grants nothing, so
// any members.manage holder may set it on any member, including themselves; only the owner may
// set the owner's title.
export async function updateMember(
  actor: Actor,
  membershipId: string,
  change: { roles?: AssignableRole[]; title?: string | null },
) {
  const { organisationId } = actor;
  return prisma.$transaction(async (tx) => {
    const org = await lockedOrg(tx, organisationId);
    const perms = await actorPermissions(tx, actor);
    const before = await getMember(organisationId, membershipId, tx);
    if (!before) throw memberNotFound();

    if (change.roles) {
      if (before.id === actor.membershipId) throw selfChange(); // RBAC-009
      // SPEC-GAP: ADR-015 does not say whether the owner's non-owner roles may be edited. They
      // grant nothing extra while owner, and editing them is close to touching the owner, so no.
      if (before.userId === org.ownerId) throw ownerProtected();
      const current = before.roles as AssignableRole[];
      const added = change.roles.filter((r) => !current.includes(r));
      const removed = current.filter((r) => !change.roles!.includes(r));
      if (!canGrant(perms, [...added, ...removed])) throw roleNotGrantable(); // RBAC-009
      const db = forTenant(organisationId, tx);
      await db.membershipRole.deleteMany({ where: { membershipId, role: { in: removed } } });
      await db.membershipRole.createMany({
        data: added.map((role) => ({ membershipId, role })) as Prisma.MembershipRoleCreateManyInput[],
      });
    }
    if (change.title !== undefined) {
      if (before.userId === org.ownerId && actor.userId !== org.ownerId) throw ownerProtected();
      await forTenant(organisationId, tx).organisationMembership.update({
        where: { id: membershipId },
        data: { title: change.title },
      });
    }

    const after = (await getMember(organisationId, membershipId, tx))!;
    if (JSON.stringify([before.roles, before.title]) !== JSON.stringify([after.roles, after.title])) {
      await audit(tx, organisationId, {
        actorUserId: actor.userId,
        action: "membership.update",
        targetType: "membership",
        targetId: membershipId,
        before: { roles: before.roles, title: before.title },
        after: { roles: after.roles, title: after.title },
      });
    }
    return after;
  });
}

export async function removeMember(actor: Actor, membershipId: string) {
  const { organisationId } = actor;
  await prisma.$transaction(async (tx) => {
    const org = await lockedOrg(tx, organisationId);
    const perms = await actorPermissions(tx, actor);
    const m = await target(tx, organisationId, membershipId);
    if (m.userId === org.ownerId) throw ownerProtected(); // RBAC-008
    if (m.id === actor.membershipId) throw selfChange(); // use POST /orgs/:orgId/leave
    const roles = await membershipRoles({ organisationId, membershipId }, tx);
    if (!canGrant(perms, roles)) throw roleNotGrantable(); // removing = revoking all their roles
    await forTenant(organisationId, tx).organisationMembership.delete({ where: { id: membershipId } });
    await audit(tx, organisationId, {
      actorUserId: actor.userId,
      action: "membership.remove",
      targetType: "membership",
      targetId: membershipId,
      before: { userId: m.userId, roles, title: m.title },
    });
  });
}

// RBAC-013: any non-owner may end their own membership; no permission needed.
export async function leave(actor: Actor) {
  const { organisationId, membershipId } = actor;
  await prisma.$transaction(async (tx) => {
    const org = await lockedOrg(tx, organisationId, true);
    if (org.ownerId === actor.userId) {
      throw new HttpError(409, "OWNER_MUST_TRANSFER", "Transfer ownership before leaving the organisation");
    }
    const roles = await membershipRoles(actor, tx);
    const { count } = await forTenant(organisationId, tx).organisationMembership.deleteMany({
      where: { id: membershipId },
    });
    if (count === 0) throw memberNotFound(); // already left in a concurrent request
    await audit(tx, organisationId, {
      actorUserId: actor.userId,
      action: "membership.leave",
      targetType: "membership",
      targetId: membershipId,
      before: { userId: actor.userId, roles },
    });
  });
}

// ADR-015 §6 rule 2 (RBAC-008): atomic transfer. The target gains owner (Organisation.ownerId);
// the previous owner keeps their other roles and gains admin.
export async function transferOwnership(actor: Actor, membershipId: string) {
  const { organisationId } = actor;
  try {
    return await prisma.$transaction(async (tx) => {
      const org = await lockedOrg(tx, organisationId);
      // Re-checked under the lock: a concurrent transfer already moved ownership.
      if (org.ownerId !== actor.userId) throw forbidden();
      const m = await target(tx, organisationId, membershipId);
      if (m.userId === actor.userId) throw new HttpError(409, "ALREADY_OWNER", "You already own this organisation");
      // Computed before any write: stored roles + admin (owner is the column, not a role row).
      const kept = await membershipRoles(actor, tx);
      const previousOwnerRoles = ASSIGNABLE_ROLES.filter((r) => r === "admin" || kept.includes(r));
      await tx.organisation.update({ where: { id: organisationId }, data: { ownerId: m.userId } });
      await forTenant(organisationId, tx).membershipRole.createMany({
        data: [{ membershipId: actor.membershipId, role: "admin" }] as Prisma.MembershipRoleCreateManyInput[],
        skipDuplicates: true,
      });
      await audit(tx, organisationId, {
        actorUserId: actor.userId,
        action: "organisation.ownership.transfer",
        targetType: "organisation",
        targetId: organisationId,
        before: { ownerMembershipId: actor.membershipId },
        after: { ownerMembershipId: m.id, previousOwnerRoles },
      });
      return memberViews(organisationId, await membersById(tx, organisationId, [actor.membershipId, m.id]), tx);
    });
  } catch (e) {
    // ORG-002 / ADR-006 (OQ-13 open): Organisation.ownerId is unique, so a user who already owns
    // another organisation cannot receive this one.
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      throw new HttpError(409, "ORGANISATION_LIMIT", "That member already manages an organisation");
    }
    throw e;
  }
}

function membersById(tx: Tx, organisationId: string, ids: string[]) {
  return forTenant(organisationId, tx).organisationMembership.findMany({
    where: { id: { in: ids } },
    select: { id: true, userId: true, title: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });
}
