import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '../../components/Icon';
import { PageHeader } from '../../components/CommunityLayout';
import { FeaturedPost, PostCard } from '../../components/PostCard';
import { Pill } from '../../components/ui';
import { buildFeed } from '../../domain/bulletin';
import { formatHijri } from '../../domain/calendar';
import { formatClock, formatDuration, nextPrayer } from '../../domain/prayer';
import type { PostKind } from '../../domain/types';
import { CURRENT_USER, PRAYER_DAY } from '../../data/seed';
import { useApp } from '../../store';

const KINDS: { key: 'all' | 'announcements' | 'events' | 'classes'; kind?: PostKind }[] = [
  { key: 'all' }, { key: 'announcements', kind: 'announcement' }, { key: 'events', kind: 'event' }, { key: 'classes', kind: 'class' },
];

export function BulletinHome() {
  const { t, lang, posts, orgs, followed } = useApp();
  const [filter, setFilter] = useState<(typeof KINDS)[number]>(KINDS[0]);
  const feed = useMemo(() => buildFeed(posts, orgs, followed, filter.kind), [posts, orgs, followed, filter]);
  const orgById = useMemo(() => new Map(orgs.map((o) => [o.id, o])), [orgs]);
  const now = new Date();
  const next = nextPrayer(PRAYER_DAY, now);

  return (
    <>
      <PageHeader
        title={t('bulletin')}
        subtitle={`${t('greeting')}, ${CURRENT_USER.name}`}
        right={
          <button type="button" aria-label={t('notifications')} className="relative flex size-11 cursor-pointer items-center justify-center rounded-full border border-line bg-surface text-ink">
            <Icon name="bell" />
            <span className="absolute top-2 right-2.5 size-2.5 rounded-full border-2 border-surface bg-gold" />
          </button>
        }
      />

      <Link to="/prayer" className="mx-5 flex h-11 items-center gap-2.5 rounded-[14px] border border-line bg-surface px-3.5 text-[13px] text-ink no-underline">
        <Icon name="moon" size={16} strokeWidth={2} className="text-brand" />
        <span className="font-bold">{next.name} {formatClock(next.time)}</span>
        <span className="text-muted">{t('in')} {formatDuration(next.minutesAway)}</span>
        <span className="ml-auto truncate font-semibold text-gold-ink">{formatHijri(now, lang, false)}</span>
      </Link>

      <div role="group" aria-label="Post type" className="no-scrollbar flex gap-2 overflow-x-auto px-5 pt-3">
        {KINDS.map((k) => (
          <Pill key={k.key} pressed={filter.key === k.key} onClick={() => setFilter(k)}>{t(k.key)}</Pill>
        ))}
      </div>

      <div className="flex flex-col gap-2.5 px-5 pt-3">
        {feed.featured && orgById.get(feed.featured.orgId) && <FeaturedPost post={feed.featured} org={orgById.get(feed.featured.orgId)!} />}
        {feed.posts.length > 0 && <h2 className="m-0 mt-1.5 text-[15px] font-bold">{t('latestFollowed')}</h2>}
        {feed.posts.map((p) => <PostCard key={p.id} post={p} org={orgById.get(p.orgId)!} />)}
        {!feed.featured && feed.posts.length === 0 && (
          <div className="rounded-[var(--radius-card)] border border-dashed border-line-strong p-7 text-center text-sm text-muted">
            <p className="m-0">{t('emptyFeed')}</p>
            <Link to="/discover" className="mt-3 inline-flex h-11 items-center rounded-xl bg-brand px-4 font-bold text-surface no-underline">{t('findOrgs')}</Link>
          </div>
        )}
      </div>
    </>
  );
}
