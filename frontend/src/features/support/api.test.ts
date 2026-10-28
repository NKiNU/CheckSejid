import { afterEach, describe, expect, it, vi } from 'vitest'
import { decide, ownerLog, requestAccess, statusVariant } from './api.ts'

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

afterEach(() => vi.unstubAllGlobals())

describe('support api', () => {
  it('files a request with the organisation id and reason in the body', async () => {
    const fn = vi.fn<typeof fetch>().mockResolvedValue(json(201, { request: { id: 'r1', status: 'REQUESTED' } }))
    vi.stubGlobal('fetch', fn)
    expect((await requestAccess('o1', 'cannot see roster')).status).toBe('REQUESTED')
    expect(fn.mock.calls[0]![0]).toBe('/platform/support/requests')
    expect(JSON.parse(String(fn.mock.calls[0]![1]!.body))).toEqual({ organisationId: 'o1', reason: 'cannot see roster' })
  })

  it('owner decisions post to the organisation path; ids are encoded', async () => {
    const fn = vi.fn<typeof fetch>().mockResolvedValue(json(200, { request: { id: 'r 1', status: 'GRANTED' } }))
    vi.stubGlobal('fetch', fn)
    await decide('o 1', 'r 1', 'approve')
    expect(fn.mock.calls[0]![0]).toBe('/orgs/o%201/support/requests/r%201/approve')
    expect(fn.mock.calls[0]![1]!.method).toBe('POST')
  })

  it('reads the access log', async () => {
    const fn = vi.fn<typeof fetch>().mockResolvedValue(json(200, { log: [{ id: 'a', action: 'support.access' }] }))
    vi.stubGlobal('fetch', fn)
    expect(await ownerLog('o1')).toHaveLength(1)
    expect(fn.mock.calls[0]![0]).toBe('/orgs/o1/support/log')
  })

  it('only a granted request looks active', () => {
    expect(statusVariant('GRANTED')).toBe('success')
    expect(statusVariant('REVOKED')).toBe('destructive')
    expect(statusVariant('EXPIRED')).toBe('neutral')
  })
})
