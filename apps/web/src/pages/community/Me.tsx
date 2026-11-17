import { Link } from 'react-router-dom';
import { PageHeader } from '../../components/CommunityLayout';
import { OrgAvatar } from '../../components/ui';
import { CURRENT_USER } from '../../data/seed';
import { useApp } from '../../store';
import { FollowButton } from './FollowButton';
import { LanguageToggle } from './LanguageToggle';

export function Me() {
  const { t, orgs, followed } = useApp();
  const mine = orgs.filter((o) => followed.has(o.id) && o.visibility !== 'PRIVATE');
  return (
    <>
      <PageHeader title={CURRENT_USER.name} subtitle={t('me')} />
      <div className="flex flex-col gap-4 px-5">
        <div className="flex items-center justify-between rounded-[var(--radius-card)] border border-line bg-surface p-3.5">
          <span className="text-sm font-semibold">{t('language')}</span>
          <LanguageToggle />
        </div>
        <section className="flex flex-col gap-2">
          <h2 className="m-0 text-[15px] font-bold">{t('followedOrgs')}</h2>
          {mine.map((o) => (
            <div key={o.id} className="flex items-center gap-3 rounded-[var(--radius-card)] border border-line bg-surface p-3">
              <OrgAvatar org={o} />
              <Link to={`/o/${o.slug}`} className="min-w-0 flex-1 truncate text-[15px] font-bold text-ink no-underline">{o.name}</Link>
              <FollowButton orgId={o.id} compact />
            </div>
          ))}
          {mine.length === 0 && <Link to="/discover">{t('findOrgs')}</Link>}
        </section>
        <Link to="/workspace" className="flex h-11 items-center justify-center rounded-xl border border-line-strong bg-surface text-sm font-semibold text-ink no-underline">
          {t('manage')}
        </Link>
      </div>
    </>
  );
}
