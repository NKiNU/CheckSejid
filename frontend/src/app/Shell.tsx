import type { ReactNode } from 'react'
import { Link, Outlet, useNavigate } from 'react-router'
import { LogOut } from 'lucide-react'
import { LanguageSwitch, useT } from '@/i18n/index.tsx'
import { Nav } from './Nav.tsx'
import { useSession } from './session.tsx'
import type { Tab } from './tabs.ts'

export function Shell({ tabs, title }: { tabs: Tab[]; title: ReactNode }) {
  const { t } = useT()
  const { status, signOut } = useSession()
  const navigate = useNavigate()
  const actions = (
    <>
      <LanguageSwitch />
      {status === 'in' ? (
        <button
          type="button"
          aria-label={t('auth.logOut')}
          className="grid size-11 place-items-center rounded-lg text-muted-foreground hover:bg-muted"
          onClick={async () => {
            await signOut()
            navigate('/')
          }}
        >
          <LogOut className="size-5" aria-hidden />
        </button>
      ) : (
        <Link to="/login" className="px-2 text-sm text-primary underline">{t('auth.logIn')}</Link>
      )}
    </>
  )
  return (
    <div className="min-h-dvh lg:flex">
      <header className="sticky top-0 z-10 flex items-center gap-2 bg-background/95 px-4 pt-[env(safe-area-inset-top)] backdrop-blur lg:hidden">
        <div className="min-w-0 flex-1 truncate font-semibold">{title}</div>
        {actions}
      </header>
      <Nav tabs={tabs} />
      <main className="legacy mx-auto w-full max-w-3xl px-4 pb-24 lg:pb-8">
        <div className="hidden items-center gap-2 py-3 lg:flex">
          <div className="min-w-0 flex-1 truncate font-semibold">{title}</div>
          {actions}
        </div>
        <Outlet />
      </main>
    </div>
  )
}
