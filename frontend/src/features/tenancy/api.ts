import { call } from '../identity/api.ts'

export type Organisation = { id: string; name: string; isOwner: boolean; createdAt: string }

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
