// Phase 04 (ADR-016) integration tests against a real PostgreSQL (DATABASE_URL, migrations applied).
import { randomUUID } from "node:crypto";
import express from "express";
import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { app } from "../../app.ts";
import { prisma } from "../../db.ts";
import { errorHandler } from "../../errors.ts";
import { createTenant, createUser, expectCrossTenantDenied, type TestTenant } from "../../test/cross-tenant.ts";
import { requireAuth } from "../identity/auth.ts";
import { platformRateLimitStores } from "./platform.routes.ts";
import { tenancyRateLimitStores } from "./tenancy.routes.ts";
import { rbacRateLimitStores } from "../rbac/rbac.routes.ts";
import * as rbac from "../rbac/rbac.service.ts";
import { requireActiveOrg, requireTenant, type OrgStatus } from "./tenant.ts";

const hasDb = Boolean(process.env.DATABASE_URL);
if (!hasDb) console.warn("onboarding.db.test: DATABASE_URL not set — DB integration tests SKIPPED");

const as = (t: { token: string }) => ({ Authorization: `Bearer ${t.token}` });
const url = (t: TestTenant, p = "") => `/orgs/${t.organisationId}${p}`;
const profile = { type: "masjid", state: "Selangor", country: "MY" };
const patch = (t: TestTenant, body: object, who: { token: string } = t) => request(app).patch(url(t)).set(as(who)).send(body);
const complete = (t: TestTenant, who: { token: string } = t) => request(app).post(url(t, "/onboarding/complete")).set(as(who));
const setStatus = (t: TestTenant, status: OrgStatus) =>
  prisma.organisation.update({ where: { id: t.organisationId }, data: { status } });
const statusOf = async (t: TestTenant) => (await prisma.organisation.findUniqueOrThrow({ where: { id: t.organisationId } })).status;
const active = async () => {
  const t = await createTenant();
  await patch(t, { ...profile }).expect(200);
  await complete(t).expect(200);
  return t;
};
async function staffOf(org: TestTenant, roles: string[] = ["staff"]) {
  const u = await createUser();
  const res = await request(app).post(url(org, "/members")).set(as(org)).send({ email: u.email, roles });
  expect(res.status).toBe(201);
  return { ...u, membershipId: res.body.member.id as string };
}
async function platformAdmin() {
  const u = await createUser();
  await prisma.user.update({ where: { id: u.userId }, data: { isPlatformAdmin: true } });
  return u;
}

