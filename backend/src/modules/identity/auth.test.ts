// DB-free tests: access-token verification, requireAuth, validation, rate limiting, error format.
import { SignJWT } from "jose";
import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { app } from "../../app.ts";
import { hashRefreshToken, newRefreshToken, signAccessToken } from "./auth.ts";
import { rateLimitStores } from "./identity.routes.ts";

const secret = new TextEncoder().encode(process.env.JWT_ACCESS_SECRET);
const userId = "00000000-0000-4000-8000-000000000001";

beforeEach(async () => {
  await rateLimitStores.credentials.resetAll();
  await rateLimitStores.refresh.resetAll();
});

describe("requireAuth (GET /me)", () => {
  it("rejects a request with no Authorization header", async () => {
    const res = await request(app).get("/me");
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: { code: "UNAUTHENTICATED", message: expect.any(String) } });
  });

  it("rejects a non-Bearer scheme", async () => {
    const res = await request(app).get("/me").set("Authorization", "Basic abc");
    expect(res.status).toBe(401);
  });

  it("rejects a malformed token", async () => {
    const res = await request(app).get("/me").set("Authorization", "Bearer not.a.jwt");
    expect(res.status).toBe(401);
  });

  it("rejects an expired token", async () => {
    const now = Math.floor(Date.now() / 1000);
    const token = await new SignJWT({})
      .setProtectedHeader({ alg: "HS256" })
      .setSubject(userId)
      .setIssuedAt(now - 3600)
      .setExpirationTime(now - 60)
      .sign(secret);
    const res = await request(app).get("/me").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(401);
  });

  it("rejects a token signed with another secret", async () => {
    const token = await new SignJWT({})
      .setProtectedHeader({ alg: "HS256" })
      .setSubject(userId)
      .setExpirationTime("15m")
      .sign(new TextEncoder().encode("another-secret-another-secret-another-secret"));
    const res = await request(app).get("/me").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(401);
  });

  it("rejects an unsigned (alg none) token", async () => {
    const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
    const token = `${b64({ alg: "none", typ: "JWT" })}.${b64({ sub: userId, exp: 9999999999 })}.`;
    const res = await request(app).get("/me").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(401);
  });
});

describe("tokens", () => {
  it("access token carries only the user id and expires in ~15 minutes", async () => {
    const token = await signAccessToken(userId);
    const payload = JSON.parse(Buffer.from(token.split(".")[1]!, "base64url").toString());
    expect(Object.keys(payload).sort()).toEqual(["exp", "iat", "sub"]);
    expect(payload.sub).toBe(userId);
    expect(payload.exp - payload.iat).toBe(15 * 60);
  });

  it("refresh tokens are random and stored only as a hash", () => {
    const a = newRefreshToken();
    const b = newRefreshToken();
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThanOrEqual(43); // 32 bytes base64url
    expect(hashRefreshToken(a)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashRefreshToken(a)).not.toContain(a);
  });
});

describe("validation (server-side)", () => {
  it.each([
    [{}, "missing fields"],
    [{ email: "not-an-email", password: "correct horse battery", displayName: "A" }, "bad email"],
    [{ email: "a@example.com", password: "short", displayName: "A" }, "short password"],
    [{ email: "a@example.com", password: "x".repeat(129), displayName: "A" }, "overlong password"],
    [{ email: "a@example.com", password: "correct horse battery", displayName: "  " }, "blank name"],
  ])("register rejects %j (%s)", async (body, _why) => {
    const res = await request(app).post("/auth/register").send(body);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(Array.isArray(res.body.error.details)).toBe(true);
  });

  it("login rejects a missing password", async () => {
    const res = await request(app).post("/auth/login").send({ email: "a@example.com" });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("rejects malformed JSON with the standard error shape", async () => {
    const res = await request(app)
      .post("/auth/login")
      .set("Content-Type", "application/json")
      .send("{bad json");
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("BAD_REQUEST");
  });

  it("refresh without a cookie is 401", async () => {
    const res = await request(app).post("/auth/session/refresh");
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("UNAUTHENTICATED");
  });

  it("unknown routes return the standard 404 shape", async () => {
    const res = await request(app).get("/nope");
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
  });
});

describe("rate limiting", () => {
  it("limits login attempts per client", async () => {
    for (let i = 0; i < 10; i++) {
      await request(app).post("/auth/login").send({}).expect(400);
    }
    const res = await request(app).post("/auth/login").send({});
    expect(res.status).toBe(429);
    expect(res.body.error.code).toBe("RATE_LIMITED");
  });
});
