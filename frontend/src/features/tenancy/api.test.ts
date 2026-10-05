import { afterEach, describe, expect, it, vi } from 'vitest'
import { archiveOrganisation, completeOnboarding, createOrganisation, getOrganisation, updateProfile } from './api.ts'

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

  it('saves the profile with PATCH and never sends status or tenant ids', async () => {
    const fn = vi.fn<typeof fetch>().mockResolvedValue(json(200, { organisation: { id: 'o1', status: 'ONBOARDING' } }))
    vi.stubGlobal('fetch', fn)
    expect(await updateProfile('o1', { type: 'masjid', country: 'MY' })).toEqual({ id: 'o1', status: 'ONBOARDING' })
    expect(fn.mock.calls[0]![0]).toBe('/orgs/o1')
    expect(fn.mock.calls[0]![1]).toMatchObject({ method: 'PATCH', body: JSON.stringify({ type: 'masjid', country: 'MY' }) })
  })

  it('completes onboarding and archives through their own endpoints', async () => {
    const fn = vi.fn<typeof fetch>().mockImplementation(async () => json(200, { organisation: { id: 'o1' } }))
    vi.stubGlobal('fetch', fn)
    await completeOnboarding('o1')
    await archiveOrganisation('o1')
    expect(fn.mock.calls.map((c) => [c[0], c[1]!.method])).toEqual([
      ['/orgs/o1/onboarding/complete', 'POST'],
      ['/orgs/o1/archive', 'POST'],
    ])
  })

  it('surfaces ORGANISATION_NOT_WRITABLE', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>().mockResolvedValue(json(409, { error: { code: 'ORGANISATION_NOT_WRITABLE', message: 'no' } })),
    )
    await expect(updateProfile('o1', { state: 'x' })).rejects.toMatchObject({ status: 409, code: 'ORGANISATION_NOT_WRITABLE' })
  })
})
