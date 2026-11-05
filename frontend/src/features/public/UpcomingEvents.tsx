import { useEffect, useState } from 'react'
import { useT } from '../../i18n/index.tsx'
import { Button } from '@/components/ui/button.tsx'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog.tsx'
import { Gallery, MainPhoto } from '../hub/Images.tsx'
import * as api from './api.ts'

// PUB-007 / ADR-033: upcoming public events for everyone, no login. The server decides what is listed.
export function UpcomingEvents() {
  const { t, error: message, dateTime } = useT()
  const [events, setEvents] = useState<api.UpcomingEvent[] | null>(null)
  const [next, setNext] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<api.UpcomingEvent | null>(null)
  const [open, setOpen] = useState(false) // separate from `selected` so the details stay put during the close animation

  const load = (cursor?: string) =>
    api.upcomingEvents(cursor).then(
      (r) => (setEvents((old) => [...(old ?? []), ...r.events]), setNext(r.nextCursor), setError(null)),
      (e) => setError(message(e)),
    )
  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- message identity changes with locale
  }, [])

  return (
    <section className="grid gap-3 pt-6">
      <h2 className="text-2xl font-medium">{t('disc.events')}</h2>
      {!events && !error && <p role="status" className="text-muted-foreground">{t('common.loading')}</p>}
      {events?.length === 0 && <p className="text-muted-foreground">{t('disc.noEvents')}</p>}
      {events && events.length > 0 && (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {events.map((e) => (
            <li key={e.id} className="min-w-0">
              <button
                type="button"
                onClick={() => (setSelected(e), setOpen(true))}
                className="grid min-h-11 w-full content-start gap-1 rounded-xl bg-card p-4 text-start text-sm text-card-foreground shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring active:opacity-80"
              >
                <MainPhoto images={e.images} title={e.title} />
                <span className="block text-base font-medium [overflow-wrap:anywhere]">{e.title}</span>
                <span className="block text-muted-foreground [overflow-wrap:anywhere]">{e.organisation.name}</span>
                <span className="block text-muted-foreground">{dateTime(e.startsAt)}</span>
                {e.location && <span className="block text-muted-foreground [overflow-wrap:anywhere]">{e.location}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
      {next && (
        <Button type="button" variant="outline" className="h-11 w-full sm:w-fit" onClick={() => load(next)}>
          {t('disc.loadMore')}
        </Button>
      )}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          {selected && (
            <>
              <DialogTitle>{selected.title}</DialogTitle>
              <Gallery images={selected.images} title={selected.title} />
              <DialogDescription className="grid gap-1">
                <span>{selected.organisation.name}</span>
                <span>{t('hub.starts')} {dateTime(selected.startsAt)}</span>
                <span>{t('hub.ends')} {dateTime(selected.endsAt)}</span>
                {selected.location && <span className="[overflow-wrap:anywhere]">{selected.location}</span>}
              </DialogDescription>
              {selected.description && <p className="whitespace-pre-line text-sm [overflow-wrap:anywhere]">{selected.description}</p>}
              <Button asChild className="h-11 px-4">
                <a href={api.shareLink(location.origin, selected.organisation.id)}>{t('disc.viewOrg')}</a>
              </Button>
            </>
          )}
        </DialogContent>
      </Dialog>
    </section>
  )
}
