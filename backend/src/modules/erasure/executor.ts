// ADR-031 §5: the erasure executor. One transaction per request; any failure rolls everything back and
// marks the request FAILED (retryable). Files are deleted after the commit.
import type { ErasureRequest } from "../../../generated/prisma/client.ts";
import { prisma } from "../../db.ts";
import { HttpError, safeErrorLog } from "../../errors.ts";
import { deleteObject, putOpaqueObject } from "../../storage.ts";
import { platformAudit } from "../rbac/rbac.ts";
import { forTenant } from "../tenancy/tenant.ts";
import { archiveOrganisation, discardArchive } from "./archive.ts";
import { delegateOf, registry } from "./registry.ts";
import { eraseUser } from "./user-erasure.ts";

type Del = { deleteMany(a: object): Promise<unknown> };

async function eraseOrganisation(r: ErasureRequest) {
  const organisationId = r.subjectId;
  let archived: Awaited<ReturnType<typeof archiveOrganisation>> = null;
  let files: string[] = [];
  try {
    await prisma.$transaction(
      async (tx) => {
        // Only this transaction may delete audit rows (the audit_log_append_only trigger); the setting ends with it.
        await tx.$queryRaw`SELECT set_config('app.erasure', ${organisationId}, true)`; // scoped to this organisation
        await tx.$queryRaw`SELECT 1 FROM "Organisation" WHERE "id" = ${organisationId}::uuid FOR UPDATE`;
        const org = await tx.organisation.findUnique({ where: { id: organisationId } });
        if (org) {
          // Ownership moved during the grace period: the person who asked is no longer entitled to ask.
          if (org.ownerId !== r.requestedByUserId) throw new HttpError(409, "OWNER_CHANGED", "The organisation owner changed");
          archived = await archiveOrganisation(organisationId, tx);
          const db = forTenant(organisationId, tx);
          files = [
            ...(await db.financeAttachment.findMany({ select: { objectKey: true } })).map((a) => a.objectKey),
            ...[org.logoKey, org.coverKey].filter((k): k is string => Boolean(k)),
          ];
          for (const model of registry) await (db as unknown as Record<string, Del>)[delegateOf(model)]!.deleteMany({});
          await tx.organisation.delete({ where: { id: organisationId } });
          await platformAudit(tx, {
            actorUserId: r.requestedByUserId,
            action: "organisation.erasure",
            targetOrganisationId: organisationId,
            details: { requestId: r.id, archived: Boolean(archived) },
          });
        }
        await tx.erasureRequest.update({ where: { id: r.id }, data: { status: "COMPLETED", finishedAt: new Date() } });
      },
      { timeout: Number(process.env["ERASURE_TX_TIMEOUT_MS"]) || 120_000 },
    );
  } catch (e) {
    if (archived) await discardArchive(archived);
    throw e;
  }
  for (const key of files) await deleteObject(key); // best effort; cached public copies expire with the CDN TTL (ADR-025)
}

// ADR-031 §7: a content-free record outside the database, replayed after a restore. Never undoes the erasure.
async function writeLedger(r: ErasureRequest) {
  try {
    await putOpaqueObject(`erasure-ledger/${r.id}.json`, Buffer.from(JSON.stringify({ kind: r.kind, subjectId: r.subjectId, finishedAt: new Date().toISOString() })));
  } catch (e) {
    console.error("erasure: ledger write failed", e instanceof Error ? e.name : "error");
  }
}

// Single instance (ADR-026): at start nothing can be running, so a RUNNING row is a crash leftover.
export const failInterrupted = () =>
  prisma.erasureRequest.updateMany({ where: { status: "RUNNING" }, data: { status: "FAILED", failureCode: "INTERRUPTED", finishedAt: new Date() } });

export async function runDueErasures(now = new Date()) {
  const due = await prisma.erasureRequest.findMany({
    where: { status: "PENDING_GRACE", executeAfter: { lte: now } },
    orderBy: { executeAfter: "asc" },
    take: 50,
  });
  for (const r of due) {
    // Claim: a request cancelled or taken by another runner since the read does not match.
    const { count } = await prisma.erasureRequest.updateMany({ where: { id: r.id, status: "PENDING_GRACE" }, data: { status: "RUNNING" } });
    if (count === 0) continue;
    try {
      await (r.kind === "ORGANISATION" ? eraseOrganisation(r) : eraseUser(r));
      await writeLedger(r);
    } catch (e) {
      console.error("erasure failed", r.id, safeErrorLog(e));
      await prisma.erasureRequest.update({
        where: { id: r.id },
        data: { status: "FAILED", failureCode: e instanceof HttpError ? e.code : "ERASURE_FAILED", finishedAt: new Date() },
      });
    }
  }
}
