// Phase 08 (ADR-022, ADR-013, ADR-020) integration tests against a real PostgreSQL and an S3 emulator.
// Cast: the owner is the "chairperson" and approves; the treasurer records and submits (the product
// owner's OQ-06 scenario).
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { app } from "../../app.ts";
import { prisma } from "../../db.ts";
import { createTenant, expectCrossTenantDenied, type TestTenant } from "../../test/cross-tenant.ts";
import { activeTenant, addMember, as, resetStores, setOrgStatus } from "../../test/fixtures.ts";
import { FILES, startS3 } from "../../test/s3.ts";
import { rbacRateLimitStores } from "../rbac/rbac.routes.ts";
import { tenancyRateLimitStores } from "../tenancy/tenancy.routes.ts";
import { financeRateLimitStores } from "./finance.routes.ts";

const hasDb = Boolean(process.env.DATABASE_URL);
if (!hasDb) console.warn("finance.db.test: DATABASE_URL not set — DB integration tests SKIPPED");

type Who = { token: string };
type Org = { chair: TestTenant; treasurer: Who & { userId: string }; income: string; expense: string; otherExpense: string };
const F = (t: Pick<TestTenant, "organisationId">) => `/orgs/${t.organisationId}/finance`;
const send = (t: Pick<TestTenant, "organisationId">, who: Who, method: "post" | "patch" | "get", path: string, body?: object) =>
  request(app)[method](`${F(t)}/${path}`).set(as(who)).send(body);

async function setup(withTreasurer = true): Promise<Org> {
  const chair = await activeTenant("Masjid Finance");
  const treasurer = withTreasurer ? await addMember(chair, ["treasurer"]) : chair;
  const cat = async (name: string, kind: string) => (await send(chair, chair, "post", "categories", { name, kind }).expect(201)).body.category.id as string;
  return { chair, treasurer, income: await cat("Friday collection", "INCOME"), expense: await cat("Utilities", "EXPENSE"), otherExpense: await cat("Maintenance", "EXPENSE") };
}
const expenseBody = (o: Org, extra: object = {}) => ({ amount: 35000, spentOn: "2026-03-10", categoryId: o.expense, payee: "TNB", description: "Electricity March", ...extra });
async function expense(o: Org, who: Who = o.treasurer, extra: object = {}) {
  return (await send(o.chair, who, "post", "expenses", expenseBody(o, extra)).expect(201)).body.record.id as string;
}
const act = (o: Org, who: Who, kind: string, id: string, verb: string, body?: object) => send(o.chair, who, "post", `${kind}/${id}/${verb}`, body);
async function approved(o: Org, kind: "expenses" | "incomes" | "budgets", id: string) {
  await act(o, o.treasurer, kind, id, "submit").expect(200);
  await act(o, o.chair, kind, id, "approve").expect(200);
}

