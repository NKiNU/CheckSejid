import { NavLink } from 'react-router'
import { cn } from '@/lib/utils.ts'
import { useT } from '@/i18n/index.tsx'
import type { Tab } from './tabs.ts'

// One nav: bottom bar on phones, sidebar column from lg.
export function Nav({ tabs }: { tabs: Tab[] }) {
  const { t } = useT()
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-20 grid bg-card/95 pb-[env(safe-area-inset-bottom)] shadow-[0_-1px_8px_rgb(0_0_0/0.06)] backdrop-blur lg:sticky lg:top-0 lg:flex lg:h-dvh lg:w-60 lg:flex-none lg:flex-col lg:gap-1 lg:p-3 lg:shadow-none"
      style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}
    >
      {tabs.map(({ to, label, icon: Icon, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          className={({ isActive }) =>
            cn(
              'flex min-h-14 flex-col items-center justify-center gap-0.5 text-[12px] text-muted-foreground lg:min-h-11 lg:flex-row lg:justify-start lg:gap-3 lg:rounded-lg lg:px-3 lg:text-sm',
              isActive && 'text-primary lg:bg-primary/10',
            )
          }
        >
          <Icon className="size-5" aria-hidden />
          <span>{t(label)}</span>
        </NavLink>
      ))}
    </nav>
  )
}
