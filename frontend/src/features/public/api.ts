import { call } from '../identity/api.ts'

// ADR-019. The server decides what is public; the UI only displays it.
export type Visibility = 'PUBLIC' | 'UNLISTED' | 'PRIVATE'
export type PublicOrganisation = {
  id: string
  name: string
  type: string | null
  description: string | null
  contactEmail: string | null
  contactPhone: string | null
  addressLine: string | null
  state: string | null
  country: string | null
  links: { label: string; url: string }[] | null
  visibility: Visibility
  logoUrl: string | null
  coverUrl: string | null
  following?: boolean
  followable?: boolean
}
export type DiscoverFilters = { q?: string; type?: string; state?: string; country?: string; cursor?: string }

export function discoverPath(filters: DiscoverFilters) {
  const qs = new URLSearchParams(Object.entries(filters).filter((e): e is [string, string] => Boolean(e[1]?.trim())))
  return `/public/orgs${qs.size ? `?${qs}` : ''}`
}

export const discover = (filters: DiscoverFilters) =>
  call<{ organisations: PublicOrganisation[]; nextCursor: string | null }>(discoverPath(filters))

export const getPublicOrganisation = async (id: string) =>
  (await call<{ organisation: PublicOrganisation }>(`/public/orgs/${encodeURIComponent(id)}`)).organisation

export const myFollows = async () => (await call<{ organisations: PublicOrganisation[] }>('/me/follows')).organisations
export const follow = (id: string) => call<void>(`/me/follows/${encodeURIComponent(id)}`, { method: 'PUT' })
export const unfollow = (id: string) => call<void>(`/me/follows/${encodeURIComponent(id)}`, { method: 'DELETE' })

// The link an Unlisted organisation shares (ADR-019 §1): its id, opened by logged-in users.
export const shareLink = (origin: string, id: string) => `${origin}/?org=${encodeURIComponent(id)}`

// ADR-020: logo/cover are sent raw; the server checks type (by content) and size.
export const IMAGE_MAX_BYTES = 2 * 1024 * 1024
export const uploadProfileImage = (orgId: string, which: 'logo' | 'cover', file: Blob) =>
  call<{ url: string }>(`/orgs/${encodeURIComponent(orgId)}/${which}`, { method: 'PUT', body: file })
export const removeProfileImage = (orgId: string, which: 'logo' | 'cover') =>
  call<void>(`/orgs/${encodeURIComponent(orgId)}/${which}`, { method: 'DELETE' })

export const setVisibility = (orgId: string, visibility: Visibility) =>
  call<{ organisation: { visibility: Visibility } }>(`/orgs/${encodeURIComponent(orgId)}`, {
    method: 'PATCH',
    body: JSON.stringify({ visibility }),
  })
