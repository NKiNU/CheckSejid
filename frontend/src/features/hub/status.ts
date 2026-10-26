import type { ContentStatus } from './api.ts'
import type { BadgeVariant } from '@/components/ui/badge.tsx'

// ADR-021: a draft is not yet visible, published is live, archived is retired (it can be republished).
export const contentStatusVariant = (s: ContentStatus): BadgeVariant =>
  s === 'PUBLISHED' ? 'success' : s === 'DRAFT' ? 'warning' : 'neutral'

// Estimated wrapped lines at ~320px (perLine chars each) so the Show-more toggle appears iff the 3-line clamp can hide text.
export const needsClamp = (s: string, perLine = 35) =>
  s.split('\n').reduce((n, l) => n + Math.max(1, Math.ceil(l.length / perLine)), 0) > 3
