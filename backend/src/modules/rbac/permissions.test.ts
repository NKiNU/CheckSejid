import { describe, expect, it } from "vitest";
import { ADR, ADR_MATRIX } from "../../test/adr-015.ts";
import { canGrant, PERMISSIONS, PLATFORM_PERMISSIONS, permissionsOf, ROLE_PERMISSIONS, ROLES } from "./permissions.ts";

describe("ADR-015 catalogue and matrix", () => {
  it("RBAC-001: the five fixed roles, in the ADR's order", () => {
    expect(ADR_MATRIX.roles).toEqual([...ROLES]);
  });

  it("RBAC-007: exactly the 23 tenant keys of ADR-015 §1/§2", () => {
    expect(PERMISSIONS).toHaveLength(23);
    expect(ADR_MATRIX.keys).toEqual([...PERMISSIONS]);
    for (const k of PERMISSIONS) expect(ADR, k).toContain(`| \`${k}\` |`);
  });

  it("RBAC-007: exactly the 4 platform keys of ADR-015 §5, none of them held by a tenant role (RBAC-006/012)", () => {
    expect(PLATFORM_PERMISSIONS).toHaveLength(4);
    for (const k of PLATFORM_PERMISSIONS) expect(ADR, k).toContain(`| \`${k}\` |`);
    const tenantHeld = new Set(ROLES.flatMap((r) => [...ROLE_PERMISSIONS[r]]));
    for (const k of PLATFORM_PERMISSIONS) expect(tenantHeld.has(k as never), k).toBe(false);
  });

  it.each(ROLES)("RBAC-002: role %s holds exactly the ADR-015 §2 keys", (role) => {
    expect([...ROLE_PERMISSIONS[role]].sort()).toEqual([...ADR_MATRIX.matrix.get(role)!].sort());
  });

  it("RBAC-014: finance.approve is held by owner and treasurer only", () => {
    expect(ROLES.filter((r) => ROLE_PERMISSIONS[r].includes("finance.approve"))).toEqual(["owner", "treasurer"]);
  });

  it("several roles per membership: effective permissions are the union", () => {
    const p = permissionsOf(["treasurer", "staff"]);
    expect(p.has("finance.approve")).toBe(true);
    expect(p.has("bulletin.manage")).toBe(true);
    expect(p.has("bulletin.publish")).toBe(false);
  });

  it("RBAC-010: unknown roles grant nothing", () => {
    expect(permissionsOf(["superuser", "OWNER", ""]).size).toBe(0);
  });

  it("RBAC-009 subset rule: admin cannot grant treasurer or owner; owner can grant anything", () => {
    const admin = permissionsOf(["admin"]);
    expect(canGrant(admin, ["staff", "committee", "admin"])).toBe(true);
    expect(canGrant(admin, ["treasurer"])).toBe(false);
    expect(canGrant(admin, ["owner"])).toBe(false);
    expect(canGrant(permissionsOf(["owner"]), ["admin", "treasurer", "committee", "staff"])).toBe(true);
    expect(canGrant(permissionsOf(["committee"]), ["admin"])).toBe(false);
  });
});
