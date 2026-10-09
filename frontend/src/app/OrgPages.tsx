import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import { useT } from '@/i18n/index.tsx'
import { Button } from '@/components/ui/button.tsx'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card.tsx'
import { Input } from '@/components/ui/input.tsx'
import { Label } from '@/components/ui/label.tsx'
import { FinancePanel } from '@/features/finance/FinancePanel.tsx'
import { HubPanel } from '@/features/hub/HubPanel.tsx'
import { OperationsPanel } from '@/features/operations/OperationsPanel.tsx'
import { VisibilityPanel } from '@/features/public/PublicPanels.tsx'
import { MembersPanel } from '@/features/rbac/MembersPanel.tsx'
import { SubscriptionPanel } from '@/features/subscriptions/SubscriptionPanel.tsx'
import { LifecyclePanel } from '@/features/tenancy/OrganisationsPanel.tsx'
import { createOrganisation, listMyOrganisations, type Organisation } from '@/features/tenancy/api.ts'
import { NotFound } from './NotFound.tsx'
import { useOrg } from './OrgLayout.tsx'
import { useSession } from './session.tsx'

const link = 'block rounded-lg border border-border p-3 text-primary'

export function OrgHome() {
  const { t } = useT()
  const { org } = useOrg()
  return (
    <div className="grid gap-4">
      <h1 className="mt-6 text-2xl font-semibold">{org.name}</h1>
      <p>
        {t(`state.${org.status}`)}
        {org.isOwner ? ` · ${t('org.owner')}` : ''}
      </p>
      <SubscriptionPanel orgId={org.id} />
      <Link to="members" className={link}>{t('nav.members')}</Link>
      <Link to="settings" className={link}>{t('nav.settings')}</Link>
    </div>
  )
}

export function OrgHub() {
  const { org, perms, usable } = useOrg()
  return usable ? <HubPanel orgId={org.id} perms={perms} /> : null
}

export function OrgFinance() {
  const { org, perms, usable } = useOrg()
  const myUserId = useSession().user!.id
  return usable && perms.has('finance.read') ? <FinancePanel orgId={org.id} myUserId={myUserId} perms={perms} /> : <NotFound />
}

export function OrgOperations() {
  const { org, perms, usable } = useOrg()
  const myUserId = useSession().user!.id
  return usable && perms.has('operations.read') ? <OperationsPanel orgId={org.id} myUserId={myUserId} perms={perms} /> : <NotFound />
}

export function OrgMembers() {
  const { org } = useOrg()
  const navigate = useNavigate()
  const myUserId = useSession().user!.id
  return <MembersPanel orgId={org.id} myUserId={myUserId} onLeft={() => navigate('/feed', { replace: true })} />
}

export function OrgSettings() {
  const { org, perms, setOrg } = useOrg()
  return (
    <>
      <LifecyclePanel org={org} onChange={setOrg} />
      <VisibilityPanel
        orgId={org.id}
        visibility={org.visibility}
        canEdit={perms.has('organisation.update') && org.status !== 'SUSPENDED' && org.status !== 'ARCHIVED'}
      />
    </>
  )
}

export function OrgMore() {
  const { t } = useT()
  return (
    <div className="mt-6 grid gap-3">
      <Link to="../members" className={link}>{t('nav.members')}</Link>
      <Link to="../settings" className={link}>{t('nav.settings')}</Link>
      <Link to="/feed" className={link}>{t('nav.community')}</Link>
    </div>
  )
}

export function MyOrganisations() {
  const { t, error: errorText } = useT()
  const navigate = useNavigate()
  const [orgs, setOrgs] = useState<Organisation[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    listMyOrganisations().then(setOrgs, (e) => setError(errorText(e)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function create(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    try {
      navigate('/org/' + (await createOrganisation(String(new FormData(e.currentTarget).get('name')))).id)
    } catch (err) {
      setError(errorText(err))
    }
  }

  return (
    <Card className="mt-4">
      <CardHeader>
        <CardTitle>{t('nav.myOrgs')}</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3">
        {orgs?.map((o) => (
          <Link key={o.id} to={'/org/' + o.id} className={link}>{o.name}</Link>
        ))}
        {orgs && !orgs.some((o) => o.isOwner) && (
          <form onSubmit={create} className="grid gap-2">
            <Label htmlFor="org-name">{t('org.newName')}</Label>
            <Input id="org-name" name="name" required maxLength={200} />
            <Button type="submit">{t('org.create')}</Button>
          </form>
        )}
        {error && <p role="alert">{error}</p>}
      </CardContent>
    </Card>
  )
}
