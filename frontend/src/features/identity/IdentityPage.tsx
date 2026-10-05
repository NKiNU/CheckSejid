import { useEffect, useState, type FormEvent } from 'react'
import * as api from './api.ts'

// Minimal Phase 01 UI: register/login, and an authenticated page whose data comes
// from the protected GET /me — proof that protection is enforced by the server.
export function IdentityPage() {
  const [user, setUser] = useState<api.User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api
      .refresh()
      .then(async (ok) => (ok ? setUser(await api.me()) : undefined))
      .catch(() => undefined)
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <p>Loading…</p>
  if (!user) return <AuthForm onAuthenticated={setUser} />

  return (
    <main>
      <h1>Welcome, {user.displayName}</h1>
      <p>Signed in as {user.email}.</p>
      <button
        type="button"
        onClick={async () => {
          await api.logout()
          setUser(null)
        }}
      >
        Log out
      </button>
    </main>
  )
}

function AuthForm({ onAuthenticated }: { onAuthenticated: (u: api.User) => void }) {
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
      setError(err instanceof Error ? err.message : 'Something went wrong')
    }
  }

  return (
    <main>
      <h1>{mode === 'login' ? 'Log in' : 'Create account'}</h1>
      <form onSubmit={submit}>
        {mode === 'register' && (
          <label>
            Name <input name="displayName" required maxLength={100} autoComplete="name" />
          </label>
        )}
        <label>
          Email <input name="email" type="email" required autoComplete="email" />
        </label>
        <label>
          Password{' '}
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
        <button type="submit">{mode === 'login' ? 'Log in' : 'Register'}</button>
      </form>
      <button type="button" onClick={() => setMode(mode === 'login' ? 'register' : 'login')}>
        {mode === 'login' ? 'Need an account? Register' : 'Have an account? Log in'}
      </button>
    </main>
  )
}
