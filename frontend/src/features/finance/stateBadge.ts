import type { BadgeVariant } from '../tenancy/orgStatus.ts'
import type { Key } from '../../i18n/en.ts'
import type { FinanceState } from './api.ts'

// ADR-022: red only for the terminal negatives (rejected, voided); a pending void request is a warning.
export function stateBadge(state: FinanceState, voidRequested = false): { variant: BadgeVariant; labelKey: Key } {
  if (voidRequested && state === 'APPROVED') return { variant: 'warning', labelKey: 'fin.voidPending' }
  const variant: BadgeVariant =
    state === 'APPROVED' ? 'success' : state === 'PENDING_APPROVAL' ? 'warning' : state === 'REJECTED' || state === 'VOIDED' ? 'destructive' : 'neutral'
  return { variant, labelKey: `state.${state}` as Key }
}
