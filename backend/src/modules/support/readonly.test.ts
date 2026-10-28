import { describe, expect, it } from "vitest";
import { PERMISSIONS } from "../rbac/permissions.ts";
import { supportCan } from "./readonly.ts";

// A new "*.read" key must be decided here: allowed in readonly.ts, or listed as denied below.
const denied: string[] = [];

describe("support read-only set (ADR-032 §4)", () => {
  it("every *.read permission is either allowed for support or explicitly denied", () => {
    const undecided = PERMISSIONS.filter((k) => k.endsWith(".read") && !supportCan(k) && !denied.includes(k));
    expect(undecided).toEqual([]);
  });
  it("no write key is allowed", () => {
    expect(PERMISSIONS.filter((k) => !k.endsWith(".read") && supportCan(k))).toEqual([]);
  });
});
