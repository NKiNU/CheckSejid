import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../identity/api.ts'
import { MY_ERASURE, cancel, current, getRetention, orgErasure, request, retry, setRetention } from './api.ts'

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
function mockFetch(...responses: Response[]) {
  const fn = vi.fn<typeof fetch>()
  for (const r of responses) fn.mockResolvedValueOnce(r)
  vi.stubGlobal('fetch', fn)
  return fn
}
const call = (fn: ReturnType<typeof mockFetch>, i = 0) => ({ url: fn.mock.calls[i]![0], method: fn.mock.calls[i]![1]!.method, body: fn.mock.calls[i]![1]!.body })

afterEach(() => vi.unstubAllGlobals())

describe('erasure api', () => {
  const r = { id: '1', kind: 'ORGANISATION', status: 'PENDING_GRACE', executeAfter: 'x', failureCode: null }

  it('requests with the password in the body only, never in the URL', async () => {
    const fn = mockFetch(json(201, { request: r }))
    await request(orgErasure('o1'), 'secret')
    expect(call(fn)).toEqual({ url: '/orgs/o1/erasure', method: 'POST', body: JSON.stringify({ password: 'secret' }) })
  })

  it('cancel is a DELETE on the same path; account erasure uses /me/erasure', async () => {
    const fn = mockFetch(json(200, { request: { ...r, status: 'CANCELLED' } }), json(200, { request: null }))
    expect((await cancel(orgErasure('o1'))).status).toBe('CANCELLED')
    expect(await current(MY_ERASURE)).toBeNull()
    expect(call(fn, 0)).toMatchObject({ url: '/orgs/o1/erasure', method: 'DELETE' })
    expect(call(fn, 1)).toMatchObject({ url: '/me/erasure', method: 'GET' })
  })

  it('retry posts the password to /retry (ADR-031 §2)', async () => {
    const fn = mockFetch(json(200, { request: r }))
    await retry(MY_ERASURE, 'pw-12345678')
    expect(call(fn)).toMatchObject({ url: '/me/erasure/retry', method: 'POST', body: JSON.stringify({ password: 'pw-12345678' }) })
  })

  it('reads and sets retention, null meaning keep nothing', async () => {
    const fn = mockFetch(json(200, { years: 3 }), json(200, { years: null }))
    expect(await getRetention('o1')).toBe(3)
    expect(await setRetention('o1', null)).toBeNull()
    expect(call(fn, 1)).toEqual({ url: '/orgs/o1/retention', method: 'PUT', body: JSON.stringify({ years: null }) })
  })

  it('surfaces the server error code (wrong password, owns an organisation)', async () => {
    mockFetch(json(409, { error: { code: 'OWNS_ORGANISATION', message: 'm' } }))
    await expect(request(MY_ERASURE, 'x')).rejects.toMatchObject({ status: 409, code: 'OWNS_ORGANISATION' })
    mockFetch(json(401, {}))
    await expect(request(MY_ERASURE, 'x')).rejects.toBeInstanceOf(ApiError)
  })
})
