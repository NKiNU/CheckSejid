import { call } from '../identity/api.ts'

// Role and permission keys come from the backend (ADR-010, ADR-015). The UI uses them only to hide
// controls; the server re-checks every request (AUTH-003).
export const ASSIGNABLE_ROLES = ['admin', 'treasurer', 'committee', 'staff'] as const
export type Role = 'owner' | (typeof ASSIGNABLE_ROLES)[number]

export type Member = {
  id: string
  userId: string
  displayName: string
  isOwner: boolean
  roles: Role[]
  title: string | null
  createdAt: string
}

const org = (id: string) => `/orgs/${encodeURIComponent(id)}`
const send = (method: string, data?: unknown): RequestInit => ({
  method,
  body: data === undefined ? undefined : JSON.stringify(data),
})

export async function myPermissions(orgId: string) {
  return call<{ roles: Role[]; permissions: string[] }>(`${org(orgId)}/me/permissions`)
}

export async function listMembers(orgId: string) {
  return (await call<{ members: Member[] }>(`${org(orgId)}/members`)).members
}

export async function addMember(orgId: string, email: string) {
  return (await call<{ member: Member }>(`${org(orgId)}/members`, send('POST', { email }))).member
}

export async function updateMember(orgId: string, memberId: string, change: { roles?: Role[]; title?: string | null }) {
  const path = `${org(orgId)}/members/${encodeURIComponent(memberId)}`
  return (await call<{ member: Member }>(path, send('PATCH', change))).member
}

export async function removeMember(orgId: string, memberId: string) {
  await call<void>(`${org(orgId)}/members/${encodeURIComponent(memberId)}`, send('DELETE'))
}

export async function leave(orgId: string) {
  await call<void>(`${org(orgId)}/leave`, send('POST'))
}

export async function transferOwnership(orgId: string, membershipId: string) {
  await call<unknown>(`${org(orgId)}/ownership/transfer`, send('POST', { membershipId }))
}
