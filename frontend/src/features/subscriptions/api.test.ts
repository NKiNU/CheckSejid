import { afterEach, describe, expect, it, vi } from 'vitest'
import { getSubscription, trialDaysLeft } from './api.ts'

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

afterEach(() => vi.unstubAllGlobals())

describe('subscriptions api', () => {
  it('reads the organisation subscription by org id in the path', async () => {
    const subscription = { plan: { key: 'professional', name: 'Professional' }, status: 'TRIAL', trialEndsAt: null, entitlements: {} }
    const fn = vi.fn<typeof fetch>().mockResolvedValue(json(200, { subscription }))
    vi.stubGlobal('fetch', fn)
    expect(await getSubscription('o 1')).toEqual(subscription)
    expect(fn.mock.calls[0]![0]).toBe('/orgs/o%201/subscription')
  })

  it('counts trial days left, rounding up and never below zero', () => {
    const now = Date.parse('2026-10-06T00:00:00Z')
    expect(trialDaysLeft('2026-11-05T00:00:00Z', now)).toBe(30)
    expect(trialDaysLeft('2026-10-06T01:00:00Z', now)).toBe(1)
    expect(trialDaysLeft('2026-10-01T00:00:00Z', now)).toBe(0)
  })
})
