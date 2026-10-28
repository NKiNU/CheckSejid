import type { Key } from '@/i18n/en.ts'
import type { ErasureRequest, Retention } from './api.ts'

// Client-side convenience only; the server checks the password and everything else.
export function passwordProblem(password: string): Key | null {
  if (password === '') return 'erasure.passwordRequired'
  return password.length > 128 ? 'account.tooLong' : null
}

// The <select> value is a string; '' means "keep nothing".
export function parseRetention(value: string): Retention {
  const n = Number(value)
  return n === 1 || n === 3 || n === 5 || n === 7 ? n : null
}

// What to show for a request: nothing for a finished or cancelled one, a deadline while waiting.
export type View = 'none' | 'pending' | 'running' | 'failed'
export function viewOf(r: ErasureRequest | null): View {
  if (!r) return 'none'
  if (r.status === 'PENDING_GRACE') return 'pending'
  if (r.status === 'RUNNING') return 'running'
  return r.status === 'FAILED' ? 'failed' : 'none'
}
