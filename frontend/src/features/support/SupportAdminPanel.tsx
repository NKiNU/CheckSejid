import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import { useT } from '@/i18n/index.tsx'
import { Badge } from '@/components/ui/badge.tsx'
import { Button } from '@/components/ui/button.tsx'
import { Card, CardContent } from '@/components/ui/card.tsx'
import { Label } from '@/components/ui/label.tsx'
import * as api from './api.ts'

// Platform-admin screen (ADR-032 §7): file a request and follow its status. Reading the organisation
// happens in the normal app once the owner has approved; the server enforces every rule.
export function SupportAdminPanel() {
  const { t, error: errorText, dateTime } = useT()
  const [orgs, setOrgs] = useState<{ id: string; name: string }[]>([])
  const [rows, setRows] = useState<api.SupportRequest[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const load = () => api.myRequests().then(setRows)
  useEffect(() => {
    Promise.all([api.platformOrganisations().then(setOrgs), load()]).catch((e) => setError(errorText(e)))
    // eslint-disable-next-line react-hooks/exhaustive-deps -- errorText identity changes with locale; load once
  }, [])

  async function send(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (busy) return
    const form = e.currentTarget
    const data = new FormData(form)
    setError(null)
    setBusy(true)
    try {
      await api.requestAccess(String(data.get('organisationId')), String(data.get('reason')))
      form.reset()
      await load()
    } catch (err) {
      setError(errorText(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="grid gap-4 pt-6">
      <h1 className="text-2xl font-medium">{t('support.admin.heading')}</h1>
      <p className="text-sm text-muted-foreground">{t('support.admin.intro')}</p>
      <form onSubmit={send} className="grid gap-3">
        <div className="grid gap-1">
          <Label htmlFor="support-org">{t('support.org')}</Label>
          <select id="support-org" name="organisationId" required defaultValue="" className="h-11 rounded-md border border-input bg-background px-3 text-base">
            <option value="" disabled>{t('common.choose')}</option>
            {orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        </div>
        <div className="grid gap-1">
          <Label htmlFor="support-reason">{t('support.reason')}</Label>
          <textarea id="support-reason" name="reason" required maxLength={500} rows={3} className="rounded-md border border-input bg-background px-3 py-2 text-base" />
        </div>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <Button type="submit" disabled={busy} className="h-11 px-4">{t('support.send')}</Button>
      </form>
      {rows?.length === 0 && <p className="text-muted-foreground">{t('support.none')}</p>}
      <ul className="grid gap-3">
        {rows?.map((r) => (
          <li key={r.id} className="min-w-0">
            <Card size="sm">
              <CardContent className="gap-2">
                <h2 className="min-w-0 text-base font-medium [overflow-wrap:anywhere]">{r.organisationName}</h2>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={api.statusVariant(r.status)}>{t(`state.${r.status}`)}</Badge>
                  {r.status === 'GRANTED' && r.expiresAt && <span className="text-sm">{t('support.expires', { time: dateTime(r.expiresAt) })}</span>}
                </div>
                <p className="text-sm text-muted-foreground [overflow-wrap:anywhere]">{r.reason}</p>
                {r.status === 'GRANTED' && (
                  <Link to={`/org/${r.organisationId}`} className="inline-flex min-h-11 items-center text-primary underline">{t('support.open')}</Link>
                )}
              </CardContent>
            </Card>
          </li>
        ))}
      </ul>
    </div>
  )
}
