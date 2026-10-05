// Phase 03 RBAC integration tests against a real PostgreSQL (DATABASE_URL, migrations applied).
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { promisify } from "node:util";
import express from "express";
import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { app } from "../../app.ts";
import { prisma } from "../../db.ts";
import { errorHandler } from "../../errors.ts";
import { ADR_MATRIX } from "../../test/adr-015.ts";
import { createTenant, createUser, expectCrossTenantDenied, type TestTenant } from "../../test/cross-tenant.ts";
import { requireAuth } from "../identity/auth.ts";
import { tenancyRateLimitStores } from "../tenancy/tenancy.routes.ts";
import { PERMISSIONS, ROLES, type AssignableRole, type Permission, type RoleKey } from "./permissions.ts";
import { setPlatformAdmin } from "./platform-admin.ts";
import { hasPermission, requirePlatformAdmin } from "./rbac.ts";
import { rbacRateLimitStores } from "./rbac.routes.ts";
import { addMember } from "./rbac.service.ts";

const hasDb = Boolean(process.env.DATABASE_URL);
if (!hasDb) console.warn("rbac.db.test: DATABASE_URL not set — DB integration tests SKIPPED");

type Who = { token: string; userId: string; membershipId: string };
const as = (t: { token: string }) => ({ Authorization: `Bearer ${t.token}` });

// A new member of `org` holding exactly `roles`, added by the owner through the real API.
async function member(org: TestTenant, roles: AssignableRole[]): Promise<Who & { email: string }> {
  const u = await createUser();
  const res = await request(app).post(`/orgs/${org.organisationId}/members`).set(as(org)).send({ email: u.email, roles });
  expect(res.status).toBe(201);
  return { ...u, membershipId: res.body.member.id };
}
const actorWith = async (org: TestTenant, role: RoleKey): Promise<Who> => (role === "owner" ? org : member(org, [role]));

const auditRows = (organisationId: string, action: string) =>
  prisma.auditLog.findMany({ where: { organisationId, action }, orderBy: { createdAt: "asc" } });
const patch = (org: TestTenant, who: { token: string }, membershipId: string, body: object) =>
  request(app).patch(`/orgs/${org.organisationId}/members/${membershipId}`).set(as(who)).send(body);

