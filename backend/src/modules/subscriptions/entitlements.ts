// The central entitlement gate (ADR-018, SAAS-002/005/006/007, RBAC-004). Modules ask by catalogue key
// (requireEntitlement / assertQuota); nothing outside this file looks at a plan's key or name.
import type { RequestHandler } from "express";
import type { Prisma, SubscriptionStatus } from "../../../generated/prisma/client.ts";
import { prisma } from "../../db.ts";
import { HttpError } from "../../errors.ts";
import { forTenant, orgNotFound } from "../tenancy/tenant.ts";

// ADR-018 §1: the catalogue (keys) lives in code; each plan's values live in Plan.entitlements (DB).
// Not gated on any plan (ADR-015 §4, ADR-018 §1): organisation.*, members.read, member removal,
// billing.*, the public profile, the information hub and Islamic features.
export const FEATURES = ["operations", "finance", "finance.reporting"] as const;
export const QUOTAS = ["members.max"] as const;
export type Feature = (typeof FEATURES)[number];
export type Quota = (typeof QUOTAS)[number];
export type Entitlements = Record<Feature, boolean> & Record<Quota, number | null>;

export const TRIAL_DAYS = 30; // SAAS-003
export const TRIAL_PLAN = "professional"; // ADR-018 §2: the trial grants Professional
const FALLBACK_PLAN = "free"; // ADR-018 §2: EXPIRED/CANCELLED fall back to Free

// ADR-018 §3: a TRIAL past trialEndsAt is EXPIRED, computed on read (persisted by the next subscription write).
export function effectiveStatus(s: { status: SubscriptionStatus; trialEndsAt: Date | null }, now = new Date()): SubscriptionStatus {
  return s.status === "TRIAL" && s.trialEndsAt !== null && s.trialEndsAt <= now ? "EXPIRED" : s.status;
}

// Fail closed: a feature is on only if exactly `true`; a quota is unlimited only if exactly `null`,
// and a missing or malformed quota is 0.
function parse(raw: Prisma.JsonValue): Entitlements {
  const o = (raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {}) as Record<string, unknown>;
  const quota = (v: unknown) => (v === null ? null : Number.isInteger(v) && (v as number) >= 0 ? (v as number) : 0);
  return Object.fromEntries([...FEATURES.map((f) => [f, o[f] === true]), ...QUOTAS.map((q) => [q, quota(o[q])])]) as Entitlements;
}

// The organisation's effective subscription: effective status, the plan whose entitlements apply
// (PAST_DUE keeps the paid plan as grace; EXPIRED/CANCELLED get Free) and those entitlements.
export async function subscriptionOf(organisationId: string, db: Prisma.TransactionClient = prisma) {
  const sub = await forTenant(organisationId, db).subscription.findUnique({
    where: { organisationId },
    select: { planKey: true, status: true, trialEndsAt: true },
  });
  const status = sub ? effectiveStatus(sub) : "EXPIRED"; // no row: fail closed to Free
  const planKey = sub && status !== "EXPIRED" && status !== "CANCELLED" ? sub.planKey : FALLBACK_PLAN;
  const plan = await db.plan.findUniqueOrThrow({ where: { key: planKey } });
  return { plan: { key: plan.key, name: plan.name }, status, trialEndsAt: sub?.trialEndsAt ?? null, entitlements: parse(plan.entitlements) };
}

// Distinct from FORBIDDEN (ADR-015 §4) so the UI can say "upgrade your plan", not "ask your owner".
export const entitlementRequired = (feature: Feature) =>
  new HttpError(403, "ENTITLEMENT_REQUIRED", `Your plan does not include ${feature}. Upgrade your plan to use it.`);

// Route guard, chained AFTER requirePermission (both must pass, RBAC-004):
//   router.post(path, requireAuth, requireTenant, requirePermission("finance.expense.create"), requireEntitlement("finance"), h)
// Read per request, so an activation or lapse takes effect on the next request.
export function requireEntitlement(feature: Feature): RequestHandler {
  if (!FEATURES.includes(feature)) throw new Error(`requireEntitlement: unknown feature "${feature}"`);
  const guard: RequestHandler = async (req, _res, next) => {
    if (!req.tenant) return next(orgNotFound()); // mounted without requireTenant: fail closed
    next((await subscriptionOf(req.tenant.organisationId)).entitlements[feature] ? undefined : entitlementRequired(feature));
  };
  // Lets a route-declaration test find which feature gates a route.
  return Object.assign(guard, { entitlement: feature });
}

// Numeric limits. Call inside the write's transaction, under a lock that serialises the counted rows
// (e.g. rbac.service lockedOrg), with the current count. Existing rows above the limit are kept.
export async function assertQuota(tx: Prisma.TransactionClient, organisationId: string, quota: Quota, current: number) {
  const limit = (await subscriptionOf(organisationId, tx)).entitlements[quota];
  if (limit !== null && current >= limit) {
    throw new HttpError(403, "QUOTA_EXCEEDED", `Your plan allows ${limit} (${quota}). Upgrade your plan to add more.`);
  }
}
