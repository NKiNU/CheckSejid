import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError, login, logout, me, refresh } from './api.ts'

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

function mockFetch(...responses: Response[]) {
  const fn = vi.fn<typeof fetch>()
  for (const r of responses) fn.mockResolvedValueOnce(r)
  vi.stubGlobal('fetch', fn)
  return fn
}

const authHeader = (fn: ReturnType<typeof mockFetch>, call: number) =>
  new Headers(fn.mock.calls[call]![1]!.headers).get('Authorization')

afterEach(() => vi.unstubAllGlobals())

describe('identity api', () => {
  it('keeps the access token in memory and sends it as a Bearer token', async () => {
    const fn = mockFetch(json(200, { accessToken: 'abc' }), json(200, { user: { id: '1' } }))
    await login('a@example.com', 'pw')
    await me()
    expect(authHeader(fn, 1)).toBe('Bearer abc')
  })

  it('forgets the access token on logout', async () => {
    const fn = mockFetch(json(200, { accessToken: 'abc' }), new Response(null, { status: 204 }), json(401, {}))
    await login('a@example.com', 'pw')
    await logout()
    await expect(me()).rejects.toBeInstanceOf(ApiError)
    expect(authHeader(fn, 2)).toBeNull()
  })

  it('refresh returns false when there is no session', async () => {
    mockFetch(json(401, { error: { code: 'UNAUTHENTICATED', message: 'Authentication required' } }))
    expect(await refresh()).toBe(false)
  })

  it('concurrent refresh calls send a single request (avoids reuse detection)', async () => {
    const fn = mockFetch(json(200, { accessToken: 'new' }))
    expect(await Promise.all([refresh(), refresh()])).toEqual([true, true])
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('surfaces the server error code and message', async () => {
    mockFetch(json(401, { error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' } }))
    await expect(login('a@example.com', 'bad')).rejects.toMatchObject({
      status: 401,
      code: 'INVALID_CREDENTIALS',
      message: 'Invalid email or password',
    })
  })
})
