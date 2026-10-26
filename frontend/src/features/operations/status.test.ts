import { expect, test } from 'vitest'
import type { TaskStatus } from './api.ts'
import { groupByDay, taskStatusVariant } from './status.ts'

test('maps every task status', () => {
  const all: Record<TaskStatus, string> = { TODO: 'neutral', IN_PROGRESS: 'warning', DONE: 'success', CANCELLED: 'neutral' }
  for (const [s, v] of Object.entries(all)) expect(taskStatusVariant(s as TaskStatus)).toBe(v)
})

test('groups by local day in first-seen order', () => {
  const a = new Date(2026, 9, 3, 9).toISOString(), b = new Date(2026, 9, 3, 18).toISOString(), c = new Date(2026, 9, 4, 8).toISOString()
  const g = groupByDay([{ s: a }, { s: c }, { s: b }], (x) => x.s)
  expect(g.map((x) => [x.day, x.items.length])).toEqual([['2026-10-03', 2], ['2026-10-04', 1]])
})
