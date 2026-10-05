// Separate file: app.ts reads TRUST_PROXY at import time, and vitest isolates modules per file.
import { randomUUID } from "node:crypto";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";

// Unique email per call so only the IP limiter is exercised.
const loginFrom = (app: Parameters<typeof request>[0], ip: string) =>
  request(app).post("/auth/login").set("X-Forwarded-For", ip).send({ email: `${randomUUID()}@example.com` });

describe("TRUST_PROXY", () => {
  it("unset: X-Forwarded-For is ignored, so spoofing it cannot evade the IP limiter", async () => {
    vi.stubEnv("TRUST_PROXY", "");
    vi.resetModules();
    const { app } = await import("../../app.ts");
    for (let i = 0; i < 10; i++) await loginFrom(app, `10.0.0.${i}`).expect(400);
    expect((await loginFrom(app, "10.0.0.99")).status).toBe(429);
  });

  it("set to a hop count: the forwarded client IP is used for rate limiting", async () => {
    vi.stubEnv("TRUST_PROXY", "1");
    vi.resetModules();
    const { app } = await import("../../app.ts");
    expect(app.get("trust proxy")).toBe(1);
    for (let i = 0; i < 10; i++) await loginFrom(app, "10.0.0.1").expect(400);
    expect((await loginFrom(app, "10.0.0.1")).status).toBe(429);
    expect((await loginFrom(app, "10.0.0.2")).status).toBe(400);
  });
});
