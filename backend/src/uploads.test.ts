import { describe, expect, it } from "vitest";
import { FILES } from "./test/s3.ts";
import { EVIDENCE_TYPES, IMAGE_TYPES, checkUpload, sniff } from "./uploads.ts";

describe("upload content checks (ADR-020 §1)", () => {
  it("detects types by leading bytes only", () => {
    expect([sniff(FILES.png), sniff(FILES.jpeg), sniff(FILES.webp), sniff(FILES.pdf)]).toEqual(["image/png", "image/jpeg", "image/webp", "application/pdf"]);
    expect(sniff(FILES.html)).toBeNull();
    expect(sniff(Buffer.from([0x89, 0x50]))).toBeNull(); // truncated header
    expect(sniff(Buffer.concat([Buffer.from("RIFF"), Buffer.alloc(4), Buffer.from("WAVE")]))).toBeNull();
  });

  it("enforces each use's allow-list", () => {
    expect(checkUpload(FILES.pdf, EVIDENCE_TYPES).type).toBe("application/pdf");
    expect(() => checkUpload(FILES.pdf, IMAGE_TYPES)).toThrow(expect.objectContaining({ status: 415 }));
    expect(() => checkUpload(undefined, IMAGE_TYPES)).toThrow(expect.objectContaining({ status: 400 }));
  });
});
