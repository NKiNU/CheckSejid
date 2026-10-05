import { useEffect, useState } from 'react'
import * as api from './api.ts'

// Minimal Phase 10 UI: the caller's own inbox. Text is rendered as plain React text, never as HTML.
export function NotificationsPanel() {
  const [inbox, setInbox] = useState<api.Inbox | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = () => api.listNotifications().then(setInbox)
  const run = async (fn: () => Promise<unknown>) => {
    setError(null)
    try {
      await fn()
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
    }
  }
  useEffect(() => {
    load().catch((e) => setError(e instanceof Error ? e.message : 'Something went wrong'))
  }, [])

  return (
    <section>
      <h3>Notifications{inbox && ` (${inbox.unreadCount} unread)`}</h3>
      {inbox && inbox.unreadCount > 0 && (
        <button type="button" onClick={() => run(api.markAllRead)}>
          Mark all read
        </button>
      )}
      <ul>
        {inbox?.notifications.map((n) => (
          <li key={n.id}>
            {n.readAt ? n.title : <strong>{n.title}</strong>} — {n.organisationName}{' '}
            {!n.readAt && (
              <button type="button" onClick={() => run(() => api.markRead(n.id))}>
                Mark read
              </button>
            )}
          </li>
        ))}
      </ul>
      {inbox?.notifications.length === 0 && <p>No notifications.</p>}
      {error && <p role="alert">{error}</p>}
    </section>
  )
}
