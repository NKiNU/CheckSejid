import { Router, type Request } from "express";
import { MemoryStore } from "express-rate-limit";
import { z } from "zod";
import { requireAuth } from "../identity/auth.ts";
import { limiter } from "../identity/identity.routes.ts";
import { requirePermission } from "../rbac/rbac.ts";
import { rolesBody } from "../rbac/rbac.routes.ts";
import { addMember } from "../rbac/rbac.service.ts";
import { requireTenant, requireWritableOrg } from "./tenant.ts";
import * as tenancy from "./tenancy.service.ts";

// .strict(): tenant context never comes from the body, so organisationId/ownerId/userId are rejected (TENANT-004).
const createOrgBody = z.strictObject({ name: z.string().trim().min(1).max(200) });
const addMemberBody = z.strictObject({
  email: z.string().trim().toLowerCase().pipe(z.email().max(254)),
  roles: rolesBody.default(["staff"]),
});

// ADR-016 §3. Every field optional; null clears (except name). .strict(): no status/organisationId/ownerId.
const httpUrl = z.url({ protocol: /^https?$/ }).max(2000);
const nullable = <T extends z.ZodType>(t: T) => t.nullable().optional();
// type/state/country are required to complete onboarding, so they may be changed but not cleared.
const profileBody = z
  .strictObject({
    name: z.string().trim().min(1).max(200).optional(),
    type: z.enum(["masjid", "surau", "madrasah", "school", "ngo", "other"]).optional(),
    description: nullable(z.string().trim().max(2000)),
    contactEmail: nullable(z.string().trim().toLowerCase().pipe(z.email().max(254))),
    contactPhone: nullable(z.string().trim().max(30)),
    addressLine: nullable(z.string().trim().max(300)),
    state: z.string().trim().min(1).max(100).optional(),
    country: z.string().regex(/^[A-Z]{2}$/).optional(),
    links: nullable(z.array(z.strictObject({ label: z.string().trim().min(1).max(100), url: httpUrl })).max(10)),
  })
  .refine((b) => Object.keys(b).length > 0, "Nothing to change");
const archiveBody = z.strictObject({ reason: z.string().trim().min(1).max(500).optional() });

// SPEC-GAP: no numbers specified. Keyed per authenticated user (runs after requireAuth), 15-min window.
// The member-add limit also bounds probing which emails have accounts.
// ponytail: in-memory store, same ceiling as identity's limits.
export const tenancyRateLimitStores = { createOrg: new MemoryStore(), addMember: new MemoryStore(), orgChange: new MemoryStore() };
const byUser = (req: Request) => `user:${req.auth!.userId}`;
const createOrgLimit = limiter(10, tenancyRateLimitStores.createOrg, byUser);
const addMemberLimit = limiter(30, tenancyRateLimitStores.addMember, byUser);
const orgChangeLimit = limiter(60, tenancyRateLimitStores.orgChange, byUser); // profile, onboarding, archive

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
  requireWritableOrg,
  async (req, res) => {
    const { email, roles } = addMemberBody.parse(req.body);
    res.status(201).json({ member: await addMember({ ...req.tenant!, userId: req.auth!.userId }, email, roles) });
  },
);

// ORG-007/008/009. Writes are lifecycle-guarded (requireWritableOrg) after the permission check.
tenancyRouter.patch(
  "/orgs/:orgId",
  requireAuth,
  orgChangeLimit,
  requireTenant,
  requirePermission("organisation.update"),
  requireWritableOrg,
  async (req, res) => {
    const change = profileBody.parse(req.body) as tenancy.ProfileChange;
    res.json({ organisation: await tenancy.updateProfile(req.tenant!.organisationId, req.auth!.userId, change) });
  },
);

tenancyRouter.post(
  "/orgs/:orgId/onboarding/complete",
  requireAuth,
  orgChangeLimit,
  requireTenant,
  requirePermission("organisation.update"),
  requireWritableOrg,
  async (req, res) => {
    res.json({ organisation: await tenancy.completeOnboarding(req.tenant!.organisationId, req.auth!.userId) });
  },
);

// No lifecycle guard: archiving is allowed from SUSPENDED, and the transition itself rejects other states.
tenancyRouter.post(
  "/orgs/:orgId/archive",
  requireAuth,
  orgChangeLimit,
  requireTenant,
  requirePermission("organisation.archive"),
  async (req, res) => {
    const { reason } = archiveBody.parse(req.body ?? {});
    res.json({ organisation: await tenancy.archiveOrganisation(req.tenant!.organisationId, req.auth!.userId, reason) });
  },
);
