import { prisma } from "../../db.ts";
import { platformAudit } from "./rbac.ts";

// ADR-015 §5 / RBAC-012: the ONLY code path that changes User.isPlatformAdmin. Used by the CLI
// (platform-admin.cli.ts), never by a route. Audited as an out-of-band action (actor null), with a
// required reason. A platform admin is a separate account: it may hold no membership and own no
// organisation (§5 assumption), so granting to a tenant account is refused.
export async function setPlatformAdmin(email: string, on: boolean, reason: string) {
  if (!reason?.trim()) throw new Error("A reason is required");
  return prisma.$transaction(async (tx) => {
    const target = await tx.user.findUniqueOrThrow({ where: { email: email.trim().toLowerCase() }, select: { id: true } });
    if (on) {
      // Lock the user row so a concurrent membership insert (FK share lock) cannot slip in.
      await tx.$queryRaw`SELECT 1 FROM "User" WHERE "id" = ${target.id}::uuid FOR UPDATE`;
      const memberships = await tx.organisationMembership.count({ where: { userId: target.id } });
      const owned = await tx.organisation.count({ where: { ownerId: target.id } });
      if (memberships + owned > 0) {
        throw new Error("Refused: this account belongs to an organisation; use a separate platform account");
      }
    }
    const user = await tx.user.update({
      where: { id: target.id },
      data: { isPlatformAdmin: on },
      select: { id: true, email: true, isPlatformAdmin: true },
    });
    await platformAudit(tx, {
      actorUserId: null,
      action: on ? "platform_admin.grant" : "platform_admin.revoke",
      targetUserId: user.id,
      reason: reason.trim(),
    });
    return user;
  });
}
