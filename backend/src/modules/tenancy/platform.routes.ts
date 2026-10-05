import { Router } from "express";
import { MemoryStore } from "express-rate-limit";
import { z } from "zod";
import { prisma } from "../../db.ts";
import { requireAuth } from "../identity/auth.ts";
import { limiter } from "../identity/identity.routes.ts";
import { requirePlatformAdmin } from "../rbac/rbac.ts";
import { transition } from "./tenancy.service.ts";
import { orgNotFound } from "./tenant.ts";

// ADR-016 §1 / ADR-015 §5: platform operations on organisations. API-only (no UI in Phase 04).
// SPEC-GAP: no numbers specified. Per authenticated user, 15-min window; ponytail: in-memory.
export const platformRateLimitStores = { change: new MemoryStore() };
const changeLimit = limiter(60, platformRateLimitStores.change, (req) => `user:${req.auth!.userId}`);

const reasonBody = z.strictObject({ reason: z.string().trim().min(1).max(500) });
const listQuery = z.strictObject({
  status: z.enum(["DRAFT", "ONBOARDING", "ACTIVE", "SUSPENDED", "ARCHIVED"]).optional(),
  cursor: z.uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20), // SEC-006
});

export const platformRouter = Router();
platformRouter.use("/platform", requireAuth, requirePlatformAdmin);

// Metadata only: no members, no tenant content. Keyset order (createdAt, id), cursor = last id.
platformRouter.get("/platform/organisations", async (req, res) => {
  const { status, cursor, limit } = listQuery.parse(req.query);
  const rows = await prisma.organisation.findMany({
    where: { ...(status && { status }) },
    select: {
      id: true,
      name: true,
      type: true,
      status: true,
      createdAt: true,
      owner: { select: { email: true, displayName: true } },
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take: limit + 1,
    ...(cursor && { cursor: { id: cursor }, skip: 1 }),
  });
  const page = rows.slice(0, limit);
  res.json({ organisations: page, nextCursor: rows.length > limit ? page[page.length - 1]!.id : null });
});

const actions = [
  ["suspend", ["ACTIVE"], "SUSPENDED"],
  ["reinstate", ["SUSPENDED"], "ACTIVE"],
  ["archive", ["ACTIVE", "SUSPENDED"], "ARCHIVED"],
] as const;
for (const [verb, from, to] of actions) {
  platformRouter.post(`/platform/organisations/:id/${verb}`, changeLimit, async (req, res) => {
    const id = z.uuid().safeParse(req.params["id"]);
    if (!id.success) throw orgNotFound(); // malformed = unknown
    const { reason } = reasonBody.parse(req.body);
    await prisma.$transaction((tx) => transition(tx, id.data, [...from], to, { userId: req.auth!.userId, platform: true }, reason));
    res.json({ organisation: { id: id.data, status: to } });
  });
}
