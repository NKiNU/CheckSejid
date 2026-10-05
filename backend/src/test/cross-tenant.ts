// TEST-ONLY helpers for cross-tenant isolation (TENANT-005, architecture/TENANT_DATA_ISOLATION.md).
// Every phase that adds tenant routes calls expectCrossTenantDenied for them.
// App code must not import from src/test/ (enforced by .oxlintrc.json no-restricted-imports).
import { randomUUID } from "node:crypto";
import request from "supertest";
import { expect } from "vitest";
import { app } from "../app.ts";
import { prisma } from "../db.ts";
import { signAccessToken } from "../modules/identity/auth.ts";

export type TestTenant = { userId: string; token: string; organisationId: string; membershipId: string };

export async function createUser(displayName = "Test User") {
  // Direct insert: avoids register rate limits and argon2 cost. The hash is never verified.
  const user = await prisma.user.create({
    data: { email: `user-${randomUUID()}@example.com`, passwordHash: "x", displayName },
  });
  return { userId: user.id, email: user.email, token: await signAccessToken(user.id) };
}

// A user who owns a fresh organisation, created through the real API.
export async function createTenant(name = "Test Organisation"): Promise<TestTenant> {
  const user = await createUser();
  const res = await request(app).post("/orgs").set("Authorization", `Bearer ${user.token}`).send({ name });
  expect(res.status).toBe(201);
  return {
    userId: user.userId,
    token: user.token,
    organisationId: res.body.organisation.id,
    membershipId: res.body.membership.id,
  };
}

export type TenantRoute = {
  method: "get" | "post" | "put" | "patch" | "delete";
  path: string;
  body?: object;
  // Error code the attacker must get. Foreign organisation in the path → the default.
  // ID guessing under the attacker's own organisation → the module's own not-found code.
  expectedCode?: string;
};

// Asserts each route is unreachable for `attacker`: 401 without a token, and 404 with the expected
// error code with the attacker's token (the code check stops a typo'd path passing via the generic
// 404). Build `routes` from the victim's organisation id (foreign tenant) and from victim resource
// ids placed under the attacker's own organisation (ID guessing). `snapshot` reads the victim's
// data; it must be identical before and after the attempts.
export async function expectCrossTenantDenied(
  attacker: Pick<TestTenant, "token">,
  routes: TenantRoute[],
  opts: { snapshot?: () => Promise<unknown> } = {},
) {
  const before = await opts.snapshot?.();
  for (const r of routes) {
    const label = `${r.method.toUpperCase()} ${r.path}`;
    const anon = await request(app)[r.method](r.path).send(r.body);
    expect(anon.status, `${label} without a token`).toBe(401);
    const res = await request(app)[r.method](r.path).set("Authorization", `Bearer ${attacker.token}`).send(r.body);
    expect(res.status, `${label} as another tenant`).toBe(404);
    expect(res.body.error?.code, `${label} error code`).toBe(r.expectedCode ?? "ORGANISATION_NOT_FOUND");
  }
  if (opts.snapshot) expect(await opts.snapshot(), "victim data changed").toEqual(before);
}
