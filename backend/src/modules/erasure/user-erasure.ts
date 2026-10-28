// ADR-031 §3/§4: account erasure. The user row stays (history that references it keeps working) with
// its personal fields replaced; memberships go through the audited leave flow.
import { randomBytes } from "node:crypto";
import argon2 from "argon2";
import type { ErasureRequest } from "../../../generated/prisma/client.ts";
import { prisma } from "../../db.ts";
import { HttpError } from "../../errors.ts";
import { leave } from "../rbac/rbac.service.ts";

export const ownsOrganisation = async (userId: string) => Boolean(await prisma.organisation.findUnique({ where: { ownerId: userId }, select: { id: true } }));
export const mustHandOver = () => new HttpError(409, "OWNS_ORGANISATION", "Delete or hand over your organisation before deleting your account");

export async function eraseUser(r: ErasureRequest) {
  const userId = r.subjectId;
  if (await ownsOrganisation(userId)) throw mustHandOver(); // may have changed since the request
  const memberships = await prisma.organisationMembership.findMany({ where: { userId }, select: { id: true, organisationId: true } });
  for (const m of memberships) await leave({ organisationId: m.organisationId, membershipId: m.id, userId });
  // An unknowable password hash: login still runs a real argon2 verify and simply fails.
  const passwordHash = await argon2.hash(randomBytes(32).toString("base64"), { type: argon2.argon2id });
  await prisma.$transaction(async (tx) => {
    await tx.refreshToken.deleteMany({ where: { userId } });
    await tx.follow.deleteMany({ where: { userId } });
    await tx.notification.deleteMany({ where: { recipientUserId: userId } });
    const { count } = await tx.user.updateMany({
      where: { id: userId },
      data: { email: `deleted-${userId}@invalid`, displayName: "Deleted user", passwordHash, isPlatformAdmin: false },
    });
    await tx.platformAuditLog.create({ data: { actorUserId: userId, action: "user.erasure", targetUserId: userId, details: { requestId: r.id, memberships: memberships.length, userFound: count > 0 } } });
    await tx.erasureRequest.update({ where: { id: r.id }, data: { status: "COMPLETED", finishedAt: new Date() } });
  });
}
