import type { BadgeVariant } from '@/components/ui/badge.tsx'
import { call } from '../identity/api.ts'

// ADR-032. The server decides everything (owner-only decisions, 1 hour window, read-only); the UI only shows it.
export type Status = 'REQUESTED' | 'GRANTED' | 'DENIED' | 'REVOKED' | 'EXPIRED'
export type SupportRequest = {
  id: string
  organisationId: string
  reason: string
  status: Status
  expiresAt: string | null
  createdAt: string
  adminName?: string | null
  organisationName?: string | null
}
export type LogRow = { id: string; action: string; reason: string | null; createdAt: string }

export const statusVariant = (s: Status): BadgeVariant =>
  s === 'GRANTED' ? 'success' : s === 'REQUESTED' ? 'warning' : s === 'DENIED' || s === 'REVOKED' ? 'destructive' : 'neutral'

const org = (id: string) => `/orgs/${encodeURIComponent(id)}/support`

export const requestAccess = async (organisationId: string, reason: string) =>
  (await call<{ request: SupportRequest }>('/platform/support/requests', { method: 'POST', body: JSON.stringify({ organisationId, reason }) })).request
export const myRequests = async () => (await call<{ requests: SupportRequest[] }>('/platform/support/requests')).requests
export const platformOrganisations = async () =>
  (await call<{ organisations: { id: string; name: string }[] }>('/platform/organisations?limit=100')).organisations

export const ownerRequests = async (orgId: string) => (await call<{ requests: SupportRequest[] }>(`${org(orgId)}/requests`)).requests
export const ownerLog = async (orgId: string) => (await call<{ log: LogRow[] }>(`${org(orgId)}/log`)).log
export const decide = async (orgId: string, id: string, verb: 'approve' | 'deny' | 'revoke' | 'extend') =>
  (await call<{ request: SupportRequest }>(`${org(orgId)}/requests/${encodeURIComponent(id)}/${verb}`, { method: 'POST', body: JSON.stringify({}) })).request
