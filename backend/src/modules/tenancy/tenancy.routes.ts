import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../identity/auth.ts";
import { requireTenant } from "./tenant.ts";
import * as tenancy from "./tenancy.service.ts";

// .strict(): tenant context never comes from the body, so organisationId/ownerId/userId are rejected (TENANT-004).
const createOrgBody = z.strictObject({ name: z.string().trim().min(1).max(200) });
const addMemberBody = z.strictObject({ email: z.string().trim().toLowerCase().pipe(z.email().max(254)) });

export const tenancyRouter = Router();

tenancyRouter.post("/orgs", requireAuth, async (req, res) => {
  const { name } = createOrgBody.parse(req.body);
  res.status(201).json(await tenancy.createOrganisation(req.auth!.userId, name));
});

tenancyRouter.get("/orgs", requireAuth, async (req, res) => {
  res.json({ organisations: await tenancy.listMyOrganisations(req.auth!.userId) });
});

// Everything under /orgs/:orgId is tenant-scoped. Later phases mount their routers the same way:
//   app.use("/orgs/:orgId/<module>", requireAuth, requireTenant, moduleRouter)
tenancyRouter.get("/orgs/:orgId", requireAuth, requireTenant, async (req, res) => {
  res.json({ organisation: await tenancy.getOrganisation(req.tenant!.organisationId, req.auth!.userId) });
});

tenancyRouter.get("/orgs/:orgId/members", requireAuth, requireTenant, async (req, res) => {
  res.json({ members: await tenancy.listMembers(req.tenant!.organisationId) });
});

tenancyRouter.post("/orgs/:orgId/members", requireAuth, requireTenant, async (req, res) => {
  const { email } = addMemberBody.parse(req.body);
  res.status(201).json({ member: await tenancy.addMember(req.tenant!.organisationId, req.auth!.userId, email) });
});
