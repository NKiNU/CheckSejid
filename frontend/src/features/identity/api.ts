// Identity API client. The access token lives only in memory (ADR-009): never localStorage.
// The refresh token is an httpOnly cookie the browser sends to /auth/session/* by itself.

export type User = { id: string; email: string; displayName: string; createdAt: string }

export class ApiError extends Error {
  readonly status: number
  readonly code: string
  constructor(status: number, code: string, message: string) {
    super(message)
    this.status = status
    this.code = code
  }
}

let accessToken: string | null = null

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers)
  if (init.body) headers.set('Content-Type', 'application/json')
  if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`)
  const res = await fetch(path, { ...init, headers, credentials: 'same-origin' })
  if (res.status === 204) return undefined as T
  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new ApiError(res.status, body.error?.code ?? 'UNKNOWN', body.error?.message ?? res.statusText)
  }
  return body as T
}

const post = <T>(path: string, data?: unknown) =>
  call<T>(path, { method: 'POST', body: data === undefined ? undefined : JSON.stringify(data) })

export async function register(email: string, password: string, displayName: string) {
  return (await post<{ user: User }>('/auth/register', { email, password, displayName })).user
}

export async function login(email: string, password: string) {
  accessToken = (await post<{ accessToken: string }>('/auth/login', { email, password })).accessToken
}

// Restores a session from the refresh cookie (e.g. after a page reload). Returns false if none.
// Concurrent callers share one request: sending the same refresh token twice would be
// treated by the server as token reuse and revoke the session (e.g. React StrictMode effects).
let refreshing: Promise<boolean> | null = null
export function refresh(): Promise<boolean> {
  refreshing ??= (async () => {
    try {
      accessToken = (await post<{ accessToken: string }>('/auth/session/refresh')).accessToken
      return true
    } catch (e) {
      accessToken = null
      if (e instanceof ApiError && e.status === 401) return false
      throw e
    } finally {
      refreshing = null
    }
  })()
  return refreshing
}

export async function logout() {
  accessToken = null
  await post<void>('/auth/session/logout')
}

// ponytail: no transparent 401→refresh→retry; the page refreshes on load. Add when sessions outlive 15 min of idle UI.
export async function me() {
  return (await call<{ user: User }>('/me')).user
}
