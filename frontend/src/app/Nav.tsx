import { Link, useLocation } from 'react-router'
import { cn } from '@/lib/utils.ts'
import { useT } from '@/i18n/index.tsx'
import type { Tab } from './tabs.ts'

// One nav: bottom bar on phones, sidebar column from lg.
export function Nav({ tabs }: { tabs: Tab[] }) {
  const { t } = useT()
  const { pathname, hash } = useLocation()
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-20 grid bg-card/95 pb-[env(safe-area-inset-bottom)] shadow-[0_-1px_8px_rgb(0_0_0/0.06)] backdrop-blur lg:static lg:flex lg:flex-1 lg:flex-col lg:gap-1 lg:bg-transparent lg:p-3 lg:pb-3 lg:shadow-none"
      style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}
    >
      {tabs.map(({ to, label, icon: Icon, end, also }) => {
        const [path, frag] = to.split('#')
        const onPath = end ? pathname === path : [path, ...(also ?? [])].some((p) => pathname === p || pathname.startsWith(p + '/'))
        // The hash tab (#prayer) is active only on its hash; other tabs on that path are not.
        const active = onPath && (frag ? hash === '#' + frag : hash !== '#prayer')
        return (
          <Link
            key={to}
            to={to}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'flex min-h-14 flex-col items-center justify-center gap-0.5 text-[12px] text-muted-foreground lg:min-h-11 lg:flex-row lg:justify-start lg:gap-3 lg:rounded-lg lg:px-3 lg:text-sm',
              active && 'text-primary lg:bg-primary/10',
            )}
          >
            <Icon className="size-5" aria-hidden />
            <span>{t(label)}</span>
          </Link>
        )
      })}
    </nav>
  )
}
