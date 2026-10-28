import type { Key } from '@/i18n/en.ts'

// Client-side convenience only; the server validates for real (12–128 chars).
export function passwordProblem(next: string, confirm: string): Key | null {
  if (next.length < 12) return 'account.tooShort'
  if (next.length > 128) return 'account.tooLong'
  return next === confirm ? null : 'account.mismatch'
}
