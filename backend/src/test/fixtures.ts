// TEST-ONLY fixtures shared by the Phase 05–09 integration tests.
import request from "supertest";
import { expect } from "vitest";
import type { MemoryStore } from "express-rate-limit";
import { app } from "../app.ts";
import { prisma } from "../db.ts";
import { createTenant, createUser, type TestTenant } from "./cross-tenant.ts";

export const as = (t: { token: string }) => ({ Authorization: `Bearer ${t.token}` });

// An organisation taken through onboarding by its owner (ADR-016), with the given visibility (ADR-019).
export async function activeTenant(name = "Test Organisation", visibility: "PUBLIC" | "UNLISTED" | "PRIVATE" = "PRIVATE", extra: object = {}) {
  const t = await createTenant(name);
  await request(app)
    .patch(`/orgs/${t.organisationId}`)
    .set(as(t))
    .send({ type: "masjid", state: "Selangor", country: "MY", visibility, ...extra })
    .expect(200);
  await request(app).post(`/orgs/${t.organisationId}/onboarding/complete`).set(as(t)).expect(200);
  return t;
}

// Adds a new user to `t` with the given roles, through the real API.
export async function addMember(t: TestTenant, roles: string[] = ["staff"]) {
  const u = await createUser();
  const res = await request(app).post(`/orgs/${t.organisationId}/members`).set(as(t)).send({ email: u.email, roles });
  expect(res.status).toBe(201);
  return { ...u, organisationId: t.organisationId, membershipId: res.body.member.id as string };
}

export const setOrgStatus = (t: Pick<TestTenant, "organisationId">, status: "ACTIVE" | "SUSPENDED" | "ARCHIVED") =>
  prisma.organisation.update({ where: { id: t.organisationId }, data: { status } });

export const resetStores = (...groups: Record<string, MemoryStore>[]) =>
  Promise.all(groups.flatMap((g) => Object.values(g)).map((s) => s.resetAll()));
