import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, availableActions, formatMoney, toMinor, type FinanceRecord } from './api.ts'

afterEach(() => vi.unstubAllGlobals())
const rec = (over: Partial<FinanceRecord>): FinanceRecord =>
  ({ id: 'r1', state: 'DRAFT', amount: 100, currency: 'MYR', categoryId: 'c', description: 'd', createdById: 'me', voidRequested: false, voidReason: null, copiedFromId: null, ...over }) as FinanceRecord
const treasurer = new Set(['finance.read', 'finance.expense.create', 'finance.approve', 'finance.void'])

describe('finance api', () => {
  it('converts money with integers only (ADR-011)', () => {
    expect([toMinor('12.34'), toMinor('12.3'), toMinor('12'), toMinor('0.1')]).toEqual([1234, 1230, 1200, 10])
    for (const bad of ['', '-1', '1.234', 'abc', '0', '0.00']) expect(toMinor(bad), bad).toBeNull()
    expect(formatMoney(123456)).toBe('RM 1,234.56')
    expect(formatMoney(5, 'USD')).toBe('USD 0.05')
  })

  it('offers actions matching ADR-022 §2', () => {
    expect(availableActions('expense', rec({}), 'me', treasurer)).toEqual(['submit', 'void'])
    expect(availableActions('expense', rec({}), 'other', new Set(['finance.read']))).toEqual([])
    expect(availableActions('expense', rec({ state: 'PENDING_APPROVAL' }), 'other', treasurer)).toEqual(['approve', 'reject', 'void'])
    expect(availableActions('expense', rec({ state: 'APPROVED' }), 'me', treasurer)).toEqual(['void-request'])
    expect(availableActions('expense', rec({ state: 'APPROVED', voidRequested: true }), 'other', treasurer)).toEqual(['void-approve', 'void-reject'])
    expect(availableActions('expense', rec({ state: 'REJECTED' }), 'me', treasurer)).toEqual(['copy'])
  })

  it('sends a reason when given', async () => {
    const fn = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ record: rec({}) }), { status: 200 }))
    vi.stubGlobal('fetch', fn)
    await act('o1', 'income', 'r1', 'void-request', 'Counted twice')
    expect([fn.mock.calls[0]![0], fn.mock.calls[0]![1]!.body]).toEqual(['/orgs/o1/finance/incomes/r1/void-request', '{"reason":"Counted twice"}'])
  })
})
