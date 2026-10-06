// TEST-ONLY: an in-process S3 emulator (s3rver) for the storage module (ADR-020 §4).
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AddressInfo } from "node:net";
// @ts-expect-error s3rver ships no types
import S3rver from "s3rver";
import { resetStorageConfig } from "../storage.ts";

export const TEST_BUCKET = "masyarakat-test";

export async function startS3() {
  const dir = mkdtempSync(join(tmpdir(), "s3rver-"));
  const server = new S3rver({ port: 0, address: "127.0.0.1", silent: true, directory: dir, configureBuckets: [{ name: TEST_BUCKET }] });
  const { port } = (await server.run()) as AddressInfo;
  Object.assign(process.env, {
    S3_ENDPOINT: `http://127.0.0.1:${port}`,
    S3_REGION: "us-east-1",
    S3_BUCKET: TEST_BUCKET,
    S3_ACCESS_KEY_ID: "S3RVER",
    S3_SECRET_ACCESS_KEY: "S3RVER",
    S3_PUBLIC_BASE_URL: `http://127.0.0.1:${port}/${TEST_BUCKET}`,
  });
  resetStorageConfig();
  return async () => {
    await server.close();
    rmSync(dir, { recursive: true, force: true });
  };
}

// Minimal valid file headers for upload tests.
export const FILES = {
  png: Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32, 1)]),
  jpeg: Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(32, 2)]),
  webp: Buffer.concat([Buffer.from("RIFF"), Buffer.alloc(4), Buffer.from("WEBP"), Buffer.alloc(32, 3)]),
  pdf: Buffer.from("%PDF-1.7\n%test\n"),
  html: Buffer.from("<html><script>alert(1)</script></html>"),
};
