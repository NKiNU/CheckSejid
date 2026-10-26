import { expect, test } from 'vitest'
import type { ContentStatus } from './api.ts'
import { contentStatusVariant, needsClamp } from './status.ts'

test('maps every content status', () => {
  const all: Record<ContentStatus, string> = { DRAFT: 'warning', PUBLISHED: 'success', ARCHIVED: 'neutral' }
  for (const [s, v] of Object.entries(all)) expect(contentStatusVariant(s as ContentStatus)).toBe(v)
})

test('needsClamp estimates wrapped lines', () => {
  expect(needsClamp('short')).toBe(false)
  expect(needsClamp('a\nb\nc')).toBe(false)
  expect(needsClamp('a\nb\n' + 'x'.repeat(85))).toBe(true)
  expect(needsClamp('x'.repeat(120))).toBe(true)
})
