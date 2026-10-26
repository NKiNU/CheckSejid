import { expect, test } from 'vitest'
import type { Subscription } from './api.ts'
import { subscriptionVariant } from './status.ts'

test('maps every subscription status', () => {
  const all: Record<Subscription['status'], string> = { TRIAL: 'warning', ACTIVE: 'success', PAST_DUE: 'warning', CANCELLED: 'destructive', EXPIRED: 'destructive' }
  for (const [s, v] of Object.entries(all)) expect(subscriptionVariant(s as Subscription['status'])).toBe(v)
})
