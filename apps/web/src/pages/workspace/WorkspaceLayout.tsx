import { useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { Icon, Star } from '../../components/Icon';
import { OrgAvatar, cx } from '../../components/ui';
import { formatGregorian, formatHijri } from '../../domain/calendar';
import { TRIAL_DAYS, trialDaysLeft } from '../../domain/entitlements';
import type { Role } from '../../domain/types';
import { WORKSPACE_ORG_ID } from '../../data/seed';
import { useApp } from '../../store';
import { LanguageToggle } from '../community/LanguageToggle';

export const NAV = [
  { to: '/workspace', label: 'Overview', end: true },
  { to: '/workspace/bulletin', label: 'Bulletin & events' },
  { to: '/workspace/profile', label: 'Profile & visibility' },
  { to: '/workspace/operations', label: 'Operations' },
  { to: '/workspace/finance', label: 'Finance' },
  { to: '/workspace/members', label: 'Members & roles' },
  { to: '/workspace/subscription', label: 'Subscription' },
  { to: '/workspace/settings', label: 'Settings' },
];

const ROLES: Role[] = ['owner', 'admin', 'treasurer', 'committee', 'staff'];
const cap = (s: string) => s[0].toUpperCase() + s.slice(1);

export function WorkspaceLayout() {
  const { orgs, records, posts, role, setRole, lang } = useApp();
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const org = orgs.find((o) => o.id === WORKSPACE_ORG_ID)!;
  const pending = records.filter((r) => r.status === 'PENDING_APPROVAL').length;
  const drafts = posts.filter((p) => p.orgId === org.id && p.status === 'DRAFT').length;
  const badges: Record<string, number> = { '/workspace/finance': pending, '/workspace/bulletin': drafts };
  const daysLeft = org.trialEndsAt ? trialDaysLeft(org.trialEndsAt, new Date()) : 0;
  const now = new Date();

  const sidebar = (
    <div className="flex h-full flex-col gap-4">
      <Link to="/" className="flex items-center gap-2.5 px-1.5 text-surface no-underline">
        <Star size={28} className="text-gold" />
        <span className="text-[17px] font-bold tracking-tight">Masyarakat</span>
      </Link>
      <div className="flex items-center gap-2.5 rounded-[14px] border border-ink-3 bg-ink-2 p-2.5">
        <OrgAvatar org={org} size="sm" />
        <div className="min-w-0 flex-1">
          <p className="m-0 truncate text-sm font-bold text-surface">{org.name}</p>
          <label className="mt-0.5 flex items-center gap-1 text-xs text-on-ink-muted">
            <span className="sr-only">Preview as role</span>
            <select value={role} onChange={(e) => setRole(e.target.value as Role)} className="cursor-pointer rounded border-0 bg-transparent p-0 text-xs text-on-ink-muted" style={{ fontSize: 12 }}>
              {ROLES.map((r) => <option key={r} value={r} className="text-ink">{cap(r)}</option>)}
            </select>
          </label>
        </div>
      </div>
      <nav aria-label="Workspace" className="flex flex-col gap-0.5">
        {NAV.map((n) => (
          <NavLink
            key={n.to}
            to={n.to}
            end={n.end}
            onClick={() => setOpen(false)}
            className={({ isActive }) => cx('flex h-10 items-center justify-between rounded-[10px] px-3 text-sm no-underline', isActive ? 'bg-brand font-bold text-surface' : 'font-medium text-on-ink hover:bg-ink-2')}
          >
            <span>{n.label}</span>
            {badges[n.to] ? <span className="rounded-full bg-gold px-1.5 py-0.5 text-[11px] font-bold text-ink">{badges[n.to]}</span> : null}
          </NavLink>
        ))}
      </nav>
      <div className="mt-auto flex flex-col gap-2 rounded-[14px] bg-ink-2 p-3.5">
        <p className="m-0 text-xs font-bold tracking-wider text-gold uppercase">{cap(org.plan.toLowerCase())} trial</p>
        <p className="m-0 text-[13px] text-on-ink">{daysLeft} of {TRIAL_DAYS} days left</p>
        <div aria-hidden="true" className="h-1.5 rounded bg-ink-3"><div className="h-1.5 rounded bg-gold" style={{ width: `${(daysLeft / TRIAL_DAYS) * 100}%` }} /></div>
        <Link to="/workspace/subscription" className="text-[13px] font-bold text-surface">Compare plans</Link>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-dvh bg-ground">
      <aside className="hidden w-[248px] flex-none bg-ink px-3.5 py-5 lg:block">{sidebar}</aside>
      {open && (
        <div className="fixed inset-0 z-20 lg:hidden">
          <button type="button" aria-label="Close menu" className="absolute inset-0 cursor-pointer border-0 bg-ink/50" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-[272px] overflow-y-auto bg-ink px-3.5 py-5">{sidebar}</aside>
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 pt-5 sm:px-8 lg:px-10">
          <div className="flex items-center gap-2">
            <button type="button" aria-label="Open menu" onClick={() => setOpen(true)} className="flex size-11 cursor-pointer items-center justify-center rounded-xl border border-line bg-surface text-ink lg:hidden">
              <Icon name="menu" />
            </button>
            <p className="m-0 text-[13px] text-muted">{formatGregorian(now, lang, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })} · {formatHijri(now, lang)}</p>
          </div>
          <div className="flex items-center gap-2">
            <span className={cx('inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[13px] font-bold', org.visibility === 'PUBLIC' ? 'bg-brand-soft text-brand' : 'bg-neutral-soft text-muted')}>
              <span aria-hidden="true" className="size-2 rounded-full bg-current" />{cap(org.visibility.toLowerCase())} profile
            </span>
            <LanguageToggle />
          </div>
        </div>
        <main key={location.pathname} className="flex flex-col gap-5 px-4 pt-4 pb-10 sm:px-8 lg:px-10">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

export function NotBuilt({ title, phase }: { title: string; phase: string }) {
  return (
    <>
      <h1 className="m-0 text-[28px] font-bold tracking-tight">{title}</h1>
      <div className="rounded-[var(--radius-card)] border border-dashed border-line-strong bg-surface p-8 text-center text-muted">
        <p className="m-0 font-semibold text-ink">Not built yet</p>
        <p className="m-0 mt-1 text-sm">Planned in {phase} of the implementation roadmap.</p>
      </div>
    </>
  );
}
