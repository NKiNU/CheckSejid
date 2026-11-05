import { afterEach, describe, expect, it, vi } from 'vitest'
import { checkHubImage, createEvent, HUB_IMAGE_MAX_BYTES, localInputToIso, nextActions, removeHubImage, setMainHubImage, transition, uploadHubImage } from './api.ts'

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })
afterEach(() => vi.unstubAllGlobals())

describe('hub api', () => {
  it('offers publish for drafts and archived items (republish), archive for published (ADR-021)', () => {
    expect(nextActions('DRAFT')).toEqual(['publish'])
    expect(nextActions('ARCHIVED')).toEqual(['publish'])
    expect(nextActions('PUBLISHED')).toEqual(['archive'])
  })

  it('posts transitions and creates under the tenant path with JSON bodies', async () => {
    const fn = vi.fn<typeof fetch>().mockResolvedValue(json({ event: { id: 'e1' } }))
    vi.stubGlobal('fetch', fn)
    await transition('o1', 'event', 'e1', 'publish')
    expect([fn.mock.calls[0]![0], fn.mock.calls[0]![1]!.method]).toEqual(['/orgs/o1/hub/events/e1/publish', 'POST'])
    await createEvent('o1', { title: 't', description: '', startsAt: 'a', endsAt: 'b', location: null })
    expect(new Headers(fn.mock.calls[1]![1]!.headers).get('Content-Type')).toBe('application/json')
  })

  it('turns a datetime-local value into a UTC instant', () => {
    expect(localInputToIso('2026-10-10T20:30')).toBe(new Date('2026-10-10T20:30').toISOString())
  })

  it('checks image type, size and count client-side', () => {
    const f = (name: string, type: string, size = 100) => ({ name, type, size })
    expect(checkHubImage(f('a.jpg', 'image/jpeg'), 0)).toBeNull()
    expect(checkHubImage(f('a.jpg', 'image/jpeg'), 5)).toBe('hub.img.max')
    expect(checkHubImage(f('a.heic', 'image/heic'), 0)).toBe('hub.img.heic')
    expect(checkHubImage(f('IMG.HEIC', ''), 0)).toBe('hub.img.heic')
    expect(checkHubImage(f('a.gif', 'image/gif'), 0)).toBe('hub.img.type')
    expect(checkHubImage(f('a.png', 'image/png', HUB_IMAGE_MAX_BYTES + 1), 0)).toBe('hub.img.big')
    expect(checkHubImage(f('a.png', 'image/png', HUB_IMAGE_MAX_BYTES), 4)).toBeNull()
  })

  it('uploads raw bytes and calls set-main / remove on the item path', async () => {
    const fn = vi.fn<typeof fetch>().mockImplementation(async () => json({ image: { id: 'i', url: 'u', isMain: true }, images: [] }))
    vi.stubGlobal('fetch', fn)
    const file = new Blob([new Uint8Array([1])], { type: 'image/png' })
    await uploadHubImage('o 1', 'event', 'e1', file)
    await setMainHubImage('o1', 'post', 'p1', 'i1')
    expect(fn.mock.calls.map(([url, init]) => [url, init!.method])).toEqual([
      ['/orgs/o%201/hub/events/e1/images', 'POST'],
      ['/orgs/o1/hub/posts/p1/images/i1/main', 'POST'],
    ])
    expect(fn.mock.calls[0]![1]!.body).toBe(file)
    fn.mockResolvedValue(new Response(null, { status: 204 }))
    await removeHubImage('o1', 'post', 'p1', 'i1')
    expect([fn.mock.calls[2]![0], fn.mock.calls[2]![1]!.method]).toEqual(['/orgs/o1/hub/posts/p1/images/i1', 'DELETE'])
  })
})
