// ADR-032 §3: the support grant is checked by the tenant guard, not by a role. Imported by tenancy/tenant.ts,
// so it must not import it (or rbac.ts): the audit row is written directly.
import type { Request } from "express";
import { prisma } from "../../db.ts";
import { HttpError } from "../../errors.ts";

// No membership exists under this id, so membership-derived roles are empty (fail closed).
export const SUPPORT_MEMBERSHIP_ID = "00000000-0000-0000-0000-000000000000";

// The admin's latest grant for this organisation, only if it is a granted, unexpired grant of a platform admin.
export async function supportGrantFor(userId: string, organisationId: string, now = new Date()) {
  const grant = await prisma.supportAccessGrant.findFirst({
    where: { organisationId, adminUserId: userId },
    orderBy: { createdAt: "desc" },
    select: { id: true, status: true, expiresAt: true },
  });
  if (!grant) return { grant: null, active: false };
  const admin = await prisma.user.findUnique({ where: { id: userId }, select: { isPlatformAdmin: true } });
  if (admin?.isPlatformAdmin !== true) return { grant: null, active: false }; // flag re-read every time (AUTH-008)
  return { grant, active: grant.status === "GRANTED" && grant.expiresAt !== null && grant.expiresAt > now };
}

// Called by requireTenant when the caller has no membership. Returns the tenant context for a valid
// read-only session, null when the caller has no grant at all (the guard then answers 404 as before),
// and throws 403 when a grant exists but is not usable (not granted, ended) or the request is not a GET.
export async function supportTenant(req: Request, organisationId: string) {
  const { grant, active } = await supportGrantFor(req.auth!.userId, organisationId);
  if (!grant) return null;
  if (!active) throw new HttpError(403, "SUPPORT_ACCESS_INACTIVE", "Support access is not active for this organisation");
  if (req.method !== "GET") throw new HttpError(403, "SUPPORT_READ_ONLY", "Support access is read-only");
  const org = await prisma.organisation.findUnique({ where: { id: organisationId }, select: { status: true } });
  if (!org) return null;
  // ADR-032 §5: one row per request made.
  await prisma.platformAuditLog.create({
    data: {
      actorUserId: req.auth!.userId,
      action: "support.access",
      targetOrganisationId: organisationId,
      details: { method: req.method, path: req.originalUrl.split("?")[0]! },
    },
  });
  return { organisationId, membershipId: SUPPORT_MEMBERSHIP_ID, status: org.status, support: true as const };
}
