import { call } from '../identity/api.ts'

// ADR-018. The server computes the effective status and entitlements; the UI only displays them.
export type Subscription = {
  plan: { key: string; name: string }
  status: 'TRIAL' | 'ACTIVE' | 'PAST_DUE' | 'CANCELLED' | 'EXPIRED'
  trialEndsAt: string | null
  entitlements: Record<string, boolean | number | null>
}

export const getSubscription = async (orgId: string) =>
  (await call<{ subscription: Subscription }>(`/orgs/${encodeURIComponent(orgId)}/subscription`)).subscription

export const trialDaysLeft = (trialEndsAt: string, now = Date.now()) =>
  Math.max(0, Math.ceil((Date.parse(trialEndsAt) - now) / (24 * 60 * 60 * 1000)))
