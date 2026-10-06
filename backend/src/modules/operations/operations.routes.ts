import { Router, type Request, type RequestHandler } from "express";
import { MemoryStore } from "express-rate-limit";
import { z } from "zod";
import { dateOnly } from "../../dates.ts";
import { HttpError } from "../../errors.ts";
import { requireAuth } from "../identity/auth.ts";
import { limiter } from "../identity/identity.routes.ts";
import type { Permission } from "../rbac/permissions.ts";
import { requirePermission } from "../rbac/rbac.ts";
import { requireEntitlement } from "../subscriptions/entitlements.ts";
import { requireActiveOrg, requireOrgStatus, requireTenant } from "../tenancy/tenant.ts";
import * as ops from "./operations.service.ts";

export const operationsRateLimitStores = { write: new MemoryStore() };
const writeLimit = limiter(300, operationsRateLimitStores.write, (req: Request) => `user:${req.auth!.userId}`);

// ADR-024 §6: permission, then entitlement (RBAC-004), then lifecycle (ADR-016 §2).
const read: RequestHandler[] = [
  requireAuth,
  requireTenant,
  requirePermission("operations.read"),
  requireEntitlement("operations"),
  requireOrgStatus("ACTIVE", "SUSPENDED", "ARCHIVED"),
];
const write = (key: Permission = "operations.manage"): RequestHandler[] => [
  requireAuth,
  writeLimit,
  requireTenant,
  requirePermission(key),
  requireEntitlement("operations"),
  requireActiveOrg,
];

const uuid = z.uuid();
const title = z.string().trim().min(1).max(200);
const longText = z.string().trim().max(5000).nullable();
const instant = z.iso.datetime({ offset: true }).transform((s) => new Date(s));
const nonEmpty = <T extends z.ZodObject>(s: T) => s.partial().refine((b) => Object.keys(b).length > 0, "Nothing to change");

const programmeBody = z.strictObject({
  title,
  objectives: longText.default(null),
  startDate: dateOnly,
  endDate: dateOnly,
  status: z.enum(["PLANNED", "ACTIVE", "COMPLETED", "CANCELLED"]).default("PLANNED"),
});
const taskStatus = z.enum(["TODO", "IN_PROGRESS", "DONE", "CANCELLED"]);
const taskBody = z.strictObject({
  title,
  description: longText.default(null),
  programmeId: uuid.nullable().default(null),
  assigneeUserId: uuid.nullable().default(null),
  dueDate: dateOnly.nullable().default(null),
  status: taskStatus.default("TODO"),
});
const rosterBody = z.strictObject({
  userId: uuid,
  duty: z.string().trim().min(1).max(100), // free text (OPS-004)
  startsAt: instant,
  endsAt: instant,
  notes: z.string().trim().max(1000).nullable().default(null),
  programmeId: uuid.nullable().default(null),
});
// PATCH bodies: same fields, all optional, no defaults.
const programmePatch = nonEmpty(programmeBody.extend({ objectives: longText, status: programmeBody.shape.status.unwrap() }));
const taskPatch = nonEmpty(
  taskBody.extend({ description: longText, programmeId: uuid.nullable(), assigneeUserId: uuid.nullable(), dueDate: dateOnly.nullable(), status: taskStatus }),
);
const rosterPatch = nonEmpty(rosterBody.extend({ notes: z.string().trim().max(1000).nullable(), programmeId: uuid.nullable() }));
const taskQuery = z.strictObject({ status: taskStatus.optional(), programmeId: uuid.optional(), assigneeUserId: uuid.optional() });
const rosterQuery = z.strictObject({ from: instant.optional(), to: instant.optional(), userId: uuid.optional() });

const actor = (req: Request): ops.Actor => ({ ...req.tenant!, userId: req.auth!.userId });
const idParam = (req: Request, notFound: () => HttpError) => {
  const v = req.params["id"];
  if (!uuid.safeParse(v).success) throw notFound();
  return v as string;
};
const org = (req: Request) => req.tenant!.organisationId;

export const operationsRouter = Router();
const P = "/orgs/:orgId/operations";

operationsRouter.get(`${P}/programmes`, ...read, async (req, res) => {
  res.json({ programmes: await ops.listProgrammes(org(req)) });
});
operationsRouter.get(`${P}/programmes/:id`, ...read, async (req, res) => {
  res.json({ programme: await ops.getProgramme(org(req), idParam(req, ops.programmeNotFound)) });
});
operationsRouter.post(`${P}/programmes`, ...write(), async (req, res) => {
  res.status(201).json({ programme: await ops.createProgramme(actor(req), programmeBody.parse(req.body)) });
});
operationsRouter.patch(`${P}/programmes/:id`, ...write(), async (req, res) => {
  const id = idParam(req, ops.programmeNotFound);
  res.json({ programme: await ops.updateProgramme(actor(req), id, programmePatch.parse(req.body)) });
});
operationsRouter.delete(`${P}/programmes/:id`, ...write(), async (req, res) => {
  await ops.deleteProgramme(actor(req), idParam(req, ops.programmeNotFound));
  res.status(204).end();
});

operationsRouter.get(`${P}/tasks`, ...read, async (req, res) => {
  res.json({ tasks: await ops.listTasks(org(req), taskQuery.parse(req.query)) });
});
operationsRouter.get(`${P}/tasks/:id`, ...read, async (req, res) => {
  res.json({ task: await ops.getTask(org(req), idParam(req, ops.taskNotFound)) });
});
operationsRouter.post(`${P}/tasks`, ...write(), async (req, res) => {
  res.status(201).json({ task: await ops.createTask(actor(req), taskBody.parse(req.body)) });
});
operationsRouter.patch(`${P}/tasks/:id`, ...write(), async (req, res) => {
  const id = idParam(req, ops.taskNotFound);
  res.json({ task: await ops.updateTask(actor(req), id, taskPatch.parse(req.body)) });
});
// ADR-015 §1 rule: the assignee (operations.read) or a manager; the service checks which.
operationsRouter.post(`${P}/tasks/:id/status`, ...write("operations.read"), async (req, res) => {
  const id = idParam(req, ops.taskNotFound);
  const { status } = z.strictObject({ status: taskStatus }).parse(req.body);
  res.json({ task: await ops.setTaskStatus(actor(req), id, status) });
});
operationsRouter.delete(`${P}/tasks/:id`, ...write(), async (req, res) => {
  await ops.deleteTask(actor(req), idParam(req, ops.taskNotFound));
  res.status(204).end();
});

operationsRouter.get(`${P}/roster`, ...read, async (req, res) => {
  res.json({ roster: await ops.listRoster(org(req), rosterQuery.parse(req.query)) });
});
operationsRouter.post(`${P}/roster`, ...write(), async (req, res) => {
  res.status(201).json({ entry: await ops.createRoster(actor(req), rosterBody.parse(req.body)) });
});
operationsRouter.patch(`${P}/roster/:id`, ...write(), async (req, res) => {
  const id = idParam(req, ops.rosterNotFound);
  res.json({ entry: await ops.updateRoster(actor(req), id, rosterPatch.parse(req.body)) });
});
operationsRouter.delete(`${P}/roster/:id`, ...write(), async (req, res) => {
  await ops.deleteRoster(actor(req), idParam(req, ops.rosterNotFound));
  res.status(204).end();
});
