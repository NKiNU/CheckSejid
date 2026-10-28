// ADR-014 / ADR-020: the one small object-storage module. S3 API directly; endpoint and bucket come from
// the environment. Private objects are read only through short-lived pre-signed URLs, issued by callers
// after their permission, entitlement and tenant checks. Keys are always generated server-side.
import { randomUUID } from "node:crypto";
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { scan, type FileType } from "./uploads.ts";

const EXT: Record<FileType, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "application/pdf": "pdf" };
export const DOWNLOAD_URL_TTL_SECONDS = 5 * 60; // ADR-020 §2

let cached: { client: S3Client; bucket: string; publicBucket: string; publicBaseUrl: string } | null = null;

function config() {
  if (cached) return cached;
  const env = (k: string) => {
    const v = process.env[k]?.trim();
    if (!v) throw new Error(`storage: ${k} is not set`);
    return v;
  };
  const endpoint = process.env["S3_ENDPOINT"]?.trim() || undefined; // unset = AWS
  cached = {
    client: new S3Client({
      region: env("S3_REGION"),
      endpoint,
      forcePathStyle: Boolean(endpoint), // MinIO / emulators
      credentials: { accessKeyId: env("S3_ACCESS_KEY_ID"), secretAccessKey: env("S3_SECRET_ACCESS_KEY") },
    }),
    bucket: env("S3_BUCKET"),
    // ADR-025 §1: logos/covers live in a separate public Space. Unset = same bucket (development only;
    // server.ts requires a distinct one in production).
    publicBucket: process.env["S3_PUBLIC_BUCKET"]?.trim() || env("S3_BUCKET"),
    publicBaseUrl: env("S3_PUBLIC_BASE_URL").replace(/\/+$/, ""),
  };
  return cached;
}

// Tests point the module at an emulator after setting the environment.
export function resetStorageConfig() {
  cached = null;
}

// ADR-025 §1: the key decides the Space, so a finance file can never be written to the public one.
export const bucketFor = (key: string) => (key.startsWith("public/") ? config().publicBucket : config().bucket);

// `prefix` is built by the caller from server-resolved ids only, e.g. `public/org/${organisationId}/logo`.
export const newObjectKey = (prefix: string, type: FileType) => `${prefix}/${randomUUID()}.${EXT[type]}`;

// Every upload passes the malware scan before it is stored (ADR-025 §2).
export async function putObject(key: string, body: Buffer, contentType: FileType) {
  await scan(body);
  // Spaces objects are private unless uploaded public-read; only public/ keys (logo, cover) ever are.
  const acl = key.startsWith("public/") ? ({ ACL: "public-read" } as const) : {};
  await config().client.send(new PutObjectCommand({ Bucket: bucketFor(key), Key: key, Body: body, ContentType: contentType, ...acl }));
}

// ADR-031 §6: erasure archives are already encrypted and opaque, so they skip the type check and scan.
export async function putOpaqueObject(key: string, body: Buffer) {
  await config().client.send(new PutObjectCommand({ Bucket: bucketFor(key), Key: key, Body: body, ContentType: "application/octet-stream" }));
}

// Best effort: an orphaned object is harmless, a failed request must not fail the user's action.
export async function deleteObject(key: string) {
  await config().client.send(new DeleteObjectCommand({ Bucket: bucketFor(key), Key: key })).catch((e: unknown) => {
    console.error("storage: delete failed", key, e instanceof Error ? e.name : "error");
  });
}

// Public prefix only (logo, cover). Finance evidence is never public (ADR-014).
export function publicUrl(key: string | null) {
  if (!key) return null;
  if (!key.startsWith("public/")) throw new Error("storage: not a public key");
  return `${config().publicBaseUrl}/${key}`;
}

// Served as an attachment so it is never rendered as HTML from the application origin (ADR-014).
export async function presignedDownloadUrl(key: string) {
  return getSignedUrl(config().client, new GetObjectCommand({ Bucket: bucketFor(key), Key: key, ResponseContentDisposition: "attachment" }), {
    expiresIn: DOWNLOAD_URL_TTL_SECONDS,
  });
}

export async function getObjectBytes(key: string) {
  const res = await config().client.send(new GetObjectCommand({ Bucket: bucketFor(key), Key: key }));
  return Buffer.from(await res.Body!.transformToByteArray());
}
