// Integration tests against a real PostgreSQL (DATABASE_URL, migrations applied).
// Skipped — loudly — when DATABASE_URL is not set.
import { randomUUID } from "node:crypto";
import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { app } from "../../app.ts";
import { prisma } from "../../db.ts";
import { hashRefreshToken, newRefreshToken } from "./auth.ts";
import { rateLimitStores, REFRESH_COOKIE } from "./identity.routes.ts";

const hasDb = Boolean(process.env.DATABASE_URL);
if (!hasDb) console.warn("identity.db.test: DATABASE_URL not set — DB integration tests SKIPPED");

const password = "correct horse battery staple";

function newEmail() {
  return `user-${randomUUID()}@Example.com`;
}

// Extracts the refresh token value from a Set-Cookie header.
function refreshCookie(res: request.Response): string | undefined {
  const raw = res.headers["set-cookie"] as unknown as string[] | undefined;
  const c = raw?.find((h) => h.startsWith(`${REFRESH_COOKIE}=`));
  return c?.split(";")[0]!.slice(REFRESH_COOKIE.length + 1) || undefined;
}

async function registerAndLogin(email = newEmail()) {
  await request(app).post("/auth/register").send({ email, password, displayName: "Aminah" }).expect(201);
  const res = await request(app).post("/auth/login").send({ email, password }).expect(200);
  return { email, accessToken: res.body.accessToken as string, refresh: refreshCookie(res)!, res };
}

function refresh(token: string) {
  return request(app).post("/auth/session/refresh").set("Cookie", `${REFRESH_COOKIE}=${token}`);
}

