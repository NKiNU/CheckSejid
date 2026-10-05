import { Router, type Request } from "express";
import { z } from "zod";
import { requireAuth } from "../identity/auth.ts";
import { requireTenant } from "../tenancy/tenant.ts";
import { PERMISSIONS, permissionsOf, ROLES, type AssignableRole } from "./permissions.ts";
import { membershipRoles, requirePermission } from "./rbac.ts";
import * as rbac from "./rbac.service.ts";

// Role keys from the client are only a request; every rule is checked server-side (RBAC-009).
export const rolesBody = z
  .array(z.enum(ROLES))
  .max(ROLES.length)
  .refine((r) => !r.includes("owner"), "The owner role is granted only by ownership transfer")
  .transform((r) => [...new Set(r)] as AssignableRole[]);

const updateMemberBody = z
  .strictObject({ roles: rolesBody.optional(), title: z.string().trim().min(1).max(100).nullable().optional() })
  .refine((b) => b.roles !== undefined || b.title !== undefined, "Nothing to change");
const transferBody = z.strictObject({ membershipId: z.uuid() });

const actor = (req: Request): rbac.Actor => ({ ...req.tenant!, userId: req.auth!.userId });
// Malformed ids are the same 404 as unknown/foreign ones.
const memberId = (req: Request) => {
  const id = z.uuid().safeParse(req.params["membershipId"]);
  if (!id.success) throw rbac.memberNotFound();
  return id.data;
};

export const rbacRouter = Router();
const tenant = [requireAuth, requireTenant];

// RBAC-005: the caller's effective keys in this organisation, for hiding UI only (AUTH-003).
rbacRouter.get("/orgs/:orgId/me/permissions", ...tenant, async (req, res) => {
  const roles = await membershipRoles(req.tenant!);
  const held = permissionsOf(roles);
  res.json({ roles, permissions: PERMISSIONS.filter((p) => held.has(p)) });
});

rbacRouter.patch("/orgs/:orgId/members/:membershipId", ...tenant, requirePermission("members.manage"), async (req, res) => {
  const id = memberId(req);
  res.json({ member: await rbac.updateMember(actor(req), id, updateMemberBody.parse(req.body)) });
});

rbacRouter.delete("/orgs/:orgId/members/:membershipId", ...tenant, requirePermission("members.manage"), async (req, res) => {
  await rbac.removeMember(actor(req), memberId(req));
  res.status(204).end();
});

// RBAC-013: self-scoped, so no permission key (declared in the route-declaration test's allow-list).
rbacRouter.post("/orgs/:orgId/leave", ...tenant, async (req, res) => {
  await rbac.leave(actor(req));
  res.status(204).end();
});

rbacRouter.post(
  "/orgs/:orgId/ownership/transfer",
  ...tenant,
  requirePermission("organisation.ownership.transfer"),
  async (req, res) => {
    const { membershipId } = transferBody.parse(req.body);
    res.json({ members: await rbac.transferOwnership(actor(req), membershipId) });
  },
);
