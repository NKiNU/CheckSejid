import type { Plan } from './types';

/** SAAS-002: the plan decides capabilities. Values are commercial configuration, kept in one place. */
export type Capability = 'bulletin' | 'events' | 'operations' | 'finance' | 'budgets' | 'auditLogReport' | 'roster';

const PLAN_CAPABILITIES: Record<Plan, readonly Capability[]> = {
  FREE: ['bulletin', 'events'],
  STARTER: ['bulletin', 'events', 'operations', 'roster', 'finance', 'budgets'],
  PROFESSIONAL: ['bulletin', 'events', 'operations', 'roster', 'finance', 'budgets', 'auditLogReport'],
};

export function hasCapability(plan: Plan, capability: Capability): boolean {
  return PLAN_CAPABILITIES[plan].includes(capability);
}

export function lowestPlanWith(capability: Capability): Plan {
  return (['FREE', 'STARTER', 'PROFESSIONAL'] as const).find((p) => hasCapability(p, capability)) ?? 'PROFESSIONAL';
}

export const TRIAL_DAYS = 30; // SAAS-003

export function trialDaysLeft(trialEndsAt: string, now: Date): number {
  return Math.max(0, Math.ceil((new Date(trialEndsAt).getTime() - now.getTime()) / 86_400_000));
}
