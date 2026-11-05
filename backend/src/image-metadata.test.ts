import { describe, expect, it } from "vitest";
import { stripImageMetadata } from "./image-metadata.ts";
import { GPS, JPEG_PIXELS, jpegWithGps, pngPlain, pngWithGps, webpPixels, webpPlain, webpWithGps } from "./test/images.ts";

const has = (b: Buffer, s: string) => b.includes(Buffer.from(s));

describe("stripImageMetadata (ADR-033 §5)", () => {
  it("JPEG: drops APP1 (EXIF/XMP) and APP13, keeps the image segments intact", () => {
    const out = stripImageMetadata(jpegWithGps(), "image/jpeg");
    expect(has(out, GPS) || has(out, "Exif")).toBe(false);
    expect(out.subarray(0, 2)).toEqual(Buffer.from([0xff, 0xd8]));
    expect(has(out, "JFIF")).toBe(true);
    expect(out.subarray(out.length - JPEG_PIXELS.length).equals(JPEG_PIXELS)).toBe(true);
  });

  it("PNG: drops eXIf/tEXt/iTXt/zTXt, keeps IHDR/IDAT/IEND byte for byte", () => {
    expect(stripImageMetadata(pngWithGps(), "image/png").equals(pngPlain())).toBe(true);
  });

  it("WebP: drops EXIF and XMP chunks, clears the VP8X flags and fixes the RIFF size", () => {
    const out = stripImageMetadata(webpWithGps(), "image/webp");
    expect(has(out, GPS)).toBe(false);
    expect(out.readUInt32LE(4)).toBe(out.length - 8);
    expect(out[20]).toBe(0x10); // VP8X flags: only the alpha bit is left
    expect(out.includes(webpPixels)).toBe(true);
  });

  it("a clean file comes back unchanged", () => {
    expect(stripImageMetadata(webpPlain(), "image/webp").equals(webpPlain())).toBe(true);
    expect(stripImageMetadata(pngPlain(), "image/png").equals(pngPlain())).toBe(true);
  });

  it("a truncated or garbage file is rejected with 400 INVALID_IMAGE", () => {
    const bad = (b: Buffer, t: "image/jpeg" | "image/png" | "image/webp") =>
      expect(() => stripImageMetadata(b, t)).toThrow(expect.objectContaining({ status: 400, code: "INVALID_IMAGE" }));
    bad(jpegWithGps().subarray(0, 30), "image/jpeg");
    bad(pngWithGps().subarray(0, 40), "image/png");
    bad(webpWithGps().subarray(0, 30), "image/webp");
    bad(Buffer.concat([pngPlain().subarray(0, 8), Buffer.alloc(32, 1)]), "image/png");
  });
});
