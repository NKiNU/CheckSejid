// Integration tests against a real PostgreSQL (DATABASE_URL, migrations applied).
import { randomUUID } from "node:crypto";
import request from "supertest";
import { afterAll, describe, expect, it } from "vitest";
import { app } from "../../app.ts";
import { prisma } from "../../db.ts";
import express from "express";
import { errorHandler } from "../../errors.ts";
import { requireAuth } from "../identity/auth.ts";
import { forTenant, requireTenant } from "./tenant.ts";
import { createTenant, createUser, expectCrossTenantDenied, type TestTenant } from "../../test/cross-tenant.ts";

const hasDb = Boolean(process.env.DATABASE_URL);
if (!hasDb) console.warn("tenancy.db.test: DATABASE_URL not set — DB integration tests SKIPPED");

const noProfile = { type: null, description: null, contactEmail: null, contactPhone: null, addressLine: null, state: null, country: null, links: null };
const as = (t: { token: string }) => ({ Authorization: `Bearer ${t.token}` });

function addMember(owner: TestTenant, email: string) {
  return request(app).post(`/orgs/${owner.organisationId}/members`).set(as(owner)).send({ email });
}

describe.skipIf(!hasDb)("tenancy (database)", () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe("POST /orgs", () => {
    it("creates the organisation and the creator's membership atomically", async () => {
      const u = await createUser();
      const res = await request(app).post("/orgs").set(as(u)).send({ name: "  Masjid Al-Falah  " });
      expect(res.status).toBe(201);
      expect(res.body.organisation).toEqual({
        id: expect.any(String),
        name: "Masjid Al-Falah",
        isOwner: true,
        createdAt: expect.any(String),
        status: "DRAFT", // Phase 04: new organisations start as DRAFT
        ...noProfile,
      });
      const m = await prisma.organisationMembership.findUniqueOrThrow({
        where: { organisationId_userId: { organisationId: res.body.organisation.id, userId: u.userId } },
      });
      expect(res.body.membership).toEqual({ id: m.id });
    });

    it("ignores tenant context from the client: an organisationId in the body is rejected", async () => {
      const victim = await createTenant();
      const u = await createUser();
      const res = await request(app)
        .post("/orgs")
        .set(as(u))
        .send({ name: "X", organisationId: victim.organisationId, ownerId: victim.userId });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
    });

    it.each([[{}], [{ name: "" }], [{ name: "   " }], [{ name: "x".repeat(201) }], [{ name: 5 }]])(
      "rejects invalid body %j",
      async (body) => {
        const u = await createUser();
        const res = await request(app).post("/orgs").set(as(u)).send(body);
        expect(res.status).toBe(400);
        expect(res.body.error.code).toBe("VALIDATION_ERROR");
      },
    );

    it("ORG-002: a user can own only one organisation", async () => {
      const t = await createTenant();
      const res = await request(app).post("/orgs").set(as(t)).send({ name: "Second" });
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe("ORGANISATION_LIMIT");
      expect(await prisma.organisation.count({ where: { ownerId: t.userId } })).toBe(1);
    });

    it("requires authentication", async () => {
      expect((await request(app).post("/orgs").send({ name: "X" })).status).toBe(401);
    });
  });

  describe("GET /orgs (my organisations)", () => {
    it("lists only organisations the user is a member of", async () => {
      const a = await createTenant("A");
      const b = await createTenant("B");
      const staff = await createUser();
      await addMember(b, staff.email).expect(201);

      const mine = await request(app).get("/orgs").set(as(a)).expect(200);
      expect(mine.body.organisations).toEqual([
        { id: a.organisationId, name: "A", isOwner: true, createdAt: expect.any(String), status: "DRAFT", ...noProfile },
      ]);
      const staffOrgs = await request(app).get("/orgs").set(as(staff)).expect(200);
      expect(staffOrgs.body.organisations.map((o: { id: string; isOwner: boolean }) => [o.id, o.isOwner])).toEqual([
        [b.organisationId, false],
      ]);
    });

    it("requires authentication", async () => {
      expect((await request(app).get("/orgs")).status).toBe(401);
    });
  });

  describe("tenant routes", () => {
    it("GET /orgs/:orgId returns the organisation to a member", async () => {
      const a = await createTenant("A");
      const res = await request(app).get(`/orgs/${a.organisationId}`).set(as(a)).expect(200);
      expect(res.body.organisation).toMatchObject({ id: a.organisationId, name: "A", isOwner: true });
    });

    it("GET /orgs/:orgId/members lists members without emails", async () => {
      const a = await createTenant();
      const res = await request(app).get(`/orgs/${a.organisationId}/members`).set(as(a)).expect(200);
      expect(res.body.members).toEqual([
        {
          id: a.membershipId,
          userId: a.userId,
          displayName: "Test User",
          isOwner: true,
          roles: ["owner"], // Phase 03
          title: null, // Phase 03
          createdAt: expect.any(String),
        },
      ]);
    });

    it("unknown, malformed and foreign organisation ids are all the same 404", async () => {
      const a = await createTenant();
      const b = await createTenant();
      const foreign = await request(app).get(`/orgs/${b.organisationId}`).set(as(a));
      const unknown = await request(app).get(`/orgs/${randomUUID()}`).set(as(a));
      const malformed = await request(app).get(`/orgs/not-a-uuid`).set(as(a));
      for (const r of [foreign, unknown, malformed]) expect(r.status).toBe(404);
      expect(foreign.body).toEqual(unknown.body);
      expect(malformed.body).toEqual(unknown.body);
    });

    it("TENANT-005: another tenant gets 401/404 on every tenant route", async () => {
      const victim = await createTenant();
      const attacker = await createTenant();
      const other = await createUser();
      await expectCrossTenantDenied(
        attacker,
        [
          { method: "get", path: `/orgs/${victim.organisationId}` },
          { method: "get", path: `/orgs/${victim.organisationId}/members` },
          { method: "post", path: `/orgs/${victim.organisationId}/members`, body: { email: other.email } },
        ],
        { snapshot: () => prisma.organisationMembership.findMany({ where: { organisationId: victim.organisationId } }) },
      );
    });

    it("cross-tenant helper rejects a typo'd path (generic 404 has a different code)", async () => {
      const attacker = await createTenant();
      const victim = await createTenant();
      await expect(
        expectCrossTenantDenied(attacker, [{ method: "get", path: `/orgz/${victim.organisationId}` }]),
      ).rejects.toThrow();
    });

    it("rate-limits organisation creation per user", async () => {
      const t = await createTenant();
      const statuses: number[] = [];
      for (let i = 0; i < 10; i++) statuses.push((await request(app).post("/orgs").set(as(t)).send({ name: "X" })).status);
      expect(statuses.slice(0, 9).every((s) => s === 409)).toBe(true);
      expect(statuses[9]).toBe(429);
    });

    it("requireTenant works in the documented mount pattern for later modules", async () => {
      const probe = express()
        .use("/orgs/:orgId/probe", requireAuth, requireTenant, (req, res) => {
          res.json({ tenant: req.tenant });
        })
        .use(errorHandler);
      const a = await createTenant();
      const b = await createTenant();
      const ok = await request(probe).get(`/orgs/${a.organisationId}/probe/anything`).set(as(a)).expect(200);
      expect(ok.body.tenant).toEqual({ organisationId: a.organisationId, membershipId: a.membershipId, status: "DRAFT" });
      await request(probe).get(`/orgs/${a.organisationId}/probe`).set(as(b)).expect(404);
      await request(probe).get(`/orgs/${a.organisationId}/probe`).expect(401);
    });

    it("membership is checked on every request: a removed member loses access immediately", async () => {
      const a = await createTenant();
      const staff = await createUser();
      const email = staff.email;
      await addMember(a, email).expect(201);
      await request(app).get(`/orgs/${a.organisationId}`).set(as(staff)).expect(200);
      await prisma.organisationMembership.deleteMany({ where: { organisationId: a.organisationId, userId: staff.userId } });
      await request(app).get(`/orgs/${a.organisationId}`).set(as(staff)).expect(404);
    });
  });

  describe("POST /orgs/:orgId/members", () => {
    it("owner adds an existing user by email; the member can then access the tenant", async () => {
      const a = await createTenant();
      const staff = await createUser("Staff");
      const email = staff.email;
      const res = await addMember(a, email.toUpperCase());
      expect(res.status).toBe(201);
      expect(res.body.member).toMatchObject({ userId: staff.userId, displayName: "Staff", isOwner: false });
      const members = await request(app).get(`/orgs/${a.organisationId}/members`).set(as(staff)).expect(200);
      expect(members.body.members).toHaveLength(2);
    });

    it("rejects a duplicate membership", async () => {
      const a = await createTenant();
      const staff = await createUser();
      const email = staff.email;
      await addMember(a, email).expect(201);
      const res = await addMember(a, email);
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe("ALREADY_MEMBER");
    });

    it("404 for an unknown user email", async () => {
      const a = await createTenant();
      const res = await addMember(a, `nobody-${randomUUID()}@example.com`);
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe("USER_NOT_FOUND");
    });

    it("a non-owner member cannot add members", async () => {
      const a = await createTenant();
      const staff = await createUser();
      const other = await createUser();
      await addMember(a, staff.email).expect(201);
      const res = await request(app)
        .post(`/orgs/${a.organisationId}/members`)
        .set(as(staff))
        .send({ email: other.email });
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe("FORBIDDEN");
    });

    it("rejects a client-supplied organisationId/userId in the body", async () => {
      const a = await createTenant();
      const b = await createTenant();
      const staff = await createUser();
      const email = staff.email;
      const res = await request(app)
        .post(`/orgs/${a.organisationId}/members`)
        .set(as(a))
        .send({ email, organisationId: b.organisationId });
      expect(res.status).toBe(400);
      expect(await prisma.organisationMembership.count({ where: { organisationId: b.organisationId } })).toBe(1);
    });

    it.each([[{}], [{ email: "not-an-email" }]])("rejects invalid body %j", async (body) => {
      const a = await createTenant();
      const res = await request(app).post(`/orgs/${a.organisationId}/members`).set(as(a)).send(body);
      expect(res.status).toBe(400);
    });
  });

  describe("forTenant (tenant-scoped data access)", () => {
    it("scopes reads, updates and deletes to the tenant", async () => {
      const a = await createTenant();
      const b = await createTenant();
      const db = forTenant(a.organisationId);
      expect((await db.organisationMembership.findMany()).map((m) => m.id)).toEqual([a.membershipId]);
      // ID guessing: a unique lookup of B's row through A's scope finds nothing
      expect(await db.organisationMembership.findUnique({ where: { id: b.membershipId } })).toBeNull();
      expect(await db.organisationMembership.count()).toBe(1);
      expect((await db.organisationMembership.updateMany({ where: { id: b.membershipId }, data: {} })).count).toBe(0);
      expect((await db.organisationMembership.deleteMany({ where: { id: b.membershipId } })).count).toBe(0);
      await expect(db.organisationMembership.delete({ where: { id: b.membershipId } })).rejects.toThrow();
      expect(await prisma.organisationMembership.findUnique({ where: { id: b.membershipId } })).not.toBeNull();
    });

    it("injects organisationId on create and rejects a foreign one (TENANT-006)", async () => {
      const a = await createTenant();
      const b = await createTenant();
      const u = await createUser();
      const db = forTenant(a.organisationId);
      const m = await db.organisationMembership.create({ data: { userId: u.userId } as never });
      expect(m.organisationId).toBe(a.organisationId);
      await expect(
        db.organisationMembership.create({ data: { userId: u.userId, organisationId: b.organisationId } }),
      ).rejects.toThrow(/cross-tenant/);
      await expect(
        db.organisationMembership.updateMany({ data: { organisationId: b.organisationId } }),
      ).rejects.toThrow(/cross-tenant/);
    });

    it("rejects a foreign organisationId in createMany, update and upsert", async () => {
      const a = await createTenant();
      const b = await createTenant();
      const u = await createUser();
      const m = forTenant(a.organisationId).organisationMembership;
      const foreign = { userId: u.userId, organisationId: b.organisationId };
      await expect(m.createMany({ data: [foreign] })).rejects.toThrow(/cross-tenant/);
      await expect(m.update({ where: { id: a.membershipId }, data: { organisationId: b.organisationId } })).rejects.toThrow(
        /cross-tenant/,
      );
      await expect(
        m.upsert({ where: { id: randomUUID() }, create: foreign, update: {} }),
      ).rejects.toThrow(/cross-tenant/);
      await expect(
        m.upsert({ where: { id: a.membershipId }, create: { userId: u.userId } as never, update: foreign }),
      ).rejects.toThrow(/cross-tenant/);
      expect(await prisma.organisationMembership.count({ where: { userId: u.userId } })).toBe(0);
    });

    it("global models are not reachable (User, RefreshToken, Organisation)", async () => {
      const db = forTenant(randomUUID()) as unknown as Record<string, unknown>;
      for (const model of ["user", "refreshToken", "organisation"]) {
        expect(() => db[model], model).toThrow(/not a tenant-owned model/);
      }
    });

    it("raw SQL and transaction methods are not present", async () => {
      const db = forTenant(randomUUID()) as unknown as Record<string, unknown>;
      for (const m of ["$queryRaw", "$executeRaw", "$queryRawUnsafe", "$executeRawUnsafe", "$transaction", "$extends"]) {
        expect(() => db[m], m).toThrow();
      }
    });

    it("client-supplied organisationId tricks in where (OR, undefined, NOT) cannot widen scope", async () => {
      const a = await createTenant();
      const b = await createTenant();
      const m = forTenant(a.organisationId).organisationMembership;
      expect(await m.findMany({ where: { OR: [{ organisationId: b.organisationId }] } })).toHaveLength(0);
      expect(await m.findMany({ where: { organisationId: undefined } })).toHaveLength(1);
      expect(await m.count({ where: { NOT: { organisationId: a.organisationId } } })).toBe(0);
      // a client organisationId is overridden by the scope: still only A's row
      expect((await m.findMany({ where: { organisationId: b.organisationId } })).map((r) => r.id)).toEqual([
        a.membershipId,
      ]);
    });

    it("relation writes (connect re-parenting, nested create) throw", async () => {
      const a = await createTenant();
      const b = await createTenant();
      const u = await createUser();
      const m = forTenant(a.organisationId).organisationMembership;
      await expect(
        m.update({ where: { id: a.membershipId }, data: { organisation: { connect: { id: b.organisationId } } } }),
      ).rejects.toThrow(/scalar/);
      await expect(
        m.create({ data: { user: { connect: { id: u.userId } } } as never }),
      ).rejects.toThrow(/scalar/);
      const row = await prisma.organisationMembership.findUniqueOrThrow({ where: { id: a.membershipId } });
      expect(row.organisationId).toBe(a.organisationId);
    });

    it("include, relation select, relation filters and relation orderBy throw", async () => {
      const a = await createTenant();
      const m = forTenant(a.organisationId).organisationMembership;
      await expect(m.findMany({ include: { user: true } })).rejects.toThrow(/include/);
      await expect(m.findMany({ select: { id: true, user: { select: { passwordHash: true } } } })).rejects.toThrow(/scalar/);
      await expect(m.findMany({ select: { _count: true } as never })).rejects.toThrow(/scalar/);
      await expect(m.findMany({ where: { user: { email: { contains: "@" } } } })).rejects.toThrow(/scalar/);
      await expect(m.findMany({ orderBy: { user: { displayName: "asc" } } })).rejects.toThrow(/scalar/);
    });

    it("does not mutate the caller's arguments", async () => {
      const a = await createTenant();
      const args = { where: { userId: a.userId } };
      await forTenant(a.organisationId).organisationMembership.findMany(args);
      expect(args).toEqual({ where: { userId: a.userId } });
    });

    it("works inside a transaction via forTenant(orgId, tx)", async () => {
      const a = await createTenant();
      const n = await prisma.$transaction((tx) => forTenant(a.organisationId, tx).organisationMembership.count());
      expect(n).toBe(1);
    });
  });
});
