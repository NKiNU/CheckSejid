// ADR-020 §1: uploads arrive as the raw request body. Mount `rawUpload(limit)` AFTER auth, tenant,
// permission and lifecycle guards, so nobody can make the server buffer a body they may not send.
import express, { type RequestHandler } from "express";
import { HttpError } from "./errors.ts";

export type FileType = "image/jpeg" | "image/png" | "image/webp" | "application/pdf";
export const IMAGE_TYPES: readonly FileType[] = ["image/jpeg", "image/png", "image/webp"];
export const EVIDENCE_TYPES: readonly FileType[] = [...IMAGE_TYPES, "application/pdf"];
export const MB = 1024 * 1024;

// The type is decided by the leading bytes only; the client's filename and Content-Type are ignored.
export function sniff(buf: Buffer): FileType | null {
  const at = (offset: number, bytes: number[]) => bytes.every((b, i) => buf[offset + i] === b);
  if (buf.length >= 3 && at(0, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (buf.length >= 8 && at(0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (buf.length >= 12 && buf.toString("latin1", 0, 4) === "RIFF" && buf.toString("latin1", 8, 12) === "WEBP") return "image/webp";
  if (buf.length >= 5 && buf.toString("latin1", 0, 5) === "%PDF-") return "application/pdf";
  return null;
}

export const fileTooLarge = (limit: number) => new HttpError(413, "FILE_TOO_LARGE", `File is larger than ${limit / MB} MB`);

// Accepts any Content-Type (it is not trusted). express.raw stops reading at `limit`.
export function rawUpload(limit: number): RequestHandler {
  const raw = express.raw({ type: () => true, limit });
  return (req, res, next) =>
    raw(req, res, (err?: unknown) => {
      const e = err as { type?: string } | undefined;
      if (e?.type === "entity.too.large") return next(fileTooLarge(limit));
      next(err);
    });
}

// Returns the detected type, or throws 400/415.
export function checkUpload(body: unknown, allowed: readonly FileType[]): { bytes: Buffer; type: FileType } {
  if (!Buffer.isBuffer(body) || body.length === 0) throw new HttpError(400, "FILE_REQUIRED", "Send the file as the request body");
  const type = sniff(body);
  if (!type || !allowed.includes(type)) {
    throw new HttpError(415, "UNSUPPORTED_FILE_TYPE", `Allowed file types: ${allowed.join(", ")}`);
  }
  return { bytes: body, type };
}
