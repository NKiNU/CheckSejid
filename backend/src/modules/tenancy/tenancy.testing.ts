// Test-only helpers for cross-tenant isolation (TENANT-005, architecture/TENANT_DATA_ISOLATION.md).
// Every phase that adds tenant routes calls expectCrossTenantDenied for them. Never import from app code.
import { randomUUID } from "node:crypto";
import request from "supertest";
import { expect } from "vitest";
import { app } from "../../app.ts";
import { prisma } from "../../db.ts";
import { signAccessToken } from "../identity/auth.ts";

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
};

// Asserts each route is unreachable for `attacker`: 401 without a token, and 404 with the
// attacker's token (existence is not leaked — no 403). Build `routes` from the victim's
// organisation id (foreign tenant) and from victim resource ids placed under the attacker's
// own organisation (ID guessing). Afterwards, also assert the victim's data is unchanged.
export async function expectCrossTenantDenied(attacker: Pick<TestTenant, "token">, routes: TenantRoute[]) {
  for (const r of routes) {
    const label = `${r.method.toUpperCase()} ${r.path}`;
    const anon = await request(app)[r.method](r.path).send(r.body);
    expect(anon.status, `${label} without a token`).toBe(401);
    const res = await request(app)[r.method](r.path).set("Authorization", `Bearer ${attacker.token}`).send(r.body);
    expect(res.status, `${label} as another tenant`).toBe(404);
  }
}
