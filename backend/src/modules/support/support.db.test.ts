// Phase 13B (ADR-030/032) integration tests against a real PostgreSQL (DATABASE_URL).
import express from "express";
import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { app } from "../../app.ts";
import { prisma } from "../../db.ts";
import { errorHandler } from "../../errors.ts";
import { createTenant, createUser, type TestTenant } from "../../test/cross-tenant.ts";
import { requireAuth } from "../identity/auth.ts";
import { requirePermission } from "../rbac/rbac.ts";
import { requireEntitlement } from "../subscriptions/entitlements.ts";
import { requireTenant } from "../tenancy/tenant.ts";
import { supportRateLimitStores } from "./support.routes.ts";
import { endExpired } from "./support.service.ts";

const hasDb = Boolean(process.env.DATABASE_URL);
if (!hasDb) console.warn("support.db.test: DATABASE_URL not set — DB integration tests SKIPPED");

const as = (t: { token: string }) => ({ Authorization: `Bearer ${t.token}` });
async function platformAdmin() {
  const u = await createUser();
  await prisma.user.update({ where: { id: u.userId }, data: { isPlatformAdmin: true } });
  return u;
}
const ask = (admin: { token: string }, org: TestTenant, reason = "Cannot see the roster") =>
  request(app).post("/platform/support/requests").set(as(admin)).send({ organisationId: org.organisationId, reason });
const owner = (org: TestTenant, id: string, verb: string, body?: object) =>
  request(app).post(`/orgs/${org.organisationId}/support/requests/${id}/${verb}`).set(as(org)).send(body);
async function granted(admin: { token: string }, org: TestTenant) {
  const id = (await ask(admin, org)).body.request.id as string;
  await owner(org, id, "approve").expect(200);
  return id;
}
const audit = (org: TestTenant, action: string) =>
  prisma.platformAuditLog.findMany({ where: { targetOrganisationId: org.organisationId, action } });
const inbox = (org: TestTenant, type: string) =>
  prisma.notification.findMany({ where: { organisationId: org.organisationId, recipientUserId: org.userId, type } });

