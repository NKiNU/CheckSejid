import { useEffect, useState } from 'react'
import { useT } from '../../i18n/index.tsx'
import { Badge } from '@/components/ui/badge.tsx'
import { Card, CardContent, CardHeader } from '@/components/ui/card.tsx'
import { ApiError } from '../identity/api.ts'
import * as api from './api.ts'
import { subscriptionVariant } from './status.ts'

// Phase 11: plan, status and trial days left, for members holding billing.read. Others get 403 and
// see nothing; the server enforces it regardless (AUTH-003). Rendered as a slot in the org home, hence h2.
export function SubscriptionPanel({ orgId }: { orgId: string }) {
  const { t, error: errorText } = useT()
  const [sub, setSub] = useState<api.Subscription | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    api.getSubscription(orgId).then(setSub, (e) => {
      if (!(e instanceof ApiError && e.status === 403)) setError(errorText(e))
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- errorText identity changes with locale
  }, [orgId])

  if (error) return <p role="alert" className="text-sm text-destructive">{error}</p>
  if (!sub) return null
  return (
    <Card>
      <CardHeader>
        <h2 className="min-w-0 text-lg font-medium">{t('sub.heading')}</h2>
      </CardHeader>
      <CardContent className="gap-2">
        <p className="min-w-0 text-base font-medium [overflow-wrap:anywhere]">{t('sub.plan', { plan: sub.plan.name })}</p>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={subscriptionVariant(sub.status)}>{t(`state.${sub.status}`)}</Badge>
          {sub.status === 'TRIAL' && sub.trialEndsAt && <Badge>{t('sub.trialLeft', { days: api.trialDaysLeft(sub.trialEndsAt) })}</Badge>}
        </div>
      </CardContent>
    </Card>
  )
}
