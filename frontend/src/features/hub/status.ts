import type { ContentStatus } from './api.ts'
import type { BadgeVariant } from '../tenancy/orgStatus.ts'

// ADR-021: a draft is not yet visible, published is live, archived is retired (it can be republished).
export const contentStatusVariant = (s: ContentStatus): BadgeVariant =>
  s === 'PUBLISHED' ? 'success' : s === 'DRAFT' ? 'warning' : 'neutral'
