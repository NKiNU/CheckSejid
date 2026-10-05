// ADR-015 — the canonical permission catalogue and the fixed role → permission mapping.
// RBAC-007: keys are added only by amending ADR-015. RBAC-002: code checks keys, never role names.
// Pure module (no DB), safe to import anywhere.

// §1 — 23 tenant keys.
export const PERMISSIONS = [
  "organisation.read",
  "organisation.update",
  "organisation.archive",
  "organisation.ownership.transfer",
  "members.read",
  "members.manage",
  "bulletin.manage",
  "bulletin.publish",
  "event.manage",
  "event.publish",
  "operations.read",
  "operations.manage",
  "finance.read",
  "finance.income.create",
  "finance.expense.create",
  "finance.collection.manage",
  "finance.budget.manage",
  "finance.category.manage",
  "finance.approve",
  "finance.void",
  "finance.audit.read",
  "billing.read",
  "billing.manage",
] as const;
export type Permission = (typeof PERMISSIONS)[number];

// §5 — 4 platform keys. Held only by the Platform Administrator, never by a tenant role (RBAC-012).
export const PLATFORM_PERMISSIONS = [
  "platform.organisations.read",
  "platform.organisations.suspend",
  "platform.organisations.archive",
  "platform.subscriptions.manage",
] as const;
export type PlatformPermission = (typeof PLATFORM_PERMISSIONS)[number];

// §2 — five fixed system roles (§3: no custom roles in MVP).
export const ROLES = ["owner", "admin", "treasurer", "committee", "staff"] as const;
export type RoleKey = (typeof ROLES)[number];
// `owner` is Organisation.ownerId and moves only by transfer; the others are MembershipRole rows.
export const ASSIGNABLE_ROLES = ["admin", "treasurer", "committee", "staff"] as const;
export type AssignableRole = (typeof ASSIGNABLE_ROLES)[number];

// §2 matrix. RBAC-014: finance.approve is owner + treasurer only.
export const ROLE_PERMISSIONS: Readonly<Record<RoleKey, readonly Permission[]>> = {
  owner: PERMISSIONS,
  admin: [
    "organisation.read",
    "organisation.update",
    "members.read",
    "members.manage",
    "bulletin.manage",
    "bulletin.publish",
    "event.manage",
    "event.publish",
    "operations.read",
    "operations.manage",
    "finance.read",
    "finance.audit.read",
    "billing.read",
  ],
  treasurer: [
    "organisation.read",
    "members.read",
    "operations.read",
    "finance.read",
    "finance.income.create",
    "finance.expense.create",
    "finance.collection.manage",
    "finance.budget.manage",
    "finance.category.manage",
    "finance.approve",
    "finance.void",
    "finance.audit.read",
  ],
  committee: [
    "organisation.read",
    "members.read",
    "bulletin.manage",
    "bulletin.publish",
    "event.manage",
    "event.publish",
    "operations.read",
    "operations.manage",
    "finance.read",
  ],
  staff: ["organisation.read", "members.read", "bulletin.manage", "event.manage", "operations.read"],
};

const KNOWN = new Set<string>(PERMISSIONS);
export const isPermission = (k: unknown): k is Permission => typeof k === "string" && KNOWN.has(k);

// Effective permissions = union over the membership's roles (ADR-015 §2 option B).
// Unknown role strings contribute nothing (fail closed, RBAC-010).
export function permissionsOf(roles: Iterable<string>): Set<Permission> {
  const out = new Set<Permission>();
  for (const r of roles) for (const p of ROLE_PERMISSIONS[r as RoleKey] ?? []) out.add(p);
  return out;
}

// §6 rule 3 (RBAC-009): an actor may grant or revoke a set of roles only if the union of that
// set's permissions is a subset of the actor's own permissions.
export function canGrant(actor: ReadonlySet<Permission>, roles: Iterable<string>): boolean {
  return [...permissionsOf(roles)].every((p) => actor.has(p));
}
