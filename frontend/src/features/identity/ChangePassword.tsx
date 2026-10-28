import { useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button.tsx'
import { Card, CardContent } from '@/components/ui/card.tsx'
import { Input } from '@/components/ui/input.tsx'
import { Label } from '@/components/ui/label.tsx'
import { useSession } from '@/app/session.tsx'
import { useT } from '@/i18n/index.tsx'
import * as api from './api.ts'
import { passwordProblem } from './passwordForm.ts'

export function ChangePassword() {
  const { t, error: errorText } = useT()
  const { user } = useSession()
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const [pending, setPending] = useState(false)

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = e.currentTarget
    const f = new FormData(form)
    const current = String(f.get('current'))
    const next = String(f.get('new'))
    setDone(false)
    const problem = passwordProblem(next, String(f.get('confirm')))
    if (problem) return setError(t(problem))
    setError(null)
    setPending(true)
    try {
      await api.changePassword(current, next)
      form.reset()
      setDone(true)
    } catch (err) {
      // Here INVALID_CREDENTIALS can only mean the current password (the caller is already signed in).
      setError(err instanceof api.ApiError && err.code === 'INVALID_CREDENTIALS' ? t('account.currentWrong') : errorText(err))
    } finally {
      setPending(false)
    }
  }

  return (
    <>
    <h1 className="mt-4 text-2xl font-medium">{t('account.password')}</h1>
    <Card className="mt-4">
      <CardContent>
        <form onSubmit={submit} className="flex flex-col gap-4">
          {/* Lets password managers attach the new password to this account; never sent to the API. */}
          <input type="text" name="username" autoComplete="username" value={user?.email ?? ''} readOnly tabIndex={-1} aria-hidden className="sr-only" />
          <div className="flex flex-col gap-2">
            <Label htmlFor="current">{t('account.current')}</Label>
            <Input id="current" name="current" type="password" className="h-11" required maxLength={128} autoComplete="current-password" />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="new">{t('account.new')}</Label>
            <Input id="new" name="new" type="password" className="h-11" required autoComplete="new-password" aria-describedby="new-hint" />
            <p id="new-hint" className="text-sm text-muted-foreground">{t('account.hint')}</p>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="confirm">{t('account.confirm')}</Label>
            <Input id="confirm" name="confirm" type="password" className="h-11" required autoComplete="new-password" />
          </div>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <p role="status" className="text-sm text-primary empty:hidden">
            {done && t('account.saved')}
          </p>
          <Button type="submit" className="h-11 w-full" disabled={pending}>
            {t('account.save')}
          </Button>
        </form>
      </CardContent>
    </Card>
    </>
  )
}
