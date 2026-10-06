import { Router, type Request } from "express";
import { MemoryStore } from "express-rate-limit";
import { z } from "zod";
import { IMAGE_TYPES, MB, checkUpload, rawUpload } from "../../uploads.ts";
import { optionalAuth, requireAuth } from "../identity/auth.ts";
import { limiter } from "../identity/identity.routes.ts";
import { requirePermission } from "../rbac/rbac.ts";
import { requireTenant, requireWritableOrg } from "../tenancy/tenant.ts";
import * as pub from "./public.service.ts";

// SPEC-GAP: no numbers specified. Anonymous reads are keyed per IP, follow changes and uploads per user.
export const publicRateLimitStores = { read: new MemoryStore(), follow: new MemoryStore(), upload: new MemoryStore() };
const byUser = (req: Request) => `user:${req.auth!.userId}`;
const readLimit = limiter(600, publicRateLimitStores.read);
const followLimit = limiter(120, publicRateLimitStores.follow, byUser);
const uploadLimit = limiter(30, publicRateLimitStores.upload, byUser);

export const discoverQuery = z.strictObject({
  q: z.string().trim().min(1).max(100).optional(),
  type: z.enum(["masjid", "surau", "madrasah", "school", "ngo", "other"]).optional(),
  state: z.string().trim().min(1).max(100).optional(),
  country: z.string().regex(/^[A-Z]{2}$/).optional(),
  cursor: z.uuid().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

const IMAGE_LIMIT = 2 * MB; // ADR-020 §1

export const publicRouter = Router();

publicRouter.get("/public/orgs", readLimit, async (req, res) => {
  res.json(await pub.discover(discoverQuery.parse(req.query)));
});

publicRouter.get("/public/orgs/:orgId", readLimit, optionalAuth, async (req, res) => {
  res.json({ organisation: await pub.getPublicOrganisation(req.params["orgId"] as string, req.auth?.userId) });
});

// Self-scoped (ADR-015 §1: acting on your own record needs no permission).
publicRouter.get("/me/follows", requireAuth, async (req, res) => {
  res.json({ organisations: await pub.listFollows(req.auth!.userId) });
});

publicRouter.put("/me/follows/:orgId", requireAuth, followLimit, async (req, res) => {
  await pub.follow(req.auth!.userId, req.params["orgId"] as string);
  res.status(204).end();
});

publicRouter.delete("/me/follows/:orgId", requireAuth, followLimit, async (req, res) => {
  await pub.unfollow(req.auth!.userId, req.params["orgId"] as string);
  res.status(204).end();
});

// ADR-020: logo and cover. Guards run before the body is read.
for (const [path, field] of [["logo", "logoKey"], ["cover", "coverKey"]] as const) {
  publicRouter.put(
    `/orgs/:orgId/${path}`,
    requireAuth,
    uploadLimit,
    requireTenant,
    requirePermission("organisation.update"),
    requireWritableOrg,
    rawUpload(IMAGE_LIMIT),
    async (req, res) => {
      const file = checkUpload(req.body, IMAGE_TYPES);
      res.json(await pub.setProfileImage(req.tenant!.organisationId, req.auth!.userId, field, file));
    },
  );
  publicRouter.delete(
    `/orgs/:orgId/${path}`,
    requireAuth,
    uploadLimit,
    requireTenant,
    requirePermission("organisation.update"),
    requireWritableOrg,
    async (req, res) => {
      await pub.setProfileImage(req.tenant!.organisationId, req.auth!.userId, field, null);
      res.status(204).end();
    },
  );
}
