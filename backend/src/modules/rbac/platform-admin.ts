import { prisma } from "../../db.ts";
import { platformAudit } from "./rbac.ts";

// ADR-015 §5 / RBAC-012: the ONLY code path that changes User.isPlatformAdmin. Used by the CLI
// (platform-admin.cli.ts), never by a route. Audited as an out-of-band action (actor null).
export async function setPlatformAdmin(email: string, on: boolean, reason?: string) {
  return prisma.$transaction(async (tx) => {
    const user = await tx.user.update({
      where: { email: email.trim().toLowerCase() },
      data: { isPlatformAdmin: on },
      select: { id: true, email: true, isPlatformAdmin: true },
    });
    await platformAudit(tx, {
      actorUserId: null,
      action: on ? "platform_admin.grant" : "platform_admin.revoke",
      targetUserId: user.id,
      reason,
    });
    return user;
  });
}
