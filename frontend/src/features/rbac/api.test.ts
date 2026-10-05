import { afterEach, describe, expect, it, vi } from 'vitest'
import { myPermissions, transferOwnership, updateMember } from './api.ts'

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

afterEach(() => vi.unstubAllGlobals())

describe('rbac api', () => {
  it('reads effective permissions for the organisation from the server', async () => {
    const fn = vi.fn<typeof fetch>().mockResolvedValue(json(200, { roles: ['staff'], permissions: ['members.read'] }))
    vi.stubGlobal('fetch', fn)
    expect(await myPermissions('o1')).toEqual({ roles: ['staff'], permissions: ['members.read'] })
    expect(fn.mock.calls[0]![0]).toBe('/orgs/o1/me/permissions')
  })

  it('sends only the role set and ids in the path (no tenant/user ids in the body)', async () => {
    const fn = vi.fn<typeof fetch>().mockResolvedValue(json(200, { member: { id: 'm1' } }))
    vi.stubGlobal('fetch', fn)
    await updateMember('o1', 'm1', { roles: ['committee'] })
    expect(fn.mock.calls[0]![0]).toBe('/orgs/o1/members/m1')
    expect(fn.mock.calls[0]![1]!.method).toBe('PATCH')
    expect(JSON.parse(String(fn.mock.calls[0]![1]!.body))).toEqual({ roles: ['committee'] })
  })

  it('surfaces a server-side permission denial', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>().mockResolvedValue(json(403, { error: { code: 'FORBIDDEN', message: 'nope' } })),
    )
    await expect(transferOwnership('o1', 'm2')).rejects.toMatchObject({ status: 403, code: 'FORBIDDEN' })
  })
})
