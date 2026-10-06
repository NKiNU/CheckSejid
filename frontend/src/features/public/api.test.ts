import { afterEach, describe, expect, it, vi } from 'vitest'
import { discoverPath, follow, shareLink, uploadProfileImage } from './api.ts'

const ok = (status = 200, body: unknown = {}) => new Response(status === 204 ? null : JSON.stringify(body), { status })
afterEach(() => vi.unstubAllGlobals())

describe('public api', () => {
  it('builds discovery queries from non-empty filters only', () => {
    expect(discoverPath({})).toBe('/public/orgs')
    expect(discoverPath({ q: 'al falah', type: 'masjid', state: ' ', country: undefined })).toBe('/public/orgs?q=al+falah&type=masjid')
  })

  it('follows with PUT on the self-scoped path', async () => {
    const fn = vi.fn<typeof fetch>().mockResolvedValue(ok(204))
    vi.stubGlobal('fetch', fn)
    await follow('o 1')
    expect(fn.mock.calls[0]![0]).toBe('/me/follows/o%201')
    expect(fn.mock.calls[0]![1]!.method).toBe('PUT')
  })

  it('uploads images raw, without a JSON content type (ADR-020)', async () => {
    const fn = vi.fn<typeof fetch>().mockResolvedValue(ok(200, { url: 'u' }))
    vi.stubGlobal('fetch', fn)
    const file = new Blob([new Uint8Array([0x89, 0x50])], { type: 'image/png' })
    await uploadProfileImage('o1', 'logo', file)
    const init = fn.mock.calls[0]![1]!
    expect([fn.mock.calls[0]![0], init.method, init.body]).toEqual(['/orgs/o1/logo', 'PUT', file])
    expect(new Headers(init.headers).get('Content-Type')).toBeNull()
  })

  it('share links carry the organisation id', () => {
    expect(shareLink('https://app.example.my', 'abc')).toBe('https://app.example.my/?org=abc')
  })
})
