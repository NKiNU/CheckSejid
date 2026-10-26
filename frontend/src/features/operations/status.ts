import type { TaskStatus } from './api.ts'
import type { BadgeVariant } from '../tenancy/orgStatus.ts'

// ADR-024: open work is a warning-free neutral, in progress needs attention, done is success.
export const taskStatusVariant = (s: TaskStatus): BadgeVariant =>
  s === 'DONE' ? 'success' : s === 'IN_PROGRESS' ? 'warning' : 'neutral'

// Groups items by their local calendar day (key "YYYY-MM-DD"), keeping first-seen order.
export function groupByDay<T>(items: T[], iso: (i: T) => string): { day: string; items: T[] }[] {
  const out = new Map<string, T[]>()
  for (const i of items) {
    const d = new Date(iso(i))
    const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    out.set(day, [...(out.get(day) ?? []), i])
  }
  return [...out].map(([day, items]) => ({ day, items }))
}
