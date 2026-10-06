import type { RequestHandler } from "express";
import type { Prisma } from "../../../generated/prisma/client.ts";
import { prisma } from "../../db.ts";
import { HttpError } from "../../errors.ts";
import { forTenant, orgNotFound } from "../tenancy/tenant.ts";
import { isPermission, permissionsOf, type Permission, type RoleKey } from "./permissions.ts";

export type TenantContext = { organisationId: string; membershipId: string };

export const forbidden = (message = "You do not have permission to do this") =>
  new HttpError(403, "FORBIDDEN", message);
// RBAC-009 subset rule failed: the actor lacks some permission of a role they tried to grant/revoke.
export const roleNotGrantable = () =>
  new HttpError(403, "ROLE_NOT_GRANTABLE", "You can only grant or revoke roles whose permissions you hold");

// The membership's roles, read from the database on every call (ADR-009: never from the token).
// `owner` is derived from Organisation.ownerId; the others are MembershipRole rows.
// A membership that does not exist in this organisation has no roles (fail closed, RBAC-010).
export async function membershipRoles(t: TenantContext, db: Prisma.TransactionClient = prisma): Promise<RoleKey[]> {
  // Sequential, not Promise.all: `db` may be a transaction client (one connection).
  const membership = await forTenant(t.organisationId, db).organisationMembership.findUnique({
    where: { id: t.membershipId },
    select: { userId: true },
  });
  const org = await db.organisation.findUnique({ where: { id: t.organisationId }, select: { ownerId: true } });
  const rows = await forTenant(t.organisationId, db).membershipRole.findMany({
    where: { membershipId: t.membershipId },
    select: { role: true },
    orderBy: { role: "asc" }, // enum declaration order
  });
  if (!membership || !org) return [];
  return [...(org.ownerId === membership.userId ? (["owner"] as const) : []), ...rows.map((r) => r.role)];
}

export async function effectivePermissions(t: TenantContext, db?: Prisma.TransactionClient) {
  return permissionsOf(await membershipRoles(t, db));
}

// Service-level check. Unknown keys are denied (RBAC-010).
export async function hasPermission(t: TenantContext, key: Permission, db?: Prisma.TransactionClient) {
  return isPermission(key) && (await effectivePermissions(t, db)).has(key);
}

// Route guard: requireAuth → requireTenant → requirePermission(key). Non-members already got 404
// from requireTenant; members without the key get 403 FORBIDDEN (RBAC-003). Re-evaluated on every
// request, so a role change takes effect on the next request.
//
// Entitlements (Phase 11, RBAC-004) are a SEPARATE guard chained after this one
// (subscriptions/entitlements.ts requireEntitlement), e.g.
//   router.post(path, requirePermission("finance.expense.create"), requireEntitlement("finance"), h)
// This function must never look at the plan or subscription.
export function requirePermission(key: Permission): RequestHandler {
  if (!isPermission(key)) throw new Error(`requirePermission: unknown permission key "${key}"`); // RBAC-007
  const guard: RequestHandler = async (req, _res, next) => {
    if (!req.tenant) return next(orgNotFound()); // mounted without requireTenant: fail closed
    next((await hasPermission(req.tenant, key)) ? undefined : forbidden());
  };
  // Lets the route-declaration test find which permission guards a route.
  return Object.assign(guard, { permission: key });
}

// ADR-015 §5: the Platform Administrator flag is re-read from the database on every request
// (AUTH-008). Use after requireAuth on /platform/* routes (Phase 04). Grants no tenant permissions.
export const requirePlatformAdmin: RequestHandler = async (req, _res, next) => {
  if (!req.auth) return next(new HttpError(401, "UNAUTHENTICATED", "Authentication required"));
  const user = await prisma.user.findUnique({ where: { id: req.auth.userId }, select: { isPlatformAdmin: true } });
  next(user?.isPlatformAdmin === true ? undefined : forbidden());
};

// Tenant audit record (RBAC-011). Call inside the transaction that makes the change.
export function audit(
  tx: Prisma.TransactionClient,
  organisationId: string,
  entry: { actorUserId: string; action: string; targetType: string; targetId: string; before?: unknown; after?: unknown },
) {
  return forTenant(organisationId, tx).auditLog.create({
    data: {
      ...entry,
      before: entry.before as Prisma.InputJsonValue | undefined,
      after: entry.after as Prisma.InputJsonValue | undefined,
    } as Prisma.AuditLogUncheckedCreateInput, // organisationId stamped by forTenant
  });
}

// Platform audit record (ADR-015 §5). actorUserId null = out of band (CLI).
export function platformAudit(
  db: Prisma.TransactionClient,
  entry: {
    actorUserId: string | null;
    action: string;
    targetUserId?: string;
    targetOrganisationId?: string;
    reason?: string;
    details?: Prisma.InputJsonValue;
  },
) {
  return db.platformAuditLog.create({ data: entry });
}
