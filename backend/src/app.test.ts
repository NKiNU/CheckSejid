import express from "express";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { app } from "./app.ts";
import { prisma } from "./db.ts";
import { errorHandler } from "./errors.ts";

afterEach(() => vi.restoreAllMocks());

// ADR-026 §3: the uptime check calls /health, so it must fail when the database is down.
describe("GET /health", () => {
  it("is ok when the database answers", async () => {
    vi.spyOn(prisma, "$queryRaw").mockResolvedValue([{ "?column?": 1 }] as never);
    const res = await request(app).get("/health");
    expect([res.status, res.body]).toEqual([200, { status: "ok" }]);
  });

  it("is 503 when the database does not", async () => {
    vi.spyOn(prisma, "$queryRaw").mockRejectedValue(new Error("connection refused"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await request(app).get("/health");
    expect([res.status, res.body]).toEqual([503, { status: "unavailable" }]);
  });
});

// SEC-003 / ADR-026 §3: an unexpected error is logged without its argument dump. Prisma puts the call's
// arguments (e.g. a password hash) after the first line of the message.
describe("error logging", () => {
  it("logs name, first message line and stack frames, never the rest of the message", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const failing = express()
      .get("/boom", () => {
        throw new Error("Invalid `prisma.user.create()` invocation:\n{ data: { passwordHash: \"$argon2id$secret\" } }");
      })
      .use(errorHandler);
    const res = await request(failing).get("/boom");
    expect([res.status, res.body.error.code]).toEqual([500, "INTERNAL_ERROR"]);
    const logged = log.mock.calls.flat().map(String).join("\n");
    expect(logged).toContain("Invalid `prisma.user.create()` invocation:");
    expect(logged).toContain("at "); // stack frames kept for debugging
    expect(logged).not.toContain("argon2id");
    expect(logged).not.toContain("passwordHash");
  });
});
