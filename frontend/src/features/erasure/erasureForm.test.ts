import { describe, expect, it } from 'vitest'
import type { ErasureRequest } from './api.ts'
import { parseRetention, passwordProblem, viewOf } from './erasureForm.ts'

const req = (status: ErasureRequest['status']): ErasureRequest => ({ id: '1', kind: 'ORGANISATION', status, executeAfter: '2026-11-04T00:00:00.000Z', failureCode: null })

describe('erasure form', () => {
  it('requires a password and caps its length', () => {
    expect(passwordProblem('')).toBe('erasure.passwordRequired')
    expect(passwordProblem('x'.repeat(129))).toBe('account.tooLong')
    expect(passwordProblem('anything')).toBeNull()
  })

  it('maps the retention choice to the four allowed years, else nothing', () => {
    expect([1, 3, 5, 7].map((y) => parseRetention(String(y)))).toEqual([1, 3, 5, 7])
    for (const bad of ['', '2', '10', 'x', '0']) expect(parseRetention(bad)).toBeNull()
  })

  it('shows the cancel state only while waiting, and retry only after a failure', () => {
    expect(viewOf(null)).toBe('none')
    expect(viewOf(req('PENDING_GRACE'))).toBe('pending')
    expect(viewOf(req('RUNNING'))).toBe('running')
    expect(viewOf(req('FAILED'))).toBe('failed')
    expect(viewOf(req('CANCELLED'))).toBe('none')
    expect(viewOf(req('COMPLETED'))).toBe('none')
  })
})
