import { useEffect, useState } from 'react'
import { ApiError } from '../identity/api.ts'
import * as api from './api.ts'

// Phase 11: plan, status and trial days left, for members holding billing.read. Others get 403 and
// see nothing; the server enforces it regardless (AUTH-003).
export function SubscriptionPanel({ orgId }: { orgId: string }) {
  const [sub, setSub] = useState<api.Subscription | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    api.getSubscription(orgId).then(setSub, (e) => {
      if (!(e instanceof ApiError && e.status === 403)) setError(api.errorMessage(e))
    })
  }, [orgId])

  if (error) return <p role="alert">{error}</p>
  if (!sub) return null
  return (
    <section>
      <h3>Subscription</h3>
      <p>
        {sub.plan.name} plan — {sub.status}
        {sub.status === 'TRIAL' && sub.trialEndsAt && ` (${api.trialDaysLeft(sub.trialEndsAt)} days left in trial)`}
      </p>
    </section>
  )
}
