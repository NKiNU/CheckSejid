import type { OrgStatus } from './api.ts'

export type BadgeVariant = 'neutral' | 'success' | 'warning' | 'destructive'

// Suspended is a warning, not destructive: the owner can still act on it. Archived is final but not an error.
export const orgStatusVariant = (s: OrgStatus): BadgeVariant =>
  s === 'ACTIVE' ? 'success' : s === 'SUSPENDED' ? 'warning' : 'neutral'