describe.skipIf(!hasDb)("onboarding + lifecycle (database)", () => {
  beforeEach(async () => {
    await Promise.all(
      [...Object.values(tenancyRateLimitStores), ...Object.values(rbacRateLimitStores), ...Object.values(platformRateLimitStores)].map((s) =>
        s.resetAll(),
      ),
    );
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe("ORG-008 onboarding transitions", () => {
    it("create → DRAFT; first PATCH → ONBOARDING; complete needs name, type, state, country → ACTIVE", async () => {
      const t = await createTenant();
      expect(await statusOf(t)).toBe("DRAFT");
      expect((await request(app).get(url(t)).set(as(t))).body.organisation.status).toBe("DRAFT");

      const first = await patch(t, { type: "masjid", description: "Hello" }).expect(200);
      expect(first.body.organisation).toMatchObject({ status: "ONBOARDING", type: "masjid", description: "Hello", state: null });

      const missing = await complete(t);
      expect(missing.status).toBe(422);
      expect(missing.body.error.code).toBe("ONBOARDING_INCOMPLETE");
      expect(missing.body.error.message).toContain("state");
      expect(missing.body.error.message).toContain("country");
      expect(await statusOf(t)).toBe("ONBOARDING"); // rolled back

      await patch(t, { state: "Selangor", country: "MY" }).expect(200);
      const done = await complete(t).expect(200);
      expect(done.body.organisation.status).toBe("ACTIVE");
      const rows = await prisma.auditLog.findMany({ where: { organisationId: t.organisationId, action: "organisation.status.change" }, orderBy: { createdAt: "asc" } });
      expect(rows.map((r) => [r.before, r.after])).toEqual([
        [{ status: "DRAFT" }, { status: "ONBOARDING" }],
        [{ status: "ONBOARDING" }, { status: "ACTIVE" }],
      ]);
    });

    it("complete from DRAFT or ACTIVE is 409 INVALID_STATE_TRANSITION", async () => {
      const draft = await createTenant();
      expect((await complete(draft)).body.error.code).toBe("INVALID_STATE_TRANSITION");
      const act = await active();
      const res = await complete(act);
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe("INVALID_STATE_TRANSITION");
    });

    it("PATCH on an ACTIVE organisation keeps it ACTIVE and can clear fields with null", async () => {
      const t = await active();
      await patch(t, { description: "x", links: [{ label: "Site", url: "https://example.org" }] }).expect(200);
      const res = await patch(t, { description: null, links: null, name: "  New name " }).expect(200);
      expect(res.body.organisation).toMatchObject({ status: "ACTIVE", name: "New name", description: null, links: null });
    });

    it("PATCH stores links and profile fields", async () => {
      const t = await createTenant();
      const body = { ...profile, contactEmail: "a@b.org", contactPhone: "+60123", addressLine: "1 Jalan", links: [{ label: "FB", url: "http://fb.com/x" }] };
      expect((await patch(t, body).expect(200)).body.organisation).toMatchObject(body);
    });

    it.each([
      ["empty body", {}],
      ["bad country", { country: "malaysia" }],
      ["lowercase country", { country: "my" }],
      ["javascript: link", { links: [{ label: "x", url: "javascript:alert(1)" }] }],
      ["11 links", { links: Array.from({ length: 11 }, () => ({ label: "x", url: "https://a.org" })) }],
      ["unknown field", { nope: 1 }],
      ["organisationId in body", { organisationId: randomUUID() }],
      ["ownerId in body", { ownerId: randomUUID() }],
      ["status in body", { status: "ACTIVE" }],
      ["bad type", { type: "church" }],
      ["bad email", { contactEmail: "nope" }],
      ["null name", { name: null }],
      ["null type", { type: null }],
      ["null state", { state: null }],
      ["null country", { country: null }],
      ["long description", { description: "x".repeat(2001) }],
    ])("PATCH rejects %s", async (_n, body) => {
      const t = await createTenant();
      const res = await patch(t, body);
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
      expect(await statusOf(t)).toBe("DRAFT");
    });

    it("concurrent double transition: exactly one wins", async () => {
      const t = await createTenant();
      await patch(t, profile).expect(200);
      const rs = await Promise.all([complete(t), complete(t)]);
      expect(rs.map((r) => r.status).sort()).toEqual([200, 409]);
      expect(await prisma.auditLog.count({ where: { organisationId: t.organisationId, after: { equals: { status: "ACTIVE" } } } })).toBe(1);
    });
  });

  describe("permissions and tenant isolation", () => {
    it("staff cannot PATCH/complete/archive; admin cannot archive", async () => {
      const t = await active();
      const staff = await staffOf(t);
      const admin = await staffOf(t, ["admin"]);
      for (const res of [
        await patch(t, { description: "x" }, staff),
        await complete(t, staff),
        await request(app).post(url(t, "/archive")).set(as(staff)),
        await request(app).post(url(t, "/archive")).set(as(admin)),
      ]) {
        expect(res.status).toBe(403);
      }
      expect(await statusOf(t)).toBe("ACTIVE");
      expect((await patch(t, { description: "ok" }, admin)).status).toBe(200); // admin holds organisation.update
    });

    it("cross-tenant: new routes are 404 for a foreign organisation", async () => {
      const victim = await createTenant();
      const attacker = await createTenant();
      await expectCrossTenantDenied(
        attacker,
        [
          { method: "patch", path: url(victim), body: { description: "pwn" } },
          { method: "post", path: url(victim, "/onboarding/complete") },
          { method: "post", path: url(victim, "/archive") },
        ],
        { snapshot: () => prisma.organisation.findUniqueOrThrow({ where: { id: victim.organisationId } }) },
      );
    });
  });

  describe("tenant archive", () => {
    it("owner archives ACTIVE (reason audited) and SUSPENDED; DRAFT/ARCHIVED rejected; bad body 400", async () => {
      const t = await active();
      expect((await request(app).post(url(t, "/archive")).set(as(t)).send({ reason: 1 })).status).toBe(400);
      const res = await request(app).post(url(t, "/archive")).set(as(t)).send({ reason: "closing" }).expect(200);
      expect(res.body.organisation.status).toBe("ARCHIVED");
      const row = await prisma.auditLog.findFirstOrThrow({ where: { organisationId: t.organisationId, after: { path: ["status"], equals: "ARCHIVED" } } });
      expect(row.after).toEqual({ status: "ARCHIVED", reason: "closing" });
      expect((await request(app).post(url(t, "/archive")).set(as(t))).body.error.code).toBe("INVALID_STATE_TRANSITION");

      const s = await active();
      await setStatus(s, "SUSPENDED");
      await request(app).post(url(s, "/archive")).set(as(s)).expect(200);
      const d = await createTenant();
      expect((await request(app).post(url(d, "/archive")).set(as(d))).body.error.code).toBe("INVALID_STATE_TRANSITION");
    });
  });

  describe("ORG-009 lifecycle guard", () => {
    it.each(["SUSPENDED", "ARCHIVED"] as const)("%s rejects every tenant write with 409, allows reads and leave", async (status) => {
      const t = await active();
      const staff = await staffOf(t);
      const other = await createUser();
      await setStatus(t, status);
      const writes = [
        request(app).post(url(t, "/members")).set(as(t)).send({ email: other.email }),
        request(app).patch(url(t, `/members/${staff.membershipId}`)).set(as(t)).send({ title: "x" }),
        request(app).delete(url(t, `/members/${staff.membershipId}`)).set(as(t)),
        request(app).post(url(t, "/ownership/transfer")).set(as(t)).send({ membershipId: staff.membershipId }),
        request(app).patch(url(t)).set(as(t)).send({ description: "x" }),
        request(app).post(url(t, "/onboarding/complete")).set(as(t)),
      ];
      for (const [i, w] of writes.entries()) {
        const res = await w;
        expect([i, res.status, res.body.error.code]).toEqual([i, 409, "ORGANISATION_NOT_WRITABLE"]);
      }
      for (const p of ["", "/members", "/me/permissions"]) await request(app).get(url(t, p)).set(as(t)).expect(200);
      await request(app).get("/orgs").set(as(t)).expect(200);
      await request(app).post(url(t, "/leave")).set(as(staff)).expect(204);
    });

    it.each(["SUSPENDED", "ARCHIVED"] as const)("M1: %s set after the route guard is re-checked under the row lock", async (status) => {
      const t = await active();
      const staff = await staffOf(t);
      const other = await createUser();
      await setStatus(t, status); // the window: requireTenant already read ACTIVE
      const actor = { organisationId: t.organisationId, membershipId: t.membershipId, userId: t.userId };
      const calls = [
        () => rbac.addMember(actor, other.email, ["staff"]),
        () => rbac.updateMember(actor, staff.membershipId, { title: "x" }),
        () => rbac.removeMember(actor, staff.membershipId),
        () => rbac.transferOwnership(actor, staff.membershipId),
      ];
      for (const [i, c] of calls.entries()) await expect(c(), String(i)).rejects.toMatchObject({ status: 409, code: "ORGANISATION_NOT_WRITABLE" });
      await rbac.leave({ organisationId: t.organisationId, membershipId: staff.membershipId, userId: staff.userId }); // leave still works
    });

    it("every tenant write route is lifecycle-guarded (route list cannot drift)", () => {
      type Layer = { route?: { path: string; methods: Record<string, boolean>; stack: { handle: { lifecycle?: string } }[] }; handle: { stack?: Layer[] } };
      const exempt = new Set(["POST /orgs/:orgId/leave", "POST /orgs/:orgId/archive"]); // leave: always; archive: transition rules
      const missing: string[] = [];
      const walk = (stack: Layer[]) =>
        stack.forEach((l) => {
          if (l.handle.stack) walk(l.handle.stack);
          if (!l.route?.path.startsWith("/orgs/:orgId")) return;
          for (const m of Object.keys(l.route.methods).filter((m) => m !== "get" && m !== "head")) {
            const name = `${m.toUpperCase()} ${l.route.path}`;
            if (!exempt.has(name) && !l.route.stack.some((h) => typeof h.handle.lifecycle === "string")) missing.push(name);
          }
        });
      walk((app as unknown as { router: { stack: Layer[] } }).router.stack);
      expect(missing).toEqual([]);
    });

    it("requireActiveOrg (for module routers) admits only ACTIVE", async () => {
      const t = await createTenant();
      const probe = express()
        .get("/orgs/:orgId/probe", requireAuth, requireTenant, requireActiveOrg, (_req, res) => void res.json({ ok: true }))
        .use(errorHandler);
      const hit = () => request(probe).get(url(t, "/probe")).set(as(t));
      expect((await hit()).body.error.code).toBe("ORGANISATION_NOT_WRITABLE"); // DRAFT
      await setStatus(t, "ACTIVE");
      await hit().expect(200);
    });
  });

  describe("platform routes", () => {
    const list = (who: { token: string }, q = "") => request(app).get(`/platform/organisations${q}`).set(as(who));
    const act = (who: { token: string }, id: string, verb: string, body?: object) =>
      request(app).post(`/platform/organisations/${id}/${verb}`).set(as(who)).send(body);

    it("non-admins are denied (403), anonymous 401", async () => {
      const t = await active();
      expect((await list(t)).status).toBe(403);
      expect((await act(t, t.organisationId, "suspend", { reason: "x" })).status).toBe(403);
      expect((await request(app).get("/platform/organisations")).status).toBe(401);
      expect(await statusOf(t)).toBe("ACTIVE");
    });

    // Every page of GET /platform/organisations?<q>, asserting no duplicates and that paging terminates.
    async function walk(admin: { token: string }, q: string, limit = 100) {
      const seen: { id: string }[] = [];
      let cursor: string | undefined;
      do {
        const page = await list(admin, `?${q}&limit=${limit}${cursor ? `&cursor=${cursor}` : ""}`).expect(200);
        for (const o of page.body.organisations) {
          expect(seen.some((s) => s.id === o.id)).toBe(false);
          seen.push(o);
        }
        cursor = page.body.nextCursor ?? undefined;
      } while (cursor);
      return seen;
    }

    it("lists metadata only, paginated, filterable by status", async () => {
      const admin = await platformAdmin();
      const t1 = await active();
      const t2 = await createTenant();
      const one = await list(admin, "?limit=1").expect(200);
      expect(one.body.organisations).toHaveLength(1);
      expect(one.body.nextCursor).toEqual(expect.any(String));
      const drafts = await walk(admin, "status=DRAFT");
      const mine = drafts.find((o) => o.id === t2.organisationId)!;
      expect(Object.keys(mine).sort()).toEqual(["createdAt", "id", "name", "owner", "status", "subscription", "type"]);
      expect(Object.keys((mine as unknown as { owner: object }).owner).sort()).toEqual(["displayName", "email"]);
      expect(drafts.some((o) => o.id === t1.organisationId)).toBe(false);
      const everyone = await walk(admin, "", 2);
      expect(everyone.some((o) => o.id === t1.organisationId) && everyone.some((o) => o.id === t2.organisationId)).toBe(true);
      for (const q of ["?limit=0", "?limit=101", "?status=NOPE", "?cursor=abc"]) expect((await list(admin, q)).status, q).toBe(400);
    });

    it("suspend → reinstate → archive, each audited with reason and target", async () => {
      const admin = await platformAdmin();
      const t = await active();
      expect((await act(admin, t.organisationId, "suspend", { reason: "abuse" })).body.organisation).toMatchObject({ id: t.organisationId, status: "SUSPENDED" });
      expect(await statusOf(t)).toBe("SUSPENDED");
      await act(admin, t.organisationId, "reinstate", { reason: "resolved" }).expect(200);
      expect(await statusOf(t)).toBe("ACTIVE");
      await act(admin, t.organisationId, "archive", { reason: "gone" }).expect(200);
      expect(await statusOf(t)).toBe("ARCHIVED");
      const rows = await prisma.platformAuditLog.findMany({ where: { targetOrganisationId: t.organisationId }, orderBy: { createdAt: "asc" } });
      expect(rows.map((r) => [r.action, r.reason, r.actorUserId])).toEqual([
        ["organisation.suspend", "abuse", admin.userId],
        ["organisation.reinstate", "resolved", admin.userId],
        ["organisation.archive", "gone", admin.userId],
      ]);
    });

    it("reason is required; invalid transitions are 409; unknown or malformed ids 404", async () => {
      const admin = await platformAdmin();
      const t = await active();
      for (const body of [undefined, {}, { reason: "" }, { reason: "x".repeat(501) }, { reason: "ok", extra: 1 }]) {
        expect((await act(admin, t.organisationId, "suspend", body)).status).toBe(400);
      }
      expect(await prisma.platformAuditLog.count({ where: { targetOrganisationId: t.organisationId } })).toBe(0);
      expect((await act(admin, t.organisationId, "reinstate", { reason: "x" })).body.error.code).toBe("INVALID_STATE_TRANSITION");
      const d = await createTenant();
      for (const verb of ["suspend", "archive"]) expect((await act(admin, d.organisationId, verb, { reason: "x" })).status).toBe(409);
      for (const id of [randomUUID(), "not-a-uuid"]) {
        const res = await act(admin, id, "suspend", { reason: "x" });
        expect([res.status, res.body.error.code]).toEqual([404, "ORGANISATION_NOT_FOUND"]);
      }
      expect(await prisma.platformAuditLog.count({ where: { targetOrganisationId: t.organisationId } })).toBe(0);
    });

    it("suspended org blocks tenant writes (end to end)", async () => {
      const admin = await platformAdmin();
      const t = await active();
      await act(admin, t.organisationId, "suspend", { reason: "x" }).expect(200);
      expect((await patch(t, { description: "x" })).body.error.code).toBe("ORGANISATION_NOT_WRITABLE");
    });
  });
});
