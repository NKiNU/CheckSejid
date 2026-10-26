import { expect, test } from 'vitest'
import type { TaskStatus } from './api.ts'
import { groupByDay, taskStatusVariant } from './status.ts'

test('maps every task status', () => {
  const all: Record<TaskStatus, string> = { TODO: 'neutral', IN_PROGRESS: 'warning', DONE: 'success', CANCELLED: 'neutral' }
  for (const [s, v] of Object.entries(all)) expect(taskStatusVariant(s as TaskStatus)).toBe(v)
})

test('groups by Kuala Lumpur day in first-seen order, whatever the device zone', () => {
  const g = groupByDay(['2026-10-03T15:59:00Z', '2026-10-03T16:00:00Z', '2026-10-03T01:00:00Z'], (x) => x)
  expect(g.map((x) => [x.day, x.items.length])).toEqual([['2026-10-03', 2], ['2026-10-04', 1]])
})
