import { expect, test } from 'vitest'
import type { FinanceState } from './api.ts'
import { stateBadge } from './stateBadge.ts'

test('maps every finance state', () => {
  const all: Record<FinanceState, string> = { DRAFT: 'neutral', PENDING_APPROVAL: 'warning', APPROVED: 'success', REJECTED: 'destructive', VOIDED: 'destructive' }
  for (const [s, v] of Object.entries(all)) expect(stateBadge(s as FinanceState)).toEqual({ variant: v, labelKey: `state.${s}` })
})

test('a void request on an approved record is a warning, not red', () => {
  expect(stateBadge('APPROVED', true)).toEqual({ variant: 'warning', labelKey: 'fin.voidPending' })
  expect(stateBadge('REJECTED', true).variant).toBe('destructive')
})