describe.skipIf(!hasDb)("rbac (database)", () => {
  beforeEach(async () => {
    await Promise.all([...Object.values(tenancyRateLimitStores), ...Object.values(rbacRateLimitStores)].map((s) => s.resetAll()));
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });

  // RBAC-003 acceptance: every sensitive route × every role, expectation taken from ADR-015 §2.
  describe("permission matrix on routes (ADR-015 §2)", () => {
    type Ctx = { org: TestTenant; target: Who; freshEmail: string };
    const routes: { name: string; key: Permission; ok: number; call: (c: Ctx) => request.Test }[] = [
      { name: "GET /orgs/:orgId", key: "organisation.read", ok: 200, call: (c) => request(app).get(`/orgs/${c.org.organisationId}`) },
      {
        name: "GET /orgs/:orgId/members",
        key: "members.read",
        ok: 200,
        call: (c) => request(app).get(`/orgs/${c.org.organisationId}/members`),
      },
      {
        name: "POST /orgs/:orgId/members",
        key: "members.manage",
        ok: 201,
        call: (c) => request(app).post(`/orgs/${c.org.organisationId}/members`).send({ email: c.freshEmail }),
      },
      {
        name: "PATCH /orgs/:orgId/members/:id",
        key: "members.manage",
        ok: 200,
        call: (c) => request(app).patch(`/orgs/${c.org.organisationId}/members/${c.target.membershipId}`).send({ roles: ["committee"] }),
      },
      {
        name: "DELETE /orgs/:orgId/members/:id",
        key: "members.manage",
        ok: 204,
        call: (c) => request(app).delete(`/orgs/${c.org.organisationId}/members/${c.target.membershipId}`),
      },
      {
        name: "POST /orgs/:orgId/ownership/transfer",
        key: "organisation.ownership.transfer",
        ok: 200,
        call: (c) =>
          request(app).post(`/orgs/${c.org.organisationId}/ownership/transfer`).send({ membershipId: c.target.membershipId }),
      },
    ];
    const cases = routes.flatMap((r) => ROLES.map((role) => [r.name, role, r] as const));

    it.each(cases)("%s as %s", async (_name, role, r) => {
      const org = await createTenant();
      const actor = await actorWith(org, role);
      const target = await member(org, ["staff"]);
      const freshEmail = (await createUser()).email;
      const res = await r.call({ org, target, freshEmail }).set(as(actor));
      const allowed = ADR_MATRIX.matrix.get(role)!.includes(r.key);
      if (allowed) expect(res.status, JSON.stringify(res.body)).toBe(r.ok);
      else expect([res.status, res.body.error?.code]).toEqual([403, "FORBIDDEN"]);
    });
  });

  describe("GET /orgs/:orgId/me/permissions (RBAC-005)", () => {
    it.each(ROLES)("returns exactly the %s keys, in catalogue order", async (role) => {
      const org = await createTenant();
      const actor = await actorWith(org, role);
      const res = await request(app).get(`/orgs/${org.organisationId}/me/permissions`).set(as(actor)).expect(200);
      expect(res.body.roles).toEqual([role]);
      expect(res.body.permissions).toEqual(PERMISSIONS.filter((p) => ADR_MATRIX.matrix.get(role)!.includes(p)));
    });

    it("multiple roles: union; no roles: nothing", async () => {
      const org = await createTenant();
      const both = await member(org, ["treasurer", "staff"]);
      const res = await request(app).get(`/orgs/${org.organisationId}/me/permissions`).set(as(both)).expect(200);
      expect(res.body.permissions).toEqual(expect.arrayContaining(["finance.approve", "bulletin.manage"]));
      const none = await member(org, []);
      const r2 = await request(app).get(`/orgs/${org.organisationId}/me/permissions`).set(as(none)).expect(200);
      expect(r2.body).toEqual({ roles: [], permissions: [] });
      // a member with no roles cannot even read the organisation (fail closed)
      await request(app).get(`/orgs/${org.organisationId}`).set(as(none)).expect(403);
    });

    it("a new member defaults to staff", async () => {
      const org = await createTenant();
      const u = await createUser();
      const res = await request(app).post(`/orgs/${org.organisationId}/members`).set(as(org)).send({ email: u.email });
      expect(res.body.member.roles).toEqual(["staff"]);
    });
  });

  describe("no self-escalation (RBAC-009)", () => {
    it("nobody changes their own roles, not even the owner", async () => {
      const org = await createTenant();
      const admin = await member(org, ["admin"]);
      const res = await patch(org, admin, admin.membershipId, { roles: ["admin", "treasurer"] });
      expect([res.status, res.body.error.code]).toEqual([403, "SELF_CHANGE"]);
      const own = await patch(org, org, org.membershipId, { roles: ["treasurer"] });
      expect(own.status).toBe(403);
      expect(await prisma.membershipRole.count({ where: { membershipId: admin.membershipId } })).toBe(1);
    });

    it("admin cannot grant treasurer (finance authority), by PATCH or when adding a member", async () => {
      const org = await createTenant();
      const admin = await member(org, ["admin"]);
      const staff = await member(org, ["staff"]);
      const res = await patch(org, admin, staff.membershipId, { roles: ["staff", "treasurer"] });
      expect([res.status, res.body.error.code]).toEqual([403, "ROLE_NOT_GRANTABLE"]);
      const u = await createUser();
      const add = await request(app)
        .post(`/orgs/${org.organisationId}/members`)
        .set(as(admin))
        .send({ email: u.email, roles: ["treasurer"] });
      expect([add.status, add.body.error.code]).toEqual([403, "ROLE_NOT_GRANTABLE"]);
      expect(await prisma.organisationMembership.count({ where: { userId: u.userId } })).toBe(0);
    });

    it("admin cannot revoke treasurer or remove a treasurer", async () => {
      const org = await createTenant();
      const admin = await member(org, ["admin"]);
      const t = await member(org, ["treasurer"]);
      expect((await patch(org, admin, t.membershipId, { roles: [] })).status).toBe(403);
      const del = await request(app).delete(`/orgs/${org.organisationId}/members/${t.membershipId}`).set(as(admin));
      expect([del.status, del.body.error.code]).toEqual([403, "ROLE_NOT_GRANTABLE"]);
    });

    it("owner is never granted through the role routes", async () => {
      const org = await createTenant();
      const staff = await member(org, ["staff"]);
      const res = await patch(org, org, staff.membershipId, { roles: ["owner"] });
      expect([res.status, res.body.error.code]).toEqual([400, "VALIDATION_ERROR"]);
      const u = await createUser();
      const add = await request(app).post(`/orgs/${org.organisationId}/members`).set(as(org)).send({ email: u.email, roles: ["owner"] });
      expect(add.status).toBe(400);
      expect((await prisma.organisation.findUniqueOrThrow({ where: { id: org.organisationId } })).ownerId).toBe(org.userId);
    });

    it.each([[{ roles: ["superuser"] }], [{ roles: "admin" }], [{}], [{ roles: [], userId: randomUUID() }], [{ title: "x".repeat(101) }]])(
      "rejects invalid body %j",
      async (body) => {
        const org = await createTenant();
        const staff = await member(org, ["staff"]);
        expect((await patch(org, org, staff.membershipId, body)).status).toBe(400);
      },
    );

    it("owner grants treasurer; it is audited with before/after (RBAC-011)", async () => {
      const org = await createTenant();
      const staff = await member(org, ["staff"]);
      const res = await patch(org, org, staff.membershipId, { roles: ["staff", "treasurer"] }).expect(200);
      expect(res.body.member.roles).toEqual(["treasurer", "staff"]);
      const [row] = await auditRows(org.organisationId, "membership.update");
      expect(row).toMatchObject({
        actorUserId: org.userId,
        targetType: "membership",
        targetId: staff.membershipId,
        before: { roles: ["staff"], title: null },
        after: { roles: ["treasurer", "staff"], title: null },
      });
    });

    it("display title grants nothing; members.manage holders may set it on anyone, including themselves", async () => {
      const org = await createTenant();
      const staff = await member(org, ["staff"]);
      const res = await patch(org, org, staff.membershipId, { title: " Nazir " }).expect(200);
      expect(res.body.member).toMatchObject({ title: "Nazir", roles: ["staff"] });
      await patch(org, org, org.membershipId, { title: "Pengerusi" }).expect(200);
      const perms = await request(app).get(`/orgs/${org.organisationId}/me/permissions`).set(as(staff));
      expect(perms.body.roles).toEqual(["staff"]);
      expect((await patch(org, staff, staff.membershipId, { title: "Imam" })).status).toBe(403); // staff lacks members.manage
    });

    it("a role change takes effect on the next request", async () => {
      const org = await createTenant();
      const staff = await member(org, ["staff"]);
      const u = await createUser();
      const add = () => request(app).post(`/orgs/${org.organisationId}/members`).set(as(staff)).send({ email: u.email });
      expect((await add()).status).toBe(403);
      await patch(org, org, staff.membershipId, { roles: ["admin"] }).expect(200);
      expect((await add()).status).toBe(201);
      await patch(org, org, staff.membershipId, { roles: ["staff"] }).expect(200);
      expect((await request(app).get(`/orgs/${org.organisationId}/members`).set(as(staff))).status).toBe(200);
      expect((await patch(org, staff, org.membershipId, { title: "x" })).status).toBe(403);
    });
  });

  describe("single owner (RBAC-008)", () => {
    it("the owner cannot be removed or have roles changed through the member routes", async () => {
      const org = await createTenant();
      const admin = await member(org, ["admin"]);
      const del = await request(app).delete(`/orgs/${org.organisationId}/members/${org.membershipId}`).set(as(admin));
      expect([del.status, del.body.error.code]).toEqual([409, "OWNER_PROTECTED"]);
      const p = await patch(org, admin, org.membershipId, { roles: ["staff"] });
      expect([p.status, p.body.error.code]).toEqual([409, "OWNER_PROTECTED"]);
    });

    it("only the owner may set the owner's title", async () => {
      const org = await createTenant();
      const admin = await member(org, ["admin"]);
      const t = await patch(org, admin, org.membershipId, { title: "Bekas Pengerusi" });
      expect([t.status, t.body.error.code]).toEqual([409, "OWNER_PROTECTED"]);
      expect(await auditRows(org.organisationId, "membership.update")).toHaveLength(0);
      await patch(org, org, org.membershipId, { title: "Pengerusi" }).expect(200);
    });

    it("the database refuses to delete the owner's membership (deferred trigger)", async () => {
      const org = await createTenant();
      await expect(prisma.organisationMembership.delete({ where: { id: org.membershipId } })).rejects.toThrow(/owner must be a member/);
      expect(await prisma.organisationMembership.count({ where: { id: org.membershipId } })).toBe(1);
    });

    it("the database refuses an owner who is not a member", async () => {
      const org = await createTenant();
      const outsider = await createUser();
      await expect(
        prisma.organisation.update({ where: { id: org.organisationId }, data: { ownerId: outsider.userId } }),
      ).rejects.toThrow(/owner must be a member/);
    });

    it("the owner cannot leave (RBAC-013)", async () => {
      const org = await createTenant();
      const res = await request(app).post(`/orgs/${org.organisationId}/leave`).set(as(org));
      expect([res.status, res.body.error.code]).toEqual([409, "OWNER_MUST_TRANSFER"]);
    });
  });

  describe("remove and leave", () => {
    it("admin removes a staff member; audited; access is gone", async () => {
      const org = await createTenant();
      const admin = await member(org, ["admin"]);
      const staff = await member(org, ["staff", "committee"]);
      await request(app).delete(`/orgs/${org.organisationId}/members/${staff.membershipId}`).set(as(admin)).expect(204);
      await request(app).get(`/orgs/${org.organisationId}`).set(as(staff)).expect(404);
      const [row] = await auditRows(org.organisationId, "membership.remove");
      expect(row).toMatchObject({ actorUserId: admin.userId, targetId: staff.membershipId, before: { roles: ["committee", "staff"] } });
      expect(await prisma.membershipRole.count({ where: { membershipId: staff.membershipId } })).toBe(0);
    });

    it("remove: self is refused (use leave), unknown member is 404", async () => {
      const org = await createTenant();
      const admin = await member(org, ["admin"]);
      const self = await request(app).delete(`/orgs/${org.organisationId}/members/${admin.membershipId}`).set(as(admin));
      expect(self.status).toBe(403);
      for (const id of [randomUUID(), "not-a-uuid"]) {
        const r = await request(app).delete(`/orgs/${org.organisationId}/members/${id}`).set(as(admin));
        expect([r.status, r.body.error.code]).toEqual([404, "MEMBER_NOT_FOUND"]);
      }
    });

    it("any non-owner may leave, with no permission needed (RBAC-013); audited", async () => {
      const org = await createTenant();
      const none = await member(org, []);
      const t = await member(org, ["treasurer"]);
      await request(app).post(`/orgs/${org.organisationId}/leave`).set(as(none)).expect(204);
      await request(app).post(`/orgs/${org.organisationId}/leave`).set(as(t)).expect(204);
      await request(app).get(`/orgs/${org.organisationId}/me/permissions`).set(as(t)).expect(404);
      const rows = await auditRows(org.organisationId, "membership.leave");
      expect(rows.map((r) => [r.actorUserId, r.before])).toEqual([
        [none.userId, { userId: none.userId, roles: [] }],
        [t.userId, { userId: t.userId, roles: ["treasurer"] }],
      ]);
    });
  });

  describe("ownership transfer (RBAC-008)", () => {
    it("moves owner atomically; the previous owner keeps their roles plus admin; audited", async () => {
      const org = await createTenant();
      const b = await member(org, ["treasurer"]);
      await patch(org, org, org.membershipId, { title: "Pengerusi" }).expect(200);
      const res = await request(app)
        .post(`/orgs/${org.organisationId}/ownership/transfer`)
        .set(as(org))
        .send({ membershipId: b.membershipId })
        .expect(200);
      expect(res.body.members.map((m: { id: string; roles: string[] }) => [m.id, m.roles])).toEqual([
        [org.membershipId, ["admin"]],
        [b.membershipId, ["owner", "treasurer"]],
      ]);
      expect((await prisma.organisation.findUniqueOrThrow({ where: { id: org.organisationId } })).ownerId).toBe(b.userId);
      const bPerms = await request(app).get(`/orgs/${org.organisationId}/me/permissions`).set(as(b));
      expect(bPerms.body.permissions).toEqual([...PERMISSIONS]);
      // the old owner lost owner-only keys immediately
      const again = await request(app).post(`/orgs/${org.organisationId}/ownership/transfer`).set(as(org)).send({ membershipId: b.membershipId });
      expect(again.status).toBe(403);
      // and can now leave
      const [row] = await auditRows(org.organisationId, "organisation.ownership.transfer");
      expect(row).toMatchObject({
        actorUserId: org.userId,
        before: { ownerMembershipId: org.membershipId },
        after: { ownerMembershipId: b.membershipId, previousOwnerRoles: ["admin"] },
      });
      await request(app).post(`/orgs/${org.organisationId}/leave`).set(as(org)).expect(204);
    });

    it("concurrent transfers: exactly one wins", async () => {
      const org = await createTenant();
      const b = await member(org, ["staff"]);
      const c = await member(org, ["staff"]);
      const send = (id: string) =>
        request(app).post(`/orgs/${org.organisationId}/ownership/transfer`).set(as(org)).send({ membershipId: id });
      const statuses = (await Promise.all([send(b.membershipId), send(c.membershipId)])).map((r) => r.status).sort();
      expect(statuses).toEqual([200, 403]);
      const owner = (await prisma.organisation.findUniqueOrThrow({ where: { id: org.organisationId } })).ownerId;
      expect([b.userId, c.userId]).toContain(owner);
      expect(await auditRows(org.organisationId, "organisation.ownership.transfer")).toHaveLength(1);
    });

    it("concurrent transfer and removal of the target cannot leave a non-member owner", async () => {
      const org = await createTenant();
      const admin = await member(org, ["admin"]);
      const b = await member(org, ["staff"]);
      await Promise.all([
        request(app).post(`/orgs/${org.organisationId}/ownership/transfer`).set(as(org)).send({ membershipId: b.membershipId }),
        request(app).delete(`/orgs/${org.organisationId}/members/${b.membershipId}`).set(as(admin)),
      ]);
      const o = await prisma.organisation.findUniqueOrThrow({ where: { id: org.organisationId } });
      expect(await prisma.organisationMembership.count({ where: { organisationId: o.id, userId: o.ownerId } })).toBe(1);
    });

    it("rejects self, unknown members, and a target who already owns an organisation", async () => {
      const org = await createTenant();
      const other = await createTenant();
      const send = (body: object) => request(app).post(`/orgs/${org.organisationId}/ownership/transfer`).set(as(org)).send(body);
      expect((await send({ membershipId: org.membershipId })).body.error.code).toBe("ALREADY_OWNER");
      expect((await send({ membershipId: randomUUID() })).body.error.code).toBe("MEMBER_NOT_FOUND");
      expect((await send({ membershipId: "x" })).status).toBe(400);
      const otherOwnerHere = await request(app).post(`/orgs/${org.organisationId}/members`).set(as(org)).send({
        email: (await prisma.user.findUniqueOrThrow({ where: { id: other.userId } })).email,
      });
      const r = await send({ membershipId: otherOwnerHere.body.member.id });
      expect([r.status, r.body.error.code]).toEqual([409, "ORGANISATION_LIMIT"]);
      expect((await prisma.organisation.findUniqueOrThrow({ where: { id: org.organisationId } })).ownerId).toBe(org.userId);
    });
  });

  describe("tenant isolation", () => {
    it("TENANT-005: every new route is denied to another tenant, and ID guessing finds nothing", async () => {
      const victim = await createTenant();
      const victimStaff = await member(victim, ["staff"]);
      const attacker = await createTenant();
      const v = `/orgs/${victim.organisationId}`;
      const a = `/orgs/${attacker.organisationId}`;
      const guessed = { expectedCode: "MEMBER_NOT_FOUND" };
      await expectCrossTenantDenied(
        attacker,
        [
          { method: "get", path: `${v}/me/permissions` },
          { method: "patch", path: `${v}/members/${victimStaff.membershipId}`, body: { roles: ["admin"] } },
          { method: "delete", path: `${v}/members/${victimStaff.membershipId}` },
          { method: "post", path: `${v}/leave` },
          { method: "post", path: `${v}/ownership/transfer`, body: { membershipId: victimStaff.membershipId } },
          { method: "patch", path: `${a}/members/${victimStaff.membershipId}`, body: { roles: ["admin"] }, ...guessed },
          { method: "delete", path: `${a}/members/${victimStaff.membershipId}`, ...guessed },
          { method: "post", path: `${a}/ownership/transfer`, body: { membershipId: victimStaff.membershipId }, ...guessed },
        ],
        {
          snapshot: async () => [
            await prisma.organisationMembership.findMany({ where: { organisationId: victim.organisationId }, orderBy: { id: "asc" } }),
            await prisma.membershipRole.findMany({ where: { organisationId: victim.organisationId }, orderBy: { id: "asc" } }),
            await prisma.organisation.findUniqueOrThrow({ where: { id: victim.organisationId } }),
          ],
        },
      );
    });

    it("a role in organisation A grants nothing in organisation B", async () => {
      const a = await createTenant();
      const b = await createTenant();
      const u = await member(a, ["admin"]);
      const inB = await request(app).post(`/orgs/${b.organisationId}/members`).set(as(b)).send({ email: u.email, roles: ["staff"] });
      const bMembershipId = inB.body.member.id as string;
      const perms = await request(app).get(`/orgs/${b.organisationId}/me/permissions`).set(as(u)).expect(200);
      expect(perms.body.roles).toEqual(["staff"]);
      const x = await createUser();
      expect((await request(app).post(`/orgs/${b.organisationId}/members`).set(as(u)).send({ email: x.email })).status).toBe(403);
      // service-level check with a mismatched (org, membership) pair fails closed
      expect(await hasPermission({ organisationId: b.organisationId, membershipId: u.membershipId }, "members.read")).toBe(false);
      expect(await hasPermission({ organisationId: b.organisationId, membershipId: bMembershipId }, "members.read")).toBe(true);
      expect(await hasPermission({ organisationId: b.organisationId, membershipId: bMembershipId }, "nope" as Permission)).toBe(false);
    });

    it("MembershipRole cannot point at a membership of another organisation (composite FK)", async () => {
      const a = await createTenant();
      const b = await createTenant();
      const staff = await member(b, ["staff"]);
      await expect(
        prisma.membershipRole.create({ data: { organisationId: a.organisationId, membershipId: staff.membershipId, role: "admin" } }),
      ).rejects.toThrow();
    });
  });

  describe("service-level re-checks and rate limits", () => {
    it("addMember re-checks members.manage inside its transaction (demoted or role-less actor)", async () => {
      const org = await createTenant();
      for (const roles of [["committee"], ["staff"], []] as AssignableRole[][]) {
        const actor = await member(org, roles);
        const u = await createUser();
        for (const grant of [["staff"], []] as AssignableRole[][]) {
          await expect(addMember({ organisationId: org.organisationId, membershipId: actor.membershipId, userId: actor.userId }, u.email, grant))
            .rejects.toMatchObject({ status: 403, code: "FORBIDDEN" });
        }
        expect(await prisma.organisationMembership.count({ where: { userId: u.userId } })).toBe(0);
      }
      // an admin removed mid-flight: their stale tenant context no longer grants anything
      const admin = await member(org, ["admin"]);
      await request(app).delete(`/orgs/${org.organisationId}/members/${admin.membershipId}`).set(as(org)).expect(204);
      const u = await createUser();
      await expect(addMember({ organisationId: org.organisationId, membershipId: admin.membershipId, userId: admin.userId }, u.email, []))
        .rejects.toMatchObject({ status: 403 });
    });

    it("member mutations are rate-limited per user", async () => {
      const org = await createTenant();
      const staff = await member(org, ["staff"]);
      const statuses: number[] = [];
      for (let i = 0; i < 61; i++) statuses.push((await patch(org, org, staff.membershipId, { title: `t${i % 2}` })).status);
      expect(statuses.slice(0, 60).every((s) => s === 200)).toBe(true);
      expect(statuses[60]).toBe(429);
      // shared across the member-mutation routes
      expect((await request(app).post(`/orgs/${org.organisationId}/leave`).set(as(org))).status).toBe(429);
      expect((await request(app).post(`/orgs/${org.organisationId}/ownership/transfer`).set(as(org)).send({ membershipId: staff.membershipId })).status).toBe(429);
      expect((await request(app).delete(`/orgs/${org.organisationId}/members/${staff.membershipId}`).set(as(org))).status).toBe(429);
    });
  });

  // ADR-015 Consequence: "a test that every mutating tenant route declares a permission key".
  it("every mutating /orgs/:orgId route declares a permission (self-scoped routes allow-listed)", () => {
    const selfScoped = new Set(["POST /orgs/:orgId/leave"]);
    type Layer = { route?: { path: string; methods: Record<string, boolean>; stack: { handle: { permission?: string } }[] }; handle: { stack?: Layer[] } };
    const found: string[] = [];
    const walk = (stack: Layer[]) =>
      stack.forEach((l) => {
        if (l.handle.stack) walk(l.handle.stack);
        if (!l.route || !l.route.path.startsWith("/orgs/:orgId")) return;
        for (const m of Object.keys(l.route.methods).filter((m) => m !== "get" && m !== "head")) {
          const name = `${m.toUpperCase()} ${l.route.path}`;
          found.push(name);
          const declared = l.route.stack.some((h) => typeof h.handle.permission === "string");
          expect(declared || selfScoped.has(name), name).toBe(true);
        }
      });
    walk((app as unknown as { router: { stack: Layer[] } }).router.stack);
    expect(found.length).toBeGreaterThanOrEqual(5);
  });

  describe("Platform Administrator (RBAC-006/012)", () => {
    const probe = express()
      .get("/platform/probe", requireAuth, requirePlatformAdmin, (_req, res) => {
        res.json({ ok: true });
      })
      .use(errorHandler);

    it("guard re-reads the flag every request; flag changes only via setPlatformAdmin, audited", async () => {
      const u = await createUser();
      await request(probe).get("/platform/probe").expect(401);
      expect((await request(probe).get("/platform/probe").set(as(u))).status).toBe(403);
      await setPlatformAdmin(u.email.toUpperCase(), true, "ops on-call");
      await request(probe).get("/platform/probe").set(as(u)).expect(200);
      await setPlatformAdmin(u.email, false, "rotation ended");
      expect((await request(probe).get("/platform/probe").set(as(u))).status).toBe(403);
      const rows = await prisma.platformAuditLog.findMany({ where: { targetUserId: u.userId }, orderBy: { createdAt: "asc" } });
      expect(rows.map((r) => [r.action, r.actorUserId, r.reason])).toEqual([
        ["platform_admin.grant", null, "ops on-call"],
        ["platform_admin.revoke", null, "rotation ended"],
      ]);
    });

    it("holds no tenant permissions and no tenant data access", async () => {
      const victim = await createTenant();
      const u = await createUser();
      await setPlatformAdmin(u.email, true, "test");
      await expectCrossTenantDenied(u, [
        { method: "get", path: `/orgs/${victim.organisationId}` },
        { method: "get", path: `/orgs/${victim.organisationId}/members` },
        { method: "get", path: `/orgs/${victim.organisationId}/me/permissions` },
      ]);
    });

    it("a reason is required", async () => {
      const u = await createUser();
      for (const reason of ["", "   ", undefined as unknown as string]) {
        await expect(setPlatformAdmin(u.email, true, reason)).rejects.toThrow(/reason/);
      }
      expect((await prisma.user.findUniqueOrThrow({ where: { id: u.userId } })).isPlatformAdmin).toBe(false);
      expect(await prisma.platformAuditLog.count({ where: { targetUserId: u.userId } })).toBe(0);
    });

    it("refuses to grant the flag to an account that owns or belongs to an organisation", async () => {
      const owner = await createTenant();
      const m = await member(owner, ["staff"]);
      const ownerEmail = (await prisma.user.findUniqueOrThrow({ where: { id: owner.userId } })).email;
      for (const email of [ownerEmail, m.email]) {
        await expect(setPlatformAdmin(email, true, "x")).rejects.toThrow(/separate platform account/);
      }
      const flags = await prisma.user.findMany({ where: { id: { in: [owner.userId, m.userId] } }, select: { isPlatformAdmin: true } });
      expect(flags.every((f) => !f.isPlatformAdmin)).toBe(true);
    });

    it("the flag cannot be set through the API", async () => {
      const email = `user-${randomUUID()}@example.com`;
      await request(app)
        .post("/auth/register")
        .send({ email, password: "correct horse battery staple", displayName: "X", isPlatformAdmin: true });
      const user = await prisma.user.findUnique({ where: { email } });
      if (user) expect(user.isPlatformAdmin).toBe(false);
      const me = await createUser();
      const res = await request(app).get("/me").set(as(me)).expect(200);
      expect(res.body.user).not.toHaveProperty("isPlatformAdmin");
    });

    it("the CLI grants and revokes", { timeout: 30_000 }, async () => {
      const u = await createUser();
      const run = (...args: string[]) =>
        promisify(execFile)("npx", ["tsx", "src/modules/rbac/platform-admin.cli.ts", ...args], { env: process.env });
      expect((await run("grant", u.email, "test")).stdout).toContain("isPlatformAdmin=true");
      expect((await prisma.user.findUniqueOrThrow({ where: { id: u.userId } })).isPlatformAdmin).toBe(true);
      await expect(run("revoke", u.email)).rejects.toThrow(); // reason required
      expect((await prisma.user.findUniqueOrThrow({ where: { id: u.userId } })).isPlatformAdmin).toBe(true);
      await run("revoke", u.email, "done");
      expect((await prisma.user.findUniqueOrThrow({ where: { id: u.userId } })).isPlatformAdmin).toBe(false);
      await expect(run("make-admin", u.email, "x")).rejects.toThrow();
    });
  });
});
