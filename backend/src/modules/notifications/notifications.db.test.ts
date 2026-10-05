// Phase 10 notification integration tests against a real PostgreSQL (DATABASE_URL, migrations applied).
import request from "supertest";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { app } from "../../app.ts";
import { prisma } from "../../db.ts";
import { createTenant, createUser, type TestTenant } from "../../test/cross-tenant.ts";
import { rbacRateLimitStores } from "../rbac/rbac.routes.ts";
import { tenancyRateLimitStores } from "../tenancy/tenancy.routes.ts";
import { notify } from "./notifications.service.ts";
import { notificationRateLimitStores } from "./notifications.routes.ts";

// Delegates to the real notify; one test makes it fail to prove the originating action rolls back.
vi.mock("./notifications.service.ts", async (orig) => {
  const real = await orig<typeof import("./notifications.service.ts")>();
  return { ...real, notify: vi.fn(real.notify) };
});

const hasDb = Boolean(process.env.DATABASE_URL);
if (!hasDb) console.warn("notifications.db.test: DATABASE_URL not set — DB integration tests SKIPPED");

const as = (t: { token: string }) => ({ Authorization: `Bearer ${t.token}` });
const inbox = (t: { token: string }, qs = "") => request(app).get(`/me/notifications${qs}`).set(as(t));
const add = (org: TestTenant, email: string) =>
  request(app).post(`/orgs/${org.organisationId}/members`).set(as(org)).send({ email });
async function member(org: TestTenant) {
  const u = await createUser();
  expect((await add(org, u.email)).status).toBe(201);
  return u;
}

