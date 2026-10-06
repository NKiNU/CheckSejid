// Phase 07 — operations (ADR-024, OPS-001..005): programmes, tasks and roster.
// Generic models: no Masjid-specific job titles (duty is free text, OPS-004).
import type { Prisma, ProgrammeStatus, TaskStatus } from "../../../generated/prisma/client.ts";
import { prisma } from "../../db.ts";
import { ymd, ymdOrNull } from "../../dates.ts";
import { HttpError } from "../../errors.ts";
import { notify } from "../notifications/notifications.service.ts";
import { hasPermission } from "../rbac/rbac.ts";
import { forTenant, type TenantDb } from "../tenancy/tenant.ts";

export type Actor = { organisationId: string; membershipId: string; userId: string };
type Tx = Prisma.TransactionClient;

const notFound = (what: "PROGRAMME" | "TASK" | "ROSTER_ENTRY", label: string) => new HttpError(404, `${what}_NOT_FOUND`, `${label} not found`);
export const programmeNotFound = () => notFound("PROGRAMME", "Programme");
export const taskNotFound = () => notFound("TASK", "Task");
export const rosterNotFound = () => notFound("ROSTER_ENTRY", "Roster entry");

// TENANT-006: referenced people and programmes must belong to this organisation.
async function assertMember(db: TenantDb, organisationId: string, userId: string) {
  const m = await db.organisationMembership.findUnique({ where: { organisationId_userId: { organisationId, userId } }, select: { id: true } });
  if (!m) throw new HttpError(422, "INVALID_ASSIGNEE", "The assignee must be a member of this organisation");
}
async function assertProgramme(db: TenantDb, programmeId: string) {
  if (!(await db.programme.findUnique({ where: { id: programmeId }, select: { id: true } }))) {
    throw new HttpError(422, "INVALID_PROGRAMME", "The programme does not exist in this organisation");
  }
}
const checkRange = (start: Date, end: Date, strict: boolean, msg: string) => {
  if (strict ? end <= start : end < start) throw new HttpError(400, "VALIDATION_ERROR", msg);
};

// ---- programmes (OPS-001) ----
type ProgrammeRow = Prisma.ProgrammeGetPayload<object>;
const programmeView = ({ organisationId: _o, startDate, endDate, ...p }: ProgrammeRow) => ({ ...p, startDate: ymd(startDate), endDate: ymd(endDate) });
export type ProgrammeInput = { title: string; objectives: string | null; startDate: Date; endDate: Date; status: ProgrammeStatus };

const LIMIT = 100; // ponytail: hard cap like tenancy lists; add cursors when an org can exceed it.

export async function listProgrammes(organisationId: string) {
  const rows = await forTenant(organisationId).programme.findMany({ orderBy: [{ startDate: "desc" }, { id: "asc" }], take: LIMIT });
  return rows.map(programmeView);
}

async function loadProgramme(db: TenantDb, id: string) {
  const p = await db.programme.findUnique({ where: { id } });
  if (!p) throw programmeNotFound();
  return p;
}

export const getProgramme = async (organisationId: string, id: string) => programmeView(await loadProgramme(forTenant(organisationId), id));

export async function createProgramme(actor: Actor, input: ProgrammeInput) {
  checkRange(input.startDate, input.endDate, false, "endDate must not be before startDate");
  return programmeView(await forTenant(actor.organisationId).programme.create({ data: input as Prisma.ProgrammeUncheckedCreateInput }));
}

export async function updateProgramme(actor: Actor, id: string, change: Partial<ProgrammeInput>) {
  const db = forTenant(actor.organisationId);
  const p = await loadProgramme(db, id);
  checkRange(change.startDate ?? p.startDate, change.endDate ?? p.endDate, false, "endDate must not be before startDate");
  return programmeView(await db.programme.update({ where: { id }, data: change }));
}

// ADR-024 §5: only an unreferenced programme is deleted; otherwise cancel it.
export async function deleteProgramme(actor: Actor, id: string) {
  const db = forTenant(actor.organisationId);
  await loadProgramme(db, id);
  const refs = (await db.task.count({ where: { programmeId: id } })) + (await db.rosterEntry.count({ where: { programmeId: id } }));
  if (refs > 0) throw new HttpError(409, "PROGRAMME_IN_USE", "The programme has tasks or roster entries; cancel it instead");
  await db.programme.deleteMany({ where: { id } });
}

// ---- tasks (OPS-002) ----
type TaskRow = Prisma.TaskGetPayload<object>;
const taskView = ({ organisationId: _o, dueDate, ...t }: TaskRow) => ({ ...t, dueDate: ymdOrNull(dueDate) });
export type TaskInput = { title: string; description: string | null; programmeId: string | null; assigneeUserId: string | null; dueDate: Date | null; status: TaskStatus };

async function loadTask(db: TenantDb, id: string) {
  const t = await db.task.findUnique({ where: { id } });
  if (!t) throw taskNotFound();
  return t;
}

export async function listTasks(organisationId: string, filter: { status?: TaskStatus; programmeId?: string; assigneeUserId?: string }) {
  const rows = await forTenant(organisationId).task.findMany({ where: filter, orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }], take: LIMIT });
  return rows.map(taskView);
}

export const getTask = async (organisationId: string, id: string) => taskView(await loadTask(forTenant(organisationId), id));

