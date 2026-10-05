import { Router, type Request } from "express";
import { MemoryStore } from "express-rate-limit";
import { z } from "zod";
import { requireAuth } from "../identity/auth.ts";
import { limiter } from "../identity/identity.routes.ts";
import { requirePermission } from "../rbac/rbac.ts";
import { rolesBody } from "../rbac/rbac.routes.ts";
import { requireTenant } from "./tenant.ts";
import * as tenancy from "./tenancy.service.ts";

// .strict(): tenant context never comes from the body, so organisationId/ownerId/userId are rejected (TENANT-004).
const createOrgBody = z.strictObject({ name: z.string().trim().min(1).max(200) });
const addMemberBody = z.strictObject({
  email: z.string().trim().toLowerCase().pipe(z.email().max(254)),
  roles: rolesBody.default(["staff"]),
});

// SPEC-GAP: no numbers specified. Keyed per authenticated user (runs after requireAuth), 15-min window.
// The member-add limit also bounds probing which emails have accounts.
// ponytail: in-memory store, same ceiling as identity's limits.
export const tenancyRateLimitStores = { createOrg: new MemoryStore(), addMember: new MemoryStore() };
const byUser = (req: Request) => `user:${req.auth!.userId}`;
const createOrgLimit = limiter(10, tenancyRateLimitStores.createOrg, byUser);
const addMemberLimit = limiter(30, tenancyRateLimitStores.addMember, byUser);

export const tenancyRouter = Router();

tenancyRouter.post("/orgs", requireAuth, createOrgLimit, async (req, res) => {
  const { name } = createOrgBody.parse(req.body);
  res.status(201).json(await tenancy.createOrganisation(req.auth!.userId, name));
});

tenancyRouter.get("/orgs", requireAuth, async (req, res) => {
  res.json({ organisations: await tenancy.listMyOrganisations(req.auth!.userId) });
});

// Everything under /orgs/:orgId is tenant-scoped. Later phases mount their routers the same way:
//   app.use("/orgs/:orgId/<module>", requireAuth, requireTenant, moduleRouter)
tenancyRouter.get("/orgs/:orgId", requireAuth, requireTenant, requirePermission("organisation.read"), async (req, res) => {
  res.json({ organisation: await tenancy.getOrganisation(req.tenant!.organisationId, req.auth!.userId) });
});

tenancyRouter.get("/orgs/:orgId/members", requireAuth, requireTenant, requirePermission("members.read"), async (req, res) => {
  res.json({ members: await tenancy.listMembers(req.tenant!.organisationId) });
});

tenancyRouter.post(
  "/orgs/:orgId/members",
  requireAuth,
  addMemberLimit,
  requireTenant,
  requirePermission("members.manage"),
  async (req, res) => {
    const { email, roles } = addMemberBody.parse(req.body);
    res.status(201).json({ member: await tenancy.addMember({ ...req.tenant!, userId: req.auth!.userId }, email, roles) });
  },
);