describe.skipIf(!hasDb)("finance (database)", () => {
  let stopS3: () => Promise<void>;
  beforeAll(async () => {
    stopS3 = await startS3();
  });
  beforeEach(() => resetStores(tenancyRateLimitStores, rbacRateLimitStores, financeRateLimitStores));
  afterAll(async () => {
    await stopS3();
    await prisma.$disconnect();
  });

  describe("state machine (FIN-009/010, ADR-022 §2)", () => {
    it("treasurer submits, chairperson approves; void request → void approved → copy to new draft; all audited", async () => {
      const o = await setup();
      const id = await expense(o);
      const draft = (await send(o.chair, o.treasurer, "get", `expenses/${id}`).expect(200)).body.record;
      expect(draft).toMatchObject({ state: "DRAFT", amount: 35000, currency: "MYR", spentOn: "2026-03-10", voidRequested: false, attachments: [], approvals: [] });
      expect(draft).not.toHaveProperty("organisationId");

      const submitted = (await act(o, o.treasurer, "expenses", id, "submit").expect(200)).body.record;
      expect(submitted).toMatchObject({ state: "PENDING_APPROVAL", submittedById: o.treasurer.userId });
      const notes = await prisma.notification.findMany({ where: { organisationId: o.chair.organisationId, type: "finance.approval_required" } });
      expect(notes.map((n) => [n.recipientUserId, n.title])).toEqual([[o.chair.userId, "Expense waiting for approval"]]); // no amount (ADR-017 §2)

      const ok = (await act(o, o.chair, "expenses", id, "approve", { reason: "Bill checked" }).expect(200)).body.record;
      expect(ok).toMatchObject({ state: "APPROVED", decidedById: o.chair.userId });
      expect(ok.approvals).toMatchObject([{ decision: "APPROVED", actorUserId: o.chair.userId, reason: "Bill checked", selfApproved: false }]);

      // Void an approved record: request with a reason, then the chairperson approves the request.
      const noReason = await act(o, o.treasurer, "expenses", id, "void-request", {});
      expect(noReason.body.error.code).toBe("VALIDATION_ERROR");
      const requested = (await act(o, o.treasurer, "expenses", id, "void-request", { reason: "Amount was RM 530" }).expect(200)).body.record;
      expect(requested).toMatchObject({ state: "APPROVED", voidRequested: true, voidReason: "Amount was RM 530" });
      const voided = (await act(o, o.chair, "expenses", id, "void-approve").expect(200)).body.record;
      expect(voided).toMatchObject({ state: "VOIDED", voidReason: "Amount was RM 530" });
      expect(voided.voidedAt).not.toBeNull();

      const copy = (await act(o, o.treasurer, "expenses", id, "copy").expect(201)).body.record;
      expect(copy).toMatchObject({ state: "DRAFT", copiedFromId: id, amount: 35000, createdById: o.treasurer.userId });
      await send(o.chair, o.treasurer, "patch", `expenses/${copy.id}`, { amount: 53000 }).expect(200);

      const log = await prisma.auditLog.findMany({ where: { organisationId: o.chair.organisationId, targetId: id }, orderBy: { createdAt: "asc" } });
      expect(log.map((l) => l.action)).toEqual([
        "finance.expense.create",
        "finance.expense.submit",
        "finance.expense.pending_approval",
        "finance.expense.approve",
        "finance.expense.void_request",
        "finance.expense.void_approve",
      ]);
      expect(log[3]!.before).toMatchObject({ state: "PENDING_APPROVAL" });
      expect(log[3]!.after).toMatchObject({ state: "APPROVED", reason: "Bill checked" });
      expect(log.every((l) => l.actorUserId)).toBe(true);
    });

    it("reject is terminal; a rejected void request leaves the record APPROVED", async () => {
      const o = await setup();
      const id = await expense(o);
      await act(o, o.treasurer, "expenses", id, "submit").expect(200);
      expect((await act(o, o.chair, "expenses", id, "reject", { reason: "Receipt missing" }).expect(200)).body.record.state).toBe("REJECTED");
      for (const verb of ["submit", "approve", "void-request"]) {
        const r = await act(o, o.chair, "expenses", id, verb, { reason: "x" });
        expect([verb, r.status, r.body.error.code]).toEqual([verb, 409, "INVALID_STATE_TRANSITION"]);
      }
      expect((await act(o, o.treasurer, "expenses", id, "copy").expect(201)).body.record.copiedFromId).toBe(id);

      const b = await expense(o);
      await approved(o, "expenses", b);
      await act(o, o.treasurer, "expenses", b, "void-request", { reason: "duplicate?" }).expect(200);
      const rejected = (await act(o, o.chair, "expenses", b, "void-reject", { reason: "Not a duplicate" }).expect(200)).body.record;
      expect(rejected).toMatchObject({ state: "APPROVED", voidRequested: false, voidReason: null });
      expect(rejected.approvals.map((a: { decision: string }) => a.decision)).toEqual(["APPROVED", "VOID_REJECTED"]);
    });

    it("invalid transitions are rejected with 409 (FIN-010)", async () => {
      const o = await setup();
      const id = await expense(o);
      const expect409 = async (who: Who, verb: string, code = "INVALID_STATE_TRANSITION", body: object = { reason: "x" }) => {
        const r = await act(o, who, "expenses", id, verb, body);
        expect([verb, r.status, r.body.error.code]).toEqual([verb, 409, code]);
      };
      await expect409(o.chair, "approve");
      await expect409(o.chair, "void-approve");
      await expect409(o.treasurer, "void-request");
      await expect409(o.treasurer, "copy", "NOT_COPYABLE");
      await act(o, o.treasurer, "expenses", id, "submit").expect(200);
      await expect409(o.treasurer, "submit");
      const edit = await send(o.chair, o.treasurer, "patch", `expenses/${id}`, { amount: 1 });
      expect([edit.status, edit.body.error.code]).toEqual([409, "NOT_EDITABLE"]);
      await act(o, o.chair, "expenses", id, "approve").expect(200);
      await expect409(o.treasurer, "void", "VOID_REQUEST_REQUIRED");
      await expect409(o.chair, "void-reject");
    });

    it("a not-yet-approved record is cancelled directly with a reason (DRAFT or PENDING_APPROVAL)", async () => {
      const o = await setup();
      const draft = await expense(o);
      expect((await act(o, o.treasurer, "expenses", draft, "void", {})).body.error.code).toBe("VALIDATION_ERROR");
      expect((await act(o, o.treasurer, "expenses", draft, "void", { reason: "Typo" }).expect(200)).body.record).toMatchObject({ state: "VOIDED", voidReason: "Typo" });
      const pending = await expense(o);
      await act(o, o.treasurer, "expenses", pending, "submit").expect(200);
      await act(o, o.treasurer, "expenses", pending, "void", { reason: "Wrong category" }).expect(200);
      expect(await prisma.financeApproval.count({ where: { recordId: { in: [draft, pending] } } })).toBe(0); // no approval needed
      // Committee holds finance.read but neither creator nor finance.void.
      const committee = await addMember(o.chair, ["committee"]);
      const third = await expense(o);
      expect((await act(o, committee, "expenses", third, "void", { reason: "x" })).status).toBe(403);
    });

    it("two approvers deciding at once: exactly one wins", async () => {
      const o = await setup();
      const second = await addMember(o.chair, ["treasurer"]);
      const id = (await send(o.chair, second, "post", "expenses", expenseBody(o)).expect(201)).body.record.id;
      await act(o, second, "expenses", id, "submit").expect(200);
      const results = await Promise.all([act(o, o.chair, "expenses", id, "approve"), act(o, o.treasurer, "expenses", id, "reject")]);
      expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
      expect(await prisma.financeApproval.count({ where: { recordId: id } })).toBe(1);
    });
  });

  describe("self-approval (FIN-013, ADR-013)", () => {
    it("blocked while another approver exists; allowed and flagged for a sole approver", async () => {
      const o = await setup();
      const id = await expense(o);
      await act(o, o.treasurer, "expenses", id, "submit").expect(200);
      const self = await act(o, o.treasurer, "expenses", id, "approve");
      expect([self.status, self.body.error.code]).toEqual([403, "SELF_APPROVAL_NOT_ALLOWED"]);
      await approved(o, "expenses", await expense(o));

      const v = await expense(o);
      await approved(o, "expenses", v);
      await act(o, o.treasurer, "expenses", v, "void-request", { reason: "x" }).expect(200);
      expect((await act(o, o.treasurer, "expenses", v, "void-approve")).body.error.code).toBe("SELF_APPROVAL_NOT_ALLOWED");

      const solo = await setup(false); // the owner is the only finance.approve holder
      const s = await expense(solo, solo.chair);
      await act(solo, solo.chair, "expenses", s, "submit").expect(200);
      const flagged = (await act(solo, solo.chair, "expenses", s, "approve").expect(200)).body.record;
      expect(flagged.approvals).toMatchObject([{ decision: "APPROVED", selfApproved: true }]);
      const row = await prisma.auditLog.findFirstOrThrow({ where: { targetId: s, action: "finance.expense.approve" } });
      expect(row.after).toMatchObject({ selfApproved: true });
    });
  });

  describe("permissions, validation and references (FIN-002..004, FIN-016, TENANT-006)", () => {
    it("finance keys gate every action; only the creator edits or submits their draft", async () => {
      const o = await setup();
      const committee = await addMember(o.chair, ["committee"]); // finance.read only
      const admin = await addMember(o.chair, ["admin"]); // finance.read + audit.read
      const staff = await addMember(o.chair, ["staff"]); // no finance
      expect((await send(o.chair, committee, "post", "expenses", expenseBody(o))).status).toBe(403);
      expect((await send(o.chair, staff, "get", "expenses")).status).toBe(403);
      await send(o.chair, admin, "get", "expenses").expect(200);
      const id = await expense(o);
      await act(o, committee, "expenses", id, "submit").expect(403);
      const notMine = await send(o.chair, o.chair, "patch", `expenses/${id}`, { amount: 1 });
      expect([notMine.status, notMine.body.error.code]).toEqual([403, "FORBIDDEN"]);
      expect((await act(o, o.chair, "expenses", id, "submit")).status).toBe(403);
      await act(o, o.treasurer, "expenses", id, "submit").expect(200);
      expect((await act(o, admin, "expenses", id, "approve")).status).toBe(403); // RBAC-014
      expect((await send(o.chair, committee, "post", "categories", { name: "x", kind: "INCOME" })).status).toBe(403);
    });

    it("validates amounts as positive integer minor units, currency, dates and strict bodies (FIN-001)", async () => {
      const o = await setup();
      for (const bad of [{ amount: 10.5 }, { amount: 0 }, { amount: -100 }, { amount: 10_000_000_000_001 }, { amount: "100" }, { currency: "myr" }, { spentOn: "2026-02-30" }, { organisationId: o.chair.organisationId }, { state: "APPROVED" }]) {
        const r = await send(o.chair, o.treasurer, "post", "expenses", expenseBody(o, bad));
        expect([JSON.stringify(bad), r.status, r.body.error.code]).toEqual([JSON.stringify(bad), 400, "VALIDATION_ERROR"]);
      }
      const missing = await send(o.chair, o.treasurer, "post", "expenses", { amount: 100, spentOn: "2026-03-01", categoryId: o.expense });
      expect(missing.body.error.code).toBe("VALIDATION_ERROR"); // description required (FIN-004)
    });

    it("categories must be this organisation's, active and of the right kind", async () => {
      const o = await setup();
      const other = await setup();
      for (const categoryId of [o.income, other.expense]) {
        const r = await send(o.chair, o.treasurer, "post", "expenses", expenseBody(o, { categoryId }));
        expect([r.status, r.body.error.code]).toEqual([422, "INVALID_CATEGORY"]);
      }
      await send(o.chair, o.treasurer, "patch", `categories/${o.otherExpense}`, { active: false }).expect(200);
      expect((await send(o.chair, o.treasurer, "post", "expenses", expenseBody(o, { categoryId: o.otherExpense }))).body.error.code).toBe("INVALID_CATEGORY");
      const dup = await send(o.chair, o.chair, "post", "categories", { name: "Utilities", kind: "EXPENSE" });
      expect([dup.status, dup.body.error.code]).toEqual([409, "CATEGORY_EXISTS"]);
    });
  });

  describe("collections (FIN-006, ADR-022 §6)", () => {
    it("progress = approved linked income against an optional target; pending and voided do not count", async () => {
      const o = await setup();
      const col = (await send(o.chair, o.treasurer, "post", "collections", { purpose: "Roof Repair Fund", targetAmount: 2_000_000 }).expect(201)).body.collection;
      expect(col).toMatchObject({ purpose: "Roof Repair Fund", targetAmount: 2_000_000, currency: "MYR", status: "OPEN", collected: 0, percent: 0 });
      const income = async (amount: number) =>
        (await send(o.chair, o.treasurer, "post", "incomes", { amount, receivedOn: "2026-10-02", categoryId: o.income, collectionId: col.id, description: "Friday box" }).expect(201)).body.record.id;
      await approved(o, "incomes", await income(500_000));
      await approved(o, "incomes", await income(345_000));
      const pending = await income(100_000);
      await act(o, o.treasurer, "incomes", pending, "submit").expect(200);
      const voided = await income(70_000);
      await approved(o, "incomes", voided);
      await act(o, o.treasurer, "incomes", voided, "void-request", { reason: "Counted twice" }).expect(200);
      expect((await send(o.chair, o.treasurer, "get", `collections/${col.id}`)).body.collection).toMatchObject({ collected: 915_000, percent: 45 }); // pending void still counts
      await act(o, o.chair, "incomes", voided, "void-approve").expect(200);
      expect((await send(o.chair, o.treasurer, "get", `collections/${col.id}`)).body.collection).toMatchObject({ collected: 845_000, percent: 42 });

      const noTarget = (await send(o.chair, o.treasurer, "post", "collections", { purpose: "Welfare" }).expect(201)).body.collection;
      expect(noTarget).toMatchObject({ targetAmount: null, percent: null });
      await send(o.chair, o.treasurer, "patch", `collections/${noTarget.id}`, { status: "CLOSED" }).expect(200);
      const closed = await send(o.chair, o.treasurer, "post", "incomes", { amount: 1, receivedOn: "2026-10-02", categoryId: o.income, collectionId: noTarget.id, description: "x" });
      expect([closed.status, closed.body.error.code]).toEqual([422, "INVALID_COLLECTION"]);
      const usd = (await send(o.chair, o.treasurer, "post", "collections", { purpose: "Overseas", currency: "USD" }).expect(201)).body.collection;
      expect((await send(o.chair, o.treasurer, "post", "incomes", { amount: 1, receivedOn: "2026-10-02", categoryId: o.income, collectionId: usd.id, description: "x" })).body.error.code).toBe("INVALID_COLLECTION");
    });

    it("totals use integer arithmetic (FIN-001): large amounts add up exactly", async () => {
      const o = await setup();
      const col = (await send(o.chair, o.treasurer, "post", "collections", { purpose: "Big" }).expect(201)).body.collection;
      for (const amount of [9_999_999_999_999, 1]) {
        const id = (await send(o.chair, o.treasurer, "post", "incomes", { amount, receivedOn: "2026-10-02", categoryId: o.income, collectionId: col.id, description: "x" }).expect(201)).body.record.id;
        await approved(o, "incomes", id);
      }
      expect((await send(o.chair, o.treasurer, "get", `collections/${col.id}`)).body.collection.collected).toBe(10_000_000_000_000);
    });
  });

  describe("budgets (FIN-007/008, ADR-022 §5)", () => {
    it("budgets go through approval; used = approved expenses in category and period only", async () => {
      const o = await setup();
      const budget = (await send(o.chair, o.treasurer, "post", "budgets", {
        name: "2026 Utilities", amount: 600_000, periodStart: "2026-01-01", periodEnd: "2026-12-31", categoryId: o.expense, description: "Moved from savings",
      }).expect(201)).body.record;
      expect(budget).toMatchObject({ state: "DRAFT", used: 0, remaining: 600_000, periodStart: "2026-01-01" });
      await approved(o, "budgets", budget.id);

      await approved(o, "expenses", await expense(o, o.treasurer, { amount: 40_000 })); // counted
      const pending = await expense(o, o.treasurer, { amount: 25_000 });
      await act(o, o.treasurer, "expenses", pending, "submit").expect(200); // not counted
      await approved(o, "expenses", await expense(o, o.treasurer, { amount: 99_000, categoryId: o.otherExpense })); // other category
      await approved(o, "expenses", await expense(o, o.treasurer, { amount: 77_000, spentOn: "2025-12-31" })); // outside the period
      const before = await prisma.expense.findMany({ where: { organisationId: o.chair.organisationId }, orderBy: { id: "asc" } });
      const view = (await send(o.chair, o.treasurer, "get", `budgets/${budget.id}`).expect(200)).body.record;
      expect(view).toMatchObject({ state: "APPROVED", amount: 600_000, used: 40_000, remaining: 560_000 });
      expect((await send(o.chair, o.treasurer, "get", "budgets").expect(200)).body.records[0]).toMatchObject({ used: 40_000 });
      expect(await prisma.expense.findMany({ where: { organisationId: o.chair.organisationId }, orderBy: { id: "asc" } })).toEqual(before); // FIN-008
      const backwards = await send(o.chair, o.treasurer, "post", "budgets", { name: "x", amount: 1, periodStart: "2026-02-01", periodEnd: "2026-01-01", categoryId: o.expense, description: "x" });
      expect(backwards.body.error.code).toBe("VALIDATION_ERROR");
    });

    it("budgets need finance.reporting; income/expenses need finance (ADR-018, RBAC-004)", async () => {
      const o = await setup();
      await prisma.subscription.update({ where: { organisationId: o.chair.organisationId }, data: { status: "ACTIVE", planKey: "starter" } });
      const gated = await send(o.chair, o.treasurer, "get", "budgets");
      expect([gated.status, gated.body.error.code]).toEqual([403, "ENTITLEMENT_REQUIRED"]);
      await send(o.chair, o.treasurer, "get", "expenses").expect(200);
      await prisma.subscription.update({ where: { organisationId: o.chair.organisationId }, data: { status: "EXPIRED" } });
      expect((await send(o.chair, o.treasurer, "get", "expenses")).body.error.code).toBe("ENTITLEMENT_REQUIRED");
    });
  });

  describe("evidence attachments (FIN-005, SEC-007, ADR-020)", () => {
    const upload = (o: Org, who: Who, id: string, body: Buffer) =>
      request(app).post(`${F(o.chair)}/expenses/${id}/attachments`).set(as(who)).set("Content-Type", "application/octet-stream").send(body);

    it("creator uploads to a draft; checked by content and size; private download link; max 5", async () => {
      const o = await setup();
      const id = await expense(o);
      const a = (await upload(o, o.treasurer, id, FILES.pdf).expect(201)).body.attachment;
      expect(a).toMatchObject({ contentType: "application/pdf", sizeBytes: FILES.pdf.length });
      const row = await prisma.financeAttachment.findUniqueOrThrow({ where: { id: a.id } });
      expect(row.objectKey).toMatch(new RegExp(`^org/${o.chair.organisationId}/finance/expenses/${id}/[0-9a-f-]{36}\\.pdf$`));

      const dl = (await send(o.chair, o.chair, "get", `expenses/${id}/attachments/${a.id}/download`).expect(200)).body;
      expect(dl.expiresInSeconds).toBe(300);
      const file = await fetch(dl.url);
      expect(file.status).toBe(200);
      expect(Buffer.from(await file.arrayBuffer()).equals(FILES.pdf)).toBe(true);

      expect((await upload(o, o.treasurer, id, FILES.html)).body.error.code).toBe("UNSUPPORTED_FILE_TYPE");
      expect((await upload(o, o.treasurer, id, Buffer.concat([FILES.pdf, Buffer.alloc(5 * 1024 * 1024)]))).body.error.code).toBe("FILE_TOO_LARGE");
      expect((await upload(o, o.chair, id, FILES.png)).status).toBe(403); // not the creator
      for (let i = 0; i < 4; i++) await upload(o, o.treasurer, id, FILES.jpeg).expect(201);
      expect((await upload(o, o.treasurer, id, FILES.jpeg)).body.error.code).toBe("TOO_MANY_ATTACHMENTS");
      await act(o, o.treasurer, "expenses", id, "submit").expect(200);
      const late = await upload(o, o.treasurer, (await expense(o)), FILES.png).expect(201);
      expect(late.body.attachment).toBeTruthy();
      expect((await upload(o, o.treasurer, id, FILES.png)).body.error.code).toBe("NOT_EDITABLE");
      const staff = await addMember(o.chair, ["staff"]);
      expect((await send(o.chair, staff, "get", `expenses/${id}/attachments/${a.id}/download`)).status).toBe(403);
    });
  });

  describe("audit log (FIN-014/015)", () => {
    it("finance.audit.read lists finance actions only; the log cannot be updated or deleted", async () => {
      const o = await setup();
      await approved(o, "expenses", await expense(o));
      const log = (await send(o.chair, o.treasurer, "get", "audit?limit=100").expect(200)).body.entries;
      expect(log.length).toBeGreaterThan(0);
      expect(log.every((e: { action: string }) => e.action.startsWith("finance."))).toBe(true); // no membership rows
      const committee = await addMember(o.chair, ["committee"]);
      expect((await send(o.chair, committee, "get", "audit")).status).toBe(403);

      const row = await prisma.auditLog.findFirstOrThrow({ where: { organisationId: o.chair.organisationId } });
      await expect(prisma.auditLog.update({ where: { id: row.id }, data: { action: "tampered" } })).rejects.toThrow(/append-only/);
      await expect(prisma.auditLog.delete({ where: { id: row.id } })).rejects.toThrow(/append-only/);
    });
  });

  describe("lifecycle guard and tenant isolation (ADR-016 §2, TENANT-005/007)", () => {
    it("SUSPENDED: reads allowed, writes blocked; onboarding orgs have no finance module", async () => {
      const o = await setup();
      const id = await expense(o);
      await setOrgStatus(o.chair, "SUSPENDED");
      await send(o.chair, o.treasurer, "get", `expenses/${id}`).expect(200);
      expect((await act(o, o.treasurer, "expenses", id, "submit")).body.error.code).toBe("ORGANISATION_NOT_WRITABLE");
      const fresh = await createTenant();
      expect((await send(fresh, fresh, "get", "expenses")).body.error.code).toBe("ORGANISATION_NOT_WRITABLE");
    });

    it("another tenant gets 404 on every finance route and cannot reach records by id", async () => {
      const v = await setup();
      const exp = await expense(v);
      const col = (await send(v.chair, v.treasurer, "post", "collections", { purpose: "Victim fund" }).expect(201)).body.collection.id;
      const att = (await request(app).post(`${F(v.chair)}/expenses/${exp}/attachments`).set(as(v.treasurer)).set("Content-Type", "application/pdf").send(FILES.pdf).expect(201)).body.attachment.id;
      const attacker = await setup();
      const routes = (o: TestTenant, own: boolean) => {
        const code = (c: string) => (own ? c : undefined);
        return [
          { method: "get" as const, path: `${F(o)}/expenses/${exp}`, expectedCode: code("EXPENSE_NOT_FOUND") },
          { method: "patch" as const, path: `${F(o)}/expenses/${exp}`, body: { amount: 1 }, expectedCode: code("EXPENSE_NOT_FOUND") },
          ...["submit", "approve", "reject", "void-request", "void-approve", "void-reject", "copy"].map((verb) => ({
            method: "post" as const,
            path: `${F(o)}/expenses/${exp}/${verb}`,
            body: { reason: "x" },
            expectedCode: code("EXPENSE_NOT_FOUND"),
          })),
          { method: "post" as const, path: `${F(o)}/expenses/${exp}/void`, body: { reason: "x" }, expectedCode: code("EXPENSE_NOT_FOUND") },
          { method: "get" as const, path: `${F(o)}/expenses/${exp}/attachments/${att}/download`, expectedCode: code("EXPENSE_NOT_FOUND") },
          { method: "get" as const, path: `${F(o)}/collections/${col}`, expectedCode: code("COLLECTION_NOT_FOUND") },
          { method: "patch" as const, path: `${F(o)}/collections/${col}`, body: { status: "CLOSED" }, expectedCode: code("COLLECTION_NOT_FOUND") },
          { method: "patch" as const, path: `${F(o)}/categories/${v.expense}`, body: { active: false }, expectedCode: code("CATEGORY_NOT_FOUND") },
        ];
      };
      const snapshot = async () => [
        await prisma.expense.findMany({ where: { organisationId: v.chair.organisationId }, orderBy: { id: "asc" } }),
        await prisma.collection.findMany({ where: { organisationId: v.chair.organisationId } }),
        await prisma.financialCategory.findMany({ where: { organisationId: v.chair.organisationId }, orderBy: { id: "asc" } }),
      ];
      await expectCrossTenantDenied(attacker.chair, [...routes(v.chair, false), { method: "get", path: `${F(v.chair)}/audit` }], { snapshot });
      await expectCrossTenantDenied(attacker.chair, routes(attacker.chair, true), { snapshot });
      // Lists and aggregates stay tenant-scoped.
      expect((await send(attacker.chair, attacker.chair, "get", "expenses")).body.records).toEqual([]);
      const attach = await send(attacker.chair, attacker.treasurer, "post", "incomes", { amount: 1, receivedOn: "2026-10-02", categoryId: attacker.income, collectionId: col, description: "x" });
      expect([attach.status, attach.body.error.code]).toEqual([422, "INVALID_COLLECTION"]);
    });
  });
});
