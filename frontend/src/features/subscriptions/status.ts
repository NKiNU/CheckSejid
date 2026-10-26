import type { Subscription } from './api.ts'
import type { BadgeVariant } from '../tenancy/orgStatus.ts'

// ADR-018: ACTIVE is paid and in good standing; TRIAL is working but temporary; PAST_DUE keeps paid
// entitlements during grace (warning); EXPIRED/CANCELLED fall back to Free (destructive).
export const subscriptionVariant = (s: Subscription['status']): BadgeVariant =>
  s === 'ACTIVE' ? 'success' : s === 'TRIAL' || s === 'PAST_DUE' ? 'warning' : s === 'CANCELLED' || s === 'EXPIRED' ? 'destructive' : 'neutral'
