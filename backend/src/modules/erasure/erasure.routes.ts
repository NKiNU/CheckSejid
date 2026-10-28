import { Router } from "express";
import { MemoryStore } from "express-rate-limit";
import { z } from "zod";
import { requireAuth } from "../identity/auth.ts";
import { limiter } from "../identity/identity.routes.ts";
import { requirePermission } from "../rbac/rbac.ts";
import { requireOrgStatus, requireTenant } from "../tenancy/tenant.ts";
import * as erasure from "./erasure.service.ts";

const passwordBody = z.strictObject({ password: z.string().min(1).max(128) });
const retentionBody = z.strictObject({ years: z.union([z.literal(1), z.literal(3), z.literal(5), z.literal(7), z.null()]) });

// Guards password guessing, keyed per user like the password change.
export const erasureRateLimitStores = { request: new MemoryStore() };
const requestLimit = limiter(10, erasureRateLimitStores.request, (req) => `user:${req.auth!.userId}`);

// ADR-031 §8: owner-only (organisation.archive is the owner's key), no entitlement guard, and a lifecycle
// guard that admits every state, so a suspended, archived or lapsed organisation can still be erased.
// (Declared explicitly so the "every tenant write route is lifecycle-guarded" test sees the decision.)
const anyState = requireOrgStatus("DRAFT", "ONBOARDING", "ACTIVE", "SUSPENDED", "ARCHIVED");
const ownerOnly = [requireAuth, requireTenant, requirePermission("organisation.archive"), anyState] as const;

export const erasureRouter = Router();

erasureRouter.post("/orgs/:orgId/erasure", requireAuth, requestLimit, requireTenant, requirePermission("organisation.archive"), anyState, async (req, res) => {
  const { password } = passwordBody.parse(req.body);
  res.status(201).json({ request: await erasure.requestOrganisationErasure(req.tenant!.organisationId, req.auth!.userId, password) });
});
erasureRouter.get("/orgs/:orgId/erasure", ...ownerOnly, async (req, res) => {
  res.json({ request: await erasure.currentErasure("ORGANISATION", req.tenant!.organisationId) });
});
erasureRouter.delete("/orgs/:orgId/erasure", ...ownerOnly, async (req, res) => {
  res.json({ request: await erasure.cancelErasure("ORGANISATION", req.tenant!.organisationId, req.auth!.userId) });
});
erasureRouter.post("/orgs/:orgId/erasure/retry", ...ownerOnly, async (req, res) => {
  res.json({ request: await erasure.retryErasure("ORGANISATION", req.tenant!.organisationId) });
});

erasureRouter.get("/orgs/:orgId/retention", ...ownerOnly, async (req, res) => {
  res.json({ years: await erasure.getRetention(req.tenant!.organisationId) });
});
erasureRouter.put("/orgs/:orgId/retention", ...ownerOnly, async (req, res) => {
  const { years } = retentionBody.parse(req.body);
  res.json({ years: await erasure.setRetention(req.tenant!.organisationId, years) });
});

// Account erasure: the caller's own account only; the subject is never taken from the client.
erasureRouter.post("/me/erasure", requireAuth, requestLimit, async (req, res) => {
  const { password } = passwordBody.parse(req.body);
  res.status(201).json({ request: await erasure.requestUserErasure(req.auth!.userId, password) });
});
erasureRouter.get("/me/erasure", requireAuth, async (req, res) => {
  res.json({ request: await erasure.currentErasure("USER", req.auth!.userId) });
});
erasureRouter.delete("/me/erasure", requireAuth, async (req, res) => {
  res.json({ request: await erasure.cancelErasure("USER", req.auth!.userId, req.auth!.userId) });
});
erasureRouter.post("/me/erasure/retry", requireAuth, async (req, res) => {
  res.json({ request: await erasure.retryErasure("USER", req.auth!.userId) });
});
