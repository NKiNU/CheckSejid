import { useEffect, useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button.tsx'
import { Card, CardContent, CardHeader } from '@/components/ui/card.tsx'
import { Input } from '@/components/ui/input.tsx'
import { Label } from '@/components/ui/label.tsx'
import { useT } from '@/i18n/index.tsx'
import * as api from './api.ts'
import { passwordProblem, viewOf } from './erasureForm.ts'

// One card for both "delete this organisation" and "delete my account": ask (with the password),
// wait (cancellable until the deadline), or retry a failure.
export function ErasureRequestCard({ path, heading, warning, onRequested }: { path: string; heading: string; warning: string; onRequested?: () => void }) {
  const { t, dateTime, error: errorText } = useT()
  const [req, setReq] = useState<api.ErasureRequest | null | undefined>(undefined)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  useEffect(() => {
    api.current(path).then(setReq, (e) => {
      setReq(null)
      setError(errorText(e))
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- errorText identity changes with locale; load once per path
  }, [path])

  async function run(action: () => Promise<api.ErasureRequest>, after?: () => void) {
    setError(null)
    setPending(true)
    try {
      setReq(await action())
      after?.()
    } catch (e) {
      setError(errorText(e))
    } finally {
      setPending(false)
    }
  }

  // Asking and retrying both need the password again (ADR-031 §2).
  function submitWith(send: (path: string, password: string) => Promise<api.ErasureRequest>, after?: () => void) {
    return (e: FormEvent<HTMLFormElement>) => {
      e.preventDefault()
      const form = e.currentTarget
      const password = String(new FormData(form).get('password'))
      const problem = passwordProblem(password)
      if (problem) return setError(t(problem))
      void run(() => send(path, password), () => {
        form.reset()
        after?.()
      })
    }
  }
  const ask = submitWith(api.request, onRequested)
  const retry = submitWith(api.retry)

  const view = viewOf(req ?? null)
  const passwordField = (
    <div className="flex flex-col gap-2">
      <Label htmlFor={`erase-pw-${path}`}>{t('erasure.password')}</Label>
      <Input id={`erase-pw-${path}`} name="password" type="password" className="h-11" required maxLength={128} autoComplete="current-password" />
    </div>
  )
  return (
    <Card>
      <CardHeader>
        <h2 className="text-base font-medium">{heading}</h2>
      </CardHeader>
      <CardContent className="gap-4">
        {req === undefined && <p role="status" className="text-muted-foreground">{t('common.loading')}</p>}
        {req !== undefined && view === 'none' && (
          <form onSubmit={ask} className="flex flex-col gap-4">
            <p className="text-sm text-muted-foreground">{warning}</p>
            {passwordField}
            <Button type="submit" variant="destructive" className="h-11 w-full" disabled={pending}>
              {t('erasure.request')}
            </Button>
          </form>
        )}
        {view === 'pending' && (
          <>
            <p role="status">{t('erasure.pending', { when: dateTime(req!.executeAfter) })}</p>
            <Button type="button" variant="outline" className="h-11 w-full" disabled={pending} onClick={() => void run(() => api.cancel(path))}>
              {t('erasure.cancel')}
            </Button>
          </>
        )}
        {view === 'running' && <p role="status">{t('erasure.running')}</p>}
        {view === 'failed' && (
          <form onSubmit={retry} className="flex flex-col gap-4">
            <p role="alert" className="text-sm text-destructive">{t('erasure.failed')}</p>
            {passwordField}
            <Button type="submit" className="h-11 w-full" disabled={pending}>
              {t('erasure.retry')}
            </Button>
          </form>
        )}
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      </CardContent>
    </Card>
  )
}
