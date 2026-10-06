import { useEffect, useState } from 'react'
import { useT } from '../../i18n/index.tsx'
import * as api from './api.ts'

// Minimal Phase 10 UI: the caller's own inbox. Text is rendered as plain React text, never as HTML.
export function NotificationsPanel() {
  const { t, error: errorText } = useT()
  const [inbox, setInbox] = useState<api.Inbox | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = () => api.listNotifications().then(setInbox)
  const run = async (fn: () => Promise<unknown>) => {
    setError(null)
    try {
      await fn()
      await load()
    } catch (e) {
      setError(errorText(e))
    }
  }
  useEffect(() => {
    load().catch((e) => setError(errorText(e)))
  }, [])

  return (
    <section>
      <h3>
        {t('notif.heading')}
        {inbox && ` (${t('notif.unread', { count: inbox.unreadCount })})`}
      </h3>
      {inbox && inbox.unreadCount > 0 && (
        <button type="button" onClick={() => run(api.markAllRead)}>
          {t('notif.markAll')}
        </button>
      )}
      <ul>
        {inbox?.notifications.map((n) => (
          <li key={n.id}>
            {n.readAt ? n.title : <strong>{n.title}</strong>} — {n.organisationName}{' '}
            {!n.readAt && (
              <button type="button" onClick={() => run(() => api.markRead(n.id))}>
                {t('notif.markRead')}
              </button>
            )}
          </li>
        ))}
      </ul>
      {inbox?.notifications.length === 0 && <p>{t('notif.none')}</p>}
      {error && <p role="alert">{error}</p>}
    </section>
  )
}
