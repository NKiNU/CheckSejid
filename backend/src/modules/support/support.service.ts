// ADR-030/032 consented support access. Only the owner approves, denies, extends or revokes (the routes
// require an owner-only key); a grant is for one named admin, one organisation, one window.
import type { Prisma, SupportAccessGrant } from "../../../generated/prisma/client.ts";
import { prisma } from "../../db.ts";
import { HttpError } from "../../errors.ts";
import type { NotificationType } from "../notifications/notifications.service.ts";
import { platformAudit } from "../rbac/rbac.ts";
import { forTenant, orgNotFound } from "../tenancy/tenant.ts";

const HOUR = 3_600_000;
type Tx = Prisma.TransactionClient;

const notFound = () => new HttpError(404, "SUPPORT_REQUEST_NOT_FOUND", "Support request not found");
const conflict = () => new HttpError(409, "INVALID_STATE_TRANSITION", "This request is not in a state that allows that");

// EXPIRED is computed on read; endExpired() persists it.
export const view = (g: SupportAccessGrant, now = new Date()) => ({
  id: g.id,
  organisationId: g.organisationId,
  adminUserId: g.adminUserId,
  reason: g.reason,
  status: g.status === "GRANTED" && g.expiresAt && g.expiresAt <= now ? "EXPIRED" : g.status,
  grantedAt: g.grantedAt,
  expiresAt: g.expiresAt,
  createdAt: g.createdAt,
});

// ADR-032 §5: the owner (only) is told. ADR-017 §1's "all members" would show the reason's existence to staff.
async function tellOwner(tx: Tx, g: SupportAccessGrant, type: NotificationType, title: string) {
  const org = await tx.organisation.findUniqueOrThrow({ where: { id: g.organisationId }, select: { ownerId: true } });
  await forTenant(g.organisationId, tx).notification.create({
    data: { recipientUserId: org.ownerId, actorUserId: g.adminUserId, type, title, targetType: "support_grant", targetId: g.id },
  } as Prisma.NotificationCreateArgs);
}

const auditGrant = (tx: Tx, actor: string, action: string, g: SupportAccessGrant, details?: Prisma.InputJsonValue) =>
  platformAudit(tx, { actorUserId: actor, action, targetUserId: g.adminUserId, targetOrganisationId: g.organisationId, reason: g.reason, details });

export async function requestAccess(adminUserId: string, organisationId: string, reason: string) {
  return prisma.$transaction(async (tx) => {
    if (!(await tx.organisation.findUnique({ where: { id: organisationId }, select: { id: true } }))) throw orgNotFound();
    const open = await tx.supportAccessGrant.count({ where: { organisationId, adminUserId, status: "REQUESTED" } });
    if (open > 0) throw new HttpError(409, "REQUEST_ALREADY_OPEN", "You already have an open request for this organisation");
    const g = await tx.supportAccessGrant.create({ data: { organisationId, adminUserId, reason } });
    await auditGrant(tx, adminUserId, "support.request", g);
    await tellOwner(tx, g, "support.requested", "Support access requested");
    return view(g);
  });
}

// Owner decisions. Each is one conditional update on (id, organisationId, status): a stale or foreign id
// matches nothing, so it is 404, and a wrong state is 409.
async function decide(
  ownerId: string,
  organisationId: string,
  id: string,
  from: "REQUESTED" | "GRANTED",
  data: Prisma.SupportAccessGrantUpdateManyMutationInput,
  action: string,
  notify?: [NotificationType, string],
  now = new Date(),
) {
  return prisma.$transaction(async (tx) => {
    const where = { id, organisationId, ...(from === "GRANTED" ? { expiresAt: { gt: now } } : {}) };
    if ((await tx.supportAccessGrant.count({ where })) === 0) throw notFound();
    const done = await tx.supportAccessGrant.updateMany({ where: { ...where, status: from }, data });
    if (done.count === 0) throw conflict();
    const g = await tx.supportAccessGrant.findUniqueOrThrow({ where: { id } });
    await auditGrant(tx, ownerId, action, g, g.expiresAt ? { expiresAt: g.expiresAt.toISOString() } : undefined);
    if (notify) await tellOwner(tx, g, ...notify);
    return view(g, now);
  });
}