describe.skipIf(!hasDb)("support access (database)", () => {
  it("two parallel requests: one is created, the other is a 409, never a 500", async () => {
    const admin = await platformAdmin();
    const t = await createTenant("Masjid P");
    const codes = (await Promise.all([ask(admin, t), ask(admin, t)])).map((r) => r.status).sort();
    expect(codes).toEqual([201, 409]);
  });

  beforeEach(async () => {
    await Promise.all(Object.values(supportRateLimitStores).map((s) => s.resetAll()));
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe("B1 request flow", () => {
    it("admin files a request with a reason; the owner is notified; reason is required", async () => {
      const org = await createTenant();
      const admin = await platformAdmin();
      for (const reason of ["", "   ", undefined]) {
        const bad = await request(app).post("/platform/support/requests").set(as(admin)).send({ organisationId: org.organisationId, reason });
        expect([bad.status, bad.body.error.code]).toEqual([400, "VALIDATION_ERROR"]);
      }
      const res = await ask(admin, org).expect(201);
      expect(res.body.request).toMatchObject({ organisationId: org.organisationId, status: "REQUESTED", expiresAt: null });
      expect(await audit(org, "support.request")).toHaveLength(1);
      expect(await inbox(org, "support.requested")).toHaveLength(1);
      expect((await ask(admin, org)).status).toBe(409); // one open request per admin and organisation
      const mine = await request(app).get("/platform/support/requests").set(as(admin)).expect(200);
      expect(mine.body.requests.map((r: { id: string }) => r.id)).toEqual([res.body.request.id]);
    });

    it("only platform admins file requests; unknown organisations are 404", async () => {
      const org = await createTenant();
      expect((await ask(org, org)).status).toBe(403);
      const admin = await platformAdmin();
      const res = await request(app).post("/platform/support/requests").set(as(admin)).send({ organisationId: crypto.randomUUID(), reason: "x" });
      expect(res.status).toBe(404);
    });

    it("owner approves for 1 hour, extends by at most 1 hour per action, revokes; others cannot", async () => {
      const org = await createTenant();
      const admin = await platformAdmin();
      const id = (await ask(admin, org)).body.request.id as string;
      const staff = await createUser();
      await request(app).post(`/orgs/${org.organisationId}/members`).set(as(org)).send({ email: staff.email, roles: ["admin"] }).expect(201);
      expect((await owner({ ...org, token: staff.token }, id, "approve")).status).toBe(403);
      const ok = await owner(org, id, "approve").expect(200);
      const { grantedAt, expiresAt } = ok.body.request;
      expect(new Date(expiresAt).getTime() - new Date(grantedAt).getTime()).toBe(3_600_000);
      expect((await owner(org, id, "approve")).status).toBe(409); // not reusable
      const ext = await owner(org, id, "extend", { minutes: 30 }).expect(200);
      expect(new Date(ext.body.request.expiresAt).getTime() - new Date(expiresAt).getTime()).toBe(1_800_000);
      expect((await owner(org, id, "extend", { minutes: 61 })).status).toBe(400);
      expect((await owner(org, id, "revoke").expect(200)).body.request.status).toBe("REVOKED");
      expect((await owner(org, id, "extend")).status).toBe(409);
      expect(await audit(org, "support.grant")).toHaveLength(1);
      expect(await audit(org, "support.extend")).toHaveLength(1);
      expect(await audit(org, "support.revoke")).toHaveLength(1);
    });

    it("owner denies a request", async () => {
      const org = await createTenant();
      const admin = await platformAdmin();
      const id = (await ask(admin, org)).body.request.id as string;
      expect((await owner(org, id, "deny").expect(200)).body.request.status).toBe("DENIED");
      expect((await owner(org, id, "approve")).status).toBe(409);
      expect((await ask(admin, org)).status).toBe(201); // a new request is allowed after a denial
    });

    it("tenant B's owner cannot see or act on A's requests", async () => {
      const a = await createTenant();
      const b = await createTenant();
      const admin = await platformAdmin();
      const id = await granted(admin, a);
      const listing = await request(app).get(`/orgs/${a.organisationId}/support/requests`).set(as(b));
      expect([listing.status, listing.body.error.code]).toEqual([404, "ORGANISATION_NOT_FOUND"]);
      expect((await request(app).get(`/orgs/${a.organisationId}/support/log`).set(as(b))).status).toBe(404);
      const own = await request(app).get(`/orgs/${b.organisationId}/support/requests`).set(as(b)).expect(200);
      expect(own.body.requests).toEqual([]);
      // A's request id under B's own organisation finds nothing
      expect((await owner(b, id, "revoke")).status).toBe(404);
      expect((await prisma.supportAccessGrant.findUniqueOrThrow({ where: { id } })).status).toBe("GRANTED");
    });
  });

  describe("B2 guard", () => {
    const get = (admin: { token: string }, org: { organisationId: string }, path = "/members") =>
      request(app).get(`/orgs/${org.organisationId}${path}`).set(as(admin));

    it("a platform admin without a grant is denied by the tenant guard", async () => {
      const org = await createTenant();
      const admin = await platformAdmin();
      const res = await get(admin, org);
      expect([res.status, res.body.error.code]).toEqual([404, "ORGANISATION_NOT_FOUND"]);
      await ask(admin, org); // a request that is not yet granted does not open anything
      expect((await get(admin, org)).status).toBe(403);
    });

    it("a valid grant allows GET only, read-only permissions, and writes an access row per request", async () => {
      const org = await createTenant();
      const admin = await platformAdmin();
      await granted(admin, org);
      const members = await get(admin, org).expect(200);
      expect(members.body.members).toHaveLength(1);
      await get(admin, org, "").expect(200); // organisation.read
      const rows = await audit(org, "support.access");
      expect(rows).toHaveLength(2);
      expect(rows[0]).toMatchObject({ actorUserId: admin.userId, details: { method: "GET" } });
      // writes are 403 and change nothing
      const other = await createUser();
      for (const w of [
        request(app).post(`/orgs/${org.organisationId}/members`).set(as(admin)).send({ email: other.email }),
        request(app).patch(`/orgs/${org.organisationId}`).set(as(admin)).send({ description: "x" }),
        request(app).delete(`/orgs/${org.organisationId}/members/${org.membershipId}`).set(as(admin)),
      ]) {
        const res = await w;
        expect([res.status, res.body.error.code]).toEqual([403, "SUPPORT_READ_ONLY"]);
      }
      expect(await prisma.organisationMembership.count({ where: { organisationId: org.organisationId } })).toBe(1);
      expect((await get(admin, org, "/support/requests")).status).toBe(403); // the grant is not the owner's rights
    });

    it("expired and revoked grants are 403", async () => {
      const org = await createTenant();
      const admin = await platformAdmin();
      const id = await granted(admin, org);
      await get(admin, org).expect(200);
      await prisma.supportAccessGrant.update({ where: { id }, data: { expiresAt: new Date(Date.now() - 1000) } });
      expect((await get(admin, org)).status).toBe(403);
      const second = await granted(admin, org);
      await get(admin, org).expect(200);
      await owner(org, second, "revoke").expect(200);
      expect((await get(admin, org)).status).toBe(403);
    });

    it("another organisation, another admin, or a de-flagged admin is denied", async () => {
      const a = await createTenant();
      const b = await createTenant();
      const admin = await platformAdmin();
      const other = await platformAdmin();
      await granted(admin, a);
      expect((await get(admin, b)).status).toBe(404);
      expect((await get(other, a)).status).toBe(404);
      await get(admin, a).expect(200);
      await prisma.user.update({ where: { id: admin.userId }, data: { isPlatformAdmin: false } });
      expect((await get(admin, a)).status).toBe(404);
    });

    it("the entitlement gate still applies to a support session", async () => {
      const org = await createTenant();
      const admin = await platformAdmin();
      await granted(admin, org);
      const probe = express()
        .get("/orgs/:orgId/probe", requireAuth, requireTenant, requirePermission("finance.read"), requireEntitlement("finance"), (_req, res) => void res.json({ ok: true }))
        .use(errorHandler);
      const hit = () => request(probe).get(`/orgs/${org.organisationId}/probe`).set(as(admin));
      await prisma.subscription.update({ where: { organisationId: org.organisationId }, data: { status: "ACTIVE", planKey: "professional" } });
      await hit().expect(200);
      await prisma.subscription.update({ where: { organisationId: org.organisationId }, data: { status: "ACTIVE", planKey: "free" } });
      expect((await hit()).body.error.code).toBe("ENTITLEMENT_REQUIRED");
    });
  });

  describe("B3 owner visibility and notifications", () => {
    it("owner reads the audit rows of their own organisation only; start and end are notified", async () => {
      const a = await createTenant();
      const b = await createTenant();
      const admin = await platformAdmin();
      const id = await granted(admin, a);
      await request(app).get(`/orgs/${a.organisationId}/members`).set(as(admin)).expect(200);
      await granted(admin, b);
      await owner(a, id, "revoke").expect(200);
      const log = await request(app).get(`/orgs/${a.organisationId}/support/log`).set(as(a)).expect(200);
      const actions = log.body.log.map((r: { action: string }) => r.action);
      expect(actions).toEqual(expect.arrayContaining(["support.request", "support.grant", "support.access", "support.revoke"]));
      expect(JSON.stringify(log.body)).not.toContain(b.organisationId);
      expect(await inbox(a, "support.started")).toHaveLength(1);
      expect(await inbox(a, "support.ended")).toHaveLength(1);
    });

    it("endExpired persists EXPIRED once, audits the end and notifies the owner", async () => {
      const org = await createTenant();
      const admin = await platformAdmin();
      const id = await granted(admin, org);
      await endExpired(new Date()); // not yet due
      expect(await audit(org, "support.end")).toHaveLength(0);
      await prisma.supportAccessGrant.update({ where: { id }, data: { expiresAt: new Date(Date.now() - 1000) } });
      await endExpired(new Date());
      await endExpired(new Date());
      expect((await prisma.supportAccessGrant.findUniqueOrThrow({ where: { id } })).status).toBe("EXPIRED");
      expect(await audit(org, "support.end")).toHaveLength(1);
      expect(await inbox(org, "support.ended")).toHaveLength(1);
      const list = await request(app).get(`/orgs/${org.organisationId}/support/requests`).set(as(org)).expect(200);
      expect(list.body.requests[0].status).toBe("EXPIRED");
    });
  });
});
