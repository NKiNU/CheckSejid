// ADR-031 §2/§3/§6/§8: erasure requests, cancel, retry and the retention choice.
import argon2 from "argon2";
import { Prisma, type ErasureKind } from "../../../generated/prisma/client.ts";
import { prisma } from "../../db.ts";
import { HttpError } from "../../errors.ts";
import { notify } from "../notifications/notifications.service.ts";
import { forTenant } from "../tenancy/tenant.ts";
import { mustHandOver, ownsOrganisation } from "./user-erasure.ts";

export const GRACE_MS = 7 * 24 * 60 * 60 * 1000;
export const RETENTION_YEARS = [1, 3, 5, 7] as const;

const view = (r: { id: string; kind: ErasureKind; status: string; executeAfter: Date; createdAt: Date; finishedAt: Date | null; failureCode: string | null }) => ({
  id: r.id, kind: r.kind, status: r.status, executeAfter: r.executeAfter, createdAt: r.createdAt, finishedAt: r.finishedAt, failureCode: r.failureCode,
});

// Same answer as login for a wrong password (INVALID_CREDENTIALS), as AUTH-007 does.
async function verifyPassword(userId: string, password: string) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { passwordHash: true } });
  if (!user || !(await argon2.verify(user.passwordHash, password))) throw new HttpError(401, "INVALID_CREDENTIALS", "Invalid email or password");
}

const duplicate = (e: unknown) =>
  e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002"
    ? new HttpError(409, "ERASURE_ALREADY_REQUESTED", "A deletion request is already open")
    : e;

const notifyRequested = (tx: Prisma.TransactionClient, organisationId: string, userId: string, requestId: string) =>
  notify(tx, { organisationId, actorUserId: userId, type: "erasure.requested", title: "Deletion of this organisation was requested", targetType: "erasure_request", targetId: requestId });

// Only the owner reaches this (route guard). The grace period starts now; members are told (ADR-017).
export async function requestOrganisationErasure(organisationId: string, userId: string, password: string) {
  await verifyPassword(userId, password);
  try {
    return await prisma.$transaction(async (tx) => {
      const r = await tx.erasureRequest.create({
        data: { kind: "ORGANISATION", subjectId: organisationId, requestedByUserId: userId, executeAfter: new Date(Date.now() + GRACE_MS) },
      });
      await notifyRequested(tx, organisationId, userId, r.id);
      return view(r);
    });
  } catch (e) {
    throw duplicate(e);
  }
}

export async function requestUserErasure(userId: string, password: string) {
  await verifyPassword(userId, password);
  if (await ownsOrganisation(userId)) throw mustHandOver(); // ADR-031 §3
  try {
    return view(
      await prisma.erasureRequest.create({
        data: { kind: "USER", subjectId: userId, requestedByUserId: userId, executeAfter: new Date(Date.now() + GRACE_MS) },
      }),
    );
  } catch (e) {
    throw duplicate(e);
  }
}

export async function cancelErasure(kind: ErasureKind, subjectId: string, userId: string) {
  return prisma.$transaction(async (tx) => {
    // Conditional on PENDING_GRACE: a request already running cannot be cancelled.
    const open = await tx.erasureRequest.findFirst({ where: { kind, subjectId, status: "PENDING_GRACE" } });
    if (!open) throw new HttpError(404, "NO_PENDING_ERASURE", "No deletion request is waiting");
    const { count } = await tx.erasureRequest.updateMany({ where: { id: open.id, status: "PENDING_GRACE" }, data: { status: "CANCELLED", finishedAt: new Date() } });
    if (count === 0) throw new HttpError(404, "NO_PENDING_ERASURE", "No deletion request is waiting");
    if (kind === "ORGANISATION") {
      await notify(tx, { organisationId: subjectId, actorUserId: userId, type: "erasure.cancelled", title: "Deletion of this organisation was cancelled", targetType: "erasure_request", targetId: open.id });
    }
    return view({ ...open, status: "CANCELLED", finishedAt: new Date() });
  });
}

// A FAILED request goes back to the queue; the next scheduler run picks it up. Needs the password like
// a new request (ADR-031 amendment §2), and an organisation's members are told.
export async function retryErasure(kind: ErasureKind, subjectId: string, userId: string, password: string) {
  await verifyPassword(userId, password);
  try {
    const failed = await prisma.erasureRequest.findFirst({ where: { kind, subjectId, status: "FAILED" }, orderBy: { createdAt: "desc" } });
    if (!failed) throw new HttpError(404, "NO_FAILED_ERASURE", "No failed deletion request");
    await prisma.$transaction(async (tx) => {
      const { count } = await tx.erasureRequest.updateMany({
        where: { id: failed.id, status: "FAILED" },
        data: { status: "PENDING_GRACE", executeAfter: new Date(), failureCode: null, finishedAt: null },
      });
      if (count === 0) throw new HttpError(404, "NO_FAILED_ERASURE", "No failed deletion request");
      if (kind === "ORGANISATION") await notifyRequested(tx, subjectId, userId, failed.id);
    });
    return view({ ...failed, status: "PENDING_GRACE", failureCode: null, finishedAt: null });
  } catch (e) {
    throw duplicate(e);
  }
}

export async function currentErasure(kind: ErasureKind, subjectId: string) {
  const r = await prisma.erasureRequest.findFirst({ where: { kind, subjectId }, orderBy: { createdAt: "desc" } });
  return r && view(r);
}

export async function getRetention(organisationId: string) {
  return (await forTenant(organisationId).retentionSetting.findFirst({ select: { years: true } }))?.years ?? null;
}

// null = no retention (immediate erasure, ADR-029 §1).
export async function setRetention(organisationId: string, years: number | null) {
  if (years !== null && !(RETENTION_YEARS as readonly number[]).includes(years)) throw new HttpError(400, "VALIDATION_ERROR", "Retention must be 1, 3, 5 or 7 years");
  const db = forTenant(organisationId);
  // The executor reads the setting when it runs, so a change then would race the archive.
  if (await prisma.erasureRequest.count({ where: { kind: "ORGANISATION", subjectId: organisationId, status: { in: ["PENDING_GRACE", "RUNNING"] } } }))
    throw new HttpError(409, "ERASURE_IN_PROGRESS", "Retention cannot change while a deletion request is open");
  if (years === null) await db.retentionSetting.deleteMany({ where: {} });
  else {
    const { count } = await db.retentionSetting.updateMany({ where: {}, data: { years } });
    if (count === 0) await db.retentionSetting.create({ data: { years } as Prisma.RetentionSettingUncheckedCreateInput });
  }
  return years;
}
