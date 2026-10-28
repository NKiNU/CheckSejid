import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader } from '@/components/ui/card.tsx'
import { Label } from '@/components/ui/label.tsx'
import { Select } from '@/components/ui/select.tsx'
import { useT } from '@/i18n/index.tsx'
import * as api from './api.ts'
import { ErasureRequestCard } from './ErasureRequestCard.tsx'
import { parseRetention } from './erasureForm.ts'

// Organisation settings, owner only (the server enforces it too): retention choice, then deletion.
export function OrgErasurePanel({ orgId }: { orgId: string }) {
  const { t, error: errorText } = useT()
  const [years, setYears] = useState<api.Retention | undefined>(undefined)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    api.getRetention(orgId).then(setYears, (e) => setError(errorText(e)))
    // eslint-disable-next-line react-hooks/exhaustive-deps -- errorText identity changes with locale; load once per org
  }, [orgId])

  async function change(value: string) {
    setError(null)
    try {
      setYears(await api.setRetention(orgId, parseRetention(value)))
    } catch (e) {
      setError(errorText(e))
    }
  }

  return (
    <>
      <Card>
        <CardHeader>
          <h2 className="text-base font-medium">{t('erasure.retention')}</h2>
        </CardHeader>
        <CardContent className="gap-2">
          <p className="text-sm text-muted-foreground">{t('erasure.retentionHelp')}</p>
          <Label htmlFor="retention">{t('erasure.retention')}</Label>
          <Select id="retention" value={years === undefined ? '' : String(years ?? '')} disabled={years === undefined} onChange={(e) => void change(e.target.value)}>
            <option value="">{t('erasure.keepNothing')}</option>
            {[1, 3, 5, 7].map((y) => (
              <option key={y} value={y}>{t('erasure.years', { count: y })}</option>
            ))}
          </Select>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        </CardContent>
      </Card>
      <ErasureRequestCard path={api.orgErasure(orgId)} heading={t('erasure.orgHeading')} warning={t('erasure.orgWarning')} />
    </>
  )
}

// Account deletion (any signed-in user). Refused by the server while the user owns an organisation.
export function AccountErasure() {
  const { t } = useT()
  return (
    <div className="grid gap-4 pt-4">
      <h1 className="text-2xl font-medium">{t('erasure.accountHeading')}</h1>
      <ErasureRequestCard path={api.MY_ERASURE} heading={t('erasure.accountHeading')} warning={t('erasure.accountWarning')} />
    </div>
  )
}
