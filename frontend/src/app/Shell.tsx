import { useEffect, type ReactNode } from 'react'
import { Link, Outlet, useLocation, useNavigate } from 'react-router'
import { LogOut } from 'lucide-react'
import { LanguageSwitch, useT } from '@/i18n/index.tsx'
import { Nav } from './Nav.tsx'
import { useSession } from './session.tsx'
import type { Tab } from './tabs.ts'

export function Shell({ tabs, title, context }: { tabs: Tab[]; title: ReactNode; context?: unknown }) {
  const { t } = useT()
  const { status, signOut } = useSession()
  const navigate = useNavigate()
  const { hash } = useLocation()
  useEffect(() => {
    if (hash) document.getElementById(hash.slice(1))?.scrollIntoView() // instant, so reduced motion is respected
  }, [hash])
  const actions = (
    <>
      <LanguageSwitch />
      {status === 'in' ? (
        <button
          type="button"
          aria-label={t('auth.logOut')}
          className="grid size-11 place-items-center rounded-lg text-muted-foreground hover:bg-muted"
          onClick={() => void signOut().finally(() => navigate('/'))}
        >
          <LogOut className="size-5" aria-hidden />
        </button>
      ) : (
        <Link to="/login" className="inline-flex min-h-11 items-center px-2 text-sm text-primary underline">{t('auth.logIn')}</Link>
      )}
    </>
  )
  return (
    <div className="min-h-dvh lg:flex">
      <header className="sticky top-0 z-10 flex items-center gap-2 bg-background/95 px-4 pt-[env(safe-area-inset-top)] backdrop-blur lg:hidden">
        <div className="min-w-0 flex-1 truncate font-semibold">{title}</div>
        {actions}
      </header>
      <aside className="lg:overflow-y-auto lg:sticky lg:top-0 lg:flex lg:h-dvh lg:w-60 lg:flex-none lg:flex-col lg:border-r lg:border-border">
        <div className="hidden truncate p-4 font-semibold lg:block">{title}</div>
        <Nav tabs={tabs} />
        <div className="hidden items-center gap-2 p-3 lg:flex">{actions}</div>
      </aside>
      <main className="mx-auto w-full min-w-0 max-w-3xl px-4 pb-24 lg:pb-8">
        <Outlet context={context} />
      </main>
    </div>
  )
}
