import { TIME_ZONE } from '../../i18n/index.tsx'
import type { TaskStatus } from './api.ts'

export const taskStatusVariant = (s: TaskStatus): 'success' | 'warning' | 'neutral' =>
  s === 'DONE' ? 'success' : s === 'IN_PROGRESS' ? 'warning' : 'neutral'

const dayFmt = new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE }) // en-CA gives YYYY-MM-DD
export const dayKey = (iso: string) => dayFmt.format(new Date(iso))

// Groups items by their calendar day in the app time zone (key "YYYY-MM-DD"), keeping first-seen order.
export function groupByDay<T>(items: T[], iso: (i: T) => string): { day: string; items: T[] }[] {
  const out = new Map<string, T[]>()
  for (const i of items) {
    const day = dayKey(iso(i))
    out.set(day, [...(out.get(day) ?? []), i])
  }
  return [...out].map(([day, items]) => ({ day, items }))
}
