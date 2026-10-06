import { useEffect, useState } from 'react'
import { useT } from '../../i18n/index.tsx'
import { ApiError } from '../identity/api.ts'
import * as api from './api.ts'

// Phase 11: plan, status and trial days left, for members holding billing.read. Others get 403 and
// see nothing; the server enforces it regardless (AUTH-003).
export function SubscriptionPanel({ orgId }: { orgId: string }) {
  const { t, error: errorText } = useT()
  const [sub, setSub] = useState<api.Subscription | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    api.getSubscription(orgId).then(setSub, (e) => {
      if (!(e instanceof ApiError && e.status === 403)) setError(errorText(e))
    })
  }, [orgId])

  if (error) return <p role="alert">{error}</p>
  if (!sub) return null
  return (
    <section>
      <h3>{t('sub.heading')}</h3>
      <p>
        {t('sub.summary', { plan: sub.plan.name, status: t(`state.${sub.status}`) })}
        {sub.status === 'TRIAL' && sub.trialEndsAt && ` (${t('sub.trialLeft', { days: api.trialDaysLeft(sub.trialEndsAt) })})`}
      </p>
    </section>
  )
}
