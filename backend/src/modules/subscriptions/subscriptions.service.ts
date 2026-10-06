// Subscription lifecycle (ADR-018, SAAS-009/010). Billing of the organisation by Masyarakat: a separate
// domain from organisation finance (SAAS-001) — nothing here reads or writes finance data.
import type { Prisma, SubscriptionStatus } from "../../../generated/prisma/client.ts";
import { HttpError } from "../../errors.ts";
import { notify } from "../notifications/notifications.service.ts";
import { platformAudit } from "../rbac/rbac.ts";
import { forTenant, orgNotFound } from "../tenancy/tenant.ts";

// ADR-018 §3/§4. TRIAL → EXPIRED is automatic (lazy, see below), so no action produces it from TRIAL.
// `activate` covers TRIAL → ACTIVE, PAST_DUE → ACTIVE, resubscribe from EXPIRED/CANCELLED, and a plan
// change while ACTIVE.
export const SUBSCRIPTION_ACTIONS = {
  activate: { from: ["TRIAL", "ACTIVE", "PAST_DUE", "EXPIRED", "CANCELLED"], to: "ACTIVE" },
  "past-due": { from: ["ACTIVE"], to: "PAST_DUE" },
  cancel: { from: ["ACTIVE"], to: "CANCELLED" },
  expire: { from: ["PAST_DUE"], to: "EXPIRED" },
} as const satisfies Record<string, { from: SubscriptionStatus[]; to: SubscriptionStatus }>;
export type SubscriptionAction = keyof typeof SUBSCRIPTION_ACTIONS;

// SAAS-010: the ONLY place Subscription.status/planKey change. Platform admin routes call it today; a
// future payment-provider adapter maps its own events onto these actions and calls it too (no provider
// interface until there is a provider). Runs in the caller's transaction: audit + notification commit
// or roll back with the change.
export async function transitionSubscription(
  tx: Prisma.TransactionClient,
  organisationId: string,
  action: SubscriptionAction,
  actor: { userId: string },
  reason: string,
  planKey?: string,
) {
  const { from, to } = SUBSCRIPTION_ACTIONS[action];
  // Serialises concurrent transitions of this subscription; no row = unknown organisation.
  const locked = await tx.$queryRaw<unknown[]>`SELECT 1 FROM "Subscription" WHERE "organisationId" = ${organisationId}::uuid FOR UPDATE`;
  if (locked.length === 0) throw orgNotFound();
  const db = forTenant(organisationId, tx);
  // ponytail: lazy trial expiry — persisted here, at the start of any subscription write; reads compute
  // it (entitlements.effectiveStatus). Add a scheduled job if something must happen at the moment a trial ends.
  await db.subscription.updateMany({ where: { status: "TRIAL", trialEndsAt: { lte: new Date() } }, data: { status: "EXPIRED" } });
  const before = await db.subscription.findUniqueOrThrow({ where: { organisationId } });
  if (!(from as readonly SubscriptionStatus[]).includes(before.status)) {
    throw new HttpError(409, "INVALID_STATE_TRANSITION", `Cannot change a subscription from ${before.status} to ${to}`);
  }
  if (planKey !== undefined && !(await tx.plan.findUnique({ where: { key: planKey } }))) {
    throw new HttpError(400, "UNKNOWN_PLAN", "Unknown plan");
  }
  const after = await db.subscription.update({ where: { organisationId }, data: { status: to, ...(planKey !== undefined && { planKey }) } });
  await platformAudit(tx, {
    actorUserId: actor.userId,
    action: `subscription.${action}`,
    targetOrganisationId: organisationId,
    reason,
    details: { from: before.status, to, planKey: after.planKey, previousPlanKey: before.planKey },
  });
  // ADR-017: every member; minimal non-sensitive title (plan name + status, never amounts).
  const plan = await tx.plan.findUniqueOrThrow({ where: { key: after.planKey }, select: { name: true } });
  await notify(tx, {
    organisationId,
    actorUserId: actor.userId,
    type: "subscription.changed",
    title: `Subscription changed: ${plan.name} plan, ${to}`,
    targetType: "subscription",
    targetId: after.id,
  });
  return { planKey: after.planKey, status: after.status };
}
