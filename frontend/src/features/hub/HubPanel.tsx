import { useEffect, useState, type FormEvent } from 'react'
import { useT } from '../../i18n/index.tsx'
import { FormDialog } from '@/components/FormDialog.tsx'
import { Badge } from '@/components/ui/badge.tsx'
import { Button } from '@/components/ui/button.tsx'
import { Card, CardContent } from '@/components/ui/card.tsx'
import { Input } from '@/components/ui/input.tsx'
import { Label } from '@/components/ui/label.tsx'
import { Textarea } from '@/components/ui/textarea.tsx'
import * as api from './api.ts'
import { contentStatusVariant } from './status.ts'

// Phase 06: bulletin posts and events with their lifecycle. Controls follow the caller's keys; the
// server enforces them (AUTH-003).
export function HubPanel({ orgId, perms }: { orgId: string; perms: ReadonlySet<string> }) {
  const { t, error: errorText, dateTime } = useT()
  const [posts, setPosts] = useState<api.Post[] | null>(null)
  const [events, setEvents] = useState<api.HubEvent[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [dialog, setDialog] = useState<api.Kind | null>(null)
  const [open, setOpen] = useState(false) // separate from `dialog` so the form stays put during the close animation
  const show = (k: api.Kind) => (setError(null), setDialog(k), setOpen(true))

  const load = () =>
    Promise.all([api.listPosts(orgId), api.listEvents(orgId)]).then(
      ([p, e]) => (setPosts(p), setEvents(e)),
      (e) => (setPosts((p) => p ?? []), setEvents((v) => v ?? []), setError(errorText(e))),
    )
  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load/errorText identity changes with locale
  }, [orgId])

  // Resolves true when the call succeeded, so a dialog only closes on success.
  const run = async (fn: () => Promise<unknown>) => {
    setError(null)
    try {
      await fn()
      await load()
      return true
    } catch (e) {
      setError(errorText(e))
      return false
    }
  }

  async function addPost(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    if (await run(() => api.createPost(orgId, { title: String(f.get('title')), body: String(f.get('body')) }))) setOpen(false)
  }
  async function addEvent(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    const ok = await run(() =>
      api.createEvent(orgId, {
        title: String(f.get('title')),
        description: String(f.get('description') ?? ''),
        startsAt: api.localInputToIso(String(f.get('startsAt'))),
        endsAt: api.localInputToIso(String(f.get('endsAt'))),
        location: String(f.get('location') ?? '').trim() || null,
      }),
    )
    if (ok) setOpen(false)
  }

  const actions = (kind: api.Kind, item: api.Post | api.HubEvent) => {
    const publish = perms.has(kind === 'post' ? 'bulletin.publish' : 'event.publish') ? api.nextActions(item.status) : []
    const del = item.status === 'DRAFT' && perms.has(kind === 'post' ? 'bulletin.manage' : 'event.manage')
    if (publish.length === 0 && !del) return null
    return (
      <div className="flex flex-wrap gap-2">
        {publish.map((a) => (
          <Button key={a} type="button" variant="outline" className="h-11 px-4" onClick={() => run(() => api.transition(orgId, kind, item.id, a))}>
            {item.status === 'ARCHIVED' ? t('action.republish') : t(`action.${a}`)}
          </Button>
        ))}
        {del && (
          <Button type="button" variant="outline" className="h-11 px-4" onClick={() => run(() => api.removeDraft(orgId, kind, item.id))}>
            {t('hub.deleteDraft')}
          </Button>
        )}
      </div>
    )
  }

  const card = (kind: api.Kind, item: api.Post | api.HubEvent) => {
    const ev = kind === 'event' ? (item as api.HubEvent) : null
    const text = ev ? ev.description : (item as api.Post).body
    const when = ev ? ev.startsAt : (item as api.Post).publishedAt ?? (item as api.Post).createdAt
    return (
      <li key={item.id} className="min-w-0">
        <Card size="sm">
          <CardContent className="gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={contentStatusVariant(item.status)}>{t(`state.${item.status}`)}</Badge>
              <Badge>{dateTime(when)}</Badge>
            </div>
            <h3 className="min-w-0 text-base font-medium [overflow-wrap:anywhere]">{item.title}</h3>
            {ev && (
              <p className="text-sm text-muted-foreground [overflow-wrap:anywhere]">
                {t('hub.ends')} {dateTime(ev.endsAt)}
                {ev.location && ` · ${ev.location}`}
              </p>
            )}
            {text && <Clamp text={text} />}
            {actions(kind, item)}
          </CardContent>
        </Card>
      </li>
    )
  }

  const section = (kind: api.Kind, title: string, items: api.Post[] | api.HubEvent[] | null, empty: string, canCreate: boolean, newLabel: string) => (
    <section className="grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="min-w-0 text-lg font-medium">{title}</h2>
        {canCreate && (
          <Button type="button" className="h-11 px-4" onClick={() => show(kind)}>
            {newLabel}
          </Button>
        )}
      </div>
      {!items && !error && <p role="status" className="text-muted-foreground">{t('common.loading')}</p>}
      {items?.length === 0 && <p className="text-muted-foreground">{empty}</p>}
      {items && items.length > 0 && <ul className="grid gap-3 lg:grid-cols-2">{(items as (api.Post | api.HubEvent)[]).map((i) => card(kind, i))}</ul>}
    </section>
  )

  const field = 'grid min-w-0 gap-2'
  return (
    <div className="grid gap-6 pt-6">
      <h1 className="text-2xl font-medium">{t('nav.hub')}</h1>
      {section('post', t('hub.announcements'), posts, t('hub.noPosts'), perms.has('bulletin.manage'), t('hub.newPost'))}
      {section('event', t('hub.events'), events, t('hub.noEvents'), perms.has('event.manage'), t('hub.newEvent'))}
      {error && !open && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <FormDialog
        open={open}
        onOpenChange={setOpen}
        title={dialog === 'event' ? t('hub.newEvent') : t('hub.newPost')}
        submitLabel={t('common.saveDraft')}
        onSubmit={dialog === 'event' ? addEvent : addPost}
        error={error}
      >
        {dialog === 'event' ? (
          <>
            <div className={field}>
              <Label htmlFor="hub-title">{t('common.title')}</Label>
              <Input id="hub-title" name="title" className="h-11" required maxLength={200} />
            </div>
            <div className={field}>
              <Label htmlFor="hub-desc">{t('common.description')}</Label>
              <Textarea id="hub-desc" name="description" maxLength={20000} />
            </div>
            <div className={field}>
              <Label htmlFor="hub-starts">{t('hub.starts')}</Label>
              <Input id="hub-starts" name="startsAt" type="datetime-local" className="h-11" required />
            </div>
            <div className={field}>
              <Label htmlFor="hub-ends">{t('hub.ends')}</Label>
              <Input id="hub-ends" name="endsAt" type="datetime-local" className="h-11" required />
            </div>
            <div className={field}>
              <Label htmlFor="hub-loc">{t('hub.location')}</Label>
              <Input id="hub-loc" name="location" className="h-11" maxLength={300} />
            </div>
          </>
        ) : (
          <>
            <div className={field}>
              <Label htmlFor="hub-title">{t('common.title')}</Label>
              <Input id="hub-title" name="title" className="h-11" required maxLength={200} />
            </div>
            <div className={field}>
              <Label htmlFor="hub-body">{t('hub.text')}</Label>
              <Textarea id="hub-body" name="body" required maxLength={20000} />
            </div>
          </>
        )}
      </FormDialog>
    </div>
  )
}

// Three lines until expanded. The toggle shows only when the text can overflow three lines at 320px.
function Clamp({ text }: { text: string }) {
  const { t } = useT()
  const [more, setMore] = useState(false)
  const long = text.length > 100 || text.split('\n').length > 3
  return (
    <div className="grid justify-items-start gap-1">
      <p className={`whitespace-pre-line text-sm [overflow-wrap:anywhere] ${more ? '' : 'line-clamp-3'}`}>{text}</p>
      {long && (
        <Button type="button" variant="link" aria-expanded={more} className="h-11 px-0" onClick={() => setMore(!more)}>
          {more ? t('hub.less') : t('hub.more')}
        </Button>
      )}
    </div>
  )
}
