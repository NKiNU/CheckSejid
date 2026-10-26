import { useT } from '@/i18n/index.tsx'
import { Badge } from '@/components/ui/badge.tsx'
import { Card, CardContent } from '@/components/ui/card.tsx'
import * as api from './api.ts'

export function CollectionList({ collections }: { collections: api.Collection[] }) {
  const { t, locale } = useT()
  if (collections.length === 0) return <p className="text-muted-foreground">{t('fin.noCollections')}</p>
  return (
    <ul className="grid gap-3 lg:grid-cols-2">
      {collections.map((c) => (
        <li key={c.id} className="min-w-0">
          <Card size="sm">
            <CardContent className="grid gap-2">
              <h3 className="min-w-0 text-base font-medium [overflow-wrap:anywhere]">{c.purpose}</h3>
              <p className="text-sm [overflow-wrap:anywhere]">
                {api.formatMoney(c.collected, c.currency, locale)}
                {c.targetAmount !== null &&
                  ` ${t('fin.ofTarget', { target: api.formatMoney(c.targetAmount, c.currency, locale), percent: c.percent ?? 0 })}`}
              </p>
              <div>
                <Badge variant={c.status === 'OPEN' ? 'success' : 'neutral'}>{t(`state.${c.status}`)}</Badge>
              </div>
            </CardContent>
          </Card>
        </li>
      ))}
    </ul>
  )
}
