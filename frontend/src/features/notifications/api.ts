import { call } from '../identity/api.ts'

// Self-scoped (ADR-017): no organisation id is sent; the server returns only the caller's own
// notifications from organisations they still belong to. Titles are plain text.
export type Notification = {
  id: string
  organisationId: string
  organisationName: string
  type: string
  title: string
  targetType: string
  targetId: string
  readAt: string | null
  createdAt: string
}

export type Inbox = { notifications: Notification[]; nextCursor: string | null; unreadCount: number }

export const listNotifications = (unreadOnly = false) =>
  call<Inbox>(`/me/notifications${unreadOnly ? '?unread=true' : ''}`)

export const markRead = (id: string) =>
  call<void>(`/me/notifications/${encodeURIComponent(id)}/read`, { method: 'POST' })

export const markAllRead = async () => (await call<{ count: number }>('/me/notifications/read-all', { method: 'POST' })).count