export const approve = (ownerId: string, orgId: string, id: string, now = new Date()) =>
  decide(ownerId, orgId, id, "REQUESTED", { status: "GRANTED", grantedAt: now, expiresAt: new Date(now.getTime() + HOUR) }, "support.grant", ["support.started", "Support access started"], now);
export const deny = (ownerId: string, orgId: string, id: string) =>
  decide(ownerId, orgId, id, "REQUESTED", { status: "DENIED" }, "support.deny");
export const revoke = (ownerId: string, orgId: string, id: string) =>
  decide(ownerId, orgId, id, "GRANTED", { status: "REVOKED" }, "support.revoke", ["support.ended", "Support access ended"]);

// "Adding up to 1 hour per action" (ADR-032 §2): the caller validates 1..60.
export async function extend(ownerId: string, orgId: string, id: string, minutes: number, now = new Date()) {
  return prisma.$transaction(async (tx) => {
    const where = { id, organisationId: orgId };
    const g = await tx.supportAccessGrant.findFirst({ where });
    if (!g) throw notFound();
    if (g.status !== "GRANTED" || !g.expiresAt || g.expiresAt <= now) throw conflict();
    // conditional on the expiry we read, so two concurrent extends cannot both apply to a stale value
    const done = await tx.supportAccessGrant.updateMany({
      where: { ...where, status: "GRANTED", expiresAt: g.expiresAt },
      data: { expiresAt: new Date(g.expiresAt.getTime() + minutes * 60_000) },
    });
    if (done.count === 0) throw conflict();
    const after = await tx.supportAccessGrant.findUniqueOrThrow({ where: { id } });
    await auditGrant(tx, ownerId, "support.extend", after, { minutes, expiresAt: after.expiresAt!.toISOString() });
    return view(after, now);
  });
}

// Persist expiry: EXPIRED + audit "end" + owner notification, once per grant. Called before the owner's
// reads and by a scheduler (not wired in B; ADR-032 says nothing about cadence).
export async function endExpired(now = new Date(), organisationId?: string) {
  const due = await prisma.supportAccessGrant.findMany({
    where: { status: "GRANTED", expiresAt: { lte: now }, ...(organisationId && { organisationId }) },
    select: { id: true },
  });
  for (const { id } of due) {
    await prisma.$transaction(async (tx) => {
      const done = await tx.supportAccessGrant.updateMany({ where: { id, status: "GRANTED", expiresAt: { lte: now } }, data: { status: "EXPIRED" } });
      if (done.count === 0) return; // someone else ended it
      const g = await tx.supportAccessGrant.findUniqueOrThrow({ where: { id } });
      await auditGrant(tx, g.adminUserId, "support.end", g, { reason: "expired" });
      await tellOwner(tx, g, "support.ended", "Support access ended");
    });
  }
}

export async function ownerRequests(organisationId: string) {
  await endExpired(new Date(), organisationId);
  const rows = await forTenant(organisationId).supportAccessGrant.findMany({ orderBy: { createdAt: "desc" }, take: 50 });
  const admins = await prisma.user.findMany({ where: { id: { in: rows.map((r) => r.adminUserId) } }, select: { id: true, displayName: true } });
  const name = new Map(admins.map((a) => [a.id, a.displayName]));
  return rows.map((r) => ({ ...view(r), adminName: name.get(r.adminUserId) ?? null }));
}

// The owner's view of the platform audit log, for their organisation only.
export const ownerLog = (organisationId: string, limit: number) =>
  prisma.platformAuditLog.findMany({
    where: { targetOrganisationId: organisationId, action: { startsWith: "support." } },
    select: { id: true, action: true, actorUserId: true, reason: true, details: true, createdAt: true },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit,
  });

export async function adminRequests(adminUserId: string) {
  const rows = await prisma.supportAccessGrant.findMany({ where: { adminUserId }, orderBy: { createdAt: "desc" }, take: 50 });
  const orgs = await prisma.organisation.findMany({ where: { id: { in: rows.map((r) => r.organisationId) } }, select: { id: true, name: true } });
  const name = new Map(orgs.map((o) => [o.id, o.name]));
  return rows.map((r) => ({ ...view(r), organisationName: name.get(r.organisationId) ?? null }));
}
