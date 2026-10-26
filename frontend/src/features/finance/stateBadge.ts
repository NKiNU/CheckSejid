import type { BadgeVariant } from '../tenancy/orgStatus.ts'
import type { Key } from '../../i18n/en.ts'
import type { FinanceState } from './api.ts'

// ADR-022: red only for the terminal negatives (rejected, voided). An approved record with a pending void
// request keeps its Approved badge and gets a second, warning badge.
export function stateBadges(state: FinanceState, voidRequested = false): { variant: BadgeVariant; labelKey: Key }[] {
  const variant: BadgeVariant =
    state === 'APPROVED' ? 'success' : state === 'PENDING_APPROVAL' ? 'warning' : state === 'REJECTED' || state === 'VOIDED' ? 'destructive' : 'neutral'
  const out: { variant: BadgeVariant; labelKey: Key }[] = [{ variant, labelKey: `state.${state}` as Key }]
  if (voidRequested && state === 'APPROVED') out.push({ variant: 'warning', labelKey: 'fin.voidRequested' })
  return out
}
