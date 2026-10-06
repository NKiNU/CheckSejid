import { ApiError, call } from '../identity/api.ts'

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

// Plan limits (ENTITLEMENT_REQUIRED / QUOTA_EXCEEDED) are not permission problems: point to an upgrade.
export const errorMessage = (e: unknown) =>
  e instanceof ApiError && (e.code === 'ENTITLEMENT_REQUIRED' || e.code === 'QUOTA_EXCEEDED')
    ? `Your plan does not allow this. Upgrade your plan to continue. (${e.message})`
    : e instanceof Error
      ? e.message
      : 'Something went wrong'
