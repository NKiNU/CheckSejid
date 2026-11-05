// ADR-033 §5: remove location/camera metadata from hub images before they are stored, without
// decoding or re-encoding (pure segment/chunk removal, so no dependency and no quality loss).
// JPEG: APP1 (EXIF, XMP) and APP13 (IPTC/Photoshop). PNG: eXIf, tEXt, iTXt, zTXt. WebP: EXIF, XMP.
// A structurally broken file is rejected: it could hide data in the part we cannot parse.
import { HttpError } from "./errors.ts";
import type { FileType } from "./uploads.ts";

const invalid = () => new HttpError(400, "INVALID_IMAGE", "The image file is damaged or incomplete");
const need = (ok: boolean) => {
  if (!ok) throw invalid();
};

function jpeg(b: Buffer) {
  const out: Buffer[] = [b.subarray(0, 2)];
  let pos = 2;
  while (pos < b.length) {
    need(b[pos] === 0xff);
    if (b[pos + 1] === 0xff) {
      pos++; // fill byte
      continue;
    }
    const marker = b[pos + 1]!;
    if (marker === 0xda || marker === 0xd9) return Buffer.concat([...out, b.subarray(pos)]); // scan data / end: copied as is
    need(pos + 4 <= b.length);
    const end = pos + 2 + b.readUInt16BE(pos + 2);
    need(end <= b.length);
    if (marker !== 0xe1 && marker !== 0xed) out.push(b.subarray(pos, end));
    pos = end;
  }
  throw invalid();
}

function png(b: Buffer) {
  const drop = new Set(["eXIf", "tEXt", "iTXt", "zTXt"]);
  const out: Buffer[] = [b.subarray(0, 8)];
  for (let pos = 8; pos < b.length; ) {
    need(pos + 12 <= b.length);
    const end = pos + 12 + b.readUInt32BE(pos);
    need(end <= b.length);
    const type = b.toString("latin1", pos + 4, pos + 8);
    if (!drop.has(type)) out.push(b.subarray(pos, end));
    if (type === "IEND") return Buffer.concat(out);
    pos = end;
  }
  throw invalid();
}

function webp(b: Buffer) {
  const end = 8 + b.readUInt32LE(4);
  need(end <= b.length && end >= 12);
  const out: Buffer[] = [];
  for (let pos = 12; pos < end; ) {
    need(pos + 8 <= end);
    const next = pos + 8 + b.readUInt32LE(pos + 4) + (b.readUInt32LE(pos + 4) % 2);
    need(next <= end);
    const fourcc = b.toString("latin1", pos, pos + 4);
    if (fourcc === "VP8X") {
      const chunk = Buffer.from(b.subarray(pos, next));
      need(chunk.length >= 18);
      chunk[8]! &= ~(0x08 | 0x04); // EXIF and XMP flags
      out.push(chunk);
    } else if (fourcc !== "EXIF" && fourcc !== "XMP ") out.push(b.subarray(pos, next));
    pos = next;
  }
  const body = Buffer.concat([b.subarray(8, 12), ...out]);
  const size = Buffer.alloc(4);
  size.writeUInt32LE(body.length);
  return Buffer.concat([b.subarray(0, 4), size, body]);
}

export function stripImageMetadata(bytes: Buffer, type: FileType) {
  if (type === "image/jpeg") return jpeg(bytes);
  if (type === "image/png") return png(bytes);
  if (type === "image/webp") return webp(bytes);
  throw invalid();
}