const assignedTitle = (title: string) => `Task assigned: ${title}`.slice(0, 300);

async function notifyAssigned(tx: Tx, actor: Actor, type: "task.assigned" | "roster.assigned", title: string, targetType: string, targetId: string) {
  await notify(tx, { organisationId: actor.organisationId, actorUserId: actor.userId, type, title, targetType, targetId });
}

export async function createTask(actor: Actor, input: TaskInput) {
  return prisma.$transaction(async (tx) => {
    const db = forTenant(actor.organisationId, tx);
    if (input.programmeId) await assertProgramme(db, input.programmeId);
    if (input.assigneeUserId) await assertMember(db, actor.organisationId, input.assigneeUserId);
    const t = await db.task.create({ data: input as Prisma.TaskUncheckedCreateInput });
    if (t.assigneeUserId) await notifyAssigned(tx, actor, "task.assigned", assignedTitle(t.title), "task", t.id); // NOTIF-004
    return taskView(t);
  });
}

export async function updateTask(actor: Actor, id: string, change: Partial<TaskInput>) {
  return prisma.$transaction(async (tx) => {
    const db = forTenant(actor.organisationId, tx);
    const before = await loadTask(db, id);
    if (change.programmeId) await assertProgramme(db, change.programmeId);
    if (change.assigneeUserId) await assertMember(db, actor.organisationId, change.assigneeUserId);
    const t = await db.task.update({ where: { id }, data: change });
    if (t.assigneeUserId && t.assigneeUserId !== before.assigneeUserId) await notifyAssigned(tx, actor, "task.assigned", assignedTitle(t.title), "task", t.id);
    return taskView(t);
  });
}

// ADR-015 §1 rule: `operations.manage`, or the task's own assignee (who holds operations.read), may
// change its status.
export async function setTaskStatus(actor: Actor, id: string, status: TaskStatus) {
  const db = forTenant(actor.organisationId);
  const t = await loadTask(db, id);
  if (t.assigneeUserId !== actor.userId && !(await hasPermission(actor, "operations.manage"))) {
    throw new HttpError(403, "FORBIDDEN", "Only the assignee or an operations manager can change this task's status");
  }
  return taskView(await db.task.update({ where: { id }, data: { status } }));
}

export async function deleteTask(actor: Actor, id: string) {
  const db = forTenant(actor.organisationId);
  await loadTask(db, id);
  await db.task.deleteMany({ where: { id } });
}

// ---- roster (OPS-003) ----
type RosterRow = Prisma.RosterEntryGetPayload<object>;
const rosterView = ({ organisationId: _o, ...r }: RosterRow) => r;
export type RosterInput = { userId: string; duty: string; startsAt: Date; endsAt: Date; notes: string | null; programmeId: string | null };

async function loadRoster(db: TenantDb, id: string) {
  const r = await db.rosterEntry.findUnique({ where: { id } });
  if (!r) throw rosterNotFound();
  return r;
}

// Entries overlapping [from, to).
export async function listRoster(organisationId: string, filter: { from?: Date; to?: Date; userId?: string }) {
  const rows = await forTenant(organisationId).rosterEntry.findMany({
    where: {
      ...(filter.userId && { userId: filter.userId }),
      ...(filter.to && { startsAt: { lt: filter.to } }),
      ...(filter.from && { endsAt: { gt: filter.from } }),
    },
    orderBy: [{ startsAt: "asc" }, { id: "asc" }],
    take: LIMIT,
  });
  return rows.map(rosterView);
}

const rosterTitle = (duty: string) => `Roster duty assigned: ${duty}`.slice(0, 300);

export async function createRoster(actor: Actor, input: RosterInput) {
  checkRange(input.startsAt, input.endsAt, true, "endsAt must be after startsAt");
  return prisma.$transaction(async (tx) => {
    const db = forTenant(actor.organisationId, tx);
    await assertMember(db, actor.organisationId, input.userId);
    if (input.programmeId) await assertProgramme(db, input.programmeId);
    const r = await db.rosterEntry.create({ data: input as Prisma.RosterEntryUncheckedCreateInput });
    await notifyAssigned(tx, actor, "roster.assigned", rosterTitle(r.duty), "roster_entry", r.id); // NOTIF-004
    return rosterView(r);
  });
}

export async function updateRoster(actor: Actor, id: string, change: Partial<RosterInput>) {
  return prisma.$transaction(async (tx) => {
    const db = forTenant(actor.organisationId, tx);
    const before = await loadRoster(db, id);
    checkRange(change.startsAt ?? before.startsAt, change.endsAt ?? before.endsAt, true, "endsAt must be after startsAt");
    if (change.userId) await assertMember(db, actor.organisationId, change.userId);
    if (change.programmeId) await assertProgramme(db, change.programmeId);
    const r = await db.rosterEntry.update({ where: { id }, data: change });
    if (r.userId !== before.userId) await notifyAssigned(tx, actor, "roster.assigned", rosterTitle(r.duty), "roster_entry", r.id);
    return rosterView(r);
  });
}

export async function deleteRoster(actor: Actor, id: string) {
  const db = forTenant(actor.organisationId);
  await loadRoster(db, id);
  await db.rosterEntry.deleteMany({ where: { id } });
}
