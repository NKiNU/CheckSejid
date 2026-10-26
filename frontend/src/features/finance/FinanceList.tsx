import { useT } from '../../i18n/index.tsx'
import { Badge } from '@/components/ui/badge.tsx'
import { Button } from '@/components/ui/button.tsx'
import { Card, CardContent } from '@/components/ui/card.tsx'
import * as api from './api.ts'
import { stateBadges } from './stateBadge.ts'

type Props = {
  kind: api.Kind
  records: api.FinanceRecord[] | null
  categories: api.Category[]
  myUserId: string
  perms: ReadonlySet<string>
  failed: boolean
  onAction: (r: api.FinanceRecord, a: api.Action) => void
  onAttach: (r: api.FinanceRecord, file: File) => void
}

export function FinanceList({ kind, records, categories, myUserId, perms, failed, onAction, onAttach }: Props) {
  const { t, locale } = useT()
  if (!records) return failed ? null : <p role="status" className="text-muted-foreground">{t('common.loading')}</p>
  if (records.length === 0) return <p className="text-muted-foreground">{t('fin.empty')}</p>
  const money = (n: number, c: string) => api.formatMoney(n, c, locale)
  return (
    <ul className="grid gap-3 lg:grid-cols-2">
      {records.map((r) => {
        const badges = stateBadges(r.state, r.voidRequested)
        const cat = categories.find((c) => c.id === r.categoryId)?.name
        const actions = api.availableActions(kind, r, myUserId, perms)
        return (
          <li key={r.id} className="min-w-0">
            <Card size="sm">
              <CardContent className="grid gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  {badges.map((b) => (
                    <Badge key={b.labelKey} variant={b.variant}>{t(b.labelKey)}</Badge>
                  ))}
                  {cat && <Badge>{cat}</Badge>}
                </div>
                <p className="text-xl font-medium [overflow-wrap:anywhere]">{money(r.amount, r.currency)}</p>
                <p className="text-sm [overflow-wrap:anywhere]">{r.name ?? r.description}</p>
                {r.used !== undefined && (
                  <p className="text-sm text-muted-foreground [overflow-wrap:anywhere]">
                    {t('fin.usedRemaining', { used: money(r.used, r.currency), remaining: money(r.remaining!, r.currency) })}
                  </p>
                )}
                {actions.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {actions.map((a) => (
                      <Button key={a} type="button" variant="outline" className="h-11 px-4" onClick={() => onAction(r, a)}>
                        {t(`action.${a}`)}
                      </Button>
                    ))}
                  </div>
                )}
                {kind === 'expense' && r.state === 'DRAFT' && r.createdById === myUserId && (
                  <input
                    type="file"
                    accept={api.RECEIPT_TYPES.join(',')}
                    aria-label={t('fin.attach')}
                    className="min-h-11 w-full min-w-0 text-base"
                    onChange={(e) => {
                      const f = e.target.files?.[0]
                      e.target.value = ''
                      if (f) onAttach(r, f)
                    }}
                  />
                )}
              </CardContent>
            </Card>
          </li>
        )
      })}
    </ul>
  )
}
