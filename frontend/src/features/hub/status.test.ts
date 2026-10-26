import { expect, test } from 'vitest'
import type { ContentStatus } from './api.ts'
import { contentStatusVariant } from './status.ts'

test('maps every content status', () => {
  const all: Record<ContentStatus, string> = { DRAFT: 'warning', PUBLISHED: 'success', ARCHIVED: 'neutral' }
  for (const [s, v] of Object.entries(all)) expect(contentStatusVariant(s as ContentStatus)).toBe(v)
})
