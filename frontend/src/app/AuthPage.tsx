import { useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router'
import { Button } from '@/components/ui/button.tsx'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card.tsx'
import { Input } from '@/components/ui/input.tsx'
import { Label } from '@/components/ui/label.tsx'
import * as api from '@/features/identity/api.ts'
import { LanguageSwitch, useT } from '@/i18n/index.tsx'
import { safeNext } from './safeNext.ts'
import { useSession } from './session.tsx'

export function AuthPage({ mode }: { mode: 'login' | 'register' }) {
  const { t, error: errorText } = useT()
  const { status, signIn } = useSession()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const register = mode === 'register'

  if (status === 'loading') return <p className="p-4">{t('common.loading')}</p>
  if (status === 'in' && !submitting) return <Navigate to="/feed" replace />

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    const email = String(f.get('email'))
    const password = String(f.get('password'))
    setError(null)
    setSubmitting(true)
    try {
      if (register) await api.register(email, password, String(f.get('displayName')))
      await api.login(email, password)
      signIn(await api.me())
      navigate(safeNext(params.get('next')), { replace: true })
    } catch (err) {
      setError(errorText(err))
      setSubmitting(false)
    }
  }

  const next = params.get('next')
  const other = (register ? '/login' : '/register') + (next ? '?next=' + encodeURIComponent(next) : '')

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-6 px-4 py-8">
      <div className="flex items-center justify-between">
        <Link to="/" className="inline-flex min-h-11 items-center text-sm underline">
          {t('common.back')}
        </Link>
        <LanguageSwitch />
      </div>
      <h1 className="text-center text-2xl font-semibold">{t('app.name')}</h1>
      <Card>
        <CardHeader>
          <CardTitle>{register ? t('auth.createAccount') : t('auth.logIn')}</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="flex flex-col gap-4">
            {register && (
              <div className="flex flex-col gap-2">
                <Label htmlFor="displayName">{t('auth.name')}</Label>
                <Input id="displayName" name="displayName" className="h-11" required maxLength={100} autoComplete="name" />
              </div>
            )}
            <div className="flex flex-col gap-2">
              <Label htmlFor="email">{t('auth.email')}</Label>
              <Input id="email" name="email" type="email" className="h-11" required autoComplete="email" />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="password">{t('auth.password')}</Label>
              <Input
                id="password"
                name="password"
                className="h-11"
                type="password"
                required
                minLength={register ? 12 : 1}
                maxLength={128}
                autoComplete={register ? 'new-password' : 'current-password'}
              />
            </div>
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
            <Button type="submit" className="h-11 w-full" disabled={submitting}>
              {register ? t('auth.register') : t('auth.logIn')}
            </Button>
          </form>
        </CardContent>
      </Card>
      <Link to={other} className="inline-flex min-h-11 items-center justify-center text-sm underline">
        {register ? t('auth.haveAccount') : t('auth.needAccount')}
      </Link>
    </main>
  )
}
