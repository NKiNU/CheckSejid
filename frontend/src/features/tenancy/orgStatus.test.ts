import { expect, test } from 'vitest'
import type { OrgStatus } from './api.ts'
import { orgStatusVariant } from './orgStatus.ts'

test('maps every org status', () => {
  const all: Record<OrgStatus, string> = { DRAFT: 'neutral', ONBOARDING: 'neutral', ACTIVE: 'success', SUSPENDED: 'warning', ARCHIVED: 'neutral' }
  for (const [s, v] of Object.entries(all)) expect(orgStatusVariant(s as OrgStatus)).toBe(v)
})
