import { afterEach, describe, expect, it, vi } from 'vitest'
import { createEvent, localInputToIso, nextActions, transition } from './api.ts'

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
})
