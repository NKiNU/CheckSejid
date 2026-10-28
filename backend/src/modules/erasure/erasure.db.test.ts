// Phase 13A (ADR-029, ADR-031) integration tests against a real PostgreSQL (DATABASE_URL, migrations applied
//) and an S3 emulator.
import { mkdtempSync, existsSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import argon2 from "argon2";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "../../../generated/prisma/client.ts";
import { app } from "../../app.ts";
import { prisma } from "../../db.ts";
import { getObjectBytes, newObjectKey, putObject } from "../../storage.ts";
import * as storage from "../../storage.ts";
import { createTenant, createUser, expectCrossTenantDenied, type TestTenant } from "../../test/cross-tenant.ts";
import { activeTenant, addMember, as, resetStores, setOrgStatus } from "../../test/fixtures.ts";
import { FILES, startS3 } from "../../test/s3.ts";
import { rbacRateLimitStores } from "../rbac/rbac.routes.ts";
import * as rbac from "../rbac/rbac.ts";
import { tenancyRateLimitStores } from "../tenancy/tenancy.routes.ts";
import { assertKeyDirWritable, decrypt, destroyExpiredArchives, readArchiveKey } from "./archive.ts";
import { erasureRateLimitStores } from "./erasure.routes.ts";
import { GRACE_MS } from "./erasure.service.ts";
import { failInterrupted, runDueErasures } from "./executor.ts";
import { registry, survivesErasure } from "./registry.ts";

// Delegates to the real platformAudit; one test makes it fail to prove the whole erasure rolls back.
vi.mock("../rbac/rbac.ts", async (orig) => {
  const real = await orig<typeof import("../rbac/rbac.ts")>();
  return { ...real, platformAudit: vi.fn(real.platformAudit) };
});

vi.mock("../../storage.ts", async (orig) => {
  const real = await orig<typeof import("../../storage.ts")>();
  return { ...real, putOpaqueObject: vi.fn(real.putOpaqueObject) };
});

const hasDb = Boolean(process.env.DATABASE_URL);
if (!hasDb) console.warn("erasure.db.test: DATABASE_URL not set — DB integration tests SKIPPED");

const PASSWORD = "correct horse battery";
const later = () => new Date(Date.now() + GRACE_MS + 60_000);
const withPassword = async (userId: string) => prisma.user.update({ where: { id: userId }, data: { passwordHash: await argon2.hash(PASSWORD, { type: argon2.argon2id }) } });
const org = (t: Pick<TestTenant, "organisationId">) => `/orgs/${t.organisationId}`;
const requestErasure = (t: TestTenant, password = PASSWORD) => request(app).post(`${org(t)}/erasure`).set(as(t)).send({ password });
const counts = async (organisationId: string) => ({
  org: await prisma.organisation.count({ where: { id: organisationId } }),
  ...Object.fromEntries(
    await Promise.all(
      [...registry, ...survivesErasure].map(async (m) => [m, await (prisma as unknown as Record<string, { count(a: object): Promise<number> }>)[m[0]!.toLowerCase() + m.slice(1)]!.count({ where: { organisationId } })]),
    ),
  ),
});

// A fully populated organisation: finance (with a file), hub, operations, a follower and a member.
async function seed(name = "Masjid A") {
  const t = await activeTenant(name);
  await withPassword(t.userId);
  const member = await addMember(t, ["staff"]);
  const id = t.organisationId;
  const category = await prisma.financialCategory.create({ data: { organisationId: id, name: "Utilities", kind: "EXPENSE" } });
  const collection = await prisma.collection.create({ data: { organisationId: id, purpose: "Roof" } });
  await prisma.income.create({ data: { organisationId: id, amount: 5000n, receivedOn: new Date("2026-01-01"), categoryId: category.id, collectionId: collection.id, description: "d", createdById: t.userId } });
  await prisma.budget.create({ data: { organisationId: id, name: "B", amount: 100n, periodStart: new Date("2026-01-01"), periodEnd: new Date("2026-12-31"), categoryId: category.id, description: "d", createdById: t.userId } });
  const expense = await prisma.expense.create({ data: { organisationId: id, amount: 3500n, spentOn: new Date("2026-01-02"), categoryId: category.id, description: "TNB", createdById: t.userId } });
  const objectKey = newObjectKey(`org/${id}/finance`, "image/png");
  await putObject(objectKey, FILES.png, "image/png");
  await prisma.financeAttachment.create({ data: { organisationId: id, expenseId: expense.id, objectKey, contentType: "image/png", sizeBytes: FILES.png.length, uploadedById: t.userId } });
  await prisma.financeApproval.create({ data: { organisationId: id, recordType: "expense", recordId: expense.id, decision: "APPROVED", actorUserId: t.userId } });
  await prisma.post.create({ data: { organisationId: id, title: "p", body: "b", createdById: t.userId } });
  await prisma.event.create({ data: { organisationId: id, title: "e", description: "d", startsAt: new Date(), endsAt: new Date(), createdById: t.userId } });
  const programme = await prisma.programme.create({ data: { organisationId: id, title: "Ramadan", startDate: new Date("2026-03-01"), endDate: new Date("2026-03-30") } });
  await prisma.task.create({ data: { organisationId: id, programmeId: programme.id, title: "t" } });
  await prisma.rosterEntry.create({ data: { organisationId: id, programmeId: programme.id, userId: member.userId, duty: "Imam", startsAt: new Date(), endsAt: new Date() } });
  const follower = await createUser();
  await prisma.follow.create({ data: { userId: follower.userId, organisationId: id } });
  return { t, member, follower, objectKey };
}

describe.skipIf(!hasDb)("erasure (database)", () => {
  let stopS3: () => Promise<void>;
  const keyDir = mkdtempSync(join(tmpdir(), "erasure-keys-"));
  beforeAll(async () => {
    stopS3 = await startS3();
    process.env["ERASURE_KEY_DIR"] = keyDir;
  });
  beforeEach(async () => {
    await resetStores(tenancyRateLimitStores, rbacRateLimitStores, erasureRateLimitStores);
  });
  afterAll(async () => {
    await stopS3();
    rmSync(keyDir, { recursive: true, force: true });
    await prisma.$disconnect();
  });

  describe("request lifecycle (A1)", () => {
    it("the owner requests with the password: PENDING_GRACE for 7 days, members are told, no deleted data in the row", async () => {
      const { t, member } = await seed();
      const res = await requestErasure(t).expect(201);
      expect(res.body.request).toMatchObject({ kind: "ORGANISATION", status: "PENDING_GRACE" });
      const row = await prisma.erasureRequest.findUniqueOrThrow({ where: { id: res.body.request.id } });
      expect(row).toMatchObject({ subjectId: t.organisationId, requestedByUserId: t.userId });
      expect(Math.abs(row.executeAfter.getTime() - (row.createdAt.getTime() + GRACE_MS))).toBeLessThan(5_000);
      const inbox = await request(app).get("/me/notifications").set(as(member)).expect(200);
      expect(inbox.body.notifications.map((n: { type: string }) => n.type)).toContain("erasure.requested");
      expect((await request(app).get(`${org(t)}/erasure`).set(as(t))).body.request.status).toBe("PENDING_GRACE");
    });

    it("rejects a wrong password, and a second open request", async () => {
      const { t } = await seed();
      await requestErasure(t, "wrong password!!").expect(401);
      await requestErasure(t).expect(201);
      expect((await requestErasure(t)).body.error.code).toBe("ERASURE_ALREADY_REQUESTED");
    });

    it("a non-owner gets 403 on every erasure and retention route", async () => {
      const { t, member } = await seed();
      await request(app).post(`${org(t)}/erasure`).set(as(member)).send({ password: PASSWORD }).expect(403);
      await request(app).get(`${org(t)}/erasure`).set(as(member)).expect(403);
      await request(app).delete(`${org(t)}/erasure`).set(as(member)).expect(403);
      await request(app).put(`${org(t)}/retention`).set(as(member)).send({ years: 1 }).expect(403);
      expect(await prisma.erasureRequest.count({ where: { subjectId: t.organisationId } })).toBe(0);
    });

    it("tenant B cannot reach tenant A's request, retention or cancel", async () => {
      const a = await seed();
      await requestErasure(a.t).expect(201);
      const b = await createTenant("Masjid B");
      await expectCrossTenantDenied(b, [
        { method: "get", path: `${org(a.t)}/erasure` },
        { method: "delete", path: `${org(a.t)}/erasure` },
        { method: "post", path: `${org(a.t)}/erasure`, body: { password: PASSWORD } },
        { method: "post", path: `${org(a.t)}/erasure/retry`, body: { password: PASSWORD } },
        { method: "get", path: `${org(a.t)}/retention` },
        { method: "put", path: `${org(a.t)}/retention`, body: { years: 1 } },
      ], { snapshot: () => prisma.erasureRequest.findMany({ where: { subjectId: a.t.organisationId } }) });
    });

    it("cancel within the grace period; members are told; nothing is erased later", async () => {
      const { t, member } = await seed();
      await requestErasure(t).expect(201);
      const res = await request(app).delete(`${org(t)}/erasure`).set(as(t)).expect(200);
      expect(res.body.request.status).toBe("CANCELLED");
      const inbox = await request(app).get("/me/notifications").set(as(member));
      expect(inbox.body.notifications.map((n: { type: string }) => n.type)).toContain("erasure.cancelled");
      await runDueErasures(later());
      expect(await prisma.organisation.count({ where: { id: t.organisationId } })).toBe(1);
      await request(app).delete(`${org(t)}/erasure`).set(as(t)).expect(404); // nothing waiting any more
    });

    it("retention accepts 1/3/5/7 and null; years: 2 is a 400", async () => {
      const { t } = await seed();
      for (const years of [1, 3, 5, 7]) {
        await request(app).put(`${org(t)}/retention`).set(as(t)).send({ years }).expect(200);
        expect((await request(app).get(`${org(t)}/retention`).set(as(t))).body.years).toBe(years);
      }
      await request(app).put(`${org(t)}/retention`).set(as(t)).send({ years: 2 }).expect(400);
      await request(app).put(`${org(t)}/retention`).set(as(t)).send({ years: null }).expect(200);
      expect((await request(app).get(`${org(t)}/retention`).set(as(t))).body.years).toBeNull();
      await expect(prisma.retentionSetting.create({ data: { organisationId: t.organisationId, years: 2 } })).rejects.toThrow(); // CHECK backstop
    });

    it("a suspended or archived organisation can still request and cancel (ADR-031 §8)", async () => {
      const { t } = await seed();
      await setOrgStatus(t, "SUSPENDED");
      await requestErasure(t).expect(201);
      await request(app).delete(`${org(t)}/erasure`).set(as(t)).expect(200);
      await setOrgStatus(t, "ARCHIVED");
      await requestErasure(t).expect(201);
    });
  });

  describe("executor (A2)", () => {
    it("registry lists every tenant model, so a table added later cannot be missed (Review Focus 1)", () => {
      const tenantModels = Object.values(Prisma.ModelName).filter((m) =>
        (Object.values((Prisma as unknown as Record<string, object>)[`${m}ScalarFieldEnum`]!) as string[]).includes("organisationId"),
      );
      const known = new Set<string>([...registry, ...survivesErasure]);
      expect(tenantModels.filter((m) => !known.has(m))).toEqual([]);
      expect([...known].filter((m) => !tenantModels.includes(m as never))).toEqual([]);
      expect(new Set(registry).size).toBe(registry.length);
    });

    it("erases the whole organisation (incl. finance, audit rows, files) and nothing of another one", async () => {
      const a = await seed("Masjid A");
      const b = await seed("Masjid B");
      const before = await counts(b.t.organisationId);
      await requestErasure(a.t).expect(201);
      await runDueErasures(new Date()); // still in the grace period: nothing happens
      expect((await counts(a.t.organisationId)).org).toBe(1);

      await runDueErasures(later());

      const gone = await counts(a.t.organisationId);
      expect(Object.values(gone).every((n) => n === 0)).toBe(true);
      expect(await counts(b.t.organisationId)).toEqual(before);
      await expect(getObjectBytes(a.objectKey)).rejects.toThrow();
      expect((await getObjectBytes(b.objectKey)).length).toBeGreaterThan(0);
      const req = await prisma.erasureRequest.findFirstOrThrow({ where: { subjectId: a.t.organisationId } });
      expect(req.status).toBe("COMPLETED");
      const log = await prisma.platformAuditLog.findFirstOrThrow({ where: { targetOrganisationId: a.t.organisationId, action: "organisation.erasure" } });
      expect(log).toMatchObject({ actorUserId: a.t.userId });
      expect(JSON.stringify(log)).not.toContain("Masjid A"); // PDPA-003: the record carries no deleted content
      expect(await prisma.user.count({ where: { id: a.t.userId } })).toBe(1); // accounts are erased separately
    });

    it("the audit trail is still append-only outside an erasure (FIN-015)", async () => {
      const { t } = await seed();
      await expect(prisma.auditLog.deleteMany({ where: { organisationId: t.organisationId } })).rejects.toThrow(/append-only/);
      await expect(prisma.$executeRawUnsafe(`UPDATE "AuditLog" SET "action" = 'x' WHERE "organisationId" = '${t.organisationId}'::uuid`)).rejects.toThrow(/append-only/);
    });

    it("a failure rolls the whole erasure back, marks FAILED, and a retry completes it (Review Focus 2)", async () => {
      const a = await seed();
      await requestErasure(a.t).expect(201);
      const before = await counts(a.t.organisationId);
      vi.mocked(rbac.platformAudit).mockImplementationOnce(() => {
        throw new Error("boom");
      });
      await runDueErasures(later());
      expect(await counts(a.t.organisationId)).toEqual(before); // every table intact, audit rows included
      expect((await getObjectBytes(a.objectKey)).length).toBeGreaterThan(0);
      const failed = await prisma.erasureRequest.findFirstOrThrow({ where: { subjectId: a.t.organisationId } });
      expect(failed).toMatchObject({ status: "FAILED", failureCode: "ERASURE_FAILED" });

      const retry = (password?: string) => request(app).post(`${org(a.t)}/erasure/retry`).set(as(a.t)).send(password === undefined ? {} : { password });
      await retry().expect(400);
      await retry("wrong password!!").expect(401);
      expect((await prisma.erasureRequest.findUniqueOrThrow({ where: { id: failed.id } })).status).toBe("FAILED");
      await retry(PASSWORD).expect(200);
      const inbox = await request(app).get("/me/notifications").set(as(a.member));
      expect(inbox.body.notifications.filter((n: { type: string }) => n.type === "erasure.requested")).toHaveLength(2); // request + retry
      await runDueErasures(new Date());
      expect((await counts(a.t.organisationId)).org).toBe(0);
      expect((await prisma.erasureRequest.findUniqueOrThrow({ where: { id: failed.id } })).status).toBe("COMPLETED");
    });

    it("an owner who is a member of another organisation keeps that membership and data (Review Focus 5)", async () => {
      const a = await seed("Masjid A");
      const b = await seed("Masjid B");
      // The owner of A is also a staff member of B.
      const m = await addMemberById(b.t, a.t.userId);
      await requestErasure(a.t).expect(201);
      await runDueErasures(later());
      expect((await counts(a.t.organisationId)).org).toBe(0);
      expect(await prisma.organisationMembership.count({ where: { id: m.id, organisationId: b.t.organisationId, userId: a.t.userId } })).toBe(1);
      expect((await counts(b.t.organisationId)).Income).toBe(1);
      const res = await request(app).get(`/orgs/${b.t.organisationId}`).set(as(a.t)).expect(200);
      expect(res.body.organisation.id).toBe(b.t.organisationId);
    });

    it("fails closed when the owner changed during the grace period", async () => {
      const a = await seed();
      await requestErasure(a.t).expect(201);
      await prisma.organisation.update({ where: { id: a.t.organisationId }, data: { ownerId: a.member.userId } });
      await runDueErasures(later());
      expect((await prisma.erasureRequest.findFirstOrThrow({ where: { subjectId: a.t.organisationId } })).failureCode).toBe("OWNER_CHANGED");
      expect((await counts(a.t.organisationId)).org).toBe(1);
    });
  });

  describe("archive (A3)", () => {
    it("with a retention choice: an encrypted archive that opens only with the key, destroyed at expiry", async () => {
      const a = await seed("Masjid Archive");
      await request(app).put(`${org(a.t)}/retention`).set(as(a.t)).send({ years: 3 }).expect(200);
      await requestErasure(a.t).expect(201);
      await runDueErasures(later());

      const rec = await prisma.archiveRecord.findFirstOrThrow({ where: { organisationId: a.t.organisationId } });
      expect(rec.destroyedAt).toBeNull();
      const years = (rec.destroyAfter.getTime() - rec.createdAt.getTime()) / (365 * 24 * 3600 * 1000);
      expect(years).toBeGreaterThan(2.99);
      expect(years).toBeLessThan(3.01);
      const blob = await getObjectBytes(rec.storageKey);
      expect(blob.includes(Buffer.from("Masjid Archive"))).toBe(false); // opaque
      const key = await readArchiveKey(a.t.organisationId);
      const plain = JSON.parse(decrypt(key, blob).toString());
      expect(plain.organisation.name).toBe("Masjid Archive");
      expect(plain.Income[0].amount).toBe("5000");
      expect(plain.FinanceAttachment).toHaveLength(1);
      expect(() => decrypt(Buffer.alloc(32, 7), blob)).toThrow(); // wrong key: GCM authentication fails
      expect((await counts(a.t.organisationId)).org).toBe(0);
      expect(await prisma.retentionSetting.count({ where: { organisationId: a.t.organisationId } })).toBe(0);

      expect(await destroyExpiredArchives(new Date())).toBe(0); // not yet
      expect(await destroyExpiredArchives(new Date(rec.destroyAfter.getTime() + 1000))).toBeGreaterThanOrEqual(1);
      expect((await prisma.archiveRecord.findUniqueOrThrow({ where: { id: rec.id } })).destroyedAt).not.toBeNull();
      expect(existsSync(join(keyDir, `${a.t.organisationId}.key`))).toBe(false);
      await expect(getObjectBytes(rec.storageKey)).rejects.toThrow();
    });

    it("without a retention choice nothing is kept", async () => {
      const a = await seed();
      await requestErasure(a.t).expect(201);
      await runDueErasures(later());
      expect(await prisma.archiveRecord.count({ where: { organisationId: a.t.organisationId } })).toBe(0);
      expect(existsSync(join(keyDir, `${a.t.organisationId}.key`))).toBe(false);
    });

    it("a rolled-back erasure leaves no archive record and no key", async () => {
      const a = await seed();
      await request(app).put(`${org(a.t)}/retention`).set(as(a.t)).send({ years: 1 }).expect(200);
      await requestErasure(a.t).expect(201);
      vi.mocked(rbac.platformAudit).mockImplementationOnce(() => {
        throw new Error("boom");
      });
      await runDueErasures(later());
      expect(await prisma.archiveRecord.count({ where: { organisationId: a.t.organisationId } })).toBe(0);
      expect(existsSync(join(keyDir, `${a.t.organisationId}.key`))).toBe(false);
    });
  });

  describe("review fixes", () => {
    it("a RUNNING request left by a crash becomes FAILED/INTERRUPTED at start", async () => {
      const a = await seed();
      await requestErasure(a.t).expect(201);
      await prisma.erasureRequest.updateMany({ where: { subjectId: a.t.organisationId }, data: { status: "RUNNING" } });
      await failInterrupted();
      expect(await prisma.erasureRequest.findFirstOrThrow({ where: { subjectId: a.t.organisationId } })).toMatchObject({ status: "FAILED", failureCode: "INTERRUPTED" });
    });

    it("a stale key from a crashed run is overwritten, not EEXIST", async () => {
      const a = await seed();
      await request(app).put(`${org(a.t)}/retention`).set(as(a.t)).send({ years: 1 }).expect(200);
      writeFileSync(join(keyDir, `${a.t.organisationId}.key`), "stale");
      await requestErasure(a.t).expect(201);
      await runDueErasures(later());
      expect((await prisma.erasureRequest.findFirstOrThrow({ where: { subjectId: a.t.organisationId } })).status).toBe("COMPLETED");
      expect((await readArchiveKey(a.t.organisationId)).length).toBe(32);
    });

    it("assertKeyDirWritable creates the directory 0700 and rejects an unset one", async () => {
      const dir = join(keyDir, "nested");
      const saved = process.env["ERASURE_KEY_DIR"];
      process.env["ERASURE_KEY_DIR"] = dir;
      await assertKeyDirWritable();
      expect(statSync(dir).mode & 0o777).toBe(0o700);
      process.env["ERASURE_KEY_DIR"] = "";
      await expect(assertKeyDirWritable()).rejects.toThrow(/ERASURE_KEY_DIR/);
      process.env["ERASURE_KEY_DIR"] = saved;
    });

    it("user retry needs the password too", async () => {
      const u = await createUser();
      await withPassword(u.userId);
      await request(app).post("/me/erasure").set(as(u)).send({ password: PASSWORD }).expect(201);
      await prisma.erasureRequest.updateMany({ where: { subjectId: u.userId }, data: { status: "FAILED" } });
      await request(app).post("/me/erasure/retry").set(as(u)).send({}).expect(400);
      await request(app).post("/me/erasure/retry").set(as(u)).send({ password: "wrong password!!" }).expect(401);
      await request(app).post("/me/erasure/retry").set(as(u)).send({ password: PASSWORD }).expect(200);
    });

    it("writes a content-free ledger object after commit; a failed write does not undo the erasure", async () => {
      const a = await seed();
      await requestErasure(a.t).expect(201);
      await runDueErasures(later());
      const req = await prisma.erasureRequest.findFirstOrThrow({ where: { subjectId: a.t.organisationId } });
      const entry = JSON.parse((await getObjectBytes(`erasure-ledger/${req.id}.json`)).toString());
      expect(entry).toMatchObject({ kind: "ORGANISATION", subjectId: a.t.organisationId });
      expect(Object.keys(entry).sort()).toEqual(["finishedAt", "kind", "subjectId"]);

      const b = await seed("Masjid B");
      await requestErasure(b.t).expect(201);
      vi.mocked(storage.putOpaqueObject).mockRejectedValueOnce(new Error("spaces down"));
      await runDueErasures(later());
      expect((await counts(b.t.organisationId)).org).toBe(0);
      expect((await prisma.erasureRequest.findFirstOrThrow({ where: { subjectId: b.t.organisationId } })).status).toBe("COMPLETED");
    });

    it("the audit delete is scoped to the organisation being erased", async () => {
      const a = await seed("Masjid A");
      const b = await seed("Masjid B");
      const del = (setting: string, orgId: string) =>
        prisma.$transaction(async (tx) => {
          await tx.$queryRaw`SELECT set_config('app.erasure', ${setting}, true)`;
          await tx.$executeRawUnsafe(`DELETE FROM "AuditLog" WHERE "organisationId" = '${orgId}'::uuid`);
        });
      await expect(del("on", a.t.organisationId)).rejects.toThrow(/append-only/);
      await expect(del(a.t.organisationId, b.t.organisationId)).rejects.toThrow(/append-only/);
      expect(await prisma.auditLog.count({ where: { organisationId: b.t.organisationId } })).toBeGreaterThan(0);
    });

    it("retention cannot change while an erasure request is open (409)", async () => {
      const { t } = await seed();
      await requestErasure(t).expect(201);
      const res = await request(app).put(`${org(t)}/retention`).set(as(t)).send({ years: 3 }).expect(409);
      expect(res.body.error.code).toBe("ERASURE_IN_PROGRESS");
      await request(app).delete(`${org(t)}/erasure`).set(as(t)).expect(200);
      await request(app).put(`${org(t)}/retention`).set(as(t)).send({ years: 3 }).expect(200);
    });
  });

  describe("user erasure (A4)", () => {
    const userReq = (u: { token: string }, password = PASSWORD) => request(app).post("/me/erasure").set(as(u)).send({ password });

    it("an organisation owner is refused with a clear error", async () => {
      const { t } = await seed();
      const res = await userReq(t).expect(409);
      expect(res.body.error.code).toBe("OWNS_ORGANISATION");
    });

    it("anonymises the account, removes sessions, follows and memberships (audited); the rows others keep still work", async () => {
      const a = await seed();
      const u = await createUser("Ahmad bin Ali");
      await withPassword(u.userId);
      await prisma.refreshToken.create({ data: { userId: u.userId, familyId: crypto.randomUUID(), tokenHash: `h-${u.userId}`, expiresAt: new Date(Date.now() + 1e6) } });
      await prisma.follow.create({ data: { userId: u.userId, organisationId: a.t.organisationId } });
      const m = await addMemberById(a.t, u.userId);
      await prisma.rosterEntry.create({ data: { organisationId: a.t.organisationId, userId: u.userId, duty: "Bilal", startsAt: new Date(), endsAt: new Date() } });

      await userReq(u, "wrong password!!").expect(401);
      await userReq(u).expect(201);
      await runDueErasures(new Date());
      expect(await prisma.user.findUniqueOrThrow({ where: { id: u.userId } })).toMatchObject({ displayName: "Ahmad bin Ali" });
      await runDueErasures(later());

      const user = await prisma.user.findUniqueOrThrow({ where: { id: u.userId } });
      expect(user).toMatchObject({ email: `deleted-${u.userId}@invalid`, displayName: "Deleted user" });
      expect(await argon2.verify(user.passwordHash, PASSWORD)).toBe(false);
      expect(await prisma.refreshToken.count({ where: { userId: u.userId } })).toBe(0);
      expect(await prisma.follow.count({ where: { userId: u.userId } })).toBe(0);
      expect(await prisma.organisationMembership.count({ where: { userId: u.userId } })).toBe(0);
      const leave = await prisma.auditLog.findFirstOrThrow({ where: { organisationId: a.t.organisationId, action: "membership.leave", targetId: m.id } });
      expect(leave.actorUserId).toBe(u.userId);
      expect(await prisma.rosterEntry.count({ where: { userId: u.userId } })).toBe(1); // organisation history kept
      expect((await prisma.erasureRequest.findFirstOrThrow({ where: { subjectId: u.userId } })).status).toBe("COMPLETED");
      expect((await counts(a.t.organisationId)).org).toBe(1); // the organisation is untouched
    });

    it("cancel works within the grace period; a user cannot cancel or read another user's request", async () => {
      const u = await createUser();
      await withPassword(u.userId);
      const other = await createUser();
      await userReq(u).expect(201);
      await request(app).delete("/me/erasure").set(as(other)).expect(404);
      expect((await request(app).get("/me/erasure").set(as(other))).body.request).toBeNull();
      await request(app).delete("/me/erasure").set(as(u)).expect(200);
      await runDueErasures(later());
      expect((await prisma.user.findUniqueOrThrow({ where: { id: u.userId } })).email).toBe(u.email);
    });

    it("fails (retryable) when the user became an owner after asking", async () => {
      const u = await createUser();
      await withPassword(u.userId);
      await userReq(u).expect(201);
      await request(app).post("/orgs").set(as(u)).send({ name: "New" }).expect(201);
      await runDueErasures(later());
      expect((await prisma.erasureRequest.findFirstOrThrow({ where: { subjectId: u.userId } })).failureCode).toBe("OWNS_ORGANISATION");
    });
  });
});

// Adds an existing user to an organisation through the real API.
async function addMemberById(t: TestTenant, userId: string) {
  const { email } = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { email: true } });
  const res = await request(app).post(`/orgs/${t.organisationId}/members`).set(as(t)).send({ email, roles: ["staff"] }).expect(201);
  return { id: res.body.member.id as string };
}
