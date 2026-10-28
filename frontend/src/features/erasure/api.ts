import { call } from '../identity/api.ts'

// ADR-031. The server decides everything (owner-only, grace period, who may cancel); this only displays it.
export type ErasureStatus = 'PENDING_GRACE' | 'CANCELLED' | 'RUNNING' | 'COMPLETED' | 'FAILED'
export type ErasureRequest = { id: string; kind: 'USER' | 'ORGANISATION'; status: ErasureStatus; executeAfter: string; failureCode: string | null }
export type Retention = 1 | 3 | 5 | 7 | null

type One = { request: ErasureRequest | null }
const send = <T>(method: string, path: string, data?: unknown) =>
  call<T>(path, { method, body: data === undefined ? undefined : JSON.stringify(data) })

export const orgErasure = (orgId: string) => `/orgs/${orgId}/erasure`
export const MY_ERASURE = '/me/erasure'

// Same four calls for an organisation and for the caller's own account.
export const current = (path: string) => send<One>('GET', path).then((r) => r.request)
export const request = (path: string, password: string) => send<One>('POST', path, { password }).then((r) => r.request!)
export const cancel = (path: string) => send<One>('DELETE', path).then((r) => r.request!)
export const retry = (path: string) => send<One>('POST', `${path}/retry`).then((r) => r.request!)

export const getRetention = (orgId: string) => send<{ years: Retention }>('GET', `/orgs/${orgId}/retention`).then((r) => r.years)
export const setRetention = (orgId: string, years: Retention) => send<{ years: Retention }>('PUT', `/orgs/${orgId}/retention`, { years }).then((r) => r.years)
