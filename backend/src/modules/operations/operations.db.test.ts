// Phase 07 (ADR-024) integration tests against a real PostgreSQL.
import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { app } from "../../app.ts";
import { prisma } from "../../db.ts";
import { createTenant, createUser, expectCrossTenantDenied, type TestTenant } from "../../test/cross-tenant.ts";
import { activeTenant, addMember, as, resetStores, setOrgStatus } from "../../test/fixtures.ts";
import { rbacRateLimitStores } from "../rbac/rbac.routes.ts";
import { tenancyRateLimitStores } from "../tenancy/tenancy.routes.ts";
import { operationsRateLimitStores } from "./operations.routes.ts";

const hasDb = Boolean(process.env.DATABASE_URL);
if (!hasDb) console.warn("operations.db.test: DATABASE_URL not set — DB integration tests SKIPPED");

type Who = { token: string };
const P = (t: Pick<TestTenant, "organisationId">) => `/orgs/${t.organisationId}/operations`;
const post = (t: TestTenant, path: string, body: object, who: Who = t) => request(app).post(`${P(t)}/${path}`).set(as(who)).send(body);
const patch = (t: TestTenant, path: string, body: object, who: Who = t) => request(app).patch(`${P(t)}/${path}`).set(as(who)).send(body);
const programme = { title: "Ramadan 1448", objectives: "Iftar every evening", startDate: "2027-02-08", endDate: "2027-03-09" };
const at = (iso: string) => new Date(iso).toISOString();

