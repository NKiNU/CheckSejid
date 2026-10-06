// Phase 05 (ADR-019, ADR-020) integration tests against a real PostgreSQL and an in-process S3 emulator.
import { randomUUID } from "node:crypto";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { app } from "../../app.ts";
import { prisma } from "../../db.ts";
import { getObjectBytes } from "../../storage.ts";
import { createTenant, createUser, expectCrossTenantDenied } from "../../test/cross-tenant.ts";
import { activeTenant, addMember, as, resetStores, setOrgStatus } from "../../test/fixtures.ts";
import { FILES, startS3 } from "../../test/s3.ts";
import { rbacRateLimitStores } from "../rbac/rbac.routes.ts";
import { tenancyRateLimitStores } from "../tenancy/tenancy.routes.ts";
import { publicRateLimitStores } from "./public.routes.ts";

const hasDb = Boolean(process.env.DATABASE_URL);
if (!hasDb) console.warn("public.db.test: DATABASE_URL not set — DB integration tests SKIPPED");

const discover = (query: Record<string, string | number>) => request(app).get("/public/orgs").query(query);
const view = (orgId: string, who?: { token: string }) => {
  const r = request(app).get(`/public/orgs/${orgId}`);
  return who ? r.set(as(who)) : r;
};

describe.skipIf(!hasDb)("public platform (database)", () => {
  let stopS3: () => Promise<void>;
  beforeAll(async () => {
    stopS3 = await startS3();
  });
  beforeEach(() => resetStores(tenancyRateLimitStores, rbacRateLimitStores, publicRateLimitStores));
  afterAll(async () => {
    await stopS3();
    await prisma.$disconnect();
  });

  describe("visibility setting (ORG-006, ADR-019 §1)", () => {
    it("defaults to PRIVATE; changed only under organisation.update; validated", async () => {
      const t = await createTenant();
      const org = await request(app).get(`/orgs/${t.organisationId}`).set(as(t)).expect(200);
      expect(org.body.organisation).toMatchObject({ visibility: "PRIVATE", logoUrl: null, coverUrl: null });
      const staff = await addMember(t, ["staff"]);
      const denied = await request(app).patch(`/orgs/${t.organisationId}`).set(as(staff)).send({ visibility: "PUBLIC" });
      expect([denied.status, denied.body.error.code]).toEqual([403, "FORBIDDEN"]);
      const bad = await request(app).patch(`/orgs/${t.organisationId}`).set(as(t)).send({ visibility: "SECRET" });
      expect([bad.status, bad.body.error.code]).toEqual([400, "VALIDATION_ERROR"]);
      const ok = await request(app).patch(`/orgs/${t.organisationId}`).set(as(t)).send({ visibility: "UNLISTED" }).expect(200);
      expect(ok.body.organisation.visibility).toBe("UNLISTED");
    });
  });

  describe("discovery (PUB-001/002/003)", () => {
    it("lists only PUBLIC + ACTIVE organisations, with keyword, type, state and country filters", async () => {
      const tag = `disc${randomUUID().slice(0, 8)}`;
      const pub = await activeTenant(`Masjid ${tag} Alpha`, "PUBLIC");
      const surau = await activeTenant(`Surau ${tag} Beta`, "PUBLIC", { type: "surau", state: "Johor" });
      await activeTenant(`Hidden ${tag} Unlisted`, "UNLISTED");
      await activeTenant(`Hidden ${tag} Private`, "PRIVATE");
      const onboarding = await createTenant(`Hidden ${tag} Onboarding`);
      await request(app).patch(`/orgs/${onboarding.organisationId}`).set(as(onboarding)).send({ visibility: "PUBLIC" }).expect(200);
      const suspended = await activeTenant(`Hidden ${tag} Suspended`, "PUBLIC");
      await setOrgStatus(suspended, "SUSPENDED");

      const all = await discover({ q: tag.toUpperCase() }).expect(200); // case-insensitive keyword
      expect(all.body.organisations.map((o: { id: string }) => o.id)).toEqual([pub.organisationId, surau.organisationId]);
      expect((await discover({ q: tag, type: "surau" })).body.organisations.map((o: { id: string }) => o.id)).toEqual([surau.organisationId]);
      expect((await discover({ q: tag, state: "johor" })).body.organisations.map((o: { id: string }) => o.id)).toEqual([surau.organisationId]);
      expect((await discover({ q: tag, country: "SG" })).body.organisations).toEqual([]);
    });

    it("public listing exposes profile fields only (PUB-004)", async () => {
      const tag = `safe${randomUUID().slice(0, 8)}`;
      await activeTenant(`Org ${tag}`, "PUBLIC", { description: "Open to all" });
      const [org] = (await discover({ q: tag }).expect(200)).body.organisations;
      expect(Object.keys(org).sort()).toEqual(
        ["addressLine", "contactEmail", "contactPhone", "country", "coverUrl", "description", "id", "links", "logoUrl", "name", "state", "type", "visibility"].sort(),
      );
    });

    it("keyset pagination is bounded and validated (SEC-006)", async () => {
      const tag = `page${randomUUID().slice(0, 8)}`;
      for (const n of [1, 2, 3]) await activeTenant(`Org ${tag} ${n}`, "PUBLIC");
      const first = await discover({ q: tag, limit: 2 }).expect(200);
      expect(first.body.organisations).toHaveLength(2);
      const second = await discover({ q: tag, limit: 2, cursor: first.body.nextCursor }).expect(200);
      expect(second.body.organisations.map((o: { name: string }) => o.name)).toEqual([`Org ${tag} 3`]);
      expect(second.body.nextCursor).toBeNull();
      for (const q of [{ limit: 51 }, { limit: 0 }, { cursor: "nope" }, { country: "my" }, { unknown: "x" }] as Record<string, string | number>[]) {
        expect((await discover(q)).body.error.code, JSON.stringify(q)).toBe("VALIDATION_ERROR");
      }
    });
  });

  describe("profile page (PUB-003, PUB-007)", () => {
    it("PUBLIC: anyone; UNLISTED: logged-in only; PRIVATE / not ACTIVE / unknown: the same 404", async () => {
      const visitor = await createUser();
      const pub = await activeTenant("Public Org", "PUBLIC");
      const unl = await activeTenant("Unlisted Org", "UNLISTED");
      const priv = await activeTenant("Private Org", "PRIVATE");

      const anon = await view(pub.organisationId).expect(200);
      expect(anon.body.organisation).toMatchObject({ id: pub.organisationId, name: "Public Org", following: false, followable: true });
      expect(anon.body.organisation).not.toHaveProperty("ownerId");
      expect(anon.body.organisation).not.toHaveProperty("status");

      const login = await view(unl.organisationId);
      expect([login.status, login.body.error.code]).toEqual([401, "LOGIN_REQUIRED"]);
      expect((await view(unl.organisationId, visitor).expect(200)).body.organisation).toMatchObject({ visibility: "UNLISTED", followable: false });

      for (const id of [priv.organisationId, randomUUID(), "not-a-uuid"]) {
        for (const who of [undefined, visitor, priv]) {
          const r = await view(id, who); // even the private org's own owner: public pages show public orgs only
          expect([r.status, r.body.error.code]).toEqual([404, "ORGANISATION_NOT_FOUND"]);
        }
      }
      await setOrgStatus(pub, "SUSPENDED");
      expect((await view(pub.organisationId)).status).toBe(404);
    });

    it("a present but invalid token is 401, not anonymous", async () => {
      const pub = await activeTenant("Public Org", "PUBLIC");
      const r = await request(app).get(`/public/orgs/${pub.organisationId}`).set("Authorization", "Bearer garbage");
      expect([r.status, r.body.error.code]).toEqual([401, "UNAUTHENTICATED"]);
    });
  });

  describe("following (PUB-005/006, ADR-019 §3)", () => {
    it("follow PUBLIC orgs (idempotent, many), not UNLISTED or PRIVATE; grants no management access", async () => {
      const u = await createUser();
      const a = await activeTenant("Follow A", "PUBLIC");
      const b = await activeTenant("Follow B", "PUBLIC");
      const unl = await activeTenant("Follow U", "UNLISTED");
      const priv = await activeTenant("Follow P", "PRIVATE");

      await request(app).put(`/me/follows/${a.organisationId}`).set(as(u)).expect(204);
      await request(app).put(`/me/follows/${a.organisationId}`).set(as(u)).expect(204); // idempotent
      await request(app).put(`/me/follows/${b.organisationId}`).set(as(u)).expect(204);
      const nf = await request(app).put(`/me/follows/${unl.organisationId}`).set(as(u));
      expect([nf.status, nf.body.error.code]).toEqual([409, "NOT_FOLLOWABLE"]);
      expect((await request(app).put(`/me/follows/${priv.organisationId}`).set(as(u))).status).toBe(404);
      expect((await request(app).put(`/me/follows/${a.organisationId}`)).status).toBe(401);

      const mine = await request(app).get("/me/follows").set(as(u)).expect(200);
      expect(mine.body.organisations.map((o: { id: string }) => o.id).sort()).toEqual([a.organisationId, b.organisationId].sort());
      expect((await view(a.organisationId, u)).body.organisation.following).toBe(true);
      expect(await prisma.follow.count({ where: { userId: u.userId } })).toBe(2);

      // PUB-006: following is not membership.
      expect((await request(app).get(`/orgs/${a.organisationId}`).set(as(u))).status).toBe(404);
      expect((await request(app).get("/orgs").set(as(u))).body.organisations).toEqual([]);
      expect(await prisma.organisationMembership.count({ where: { userId: u.userId } })).toBe(0);
    });

    it("follows of an organisation that stops being public are hidden, kept, and come back; unfollow always works", async () => {
      const u = await createUser();
      const a = await activeTenant("Follow C", "PUBLIC");
      await request(app).put(`/me/follows/${a.organisationId}`).set(as(u)).expect(204);
      await request(app).patch(`/orgs/${a.organisationId}`).set(as(a)).send({ visibility: "PRIVATE" }).expect(200);
      expect((await request(app).get("/me/follows").set(as(u))).body.organisations).toEqual([]);
      expect(await prisma.follow.count({ where: { userId: u.userId } })).toBe(1);
      await request(app).patch(`/orgs/${a.organisationId}`).set(as(a)).send({ visibility: "PUBLIC" }).expect(200);
      expect((await request(app).get("/me/follows").set(as(u))).body.organisations).toHaveLength(1);
      await request(app).patch(`/orgs/${a.organisationId}`).set(as(a)).send({ visibility: "PRIVATE" }).expect(200);
      await request(app).delete(`/me/follows/${a.organisationId}`).set(as(u)).expect(204);
      await request(app).delete(`/me/follows/${a.organisationId}`).set(as(u)).expect(204);
      await request(app).delete(`/me/follows/not-a-uuid`).set(as(u)).expect(204);
      expect(await prisma.follow.count({ where: { userId: u.userId } })).toBe(0);
    });
  });

  describe("logo and cover uploads (SEC-007, ADR-020)", () => {
    const put = (t: { token: string; organisationId: string }, path: string, body: Buffer, type = "application/octet-stream") =>
      request(app).put(`/orgs/${t.organisationId}/${path}`).set(as(t)).set("Content-Type", type).send(body);

    it("stores a sniffed image under the public prefix, replaces and removes it, audited", async () => {
      const t = await activeTenant("Logo Org", "PUBLIC");
      const first = await put(t, "logo", FILES.png).expect(200);
      expect(first.body.url).toMatch(new RegExp(`/public/org/${t.organisationId}/logo/[0-9a-f-]{36}\\.png$`));
      const row = await prisma.organisation.findUniqueOrThrow({ where: { id: t.organisationId } });
      expect((await getObjectBytes(row.logoKey!)).equals(FILES.png)).toBe(true);
      expect((await view(t.organisationId)).body.organisation.logoUrl).toBe(first.body.url);

      // The client's Content-Type is ignored: a WebP sent as image/png is stored as .webp.
      const second = await put(t, "logo", FILES.webp, "image/png").expect(200);
      expect(second.body.url).toMatch(/\.webp$/);
      await expect(getObjectBytes(row.logoKey!)).rejects.toThrow(); // old object deleted

      await put(t, "cover", FILES.jpeg).expect(200);
      await request(app).delete(`/orgs/${t.organisationId}/logo`).set(as(t)).expect(204);
      const after = (await request(app).get(`/orgs/${t.organisationId}`).set(as(t))).body.organisation;
      expect(after.logoUrl).toBeNull();
      expect(after.coverUrl).toMatch(/\.jpg$/);
      const audits = await prisma.auditLog.findMany({ where: { organisationId: t.organisationId, action: { startsWith: "organisation.logo" } } });
      expect(audits.map((a) => a.action).sort()).toEqual(["organisation.logo.remove", "organisation.logo.set", "organisation.logo.set"]);
    });

    it("rejects wrong types by content (415), oversize files (413), empty bodies (400)", async () => {
      const t = await activeTenant();
      for (const body of [FILES.html, FILES.pdf]) {
        const r = await put(t, "logo", body, "image/png");
        expect([r.status, r.body.error.code]).toEqual([415, "UNSUPPORTED_FILE_TYPE"]);
      }
      const big = Buffer.concat([FILES.png, Buffer.alloc(2 * 1024 * 1024)]);
      const r = await put(t, "cover", big, "image/png");
      expect([r.status, r.body.error.code]).toEqual([413, "FILE_TOO_LARGE"]);
      expect((await put(t, "logo", Buffer.alloc(0))).body.error.code).toBe("FILE_REQUIRED");
      expect((await prisma.organisation.findUniqueOrThrow({ where: { id: t.organisationId } })).logoKey).toBeNull();
    });

    it("needs organisation.update and a writable organisation; another tenant gets 404", async () => {
      const t = await activeTenant();
      const staff = await addMember(t, ["staff"]);
      const denied = await put({ ...staff, organisationId: t.organisationId }, "logo", FILES.png);
      expect([denied.status, denied.body.error.code]).toEqual([403, "FORBIDDEN"]);
      const other = await createTenant();
      await expectCrossTenantDenied(other, [
        { method: "put", path: `/orgs/${t.organisationId}/logo` },
        { method: "delete", path: `/orgs/${t.organisationId}/cover` },
      ]);
      await setOrgStatus(t, "SUSPENDED");
      const blocked = await put(t, "logo", FILES.png);
      expect([blocked.status, blocked.body.error.code]).toEqual([409, "ORGANISATION_NOT_WRITABLE"]);
    });
  });
});
