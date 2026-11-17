import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader } from '../../components/CommunityLayout';
import { Icon } from '../../components/Icon';
import { OrgAvatar, Pill } from '../../components/ui';
import { discoverable, orgBulletin } from '../../domain/bulletin';
import type { OrgType } from '../../domain/types';
import { AREA } from '../../data/seed';
import { useApp } from '../../store';
import { FollowButton } from './FollowButton';

const TYPES: (OrgType | 'All')[] = ['All', 'Masjid', 'Surau', 'Madrasah', 'NGO'];

export function Discover() {
  const { t, orgs, posts, followed } = useApp();
  const [query, setQuery] = useState('');
  const [type, setType] = useState<OrgType | 'All'>('All');
  const list = useMemo(() => discoverable(orgs, query, type), [orgs, query, type]);

  return (
    <>
      <PageHeader title={t('discover')} />
      <p className="m-0 -mt-2 px-5 text-[13px] text-muted">{t('discoverHint')}</p>
      <div className="flex flex-col gap-3 px-5 pt-3">
        <label className="flex h-12 items-center gap-2.5 rounded-[14px] border border-line bg-surface px-3.5 focus-within:border-brand">
          <Icon name="search" size={18} className="text-muted" />
          <span className="sr-only">{t('searchLabel')}</span>
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('search')} className="min-w-0 flex-1 border-0 bg-transparent text-ink outline-none" />
        </label>
        <div role="group" aria-label="Organisation type" className="no-scrollbar flex gap-2 overflow-x-auto">
          {TYPES.map((ty) => (
            <Pill key={ty} pressed={type === ty} onClick={() => setType(ty)}>{ty === 'All' ? t('all') : ty}</Pill>
          ))}
        </div>
      </div>
      <div className="flex flex-col gap-2.5 px-5 pt-4">
        <h2 className="m-0 text-[17px] font-bold">{t('near')} {AREA.name}</h2>
        {list.map((o) => {
          const latest = orgBulletin(posts, o, followed.has(o.id))[0];
          return (
            <div key={o.id} className="flex flex-col gap-2.5 rounded-[var(--radius-card)] border border-line bg-surface p-3">
              <div className="flex items-center gap-3">
                <OrgAvatar org={o} />
                <div className="min-w-0 flex-1">
                  <Link to={`/o/${o.slug}`} className="block truncate text-[15px] font-bold text-ink no-underline hover:underline">{o.name}</Link>
                  <p className="m-0 mt-0.5 text-[13px] text-muted">{o.type} · {o.area}</p>
                </div>
                <FollowButton orgId={o.id} compact />
              </div>
              {latest && (
                <p className="m-0 truncate rounded-[10px] bg-ground px-2.5 py-2 text-xs text-muted">
                  <span className="font-bold text-ink">{t('latest')}:</span> {latest.title}
                </p>
              )}
            </div>
          );
        })}
        {list.length === 0 && <p className="rounded-[var(--radius-card)] border border-dashed border-line-strong p-7 text-center text-sm text-muted">{t('noOrgs')}</p>}
      </div>
    </>
  );
}
