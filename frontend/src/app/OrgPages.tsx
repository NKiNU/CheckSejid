import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import { useT } from '@/i18n/index.tsx'
import { ChevronRight } from 'lucide-react'
import { FormDialog } from '@/components/FormDialog.tsx'
import { Badge } from '@/components/ui/badge.tsx'
import { Button } from '@/components/ui/button.tsx'
import { Card, CardContent, CardHeader } from '@/components/ui/card.tsx'
import { Input } from '@/components/ui/input.tsx'
import { Label } from '@/components/ui/label.tsx'
import { FinancePanel } from '@/features/finance/FinancePanel.tsx'
import { HubPanel } from '@/features/hub/HubPanel.tsx'
import { OperationsPanel } from '@/features/operations/OperationsPanel.tsx'
import { VisibilityPanel } from '@/features/public/VisibilityPanel.tsx'
import { MembersPanel } from '@/features/rbac/MembersPanel.tsx'
import { SupportOwnerPanel } from '@/features/support/SupportOwnerPanel.tsx'
import { SubscriptionPanel } from '@/features/subscriptions/SubscriptionPanel.tsx'
import { LifecyclePanel } from '@/features/tenancy/OrganisationsPanel.tsx'
import { orgStatusVariant } from '@/features/tenancy/orgStatus.ts'
import { createOrganisation, listMyOrganisations, type Organisation } from '@/features/tenancy/api.ts'
import { NotFound } from './NotFound.tsx'
import { useOrg } from './OrgLayout.tsx'
import { useSession } from './session.tsx'

function NavRows({ items }: { items: [string, string][] }) {
  return (
    <Card className="gap-0 py-0">
      {items.map(([to, label]) => (
        <Link key={to} to={to} className="flex min-h-12 items-center justify-between gap-3 px-4 py-2 outline-none focus-visible:bg-muted focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring not-first:border-t not-first:border-border active:bg-muted">
          <span className="min-w-0">{label}</span>
          <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        </Link>
      ))}
    </Card>
  )
}

export function OrgHome() {
  const { t } = useT()
  const { org } = useOrg()
  return (
    <div className="grid gap-4 pt-6">
      <Card>
        <CardHeader>
          <h1 className="min-w-0 text-2xl font-medium">{org.name}</h1>
        </CardHeader>
        <CardContent className="flex-row flex-wrap">
          <Badge variant={orgStatusVariant(org.status)}>{t(`state.${org.status}`)}</Badge>
          {org.isOwner && <Badge>{t('org.owner')}</Badge>}
        </CardContent>
      </Card>
      <SubscriptionPanel orgId={org.id} />
      <NavRows items={[['members', t('nav.members')], ['settings', t('nav.settings')]]} />
    </div>
  )
}

export function OrgHub() {
  const { org, perms, usable } = useOrg()
  return usable ? <HubPanel orgId={org.id} perms={perms} /> : <NotFound />
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
  const { t } = useT()
  const { org, perms, setOrg } = useOrg()
  return (
    <div className="grid gap-4 pt-6">
      <h1 className="text-2xl font-medium">{t('nav.settings')}</h1>
      <LifecyclePanel org={org} onChange={setOrg} />
      {org.isOwner && <SupportOwnerPanel orgId={org.id} />}
      <VisibilityPanel
        org={org}
        onChange={setOrg}
        canEdit={perms.has('organisation.update') && org.status !== 'SUSPENDED' && org.status !== 'ARCHIVED'}
      />
    </div>
  )
}

export function OrgMore() {
  const { t } = useT()
  return (
    <div className="grid gap-4 pt-6">
      <h1 className="text-2xl font-medium">{t('nav.more')}</h1>
      <NavRows items={[['../members', t('nav.members')], ['../settings', t('nav.settings')], ['/feed', t('nav.community')]]} />
    </div>
  )
}

export function MyOrganisations() {
  const { t, error: errorText } = useT()
  const navigate = useNavigate()
  const [orgs, setOrgs] = useState<Organisation[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  useEffect(() => {
    listMyOrganisations().then(setOrgs, (e) => setError(errorText(e)))
    // eslint-disable-next-line react-hooks/exhaustive-deps -- errorText identity changes with locale; load once on mount
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
    <div className="grid gap-4 pt-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="min-w-0 text-2xl font-medium">{t('nav.myOrgs')}</h1>
        {orgs && !orgs.some((o) => o.isOwner) && (
          <Button
            className="h-11 px-4"
            onClick={() => {
              setError(null)
              setOpen(true)
            }}
          >
            {t('org.new')}
          </Button>
        )}
      </div>
      {!orgs && !error && <p role="status" className="text-muted-foreground">{t('common.loading')}</p>}
      {orgs?.length === 0 && <p className="text-muted-foreground">{t('org.none')}</p>}
      {orgs?.map((o) => (
        <Link key={o.id} to={'/org/' + o.id} className="block rounded-xl active:opacity-80">
          <Card size="sm">
            <CardContent className="gap-2">
              <span className="min-w-0 text-base font-medium">{o.name}</span>
              <span className="flex flex-wrap gap-2">
                <Badge variant={orgStatusVariant(o.status)}>{t(`state.${o.status}`)}</Badge>
                {o.isOwner && <Badge>{t('org.owner')}</Badge>}
              </span>
            </CardContent>
          </Card>
        </Link>
      ))}
      {error && !orgs && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <FormDialog open={open} onOpenChange={setOpen} title={t('org.create')} submitLabel={t('org.create')} onSubmit={create} error={error}>
        <Label htmlFor="org-name">{t('org.newName')}</Label>
        <Input id="org-name" name="name" className="h-11" required maxLength={200} />
      </FormDialog>
    </div>
  )
}