describe.skipIf(!hasDb)("operations (database)", () => {
  beforeEach(() => resetStores(tenancyRateLimitStores, rbacRateLimitStores, operationsRateLimitStores));
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("programmes: create, read, update, validate dates, delete only when unreferenced (OPS-001)", async () => {
    const t = await activeTenant();
    const p = (await post(t, "programmes", programme).expect(201)).body.programme;
    expect(p).toMatchObject({ ...programme, status: "PLANNED" });
    expect(p).not.toHaveProperty("organisationId");
    await request(app).get(`${P(t)}/programmes/${p.id}`).set(as(t)).expect(200);
    expect((await patch(t, `programmes/${p.id}`, { status: "ACTIVE" }).expect(200)).body.programme.status).toBe("ACTIVE");
    expect((await patch(t, `programmes/${p.id}`, { endDate: "2027-01-01" })).body.error.code).toBe("VALIDATION_ERROR");
    for (const bad of [{ ...programme, startDate: "2027-02-30" }, { ...programme, status: "DONE" }, { ...programme, organisationId: t.organisationId }]) {
      expect((await post(t, "programmes", bad)).body.error.code, JSON.stringify(bad)).toBe("VALIDATION_ERROR");
    }
    await post(t, "tasks", { title: "Book caterer", programmeId: p.id }).expect(201);
    const inUse = await request(app).delete(`${P(t)}/programmes/${p.id}`).set(as(t));
    expect([inUse.status, inUse.body.error.code]).toEqual([409, "PROGRAMME_IN_USE"]);
    const empty = (await post(t, "programmes", programme).expect(201)).body.programme;
    await request(app).delete(`${P(t)}/programmes/${empty.id}`).set(as(t)).expect(204);
  });

  it("tasks: assignment to members only, notified; the assignee may change only the status (OPS-002, ADR-015 rule)", async () => {
    const t = await activeTenant();
    const staff = await addMember(t, ["staff"]); // operations.read only
    const other = await addMember(t, ["staff"]);
    const outsider = await createUser();

    const bad = await post(t, "tasks", { title: "Clean hall", assigneeUserId: outsider.userId });
    expect([bad.status, bad.body.error.code]).toEqual([422, "INVALID_ASSIGNEE"]);
    const task = (await post(t, "tasks", { title: "Clean hall", assigneeUserId: staff.userId, dueDate: "2026-12-01" }).expect(201)).body.task;
    expect(task).toMatchObject({ status: "TODO", dueDate: "2026-12-01", assigneeUserId: staff.userId });

    const notes = await prisma.notification.findMany({ where: { organisationId: t.organisationId, type: "task.assigned" } });
    expect(notes.map((n) => n.recipientUserId).sort()).toEqual([staff.userId, other.userId].sort()); // ADR-017: all but the actor
    expect(notes[0]!.title).toBe("Task assigned: Clean hall");

    // Assignee: status yes, other edits no.
    expect((await post(t, `tasks/${task.id}/status`, { status: "IN_PROGRESS" }, staff).expect(200)).body.task.status).toBe("IN_PROGRESS");
    expect((await patch(t, `tasks/${task.id}`, { title: "x" }, staff)).status).toBe(403);
    const notMine = await post(t, `tasks/${task.id}/status`, { status: "DONE" }, other);
    expect([notMine.status, notMine.body.error.code]).toEqual([403, "FORBIDDEN"]);
    expect((await post(t, "tasks", { title: "x" }, staff)).status).toBe(403);

    // Reassigning notifies again; unchanged assignee does not.
    await patch(t, `tasks/${task.id}`, { assigneeUserId: other.userId }).expect(200);
    await patch(t, `tasks/${task.id}`, { description: "Use the new mop" }).expect(200);
    expect(await prisma.notification.count({ where: { organisationId: t.organisationId, type: "task.assigned" } })).toBe(4);
    expect((await post(t, `tasks/${task.id}/status`, { status: "DONE" }, other).expect(200)).body.task.status).toBe("DONE");

    const mine = await request(app).get(`${P(t)}/tasks?assigneeUserId=${other.userId}`).set(as(staff)).expect(200);
    expect(mine.body.tasks.map((x: { id: string }) => x.id)).toEqual([task.id]);
    await request(app).delete(`${P(t)}/tasks/${task.id}`).set(as(t)).expect(204);
  });

  it("roster: flexible people/time assignments with free-text duty, notified, range queries (OPS-003/004)", async () => {
    const t = await activeTenant();
    const imam = await addMember(t, ["staff"]);
    const outsider = await createUser();
    const entry = { userId: imam.userId, duty: "Imam (Subuh)", startsAt: at("2026-10-10T21:30:00Z"), endsAt: at("2026-10-10T22:30:00Z") };
    const r = (await post(t, "roster", entry).expect(201)).body.entry;
    expect(r).toMatchObject({ ...entry, notes: null });
    expect((await post(t, "roster", { ...entry, endsAt: entry.startsAt })).body.error.code).toBe("VALIDATION_ERROR");
    expect((await post(t, "roster", { ...entry, userId: outsider.userId })).body.error.code).toBe("INVALID_ASSIGNEE");
    expect(await prisma.notification.count({ where: { organisationId: t.organisationId, type: "roster.assigned" } })).toBe(1);

    const inRange = await request(app).get(`${P(t)}/roster?from=${at("2026-10-10T22:00:00Z")}&to=${at("2026-10-11T00:00:00Z")}`).set(as(imam)).expect(200);
    expect(inRange.body.roster.map((x: { id: string }) => x.id)).toEqual([r.id]);
    const outRange = await request(app).get(`${P(t)}/roster?from=${at("2026-10-11T00:00:00Z")}`).set(as(imam)).expect(200);
    expect(outRange.body.roster).toEqual([]);

    expect((await patch(t, `roster/${r.id}`, { duty: "Bilal" }).expect(200)).body.entry.duty).toBe("Bilal");
    expect((await patch(t, `roster/${r.id}`, { endsAt: at("2026-10-10T20:00:00Z") })).body.error.code).toBe("VALIDATION_ERROR");
    expect((await patch(t, `roster/${r.id}`, { duty: "x" }, imam)).status).toBe(403);
    await request(app).delete(`${P(t)}/roster/${r.id}`).set(as(t)).expect(204);
  });

  it("entitlement, lifecycle and permission guards are separate (RBAC-004, ADR-016 §2)", async () => {
    const t = await activeTenant();
    // Free plan (lapsed trial) lacks `operations`.
    await prisma.subscription.update({ where: { organisationId: t.organisationId }, data: { trialEndsAt: new Date(Date.now() - 1000) } });
    const gated = await request(app).get(`${P(t)}/tasks`).set(as(t));
    expect([gated.status, gated.body.error.code]).toEqual([403, "ENTITLEMENT_REQUIRED"]);
    await prisma.subscription.update({ where: { organisationId: t.organisationId }, data: { trialEndsAt: new Date(Date.now() + 86_400_000) } });
    await request(app).get(`${P(t)}/tasks`).set(as(t)).expect(200);

    const onboarding = await createTenant();
    expect((await request(app).get(`${P(onboarding)}/tasks`).set(as(onboarding))).body.error.code).toBe("ORGANISATION_NOT_WRITABLE");
    await setOrgStatus(t, "SUSPENDED");
    await request(app).get(`${P(t)}/programmes`).set(as(t)).expect(200);
    expect((await post(t, "programmes", programme)).body.error.code).toBe("ORGANISATION_NOT_WRITABLE");
  });

  it("another tenant gets 404 everywhere and cannot attach the victim's programme (TENANT-005/006)", async () => {
    const victim = await activeTenant();
    const vp = (await post(victim, "programmes", programme).expect(201)).body.programme.id;
    const vt = (await post(victim, "tasks", { title: "Victim task" }).expect(201)).body.task.id;
    const member = await addMember(victim, ["staff"]);
    const vr = (await post(victim, "roster", { userId: member.userId, duty: "Siak", startsAt: at("2026-10-10T01:00:00Z"), endsAt: at("2026-10-10T02:00:00Z") }).expect(201)).body.entry.id;
    const attacker = await activeTenant();

    const snapshot = async () => [
      await prisma.task.findMany({ where: { organisationId: victim.organisationId }, orderBy: { id: "asc" } }),
      await prisma.rosterEntry.findMany({ where: { organisationId: victim.organisationId } }),
      await prisma.programme.findMany({ where: { organisationId: victim.organisationId } }),
    ];
    const routes = (o: TestTenant, own: boolean) => [
      { method: "get" as const, path: `${P(o)}/programmes/${vp}`, expectedCode: own ? "PROGRAMME_NOT_FOUND" : undefined },
      { method: "patch" as const, path: `${P(o)}/programmes/${vp}`, body: { title: "x" }, expectedCode: own ? "PROGRAMME_NOT_FOUND" : undefined },
      { method: "delete" as const, path: `${P(o)}/programmes/${vp}`, expectedCode: own ? "PROGRAMME_NOT_FOUND" : undefined },
      { method: "get" as const, path: `${P(o)}/tasks/${vt}`, expectedCode: own ? "TASK_NOT_FOUND" : undefined },
      { method: "patch" as const, path: `${P(o)}/tasks/${vt}`, body: { title: "x" }, expectedCode: own ? "TASK_NOT_FOUND" : undefined },
      { method: "post" as const, path: `${P(o)}/tasks/${vt}/status`, body: { status: "DONE" }, expectedCode: own ? "TASK_NOT_FOUND" : undefined },
      { method: "delete" as const, path: `${P(o)}/tasks/${vt}`, expectedCode: own ? "TASK_NOT_FOUND" : undefined },
      { method: "patch" as const, path: `${P(o)}/roster/${vr}`, body: { duty: "x" }, expectedCode: own ? "ROSTER_ENTRY_NOT_FOUND" : undefined },
      { method: "delete" as const, path: `${P(o)}/roster/${vr}`, expectedCode: own ? "ROSTER_ENTRY_NOT_FOUND" : undefined },
    ];
    await expectCrossTenantDenied(attacker, [...routes(victim, false), { method: "get", path: `${P(victim)}/tasks` }], { snapshot });
    await expectCrossTenantDenied(attacker, routes(attacker, true), { snapshot });

    const attach = await post(attacker, "tasks", { title: "x", programmeId: vp });
    expect([attach.status, attach.body.error.code]).toEqual([422, "INVALID_PROGRAMME"]);
    expect((await post(attacker, "roster", { userId: member.userId, duty: "x", startsAt: at("2026-10-10T01:00:00Z"), endsAt: at("2026-10-10T02:00:00Z") })).body.error.code).toBe("INVALID_ASSIGNEE");
    expect((await request(app).get(`${P(attacker)}/tasks`).set(as(attacker))).body.tasks).toEqual([]);
  });
});
