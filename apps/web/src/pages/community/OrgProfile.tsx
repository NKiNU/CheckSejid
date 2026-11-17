import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Icon, Star } from '../../components/Icon';
import { PostCard } from '../../components/PostCard';
import { OrgAvatar, cx } from '../../components/ui';
import { orgBulletin } from '../../domain/bulletin';
import { useApp } from '../../store';
import { FollowButton } from './FollowButton';

type Tab = 'bulletin' | 'events' | 'about';

export function OrgProfile() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const { t, orgs, posts } = useApp();
  const [tab, setTab] = useState<Tab>('bulletin');
  const org = orgs.find((o) => o.slug === slug);
  // Private organisations are not public at all (ORGANISATION_PROFILE.md). Unlisted ones open by link.
  const visible = org && org.visibility !== 'PRIVATE';
  const all = useMemo(() => (org ? orgBulletin(posts, org, true) : []), [org, posts]);

  if (!org || !visible) {
    return (
      <div className="p-8 text-center">
        <h1 className="text-xl font-bold">Organisation not found</h1>
        <Link to="/discover">{t('discover')}</Link>
      </div>
    );
  }

  const items = tab === 'bulletin' ? all.filter((p) => p.kind === 'announcement') : all.filter((p) => p.kind !== 'announcement');
  const tabs: Tab[] = ['bulletin', 'events', 'about'];

  return (
    <>
      <div className="relative h-[168px] overflow-hidden bg-brand">
        <div className="absolute inset-0 flex flex-wrap gap-6 p-2 text-surface opacity-15" aria-hidden="true">
          {Array.from({ length: 28 }, (_, i) => <Star key={i} size={40} strokeWidth={4} />)}
        </div>
        <div className="absolute inset-x-4 top-5 flex justify-between">
          <button type="button" onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/'))} aria-label={t('back')} className="flex size-11 cursor-pointer items-center justify-center rounded-full border-0 bg-surface/20 text-surface">
            <Icon name="back" strokeWidth={2} />
          </button>
          <button
            type="button"
            aria-label="Share profile"
            onClick={() => navigator.share?.({ title: org.name, url: window.location.href }).catch(() => undefined)}
            className="flex size-11 cursor-pointer items-center justify-center rounded-full border-0 bg-surface/20 text-surface"
          >
            <Icon name="share" strokeWidth={2} />
          </button>
        </div>
      </div>

      <div className="relative -mt-10 flex flex-col gap-3 px-5">
        <OrgAvatar org={org} size="lg" />
        <div>
          <h1 className="m-0 text-2xl leading-[30px] font-bold tracking-tight">{org.name}</h1>
          <p className="m-0 mt-1 text-sm text-muted">{org.type} · {org.area}</p>
        </div>
        <div className="flex gap-2">
          <FollowButton orgId={org.id} />
          <a aria-label="Directions" href={`https://maps.google.com/?q=${encodeURIComponent(org.address)}`} target="_blank" rel="noreferrer" className="flex size-11 items-center justify-center rounded-[14px] border border-line bg-surface text-ink">
            <Icon name="pin" />
          </a>
        </div>
        <p className="m-0 text-xs text-muted">{t('followHint')}</p>
      </div>

      <div role="tablist" aria-label="Profile sections" className="mx-5 mt-3.5 grid grid-cols-3 rounded-[14px] bg-ground-2 p-1">
        {tabs.map((k) => (
          <button
            key={k}
            role="tab"
            type="button"
            aria-selected={tab === k}
            onClick={() => setTab(k)}
            className={cx('h-9 cursor-pointer rounded-[10px] border-0 text-sm font-semibold', tab === k ? 'bg-surface text-ink shadow-sm' : 'bg-transparent text-muted')}
          >
            {t(k)}
          </button>
        ))}
      </div>

      <div role="tabpanel" className="flex flex-col gap-2.5 px-5 pt-3.5">
        {tab !== 'about' && items.map((p) => (
          <div key={p.id} className="relative">
            {p.pinned && <span className="absolute -top-2 right-3 z-[1] rounded-full bg-gold px-2 py-0.5 text-[11px] font-bold text-ink">{t('pinned')}</span>}
            <PostCard post={p} org={org} showOrg={false} />
          </div>
        ))}
        {tab !== 'about' && items.length === 0 && <p className="text-center text-sm text-muted">{t('noPosts')}</p>}
        {tab === 'about' && (
          <>
            <p className="m-0 text-sm leading-[21px]">{org.description}</p>
            <dl className="m-0 grid grid-cols-[88px_1fr] gap-x-3 gap-y-2.5 rounded-[var(--radius-card)] border border-line bg-surface p-3.5 text-sm">
              <dt className="text-muted">{t('address')}</dt>
              <dd className="m-0">{org.address}</dd>
            </dl>
            <div className="flex items-center justify-between rounded-[var(--radius-card)] bg-gold-soft p-3.5 text-gold-ink">
              <div>
                <p className="m-0 text-sm font-bold">{t('donations')}</p>
                <p className="m-0 mt-0.5 text-xs">{t('donationsNote')}</p>
              </div>
              <span className="rounded-full bg-surface px-2.5 py-1 text-xs font-bold">{t('comingSoon')}</span>
            </div>
          </>
        )}
      </div>
    </>
  );
}
