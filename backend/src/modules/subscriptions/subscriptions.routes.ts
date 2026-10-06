import { Router } from "express";
import { requireAuth } from "../identity/auth.ts";
import { requirePermission } from "../rbac/rbac.ts";
import { requireTenant } from "../tenancy/tenant.ts";
import { subscriptionOf } from "./entitlements.ts";

// Tenant view of the organisation's own subscription (ADR-015 billing.read). Never entitlement- or
// lifecycle-gated: an organisation can always see its plan (ADR-015 §4). Platform transitions are in
// tenancy/platform.routes.ts behind requirePlatformAdmin.
export const subscriptionsRouter = Router();

subscriptionsRouter.get("/orgs/:orgId/subscription", requireAuth, requireTenant, requirePermission("billing.read"), async (req, res) => {
  res.json({ subscription: await subscriptionOf(req.tenant!.organisationId) });
});
