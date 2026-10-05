import { afterEach, describe, expect, it, vi } from 'vitest'
import { listNotifications, markAllRead, markRead } from './api.ts'

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

afterEach(() => vi.unstubAllGlobals())

describe('notifications api', () => {
  it('lists the inbox without sending any user or organisation id', async () => {
    const inbox = { notifications: [], nextCursor: null, unreadCount: 0 }
    const fn = vi.fn<typeof fetch>().mockResolvedValue(json(200, inbox))
    vi.stubGlobal('fetch', fn)
    expect(await listNotifications()).toEqual(inbox)
    expect(fn.mock.calls[0]![0]).toBe('/me/notifications')
    await listNotifications(true)
    expect(fn.mock.calls[1]![0]).toBe('/me/notifications?unread=true')
  })

  it('marks one read by id in the path, and all read', async () => {
    const fn = vi.fn<typeof fetch>().mockResolvedValueOnce(new Response(null, { status: 204 })).mockResolvedValueOnce(json(200, { count: 3 }))
    vi.stubGlobal('fetch', fn)
    await markRead('n 1')
    expect(fn.mock.calls[0]![0]).toBe('/me/notifications/n%201/read')
    expect(fn.mock.calls[0]![1]!.method).toBe('POST')
    expect(await markAllRead()).toBe(3)
    expect(fn.mock.calls[1]![0]).toBe('/me/notifications/read-all')
  })

  it('surfaces a 404 for a notification that is not yours', async () => {
    vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockResolvedValue(json(404, { error: { code: 'NOTIFICATION_NOT_FOUND', message: 'x' } })))
    await expect(markRead('n1')).rejects.toMatchObject({ status: 404, code: 'NOTIFICATION_NOT_FOUND' })
  })
})
