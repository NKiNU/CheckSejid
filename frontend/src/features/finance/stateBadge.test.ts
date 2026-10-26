import { expect, test } from 'vitest'
import type { FinanceState } from './api.ts'
import { stateBadges } from './stateBadge.ts'

test('maps every finance state', () => {
  const all: Record<FinanceState, string> = { DRAFT: 'neutral', PENDING_APPROVAL: 'warning', APPROVED: 'success', REJECTED: 'destructive', VOIDED: 'destructive' }
  for (const [s, v] of Object.entries(all)) expect(stateBadges(s as FinanceState)).toEqual([{ variant: v, labelKey: `state.${s}` }])
})

test('an approved record with a void request shows Approved plus a warning badge', () => {
  expect(stateBadges('APPROVED', true)).toEqual([
    { variant: 'success', labelKey: 'state.APPROVED' },
    { variant: 'warning', labelKey: 'fin.voidRequested' },
  ])
  expect(stateBadges('REJECTED', true)).toHaveLength(1)
})
