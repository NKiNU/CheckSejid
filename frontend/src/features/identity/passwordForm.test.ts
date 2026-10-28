import { describe, expect, it } from 'vitest'
import { passwordProblem } from './passwordForm.ts'

describe('passwordProblem', () => {
  it('accepts a matching 12+ character password', () => {
    expect(passwordProblem('a'.repeat(12), 'a'.repeat(12))).toBeNull()
  })
  it('rejects short, long and mismatched passwords', () => {
    expect(passwordProblem('short', 'short')).toBe('account.tooShort')
    expect(passwordProblem('a'.repeat(129), 'a'.repeat(129))).toBe('account.tooLong')
    expect(passwordProblem('a'.repeat(12), 'b'.repeat(12))).toBe('account.mismatch')
  })
})
