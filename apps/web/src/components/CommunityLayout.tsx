import { NavLink, Outlet } from 'react-router-dom';
import { useApp } from '../store';
import { Icon, type IconName } from './Icon';
import { cx } from './ui';

const TABS: { to: string; key: 'bulletin' | 'discover' | 'prayer' | 'me'; icon: IconName }[] = [
  { to: '/', key: 'bulletin', icon: 'feed' },
  { to: '/discover', key: 'discover', icon: 'compass' },
  { to: '/prayer', key: 'prayer', icon: 'moon' },
  { to: '/me', key: 'me', icon: 'user' },
];

export function CommunityLayout() {
  const { t } = useApp();
  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col bg-ground">
      <main className="flex-1 pb-28">
        <Outlet />
      </main>
      <nav aria-label="Main" className="pb-safe fixed inset-x-0 bottom-0 z-10 mx-auto grid max-w-md grid-cols-4 border-t border-line bg-surface px-2 pt-2">
        {TABS.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            end={tab.to === '/'}
            className={({ isActive }) => cx('flex min-h-11 flex-col items-center gap-1 py-1.5 text-[11px] no-underline', isActive ? 'font-bold text-brand' : 'font-medium text-muted')}
          >
            {({ isActive }) => (
              <>
                <Icon name={tab.icon} size={22} strokeWidth={isActive ? 2 : 1.8} />
                {t(tab.key)}
              </>
            )}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}

export function PageHeader({ title, subtitle, right }: { title: string; subtitle?: string; right?: React.ReactNode }) {
  return (
    <header className="flex items-center justify-between px-5 pt-6 pb-3">
      <div>
        {subtitle && <p className="m-0 text-[13px] text-muted">{subtitle}</p>}
        <h1 className="m-0 mt-0.5 text-[28px] leading-[34px] font-bold tracking-tight">{title}</h1>
      </div>
      {right}
    </header>
  );
}
