// ADR-031 §6: opt-in retention. AES-256-GCM with a 32-byte per-organisation key that lives OUTSIDE the
// database, as a 0600 file in ERASURE_KEY_DIR (a directory on the server that is not part of the DB
// dump). Destroying the file at expiry is the destruction (ADR-029 §5). Opening an archive is not built.
import { createCipheriv, createDecipheriv, randomBytes, randomUUID } from "node:crypto";
import { access, constants, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Prisma } from "../../../generated/prisma/client.ts";
import { prisma } from "../../db.ts";
import { deleteObject, putOpaqueObject } from "../../storage.ts";
import { forTenant } from "../tenancy/tenant.ts";
import { delegateOf, registry } from "./registry.ts";

const keyDir = () => {
  const dir = process.env["ERASURE_KEY_DIR"]?.trim();
  if (!dir) throw new Error("archive: ERASURE_KEY_DIR is not set");
  return dir;
};
const keyFile = (organisationId: string) => join(keyDir(), `${organisationId}.key`);

// iv (12) | auth tag (16) | ciphertext
export function encrypt(key: Buffer, plain: Buffer) {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key, iv);
  const body = Buffer.concat([c.update(plain), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), body]);
}

export function decrypt(key: Buffer, blob: Buffer) {
  const d = createDecipheriv("aes-256-gcm", key, blob.subarray(0, 12));
  d.setAuthTag(blob.subarray(12, 28));
  return Buffer.concat([d.update(blob.subarray(28)), d.final()]); // throws on a wrong key or tampering
}

// Production startup check (ADR-031 §6): the key directory must be configured and writable. Created 0700.
export async function assertKeyDirWritable() {
  const dir = keyDir();
  await mkdir(dir, { recursive: true, mode: 0o700 });
  await access(dir, constants.W_OK);
}

export const readArchiveKey = (organisationId: string) => readFile(keyFile(organisationId));

// Snapshots the organisation and every registry table, encrypts it, stores the blob and records it.
// Returns null when the owner chose no retention. Runs in the erasure transaction `tx`; if that rolls back,
// the caller passes the returned record to discardArchive (the blob and key are outside the transaction).
// ponytail: whole organisation in memory; stream per table if an organisation ever outgrows that.
export async function archiveOrganisation(organisationId: string, tx: Prisma.TransactionClient = prisma, now = new Date()) {
  const setting = await forTenant(organisationId, tx).retentionSetting.findFirst();
  if (!setting) return null;
  const snapshot: Record<string, unknown> = { organisation: await tx.organisation.findUnique({ where: { id: organisationId } }) };
  for (const model of registry) {
    const delegate = (forTenant(organisationId, tx) as unknown as Record<string, { findMany(a: object): Promise<unknown[]> }>)[delegateOf(model)]!;
    snapshot[model] = await delegate.findMany({});
  }
  const plain = Buffer.from(JSON.stringify(snapshot, (_k, v) => (typeof v === "bigint" ? v.toString() : v)));
  const key = randomBytes(32);
  const file = keyFile(organisationId);
  await mkdir(join(file, ".."), { recursive: true, mode: 0o700 });
  await writeFile(file, key, { mode: 0o600 }); // a key with no ArchiveRecord is a crashed run's leftover: overwrite
  const storageKey = `archive/${organisationId}/${randomUUID()}.enc`;
  try {
    await putOpaqueObject(storageKey, encrypt(key, plain));
    const destroyAfter = new Date(now);
    destroyAfter.setUTCFullYear(destroyAfter.getUTCFullYear() + setting.years);
    return await tx.archiveRecord.create({ data: { organisationId, storageKey, destroyAfter } });
  } catch (e) {
    await discardArchive({ storageKey, organisationId });
    throw e;
  }
}

export async function discardArchive({ storageKey, organisationId }: { storageKey: string; organisationId: string }) {
  await rm(keyFile(organisationId), { force: true });
  await deleteObject(storageKey);
}

// Expiry: destroy the key first (that is what makes the blob unreadable), then the blob, then mark it.
export async function destroyExpiredArchives(now: Date) {
  const due = await prisma.archiveRecord.findMany({ where: { destroyAfter: { lte: now }, destroyedAt: null } });
  for (const r of due) {
    await discardArchive(r);
    await prisma.archiveRecord.update({ where: { id: r.id }, data: { destroyedAt: now } });
  }
  return due.length;
}
