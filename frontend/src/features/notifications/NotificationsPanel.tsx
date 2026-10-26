import { useEffect, useState } from 'react'
import { useT } from '../../i18n/index.tsx'
import { Badge } from '@/components/ui/badge.tsx'
import { Button } from '@/components/ui/button.tsx'
import { Card, CardContent } from '@/components/ui/card.tsx'
import * as api from './api.ts'

// Phase 10: the caller's own inbox. Text is rendered as plain React text, never as HTML.
export function NotificationsPanel() {
  const { t, error: errorText, dateTime } = useT()
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load/errorText identity changes with locale
  }, [])

  return (
    <div className="grid gap-4 pt-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="grid min-w-0 gap-1">
          <h1 className="text-2xl font-medium">{t('notif.heading')}</h1>
          {inbox && <p className="text-sm text-muted-foreground">{t('notif.unread', { count: inbox.unreadCount })}</p>}
        </div>
        {inbox && inbox.unreadCount > 0 && (
          <Button type="button" variant="outline" className="h-auto min-h-11 whitespace-normal px-4" onClick={() => run(api.markAllRead)}>
            {t('notif.markAll')}
          </Button>
        )}
      </div>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {!inbox && !error && <p role="status" className="text-muted-foreground">{t('common.loading')}</p>}
      {inbox?.notifications.length === 0 && <p className="text-muted-foreground">{t('notif.none')}</p>}
      {inbox && inbox.notifications.length > 0 && (
        <ul className="grid gap-3">
          {inbox.notifications.map((n) => (
            <li key={n.id} className="min-w-0">
              <Card size="sm">
                <CardContent className="gap-2">
                  <div className="flex items-start gap-2">
                    {!n.readAt && <span aria-hidden className="mt-2 size-2 shrink-0 rounded-full bg-primary" />}
                    <h2 className={`min-w-0 text-base [overflow-wrap:anywhere] ${n.readAt ? 'font-normal' : 'font-bold'}`}>
                      {!n.readAt && <Badge variant="success" className="mr-2 align-middle">{t('notif.new')}</Badge>}
                      {n.title}
                    </h2>
                  </div>
                  <p className="text-sm text-muted-foreground [overflow-wrap:anywhere]">
                    {n.organisationName} · {dateTime(n.createdAt)}
                  </p>
                  {!n.readAt && (
                    <div>
                      <Button type="button" variant="outline" className="h-auto min-h-11 whitespace-normal px-4" onClick={() => run(() => api.markRead(n.id))}>
                        {t('notif.markRead')}
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
