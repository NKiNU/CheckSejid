import { Router, type Request, type RequestHandler } from "express";
import { MemoryStore } from "express-rate-limit";
import { z } from "zod";
import { optionalAuth, requireAuth } from "../identity/auth.ts";
import { limiter } from "../identity/identity.routes.ts";
import type { Permission } from "../rbac/permissions.ts";
import { hasPermission, requirePermission } from "../rbac/rbac.ts";
import { requireActiveOrg, requireOrgStatus, requireTenant } from "../tenancy/tenant.ts";
import * as hub from "./hub.service.ts";

// ADR-016 §2: module writes need ACTIVE; reads stay available while SUSPENDED or ARCHIVED.
// No entitlement guard: the hub is on every plan (ADR-018 §1).
export const requireReadableModule = requireOrgStatus("ACTIVE", "SUSPENDED", "ARCHIVED");

export const hubRateLimitStores = { write: new MemoryStore(), read: new MemoryStore() };
const writeLimit = limiter(300, hubRateLimitStores.write, (req: Request) => `user:${req.auth!.userId}`);
const readLimit = limiter(600, hubRateLimitStores.read);

const page = z.strictObject({ cursor: z.uuid().optional(), limit: z.coerce.number().int().min(1).max(50).default(20) });
const listQuery = page.extend({ status: z.enum(["DRAFT", "PUBLISHED", "ARCHIVED"]).optional() });
const id = z.uuid();

const title = z.string().trim().min(1).max(200);
const text = z.string().trim().max(20000);
const instant = z.iso.datetime({ offset: true }).transform((s) => new Date(s)); // stored UTC (LOC-003)
const postBody = z.strictObject({ title, body: text.min(1) });
const eventBody = z.strictObject({
  title,
  description: text.default(""),
  startsAt: instant,
  endsAt: instant,
  location: z.string().trim().max(300).nullable().default(null),
});
const nonEmpty = <T extends z.ZodObject>(s: T) => s.partial().refine((b) => Object.keys(b).length > 0, "Nothing to change");
const patchBody = { post: nonEmpty(postBody), event: nonEmpty(eventBody.extend({ description: text, location: z.string().trim().max(300).nullable() })) };
const createBody = { post: postBody, event: eventBody };

const KEYS: Record<hub.Kind, { manage: Permission; publish: Permission }> = {
  post: { manage: "bulletin.manage", publish: "bulletin.publish" },
  event: { manage: "event.manage", publish: "event.publish" },
};

const actor = (req: Request): hub.Actor => ({ organisationId: req.tenant!.organisationId, userId: req.auth!.userId });
const itemId = (req: Request, kind: hub.Kind) => {
  const v = req.params["id"];
  if (!id.safeParse(v).success) throw hub.contentNotFound(kind);
  return v as string;
};

export const hubRouter = Router();

for (const kind of ["post", "event"] as const) {
  const base = `/orgs/:orgId/hub/${kind}s`;
  const { manage, publish } = KEYS[kind];
  const tenantRead: RequestHandler[] = [requireAuth, requireTenant, requirePermission("organisation.read"), requireReadableModule];
  const tenantWrite = (key: Permission): RequestHandler[] => [requireAuth, writeLimit, requireTenant, requirePermission(key), requireActiveOrg];

  hubRouter.get(base, ...tenantRead, async (req, res) => {
    const q = listQuery.parse(req.query);
    const { items, nextCursor } = await hub.list(req.tenant!.organisationId, kind, { ...q, canSeeDrafts: await hasPermission(req.tenant!, manage) });
    res.json({ [`${kind}s`]: items, nextCursor });
  });

  hubRouter.get(`${base}/:id`, ...tenantRead, async (req, res) => {
    res.json({ [kind]: await hub.get(req.tenant!.organisationId, kind, itemId(req, kind), await hasPermission(req.tenant!, manage)) });
  });

  hubRouter.post(base, ...tenantWrite(manage), async (req, res) => {
    res.status(201).json({ [kind]: await hub.create(actor(req), kind, createBody[kind].parse(req.body) as never) });
  });

  hubRouter.patch(`${base}/:id`, ...tenantWrite(manage), async (req, res) => {
    const target = itemId(req, kind);
    res.json({ [kind]: await hub.update(actor(req), kind, target, patchBody[kind].parse(req.body) as never) });
  });

  hubRouter.delete(`${base}/:id`, ...tenantWrite(manage), async (req, res) => {
    await hub.remove(actor(req), kind, itemId(req, kind));
    res.status(204).end();
  });

  for (const action of ["publish", "archive"] as const) {
    hubRouter.post(`${base}/:id/${action}`, ...tenantWrite(publish), async (req, res) => {
      res.json({ [kind]: await hub.transition(actor(req), kind, itemId(req, kind), action) });
    });
  }
}

// Public (HUB-004/005, ADR-019): published content only, behind the visibility rule.
hubRouter.get("/public/orgs/:orgId/posts", readLimit, optionalAuth, async (req, res) => {
  res.json(await hub.publicPosts(req.params["orgId"] as string, req.auth?.userId, page.parse(req.query)));
});
hubRouter.get("/public/orgs/:orgId/events", readLimit, optionalAuth, async (req, res) => {
  res.json(await hub.publicEvents(req.params["orgId"] as string, req.auth?.userId, page.parse(req.query)));
});

hubRouter.get("/me/feed", requireAuth, async (req, res) => {
  res.json(await hub.feed(req.auth!.userId));
});
