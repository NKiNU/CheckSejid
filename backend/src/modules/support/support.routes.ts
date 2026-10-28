import { Router } from "express";
import { MemoryStore } from "express-rate-limit";
import { z } from "zod";
import { requireAuth } from "../identity/auth.ts";
import { limiter } from "../identity/identity.routes.ts";
import { requirePermission, requirePlatformAdmin } from "../rbac/rbac.ts";
import { requireOrgStatus, requireTenant } from "../tenancy/tenant.ts";
import * as support from "./support.service.ts";

// SPEC-GAP: no numbers specified. Per user, 15-min window. ponytail: in-memory, as the other modules.
export const supportRateLimitStores = { change: new MemoryStore() };
const changeLimit = limiter(60, supportRateLimitStores.change, (req) => `user:${req.auth!.userId}`);

const requestBody = z.strictObject({ organisationId: z.uuid(), reason: z.string().trim().min(1).max(500) });
const extendBody = z.strictObject({ minutes: z.number().int().min(1).max(60).default(60) });
const idParam = z.uuid();
const logQuery = z.strictObject({ limit: z.coerce.number().int().min(1).max(100).default(50) }); // SEC-006

export const supportRouter = Router();

// Platform admin side (ADR-015 §5, platform.support.access): file and follow requests. Reads no tenant data.
supportRouter.post("/platform/support/requests", requireAuth, requirePlatformAdmin, changeLimit, async (req, res) => {
  const b = requestBody.parse(req.body);
  res.status(201).json({ request: await support.requestAccess(req.auth!.userId, b.organisationId, b.reason) });
});
supportRouter.get("/platform/support/requests", requireAuth, requirePlatformAdmin, async (req, res) => {
  res.json({ requests: await support.adminRequests(req.auth!.userId) });
});

// Owner side. "organisation.ownership.transfer" is held by the owner only (ADR-015 §2), so it is the owner
// check; a support session never holds it (read keys only). Allowed in every organisation status, so an
// owner can still revoke access to a suspended organisation (route-declaration tests need both guards).
const ownerOnly = [requireTenant, requirePermission("organisation.ownership.transfer")];
const anyStatus = requireOrgStatus("DRAFT", "ONBOARDING", "ACTIVE", "SUSPENDED", "ARCHIVED");
const base = "/orgs/:orgId/support";

supportRouter.get(`${base}/requests`, requireAuth, ...ownerOnly, async (req, res) => {
  res.json({ requests: await support.ownerRequests(req.tenant!.organisationId) });
});
supportRouter.get(`${base}/log`, requireAuth, ...ownerOnly, async (req, res) => {
  const { limit } = logQuery.parse(req.query);
  res.json({ log: await support.ownerLog(req.tenant!.organisationId, limit) });
});

for (const verb of ["approve", "deny", "revoke", "extend"] as const) {
  supportRouter.post(`${base}/requests/:id/${verb}`, requireAuth, changeLimit, ...ownerOnly, anyStatus, async (req, res) => {
    const id = idParam.safeParse(req.params["id"]);
    if (!id.success) return void res.status(404).json({ error: { code: "SUPPORT_REQUEST_NOT_FOUND", message: "Support request not found" } });
    const owner = req.auth!.userId;
    const org = req.tenant!.organisationId;
    const request =
      verb === "extend" ? await support.extend(owner, org, id.data, extendBody.parse(req.body ?? {}).minutes) : await support[verb](owner, org, id.data);
    res.json({ request });
  });
}
