import { useEffect, useState } from 'react'
import { useT } from '../../i18n/index.tsx'
import { Button } from '@/components/ui/button.tsx'
import { Card, CardContent } from '@/components/ui/card.tsx'
import { publicEvents, publicPosts, type HubEvent, type Post } from '../hub/api.ts'
import * as api from './api.ts'

export function PublicOrgPage({ id }: { id: string }) {
  const { t, error: message, dateTime } = useT()
  const [org, setOrg] = useState<api.PublicOrganisation | null>(null)
  const [posts, setPosts] = useState<Post[]>([])
  const [events, setEvents] = useState<HubEvent[]>([])
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    Promise.all([api.getPublicOrganisation(id), publicPosts(id), publicEvents(id)]).then(
      ([o, p, e]) => (setOrg(o), setPosts(p), setEvents(e)),
      (e) => setError(message(e)),
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])
  if (error) return <p role="alert" className="text-sm text-destructive">{error}</p>
  if (!org) return <p role="status" className="text-muted-foreground">{t('common.loading')}</p>

  async function toggle() {
    try {
      if (org!.following) await api.unfollow(id)
      else await api.follow(id)
      setOrg({ ...org!, following: !org!.following })
    } catch (e) {
      setError(message(e))
    }
  }

  const contact = [[org.addressLine, org.state, org.country].filter(Boolean).join(', '), org.contactPhone, org.contactEmail].filter(Boolean)
  return (
    <article className="grid gap-4">
      <Card className="gap-0 py-0">
        {org.coverUrl ? <img src={org.coverUrl} alt="" className="h-36 w-full object-cover sm:h-48" /> : <div className="h-16 bg-muted" aria-hidden />}
        <CardContent className="gap-3 py-4">
          <div className="flex items-center gap-3">
            {org.logoUrl && <img src={org.logoUrl} alt="" width={48} height={48} className="size-12 shrink-0 rounded-lg bg-muted object-cover" />}
            <h2 className="min-w-0 text-xl font-medium [overflow-wrap:anywhere]">{org.name}</h2>
          </div>
          {org.description && <p className="[overflow-wrap:anywhere]">{org.description}</p>}
          {contact.length > 0 && <p className="text-sm text-muted-foreground [overflow-wrap:anywhere]">{contact.join(' · ')}</p>}
          {org.followable && (
            <Button type="button" variant={org.following ? 'outline' : 'default'} className="h-11 w-full sm:w-fit" onClick={toggle}>
              {org.following ? t('disc.unfollow') : t('disc.follow')}
            </Button>
          )}
        </CardContent>
      </Card>
      <h3 className="text-base font-medium">{t('disc.events')}</h3>
      {events.length === 0 && <p className="text-muted-foreground">{t('disc.noEvents')}</p>}
      {events.map((e) => (
        <Card size="sm" key={e.id}>
          <CardContent className="gap-1">
            <span className="font-medium [overflow-wrap:anywhere]">{e.title}</span>
            <span className="text-sm text-muted-foreground [overflow-wrap:anywhere]">{dateTime(e.startsAt)}{e.location && ` · ${e.location}`}</span>
          </CardContent>
        </Card>
      ))}
      <h3 className="text-base font-medium">{t('hub.announcements')}</h3>
      {posts.length === 0 && <p className="text-muted-foreground">{t('disc.noPosts')}</p>}
      {posts.map((p) => (
        <Card size="sm" key={p.id}>
          <CardContent className="gap-1">
            <span className="font-medium [overflow-wrap:anywhere]">{p.title}</span>
            <span className="whitespace-pre-line text-sm text-muted-foreground [overflow-wrap:anywhere]">{p.body}</span>
          </CardContent>
        </Card>
      ))}
    </article>
  )
}