describe.skipIf(!hasDb)("identity (database)", () => {
  beforeEach(async () => {
    await rateLimitStores.credentials.resetAll();
    await rateLimitStores.refresh.resetAll();
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe("register", () => {
    it("creates a user, normalises email, never returns the hash", async () => {
      const email = newEmail();
      const res = await request(app).post("/auth/register").send({ email, password, displayName: " Aminah " });
      expect(res.status).toBe(201);
      expect(res.body.user).toEqual({
        id: expect.any(String),
        email: email.toLowerCase(),
        displayName: "Aminah",
        createdAt: expect.any(String),
      });
      const row = await prisma.user.findUniqueOrThrow({ where: { email: email.toLowerCase() } });
      expect(row.passwordHash).toMatch(/^\$argon2id\$/);
    });

    it("rejects a duplicate email (case-insensitive)", async () => {
      const email = newEmail();
      await request(app).post("/auth/register").send({ email, password, displayName: "A" }).expect(201);
      const res = await request(app)
        .post("/auth/register")
        .send({ email: email.toUpperCase(), password, displayName: "B" });
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe("EMAIL_TAKEN");
    });
  });

  describe("login", () => {
    it("returns an access token and sets a hardened refresh cookie", async () => {
      const { accessToken, refresh: token, res } = await registerAndLogin();
      expect(accessToken).toEqual(expect.any(String));
      expect(res.body.refreshToken).toBeUndefined();
      expect(token).toBeTruthy();
      const cookie = (res.headers["set-cookie"] as unknown as string[]).join(";");
      expect(cookie).toMatch(/HttpOnly/i);
      expect(cookie).toMatch(/Secure/i);
      expect(cookie).toMatch(/SameSite=Strict/i);
      expect(cookie).toMatch(/Path=\/auth\/session/i);
      const stored = await prisma.refreshToken.findUnique({ where: { tokenHash: hashRefreshToken(token) } });
      expect(stored).not.toBeNull();
    });

    it("rejects a wrong password and an unknown email identically", async () => {
      const { email } = await registerAndLogin();
      const wrong = await request(app).post("/auth/login").send({ email, password: "wrong password!!" });
      const unknown = await request(app).post("/auth/login").send({ email: newEmail(), password });
      expect(wrong.status).toBe(401);
      expect(unknown.status).toBe(401);
      expect(wrong.body).toEqual(unknown.body);
      expect(wrong.body.error.code).toBe("INVALID_CREDENTIALS");
    });
  });

  describe("protected access", () => {
    it("GET /me returns the authenticated user", async () => {
      const { email, accessToken } = await registerAndLogin();
      const res = await request(app).get("/me").set("Authorization", `Bearer ${accessToken}`);
      expect(res.status).toBe(200);
      expect(res.body.user.email).toBe(email.toLowerCase());
      expect(res.body.user.passwordHash).toBeUndefined();
    });

    it("GET /me with a valid token for a deleted user is 401", async () => {
      const { email, accessToken } = await registerAndLogin();
      await prisma.user.delete({ where: { email: email.toLowerCase() } });
      const res = await request(app).get("/me").set("Authorization", `Bearer ${accessToken}`);
      expect(res.status).toBe(401);
    });
  });

  describe("refresh rotation", () => {
    it("rotates: returns a new access token and a new refresh token", async () => {
      const { refresh: t1 } = await registerAndLogin();
      const res = await refresh(t1);
      expect(res.status).toBe(200);
      expect(res.body.accessToken).toEqual(expect.any(String));
      const t2 = refreshCookie(res)!;
      expect(t2).toBeTruthy();
      expect(t2).not.toBe(t1);
      const me = await request(app).get("/me").set("Authorization", `Bearer ${res.body.accessToken}`);
      expect(me.status).toBe(200);
      // the new token works
      expect((await refresh(t2)).status).toBe(200);
    });

    it("reuse of a rotated token revokes the whole family", async () => {
      const { refresh: t1 } = await registerAndLogin();
      const t2 = refreshCookie(await refresh(t1).expect(200))!;

      const reuse = await refresh(t1);
      expect(reuse.status).toBe(401);
      expect(reuse.body.error.code).toBe("UNAUTHENTICATED");

      // the legitimate successor is now revoked too
      expect((await refresh(t2)).status).toBe(401);
      const family = await prisma.refreshToken.findMany({
        where: { tokenHash: { in: [hashRefreshToken(t1), hashRefreshToken(t2)] } },
      });
      expect(family).toHaveLength(2);
      expect(family.every((t) => t.revokedAt !== null)).toBe(true);
    });

    it("reuse in one family does not affect another session of the same user", async () => {
      const { email, refresh: a1 } = await registerAndLogin();
      const b = await request(app).post("/auth/login").send({ email, password }).expect(200);
      const b1 = refreshCookie(b)!;
      await refresh(a1).expect(200);
      await refresh(a1).expect(401); // reuse → family A revoked
      expect((await refresh(b1)).status).toBe(200);
    });

    it("concurrent use of the same token succeeds at most once", async () => {
      const { refresh: t1 } = await registerAndLogin();
      const results = await Promise.all([refresh(t1), refresh(t1)]);
      expect(results.filter((r) => r.status === 200).length).toBeLessThanOrEqual(1);
    });

    it("rejects an expired refresh token", async () => {
      const { email } = await registerAndLogin();
      const user = await prisma.user.findUniqueOrThrow({ where: { email: email.toLowerCase() } });
      const token = newRefreshToken();
      await prisma.refreshToken.create({
        data: {
          userId: user.id,
          familyId: randomUUID(),
          tokenHash: hashRefreshToken(token),
          expiresAt: new Date(Date.now() - 1000),
        },
      });
      const res = await refresh(token);
      expect(res.status).toBe(401);
    });

    it("rejects an unknown refresh token", async () => {
      expect((await refresh(newRefreshToken())).status).toBe(401);
    });

    it("keeps the family's original expiry on rotation (absolute session lifetime)", async () => {
      const { refresh: t1 } = await registerAndLogin();
      const t2 = refreshCookie(await refresh(t1).expect(200))!;
      const [r1, r2] = await Promise.all(
        [t1, t2].map((t) => prisma.refreshToken.findUniqueOrThrow({ where: { tokenHash: hashRefreshToken(t) } })),
      );
      expect(r2!.expiresAt.getTime()).toBe(r1!.expiresAt.getTime());
      expect(r2!.familyId).toBe(r1!.familyId);
    });
  });

  describe("logout", () => {
    it("revokes the session and clears the cookie", async () => {
      const { refresh: t1 } = await registerAndLogin();
      const res = await request(app).post("/auth/session/logout").set("Cookie", `${REFRESH_COOKIE}=${t1}`);
      expect(res.status).toBe(204);
      const cleared = (res.headers["set-cookie"] as unknown as string[]).join(";");
      expect(cleared).toMatch(new RegExp(`${REFRESH_COOKIE}=;`));
      expect((await refresh(t1)).status).toBe(401);
    });

    it("is idempotent without a cookie", async () => {
      expect((await request(app).post("/auth/session/logout")).status).toBe(204);
    });
  });
});
