import { afterEach, describe, expect, it } from "vitest";
import { EICAR, startFakeClamd } from "./test/clamd.ts";
import { FILES } from "./test/s3.ts";
import { EVIDENCE_TYPES, IMAGE_TYPES, checkUpload, scan, sniff } from "./uploads.ts";

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

describe("malware scan (ADR-025 §2)", () => {
  afterEach(() => {
    delete process.env["CLAMD_HOST"];
  });

  it("passes clean files and rejects infected ones (422 UPLOAD_REJECTED)", async () => {
    const clamd = await startFakeClamd();
    process.env["CLAMD_HOST"] = clamd.host;
    try {
      await expect(scan(FILES.pdf)).resolves.toBeUndefined();
      const big = Buffer.concat([Buffer.alloc(200_000, 7), EICAR]); // spans several INSTREAM chunks
      await expect(scan(big)).rejects.toMatchObject({ status: 422, code: "UPLOAD_REJECTED" });
    } finally {
      await clamd.stop();
    }
  });

  it("fails closed when the scanner is unreachable (503 SCANNER_UNAVAILABLE)", async () => {
    const clamd = await startFakeClamd();
    await clamd.stop(); // port now closed
    process.env["CLAMD_HOST"] = clamd.host;
    await expect(scan(FILES.pdf)).rejects.toMatchObject({ status: 503, code: "SCANNER_UNAVAILABLE" });
  });

  it("is skipped only when no scanner is configured (development; production refuses to start)", async () => {
    await expect(scan(Buffer.concat([FILES.pdf, EICAR]))).resolves.toBeUndefined();
  });
});
