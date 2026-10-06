// Phase 11 (ADR-018) integration tests against a real PostgreSQL (DATABASE_URL, migrations applied).
import { randomUUID } from "node:crypto";
import express from "express";
import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { app } from "../../app.ts";
import { prisma } from "../../db.ts";
import { errorHandler } from "../../errors.ts";
import { createTenant, createUser, expectCrossTenantDenied, type TestTenant } from "../../test/cross-tenant.ts";
import { requireAuth } from "../identity/auth.ts";
import { requirePermission } from "../rbac/rbac.ts";
import { rbacRateLimitStores } from "../rbac/rbac.routes.ts";
import { platformRateLimitStores } from "../tenancy/platform.routes.ts";
import { tenancyRateLimitStores } from "../tenancy/tenancy.routes.ts";
import { requireTenant } from "../tenancy/tenant.ts";
import { FEATURES, QUOTAS, requireEntitlement, type Feature } from "./entitlements.ts";

const hasDb = Boolean(process.env.DATABASE_URL);
if (!hasDb) console.warn("subscriptions.db.test: DATABASE_URL not set — DB integration tests SKIPPED");

const DAY = 24 * 60 * 60 * 1000;
const as = (t: { token: string }) => ({ Authorization: `Bearer ${t.token}` });
const getSub = (t: TestTenant, who: { token: string } = t) => request(app).get(`/orgs/${t.organisationId}/subscription`).set(as(who));
const act = (who: { token: string }, orgId: string, verb: string, body?: object) =>
  request(app).post(`/platform/organisations/${orgId}/subscription/${verb}`).set(as(who)).send(body);
const stored = (t: TestTenant) => prisma.subscription.findUniqueOrThrow({ where: { organisationId: t.organisationId } });
const lapse = (t: TestTenant) =>
  prisma.subscription.update({ where: { organisationId: t.organisationId }, data: { trialEndsAt: new Date(Date.now() - 1000) } });
const add = (t: TestTenant, email: string, roles = ["staff"]) =>
  request(app).post(`/orgs/${t.organisationId}/members`).set(as(t)).send({ email, roles });
async function member(t: TestTenant, roles = ["staff"]) {
  const u = await createUser();
  expect((await add(t, u.email, roles)).status).toBe(201);
  return u;
}
async function platformAdmin() {
  const u = await createUser();
  await prisma.user.update({ where: { id: u.userId }, data: { isPlatformAdmin: true } });
  return u;
}

