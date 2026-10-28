import { useEffect, useState } from 'react'
import { useT } from '@/i18n/index.tsx'
import { en, type Key } from '@/i18n/en.ts'
import { Badge } from '@/components/ui/badge.tsx'
import { Button } from '@/components/ui/button.tsx'
import { Card, CardContent, CardHeader } from '@/components/ui/card.tsx'
import * as api from './api.ts'

// Owner screen (ADR-032 §7): approve, deny, extend or revoke, and read the access log. Shown to the owner
// only; the server checks ownership on every call.
export function SupportOwnerPanel({ orgId }: { orgId: string }) {
  const { t, error: errorText, dateTime } = useT()
  const [rows, setRows] = useState<api.SupportRequest[] | null>(null)
  const [log, setLog] = useState<api.LogRow[]>([])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const load = async () => {
    const [r, l] = await Promise.all([api.ownerRequests(orgId), api.ownerLog(orgId)])
    setRows(r)
    setLog(l)
  }
  useEffect(() => {
    load().catch((e) => setError(errorText(e)))
    // eslint-disable-next-line react-hooks/exhaustive-deps -- errorText identity changes with locale; reload only on org change
  }, [orgId])

  async function act(id: string, verb: 'approve' | 'deny' | 'revoke' | 'extend') {
    if (busy) return
    setError(null)
    setBusy(id)
    try {
      await api.decide(orgId, id, verb)
      await load()
    } catch (e) {
      setError(errorText(e))
    } finally {
      setBusy(null)
    }
  }
  const actLabel = (action: string) => {
    const k = `support.act.${action.slice(8)}`
    return k in en ? t(k as Key) : action
  }
  const btn = (r: api.SupportRequest, verb: 'approve' | 'deny' | 'revoke' | 'extend', variant: 'default' | 'outline' | 'destructive' = 'outline') => (
    <Button key={verb} type="button" variant={variant} disabled={busy !== null} onClick={() => act(r.id, verb)} className="h-auto min-h-11 whitespace-normal px-4">
      {t(`support.${verb}`)}
    </Button>
  )

  return (
    <Card>
      <CardHeader>
        <h2 className="min-w-0 text-lg font-medium">{t('support.owner.heading')}</h2>
      </CardHeader>
      <CardContent className="gap-3">
        <p className="text-sm text-muted-foreground">{t('support.owner.intro')}</p>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        {rows?.length === 0 && <p className="text-muted-foreground">{t('support.none')}</p>}
        {rows?.map((r) => (
          <div key={r.id} className="grid min-w-0 gap-2 border-t border-border pt-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={api.statusVariant(r.status)}>{t(`state.${r.status}`)}</Badge>
              <span className="min-w-0 text-sm [overflow-wrap:anywhere]">{t('support.by', { name: r.adminName ?? '—' })}</span>
            </div>
            <p className="text-sm [overflow-wrap:anywhere]">{r.reason}</p>
            {r.status === 'GRANTED' && r.expiresAt && <p className="text-sm text-muted-foreground">{t('support.expires', { time: dateTime(r.expiresAt) })}</p>}
            <div className="flex flex-wrap gap-2">
              {r.status === 'REQUESTED' && <>{btn(r, 'approve', 'default')}{btn(r, 'deny')}</>}
              {r.status === 'GRANTED' && <>{btn(r, 'extend')}{btn(r, 'revoke', 'destructive')}</>}
            </div>
          </div>
        ))}
        <h3 className="border-t border-border pt-3 text-base font-medium">{t('support.log')}</h3>
        {log.length === 0 && <p className="text-muted-foreground">{t('support.log.none')}</p>}
        <ul className="grid gap-1 text-sm">
          {log.map((r) => (
            <li key={r.id} className="min-w-0 [overflow-wrap:anywhere]">
              {dateTime(r.createdAt)} · {actLabel(r.action)}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}

