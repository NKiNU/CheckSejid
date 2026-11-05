import { call } from '../identity/api.ts'

// ADR-021. Lifecycle: DRAFT → PUBLISHED → ARCHIVED → PUBLISHED. The server enforces it and the keys.
export type ContentStatus = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED'
export type HubImage = { id: string; url: string; isMain: boolean }
export type Post = { id: string; title: string; body: string; status: ContentStatus; publishedAt: string | null; createdAt: string; images: HubImage[] }
export type HubEvent = {
  id: string
  title: string
  description: string
  startsAt: string
  endsAt: string
  location: string | null
  status: ContentStatus
  publishedAt: string | null
  images: HubImage[]
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

// ADR-033: up to 5 images per draft item, sent raw like the logo; the server checks type by content and size.
export const HUB_IMAGE_MAX_BYTES = 5 * 1024 * 1024
export const HUB_IMAGE_MAX_COUNT = 5
const imageBase = (orgId: string, kind: Kind, id: string) => `${base(orgId, kind)}/${encodeURIComponent(id)}/images`
export const uploadHubImage = async (orgId: string, kind: Kind, id: string, file: Blob) =>
  (await call<{ image: HubImage }>(imageBase(orgId, kind, id), { method: 'POST', body: file })).image
export const removeHubImage = (orgId: string, kind: Kind, id: string, imageId: string) =>
  call<void>(`${imageBase(orgId, kind, id)}/${encodeURIComponent(imageId)}`, json('DELETE'))
export const setMainHubImage = async (orgId: string, kind: Kind, id: string, imageId: string) =>
  (await call<{ images: HubImage[] }>(`${imageBase(orgId, kind, id)}/${encodeURIComponent(imageId)}/main`, json('POST'))).images

// Convenience only (the server decides): the message key of the first problem, else null.
export const checkHubImage = (file: { name: string; type: string; size: number }, count: number) =>
  count >= HUB_IMAGE_MAX_COUNT
    ? 'hub.img.max'
    : /^image\/hei[cf]$/.test(file.type) || /\.hei[cf]$/i.test(file.name)
      ? 'hub.img.heic'
      : !['image/jpeg', 'image/png', 'image/webp'].includes(file.type)
        ? 'hub.img.type'
        : file.size > HUB_IMAGE_MAX_BYTES
          ? 'hub.img.big'
          : null
