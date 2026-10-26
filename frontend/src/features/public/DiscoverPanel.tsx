import { useEffect, useState, type FormEvent } from 'react'
import { useT } from '../../i18n/index.tsx'
import { Button } from '@/components/ui/button.tsx'
import { Card, CardContent } from '@/components/ui/card.tsx'
import { Input } from '@/components/ui/input.tsx'
import { Label } from '@/components/ui/label.tsx'
import { Select } from '@/components/ui/select.tsx'
import { ORG_TYPES } from '../tenancy/api.ts'
import * as api from './api.ts'
import { PublicOrgPage } from './PublicOrgPage.tsx'

// Phase 05: discovery (PUB-001/002) and a public organisation page with follow (PUB-005, ADR-019).
export function DiscoverPanel() {
  const { t, error: message } = useT()
  const [result, setResult] = useState<api.PublicOrganisation[] | null>(null)
  const [selected, setSelected] = useState<string | null>(() => new URLSearchParams(location.search).get('org'))
  const [error, setError] = useState<string | null>(null)

  async function search(e?: FormEvent<HTMLFormElement>) {
    e?.preventDefault()
    const f = e ? new FormData(e.currentTarget) : new FormData()
    setError(null)
    try {
      setResult((await api.discover({ q: String(f.get('q') ?? ''), type: String(f.get('type') ?? ''), state: String(f.get('state') ?? '') })).organisations)
    } catch (err) {
      setError(message(err))
    }
  }
  useEffect(() => {
    api.discover({}).then((r) => setResult(r.organisations), (e) => setError(message(e)))
    // eslint-disable-next-line react-hooks/exhaustive-deps -- message identity changes with locale
  }, [])

  const field = 'grid min-w-0 gap-2'
  return (
    <div className="grid gap-4 pt-6">
      <h1 className="text-2xl font-medium">{t('disc.heading')}</h1>
      <Card>
        <CardContent>
          <form onSubmit={search} className="grid gap-4 sm:grid-cols-3">
            <div className={field}>
              <Label htmlFor="disc-q">{t('disc.name')}</Label>
              <Input id="disc-q" className="h-11" name="q" maxLength={100} />
            </div>
            <div className={field}>
              <Label htmlFor="disc-type">{t('org.type')}</Label>
              <Select id="disc-type" name="type" defaultValue="">
                <option value="">{t('disc.anyType')}</option>
                {ORG_TYPES.map((ty) => (
                  <option key={ty} value={ty}>
                    {t(`orgType.${ty}`)}
                  </option>
                ))}
              </Select>
            </div>
            <div className={field}>
              <Label htmlFor="disc-state">{t('org.state')}</Label>
              <Input id="disc-state" className="h-11" name="state" maxLength={100} />
            </div>
            <Button type="submit" className="h-11 sm:col-span-3 sm:justify-self-start">{t('disc.search')}</Button>
          </form>
        </CardContent>
      </Card>
      {!result && !error && <p role="status" className="text-muted-foreground">{t('common.loading')}</p>}
      {result?.length === 0 && <p className="text-muted-foreground">{t('disc.none')}</p>}
      {result && result.length > 0 && (
        <ul className="grid gap-3 lg:grid-cols-2">
          {result.map((o) => (
            <li key={o.id} className="min-w-0">
              <button
                type="button"
                onClick={() => setSelected(o.id)}
                className="grid min-h-11 w-full gap-1 rounded-xl bg-card p-4 text-start text-sm text-card-foreground shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring active:opacity-80"
              >
                <span className="block text-base font-medium [overflow-wrap:anywhere]">{o.name}</span>
                <span className="block text-sm text-muted-foreground [overflow-wrap:anywhere]">
                  {[o.type && t(`orgType.${o.type as (typeof ORG_TYPES)[number]}`), o.state].filter(Boolean).join(' · ')}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {selected && <PublicOrgPage key={selected} id={selected} />}
    </div>
  )
}
