import { afterEach, describe, expect, it, vi } from 'vitest'
import { createOrganisation, getOrganisation } from './api.ts'

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

afterEach(() => vi.unstubAllGlobals())

describe('tenancy api', () => {
  it('creates an organisation with only a name (tenant context is server-side)', async () => {
    const fn = vi.fn<typeof fetch>().mockResolvedValue(json(201, { organisation: { id: 'o1', name: 'A' } }))
    vi.stubGlobal('fetch', fn)
    expect(await createOrganisation('A')).toEqual({ id: 'o1', name: 'A' })
    expect(fn.mock.calls[0]![0]).toBe('/orgs')
    expect(JSON.parse(String(fn.mock.calls[0]![1]!.body))).toEqual({ name: 'A' })
  })

  it('surfaces a 404 for an organisation the user cannot access', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>().mockResolvedValue(
        json(404, { error: { code: 'ORGANISATION_NOT_FOUND', message: 'Organisation not found' } }),
      ),
    )
    await expect(getOrganisation('x/../y')).rejects.toMatchObject({ status: 404, code: 'ORGANISATION_NOT_FOUND' })
  })
})
