// ADR-014 / ADR-020: the one small object-storage module. S3 API directly; endpoint and bucket come from
// the environment. Private objects are read only through short-lived pre-signed URLs, issued by callers
// after their permission, entitlement and tenant checks. Keys are always generated server-side.
import { randomUUID } from "node:crypto";
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { FileType } from "./uploads.ts";

const EXT: Record<FileType, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "application/pdf": "pdf" };
export const DOWNLOAD_URL_TTL_SECONDS = 5 * 60; // ADR-020 §2

let cached: { client: S3Client; bucket: string; publicBaseUrl: string } | null = null;

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
    publicBaseUrl: env("S3_PUBLIC_BASE_URL").replace(/\/+$/, ""),
  };
  return cached;
}

// Tests point the module at an emulator after setting the environment.
export function resetStorageConfig() {
  cached = null;
}

// `prefix` is built by the caller from server-resolved ids only, e.g. `public/org/${organisationId}/logo`.
export const newObjectKey = (prefix: string, type: FileType) => `${prefix}/${randomUUID()}.${EXT[type]}`;

export async function putObject(key: string, body: Buffer, contentType: FileType) {
  const { client, bucket } = config();
  await client.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: contentType }));
}

// Best effort: an orphaned object is harmless, a failed request must not fail the user's action.
export async function deleteObject(key: string) {
  const { client, bucket } = config();
  await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key })).catch((e: unknown) => {
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
  const { client, bucket } = config();
  return getSignedUrl(client, new GetObjectCommand({ Bucket: bucket, Key: key, ResponseContentDisposition: "attachment" }), {
    expiresIn: DOWNLOAD_URL_TTL_SECONDS,
  });
}

export async function getObjectBytes(key: string) {
  const { client, bucket } = config();
  const res = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  return Buffer.from(await res.Body!.transformToByteArray());
}
