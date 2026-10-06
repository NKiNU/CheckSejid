import { call } from '../identity/api.ts'

export const ORG_TYPES = ['masjid', 'surau', 'madrasah', 'school', 'ngo', 'other'] as const
export type OrgStatus = 'DRAFT' | 'ONBOARDING' | 'ACTIVE' | 'SUSPENDED' | 'ARCHIVED'
export type Profile = {
  type: (typeof ORG_TYPES)[number] | null
  description: string | null
  contactEmail: string | null
  contactPhone: string | null
  addressLine: string | null
  state: string | null
  country: string | null
}
export type Organisation = {
  id: string
  name: string
  isOwner: boolean
  createdAt: string
  status: OrgStatus
  visibility: 'PUBLIC' | 'UNLISTED' | 'PRIVATE'
  logoUrl: string | null
  coverUrl: string | null
} & Profile

export async function listMyOrganisations() {
  return (await call<{ organisations: Organisation[] }>('/orgs')).organisations
}

export async function createOrganisation(name: string) {
  const body = JSON.stringify({ name })
  return (await call<{ organisation: Organisation }>('/orgs', { method: 'POST', body })).organisation
}

// The selected organisation is only an identifier: the server re-checks membership on every call.
export async function getOrganisation(id: string) {
  return (await call<{ organisation: Organisation }>(`/orgs/${encodeURIComponent(id)}`)).organisation
}

// ADR-016: the status is read-only here; it changes only through these server-side actions.
const orgPath = (id: string) => `/orgs/${encodeURIComponent(id)}`
const post = (data?: unknown): RequestInit => ({ method: 'POST', body: data === undefined ? undefined : JSON.stringify(data) })

export async function updateProfile(id: string, change: Partial<Omit<Profile, 'type' | 'state' | 'country'> & { name: string; type: NonNullable<Profile['type']>; state: string; country: string }>) {
  const init = { method: 'PATCH', body: JSON.stringify(change) }
  return (await call<{ organisation: Organisation }>(orgPath(id), init)).organisation
}

export async function completeOnboarding(id: string) {
  return (await call<{ organisation: Organisation }>(`${orgPath(id)}/onboarding/complete`, post())).organisation
}

export async function archiveOrganisation(id: string) {
  return (await call<{ organisation: Organisation }>(`${orgPath(id)}/archive`, post({}))).organisation
}
