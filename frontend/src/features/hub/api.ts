import { call } from '../identity/api.ts'

// ADR-021. Lifecycle: DRAFT → PUBLISHED → ARCHIVED → PUBLISHED. The server enforces it and the keys.
export type ContentStatus = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED'
export type Post = { id: string; title: string; body: string; status: ContentStatus; publishedAt: string | null; createdAt: string }
export type HubEvent = {
  id: string
  title: string
  description: string
  startsAt: string
  endsAt: string
  location: string | null
  status: ContentStatus
  publishedAt: string | null
}
export type Kind = 'post' | 'event'

const base = (orgId: string, kind: Kind) => `/orgs/${encodeURIComponent(orgId)}/hub/${kind}s`
const json = (method: string, data?: unknown): RequestInit => ({ method, body: data === undefined ? undefined : JSON.stringify(data) })

export const listPosts = async (orgId: string) => (await call<{ posts: Post[] }>(base(orgId, 'post'))).posts
export const listEvents = async (orgId: string) => (await call<{ events: HubEvent[] }>(base(orgId, 'event'))).events
export const createPost = async (orgId: string, data: { title: string; body: string }) =>
  (await call<{ post: Post }>(base(orgId, 'post'), json('POST', data))).post
export const createEvent = async (orgId: string, data: { title: string; description: string; startsAt: string; endsAt: string; location: string | null }) =>
  (await call<{ event: HubEvent }>(base(orgId, 'event'), json('POST', data))).event
export const transition = (orgId: string, kind: Kind, id: string, action: 'publish' | 'archive') =>
  call<Record<Kind, Post | HubEvent>>(`${base(orgId, kind)}/${encodeURIComponent(id)}/${action}`, json('POST'))
export const removeDraft = (orgId: string, kind: Kind, id: string) => call<void>(`${base(orgId, kind)}/${encodeURIComponent(id)}`, json('DELETE'))

// Which action a status allows (ADR-021 §3); used only to show buttons.
export const nextActions = (status: ContentStatus): ('publish' | 'archive')[] =>
  status === 'PUBLISHED' ? ['archive'] : ['publish']

// A local "datetime-local" value (no zone) → an ISO instant in the browser's zone (stored as UTC).
export const localInputToIso = (value: string) => new Date(value).toISOString()

export type FeedItem<T> = T & { organisation: { id: string; name: string } }
export const myFeed = () => call<{ posts: FeedItem<Post>[]; events: FeedItem<HubEvent>[] }>('/me/feed')
export const publicPosts = async (orgId: string) => (await call<{ posts: Post[] }>(`/public/orgs/${encodeURIComponent(orgId)}/posts`)).posts
export const publicEvents = async (orgId: string) => (await call<{ events: HubEvent[] }>(`/public/orgs/${encodeURIComponent(orgId)}/events`)).events
