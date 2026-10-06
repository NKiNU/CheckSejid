import { useEffect, useState, type FormEvent } from 'react'
import { NotificationsPanel } from '../notifications/NotificationsPanel.tsx'
import { FeedPanel } from '../public/PublicPanels.tsx'
import { OrganisationsPanel } from '../tenancy/OrganisationsPanel.tsx'
import { useT } from '../../i18n/index.tsx'
import * as api from './api.ts'

// Minimal Phase 01 UI: register/login, and an authenticated page whose data comes
// from the protected GET /me — proof that protection is enforced by the server.
export function IdentityPage() {
  const { t } = useT()
  const [user, setUser] = useState<api.User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api
      .refresh()
      .then(async (ok) => (ok ? setUser(await api.me()) : undefined))
      .catch(() => undefined)
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <p>{t('common.loading')}</p>
  if (!user) return <AuthForm onAuthenticated={setUser} />

  return (
    <main>
      <h1>{t('auth.welcome', { name: user.displayName })}</h1>
      <p>{t('auth.signedInAs', { email: user.email })}</p>
      <NotificationsPanel />
      <FeedPanel />
      <OrganisationsPanel userId={user.id} />
      <button
        type="button"
        onClick={async () => {
          await api.logout()
          setUser(null)
        }}
      >
        {t('auth.logOut')}
      </button>
    </main>
  )
}

function AuthForm({ onAuthenticated }: { onAuthenticated: (u: api.User) => void }) {
  const { t, error: errorText } = useT()
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [error, setError] = useState<string | null>(null)

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    const email = String(f.get('email'))
    const password = String(f.get('password'))
    setError(null)
    try {
      if (mode === 'register') await api.register(email, password, String(f.get('displayName')))
      await api.login(email, password)
      onAuthenticated(await api.me())
    } catch (err) {
      setError(errorText(err))
    }
  }

  return (
    <main>
      <h1>{mode === 'login' ? t('auth.logIn') : t('auth.createAccount')}</h1>
      <form onSubmit={submit}>
        {mode === 'register' && (
          <label>
            {t('auth.name')} <input name="displayName" required maxLength={100} autoComplete="name" />
          </label>
        )}
        <label>
          {t('auth.email')} <input name="email" type="email" required autoComplete="email" />
        </label>
        <label>
          {t('auth.password')}{' '}
          <input
            name="password"
            type="password"
            required
            minLength={mode === 'register' ? 12 : 1}
            maxLength={128}
            autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
          />
        </label>
        {error && <p role="alert">{error}</p>}
        <button type="submit">{mode === 'login' ? t('auth.logIn') : t('auth.register')}</button>
      </form>
      <button type="button" onClick={() => setMode(mode === 'login' ? 'register' : 'login')}>
        {mode === 'login' ? t('auth.needAccount') : t('auth.haveAccount')}
      </button>
    </main>
  )
}