describe.skipIf(!hasDb)("subscriptions (database)", () => {
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

  it("plans are seeded as DB configuration with exactly the catalogue keys (SAAS-004/005/006)", async () => {
    const plans = await prisma.plan.findMany({ orderBy: { key: "asc" } });
    expect(plans.map((p) => [p.key, p.name])).toEqual([
      ["free", "Free"],
      ["professional", "Professional"],
      ["starter", "Starter"],
    ]);
    for (const p of plans) expect(Object.keys(p.entitlements as object).sort()).toEqual([...FEATURES, ...QUOTAS].sort());
  });

  describe("trial (SAAS-003, ADR-018 §2)", () => {
    it("a new organisation gets a 30-day Professional TRIAL in the same transaction", async () => {
      const before = Date.now();
      const t = await createTenant();
      const s = await stored(t);
      expect([s.status, s.planKey]).toEqual(["TRIAL", "professional"]);
      expect(s.trialEndsAt!.getTime()).toBeGreaterThanOrEqual(before + 30 * DAY);
      expect(s.trialEndsAt!.getTime()).toBeLessThanOrEqual(Date.now() + 30 * DAY);
      const res = await getSub(t).expect(200);
      expect(res.body.subscription).toEqual({
        plan: { key: "professional", name: "Professional" },
        status: "TRIAL",
        trialEndsAt: s.trialEndsAt!.toISOString(),
        entitlements: { operations: true, finance: true, "finance.reporting": true, "members.max": null },
      });
    });

    it("a lapsed trial reads as EXPIRED with Free entitlements; the next write persists it", async () => {
      const t = await createTenant();
      await lapse(t);
      const res = await getSub(t).expect(200);
      expect(res.body.subscription).toMatchObject({
        plan: { key: "free" },
        status: "EXPIRED",
        entitlements: { operations: false, finance: false, "finance.reporting": false, "members.max": 5 },
      });
      expect((await stored(t)).status).toBe("TRIAL"); // reads do not write
      const admin = await platformAdmin();
      const rejected = await act(admin, t.organisationId, "past-due", { reason: "x" });
      expect([rejected.body.error.code, rejected.body.error.message]).toEqual(["INVALID_STATE_TRANSITION", "Cannot change a subscription from EXPIRED to PAST_DUE"]);
      await act(admin, t.organisationId, "activate", { reason: "paid late", planKey: "starter" }).expect(200);
      const row = await prisma.platformAuditLog.findFirstOrThrow({ where: { targetOrganisationId: t.organisationId } });
      expect(row.details).toMatchObject({ from: "EXPIRED", to: "ACTIVE" }); // resubscribe, not TRIAL → ACTIVE
    });
  });

  describe("platform transitions (SAAS-009, ADR-018 §3/§4)", () => {
    it("every allowed transition, each audited with reason and notified to every member", async () => {
      const admin = await platformAdmin();
      const t = await createTenant("Surau B");
      const staff = await member(t);
      const steps: [string, object, string, string][] = [
        ["activate", { reason: "invoice 1 paid", planKey: "starter" }, "ACTIVE", "starter"],
        ["activate", { reason: "upgrade", planKey: "professional" }, "ACTIVE", "professional"], // plan change while ACTIVE
        ["past-due", { reason: "invoice 2 unpaid" }, "PAST_DUE", "professional"],
        ["activate", { reason: "invoice 2 paid", planKey: "professional" }, "ACTIVE", "professional"],
        ["cancel", { reason: "owner request" }, "CANCELLED", "professional"],
        ["activate", { reason: "resubscribe", planKey: "starter" }, "ACTIVE", "starter"],
        ["past-due", { reason: "late" }, "PAST_DUE", "starter"],
        ["expire", { reason: "never paid" }, "EXPIRED", "starter"],
        ["activate", { reason: "resubscribe", planKey: "starter" }, "ACTIVE", "starter"],
      ];
      for (const [verb, body, status, planKey] of steps) {
        const res = await act(admin, t.organisationId, verb, body);
        expect([verb, res.status, res.body.subscription]).toEqual([verb, 200, { status, planKey }]);
      }
      const rows = await prisma.platformAuditLog.findMany({ where: { targetOrganisationId: t.organisationId }, orderBy: { createdAt: "asc" } });
      expect(rows.map((r) => [r.action, r.reason, r.actorUserId])).toEqual(
        steps.map(([verb, body]) => [`subscription.${verb}`, (body as { reason: string }).reason, admin.userId]),
      );
      expect(rows[0]!.details).toEqual({ from: "TRIAL", to: "ACTIVE", planKey: "starter", previousPlanKey: "professional" });
      expect(rows[7]!.details).toEqual({ from: "PAST_DUE", to: "EXPIRED", planKey: "starter", previousPlanKey: "starter" });

      // ADR-017: every member (the admin is not one), minimal title, no amounts.
      for (const who of [t, staff]) {
        const n = await prisma.notification.findMany({ where: { recipientUserId: who.userId, type: "subscription.changed" }, orderBy: { createdAt: "asc" } });
        expect(n).toHaveLength(steps.length);
        expect(n[0]).toMatchObject({ organisationId: t.organisationId, title: "Subscription changed: Starter plan, ACTIVE", targetType: "subscription" });
      }
    });

    it("disallowed transitions are 409 INVALID_STATE_TRANSITION and change nothing", async () => {
      const admin = await platformAdmin();
      const t = await createTenant();
      const reject = async (verbs: string[]) => {
        for (const verb of verbs) {
          const res = await act(admin, t.organisationId, verb, { reason: "x" });
          expect([verb, res.status, res.body.error?.code]).toEqual([verb, 409, "INVALID_STATE_TRANSITION"]);
        }
      };
      await reject(["past-due", "cancel", "expire"]); // TRIAL: only activate (or lazy expiry)
      await act(admin, t.organisationId, "activate", { reason: "x", planKey: "starter" }).expect(200);
      await reject(["expire"]); // ACTIVE
      await act(admin, t.organisationId, "cancel", { reason: "x" }).expect(200);
      await reject(["past-due", "cancel", "expire"]); // CANCELLED
      expect((await stored(t)).status).toBe("CANCELLED");
      expect(await prisma.platformAuditLog.count({ where: { targetOrganisationId: t.organisationId } })).toBe(2);
    });

    it("reason is required; planKey is required for activate, validated against the Plan table and rejected elsewhere", async () => {
      const admin = await platformAdmin();
      const t = await createTenant();
      const bad: [string, object | undefined][] = [
        ["activate", undefined],
        ["activate", { planKey: "starter" }],
        ["activate", { reason: "", planKey: "starter" }],
        ["activate", { reason: "x" }],
        ["activate", { reason: "x".repeat(501), planKey: "starter" }],
        ["activate", { reason: "x", planKey: "starter", status: "ACTIVE" }],
        ["cancel", {}],
        ["cancel", { reason: "x", planKey: "free" }],
      ];
      for (const [verb, body] of bad) expect((await act(admin, t.organisationId, verb, body)).status, JSON.stringify(body)).toBe(400);
      const unknown = await act(admin, t.organisationId, "activate", { reason: "x", planKey: "enterprise" });
      expect([unknown.status, unknown.body.error.code]).toEqual([400, "UNKNOWN_PLAN"]);
      for (const id of [randomUUID(), "not-a-uuid"]) {
        const res = await act(admin, id, "activate", { reason: "x", planKey: "starter" });
        expect([res.status, res.body.error.code]).toEqual([404, "ORGANISATION_NOT_FOUND"]);
      }
      expect((await stored(t)).status).toBe("TRIAL");
      expect(await prisma.platformAuditLog.count({ where: { targetOrganisationId: t.organisationId } })).toBe(0);
    });

    it("only a Platform Administrator may transition (owner 403, anonymous 401)", async () => {
      const t = await createTenant();
      expect((await act(t, t.organisationId, "activate", { reason: "x", planKey: "professional" })).status).toBe(403);
      expect((await request(app).post(`/platform/organisations/${t.organisationId}/subscription/activate`).send({ reason: "x", planKey: "starter" })).status).toBe(401);
      expect((await stored(t)).status).toBe("TRIAL");
    });

    it("concurrent transitions: exactly one wins", async () => {
      const admin = await platformAdmin();
      const t = await createTenant();
      await act(admin, t.organisationId, "activate", { reason: "x", planKey: "starter" }).expect(200);
      const rs = await Promise.all([act(admin, t.organisationId, "cancel", { reason: "a" }), act(admin, t.organisationId, "cancel", { reason: "b" })]);
      expect(rs.map((r) => r.status).sort()).toEqual([200, 409]);
    });

    it("the platform list shows subscription metadata with the effective status", async () => {
      const admin = await platformAdmin();
      const t = await createTenant();
      await lapse(t);
      type Page = { organisations: { id: string; subscription: { planKey: string; status: string } }[]; nextCursor: string | null };
      let cursor: string | null = null;
      let mine: Page["organisations"][number] | undefined;
      do {
        const res = await request(app).get(`/platform/organisations?status=DRAFT&limit=100${cursor ? `&cursor=${cursor}` : ""}`).set(as(admin)).expect(200);
        const page = res.body as Page;
        mine ??= page.organisations.find((o) => o.id === t.organisationId);
        cursor = page.nextCursor;
      } while (cursor && !mine);
      expect(mine!.subscription).toMatchObject({ planKey: "professional", status: "EXPIRED" });
    });
  });

  describe("entitlement gate (RBAC-004, SAAS-002/007)", () => {
    // A finance-like route: permission first, then entitlement; both must pass.
    const probe = (feature: Feature) =>
      express()
        .post("/orgs/:orgId/probe", requireAuth, requireTenant, requirePermission("finance.approve"), requireEntitlement(feature), (_req, res) => void res.json({ ok: true }))
        .use(errorHandler);
    const hit = (t: TestTenant, who: { token: string } = t, feature: Feature = "finance") =>
      request(probe(feature)).post(`/orgs/${t.organisationId}/probe`).set(as(who));

    it("trial allows; lapsed trial denies with ENTITLEMENT_REQUIRED (distinct from FORBIDDEN); activation restores", async () => {
      const t = await createTenant();
      const staff = await member(t);
      await hit(t).expect(200);
      expect((await hit(t, staff)).body.error.code).toBe("FORBIDDEN"); // permission is checked first
      await lapse(t);
      const denied = await hit(t);
      expect([denied.status, denied.body.error.code]).toEqual([403, "ENTITLEMENT_REQUIRED"]);
      expect((await hit(t, staff)).body.error.code).toBe("FORBIDDEN");
      const admin = await platformAdmin();
      await act(admin, t.organisationId, "activate", { reason: "paid", planKey: "starter" }).expect(200);
      await hit(t).expect(200);
      expect((await hit(t, t, "finance.reporting")).body.error.code).toBe("ENTITLEMENT_REQUIRED"); // Starter lacks it
    });

    it("PAST_DUE keeps the paid plan (grace); CANCELLED falls back to Free", async () => {
      const admin = await platformAdmin();
      const t = await createTenant();
      await act(admin, t.organisationId, "activate", { reason: "x", planKey: "starter" }).expect(200);
      await act(admin, t.organisationId, "past-due", { reason: "x" }).expect(200);
      await hit(t).expect(200);
      expect((await getSub(t)).body.subscription).toMatchObject({ status: "PAST_DUE", plan: { key: "starter" } });
      await act(admin, t.organisationId, "activate", { reason: "x", planKey: "starter" }).expect(200);
      await act(admin, t.organisationId, "cancel", { reason: "x" }).expect(200);
      expect((await hit(t)).body.error.code).toBe("ENTITLEMENT_REQUIRED");
      expect((await getSub(t)).body.subscription).toMatchObject({ status: "CANCELLED", plan: { key: "free" } });
    });

    it("guards declare their feature and reject unknown features", () => {
      expect((requireEntitlement("operations") as unknown as { entitlement: string }).entitlement).toBe("operations");
      expect(() => requireEntitlement("hub" as Feature)).toThrow(/unknown feature/);
    });
  });

  describe("members.max quota (ADR-018 §1)", () => {
    it("Free allows 5 memberships (owner included); the 6th is 403 QUOTA_EXCEEDED; existing rows are kept", async () => {
      const t = await createTenant();
      for (let i = 0; i < 6; i++) await member(t); // trial: unlimited → 7 memberships
      await lapse(t); // Free: 5
      const u = await createUser();
      const res = await add(t, u.email);
      expect([res.status, res.body.error.code]).toEqual([403, "QUOTA_EXCEEDED"]);
      expect(res.body.error.message).toMatch(/upgrade your plan/i);
      expect((await request(app).get(`/orgs/${t.organisationId}/members`).set(as(t))).body.members).toHaveLength(7); // kept, readable
      const admin = await platformAdmin();
      await act(admin, t.organisationId, "activate", { reason: "x", planKey: "starter" }).expect(200);
      await add(t, u.email).expect(201);
    });

    it("concurrent adds at the limit: exactly one wins (checked under the org row lock)", async () => {
      const t = await createTenant();
      for (let i = 0; i < 3; i++) await member(t); // 4 memberships
      await lapse(t);
      const [a, b] = [await createUser(), await createUser()];
      const rs = await Promise.all([add(t, a.email), add(t, b.email)]);
      expect(rs.map((r) => r.status).sort()).toEqual([201, 403]);
      expect(await prisma.organisationMembership.count({ where: { organisationId: t.organisationId } })).toBe(5);
    });
  });

  describe("GET /orgs/:orgId/subscription", () => {
    it("requires billing.read (owner, admin); other roles get 403 FORBIDDEN", async () => {
      const t = await createTenant();
      await getSub(t, await member(t, ["admin"])).expect(200);
      for (const role of ["treasurer", "committee", "staff"]) {
        const res = await getSub(t, await member(t, [role]));
        expect([role, res.status, res.body.error.code]).toEqual([role, 403, "FORBIDDEN"]);
      }
    });

    it("cross-tenant: 404 for a foreign organisation", async () => {
      const victim = await createTenant();
      const attacker = await createTenant();
      await expectCrossTenantDenied(attacker, [{ method: "get", path: `/orgs/${victim.organisationId}/subscription` }], {
        snapshot: () => stored(victim),
      });
    });
  });
});
