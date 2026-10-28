import { useEffect, useState } from 'react'
import { useT } from '../../i18n/index.tsx'
import { Card, CardContent } from '@/components/ui/card.tsx'
import { myFeed, type FeedItem, type HubEvent, type Post } from '../hub/api.ts'

// ADR-019 §3: following only adds published content to the user's own feed.
export function FeedPanel() {
  const { t, dateTime } = useT()
  const [feed, setFeed] = useState<{ posts: FeedItem<Post>[]; events: FeedItem<HubEvent>[] } | null>(null)
  useEffect(() => {
    myFeed().then(setFeed, () => setFeed(null))
  }, [])
  if (!feed || (feed.posts.length === 0 && feed.events.length === 0)) return null
  const row = (id: string, org: string, title: string, when?: string) => (
    <li key={id}>
      <Card size="sm">
        <CardContent className="gap-1">
          <span className="text-sm text-muted-foreground [overflow-wrap:anywhere]">{org}</span>
          <span className="font-medium [overflow-wrap:anywhere]">{title}</span>
          {when && <span className="text-sm text-muted-foreground">{dateTime(when)}</span>}
        </CardContent>
      </Card>
    </li>
  )
  return (
    <section className="grid gap-3 pt-6 pb-6">
      <h2 className="text-base font-medium">{t('feed.heading')}</h2>
      <ul className="grid gap-3">
        {feed.events.map((e) => row(e.id, e.organisation.name, e.title, e.startsAt))}
        {feed.posts.map((p) => row(p.id, p.organisation.name, p.title, p.publishedAt ?? undefined))}
      </ul>
    </section>
  )
}
