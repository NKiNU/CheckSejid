import { useT } from '../../i18n/index.tsx'
import { Card, CardContent } from '@/components/ui/card.tsx'
import * as api from './api.ts'

// Approved total per currency plus how many records wait for approval (ADR-022; integer minor units, ADR-011).
export function FinanceSummary({ records }: { records: api.FinanceRecord[] }) {
  const { t, locale } = useT()
  const totals = new Map<string, number>()
  for (const r of records) if (r.state === 'APPROVED') totals.set(r.currency, (totals.get(r.currency) ?? 0) + r.amount)
  if (totals.size === 0) totals.set('MYR', 0)
  const pending = records.filter((r) => r.state === 'PENDING_APPROVAL').length
  return (
    <Card size="sm">
      <CardContent className="grid gap-1">
        <p className="text-sm text-muted-foreground">{t('fin.approvedTotal')}</p>
        {[...totals].map(([cur, sum]) => (
          <p key={cur} className="text-2xl font-medium [overflow-wrap:anywhere]">{api.formatMoney(sum, cur, locale)}</p>
        ))}
        <p className="text-sm text-muted-foreground">{t('fin.pendingCount', { n: pending })}</p>
      </CardContent>
    </Card>
  )
}