describe.skipIf(!hasDb)("notifications (database)", () => {
  beforeEach(async () => {
    await Promise.all(
      [...Object.values(tenancyRateLimitStores), ...Object.values(rbacRateLimitStores), ...Object.values(notificationRateLimitStores)].map((s) => s.resetAll()),
    );
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("member.added notifies every other member including the new one, not the actor (ADR-017 §1)", async () => {
    const org = await createTenant("Masjid A");
    const first = await member(org);
    const second = await member(org);
    // owner is the actor both times
    expect((await inbox(org)).body.notifications).toEqual([]);
    const f = (await inbox(first)).body;
    expect(f.notifications.map((n: { type: string }) => n.type)).toEqual(["member.added", "member.added"]);
    expect(f.unreadCount).toBe(2);
    expect((await inbox(second)).body.notifications).toHaveLength(1);
    const n = (await inbox(second)).body.notifications[0];
    expect(n).toMatchObject({ organisationId: org.organisationId, organisationName: "Masjid A", targetType: "membership", readAt: null });
    expect(n.title).toBe("Test User joined Masjid A");
    expect(Object.keys(n).sort()).toEqual(
      ["createdAt", "id", "organisationId", "organisationName", "readAt", "targetId", "targetType", "title", "type"],
    );
  });

  it("a failing notify rolls the member add back (NOTIF-005)", async () => {
    const org = await createTenant();
    const u = await createUser();
    vi.mocked(notify).mockRejectedValueOnce(new Error("boom"));
    vi.spyOn(console, "error").mockImplementationOnce(() => {});
    expect((await add(org, u.email)).status).toBe(500);
    expect(await prisma.organisationMembership.count({ where: { userId: u.userId } })).toBe(0);
    expect(await prisma.notification.count({ where: { organisationId: org.organisationId } })).toBe(0);
  });

  it("notify throws on an empty or over-long title", async () => {
    const org = await createTenant();
    const ev = { organisationId: org.organisationId, actorUserId: org.userId, type: "member.added", targetType: "membership", targetId: crypto.randomUUID() } as const;
    const real = (await vi.importActual<typeof import("./notifications.service.ts")>("./notifications.service.ts")).notify;
    await expect(prisma.$transaction((tx) => real(tx, { ...ev, title: "" }))).rejects.toThrow("title");
    await expect(prisma.$transaction((tx) => real(tx, { ...ev, title: "x".repeat(301) }))).rejects.toThrow("title");
  });

  it("each user sees only their own; another user cannot mark it read (404)", async () => {
    const org = await createTenant();
    const a = await member(org);
    const b = await member(org);
    const [na] = (await inbox(a)).body.notifications;
    const res = await request(app).post(`/me/notifications/${na.id}/read`).set(as(b));
    expect(res.status).toBe(404);
    expect((await inbox(a)).body.unreadCount).toBe(2);
    expect((await prisma.notification.findUnique({ where: { id: na.id } }))!.readAt).toBeNull();
  });

  it("mark read is idempotent; unknown and malformed ids are the same 404", async () => {
    const org = await createTenant();
    const a = await member(org);
    const [n] = (await inbox(a)).body.notifications;
    for (let i = 0; i < 2; i++) expect((await request(app).post(`/me/notifications/${n.id}/read`).set(as(a))).status).toBe(204);
    const r = (await inbox(a)).body;
    expect(r.unreadCount).toBe(0);
    expect(r.notifications.find((x: { id: string }) => x.id === n.id).readAt).not.toBeNull();
    const unknown = await request(app).post(`/me/notifications/${crypto.randomUUID()}/read`).set(as(a));
    const bad = await request(app).post(`/me/notifications/nope/read`).set(as(a));
    expect([unknown.status, bad.status]).toEqual([404, 404]);
    expect(unknown.body).toEqual(bad.body);
  });

  it("unread filter and read-all", async () => {
    const org = await createTenant();
    const a = await member(org);
    await member(org);
    const [n] = (await inbox(a)).body.notifications;
    await request(app).post(`/me/notifications/${n.id}/read`).set(as(a));
    expect((await inbox(a, "?unread=true")).body.notifications).toHaveLength(1);
    const all = await request(app).post("/me/notifications/read-all").set(as(a));
    expect(all.body).toEqual({ count: 1 });
    expect((await inbox(a, "?unread=true")).body).toMatchObject({ notifications: [], unreadCount: 0 });
    expect((await request(app).post("/me/notifications/read-all").set(as(a))).body).toEqual({ count: 0 });
  });

  it("removed or departed members no longer see that organisation's notifications (ADR-017 §5)", async () => {
    const org = await createTenant();
    const a = await member(org);
    expect((await inbox(a)).body.unreadCount).toBe(1);
    const m = await prisma.organisationMembership.findFirstOrThrow({ where: { userId: a.userId } });
    expect((await request(app).delete(`/orgs/${org.organisationId}/members/${m.id}`).set(as(org))).status).toBe(204);
    expect((await inbox(a)).body).toMatchObject({ notifications: [], unreadCount: 0, nextCursor: null });
    const [row] = await prisma.notification.findMany({ where: { recipientUserId: a.userId } });
    expect(row).toBeDefined(); // hidden, not deleted
    expect((await request(app).post(`/me/notifications/${row!.id}/read`).set(as(a))).status).toBe(404);
    expect((await request(app).post("/me/notifications/read-all").set(as(a))).body).toEqual({ count: 0 });
    expect((await prisma.notification.findUnique({ where: { id: row!.id } }))!.readAt).toBeNull();
  });

  it("other organisations' notifications never reach a user who is not a member (cross-tenant)", async () => {
    const orgA = await createTenant();
    const orgB = await createTenant();
    const a = await member(orgA);
    await member(orgB);
    const seen = (await inbox(a)).body.notifications;
    expect(seen.every((n: { organisationId: string }) => n.organisationId === orgA.organisationId)).toBe(true);
    expect((await inbox(orgA)).body.notifications).toEqual([]);
    const foreign = await prisma.notification.findFirstOrThrow({ where: { organisationId: orgB.organisationId } });
    expect((await request(app).post(`/me/notifications/${foreign.id}/read`).set(as(a))).status).toBe(404);
  });

  it("keyset pagination: limit bounds, stable order, nextCursor", async () => {
    const org = await createTenant();
    const a = await member(org);
    for (let i = 0; i < 4; i++) await member(org);
    for (const bad of ["limit=0", "limit=51", "limit=abc", "limit=1.5", "cursor=garbage", "unread=maybe", "x=1"]) {
      expect((await inbox(a, `?${bad}`)).status, bad).toBe(400);
    }
    const p1 = (await inbox(a, "?limit=2")).body;
    expect(p1.notifications).toHaveLength(2);
    expect(p1.nextCursor).toEqual(expect.any(String));
    const p2 = (await inbox(a, `?limit=2&cursor=${encodeURIComponent(p1.nextCursor)}`)).body;
    const p3 = (await inbox(a, `?limit=2&cursor=${encodeURIComponent(p2.nextCursor)}`)).body;
    const ids = [...p1.notifications, ...p2.notifications, ...p3.notifications].map((n: { id: string }) => n.id);
    expect(new Set(ids).size).toBe(5);
    expect(p3.nextCursor).toBeNull();
    expect(p1.unreadCount).toBe(5);
    expect((await inbox(a)).body.notifications).toHaveLength(5); // default 20
  });

  it("requires authentication; bodies and params are validated strictly", async () => {
    expect((await request(app).get("/me/notifications")).status).toBe(401);
    expect((await request(app).post("/me/notifications/read-all")).status).toBe(401);
    expect((await request(app).post(`/me/notifications/${crypto.randomUUID()}/read`)).status).toBe(401);
    const u = await createUser();
    expect((await request(app).post("/me/notifications/read-all").set(as(u)).send({ organisationId: crypto.randomUUID() })).status).toBe(400);
    expect((await request(app).post(`/me/notifications/${crypto.randomUUID()}/read`).set(as(u)).send({ x: 1 })).status).toBe(400);
  });

  it("rate-limits the POSTs per user", async () => {
    const u = await createUser();
    const statuses: number[] = [];
    for (let i = 0; i < 61; i++) statuses.push((await request(app).post("/me/notifications/read-all").set(as(u))).status);
    expect(statuses[59]).toBe(200);
    expect(statuses[60]).toBe(429);
  });
});
