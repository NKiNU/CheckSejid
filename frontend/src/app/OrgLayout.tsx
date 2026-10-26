import { useEffect, useState } from 'react'
import { Link, useNavigate, useOutletContext, useParams } from 'react-router'
import { useT } from '@/i18n/index.tsx'
import { Card, CardContent } from '@/components/ui/card.tsx'
import { myPermissions } from '@/features/rbac/api.ts'
import { getOrganisation, listMyOrganisations, type Organisation } from '@/features/tenancy/api.ts'
import { Select } from '@/components/ui/select.tsx'
import { Shell } from './Shell.tsx'
import { orgTabs } from './tabs.ts'

export type OrgCtx = { org: Organisation; perms: ReadonlySet<string>; setOrg(o: Organisation): void; usable: boolean }
export const useOrg = () => useOutletContext<OrgCtx>()

function OrgSwitcher({ current }: { current: Organisation }) {
  const { t } = useT()
  const navigate = useNavigate()
  const [orgs, setOrgs] = useState<Organisation[]>([])
  useEffect(() => {
    listMyOrganisations().then(setOrgs, () => setOrgs([]))
  }, [])
  const list = orgs.some((o) => o.id === current.id) ? orgs : [current, ...orgs]
  return (
    <Select
      aria-label={t('org.current')}
      className="max-w-[60vw] truncate bg-background lg:max-w-full"
      value={current.id}
      onChange={(e) => navigate(e.target.value === '/feed' ? '/feed' : '/org/' + e.target.value)}
    >
      {list.map((o) => (
        <option key={o.id} value={o.id}>{o.name}</option>
      ))}
      <option value="/feed">{t('nav.community')}</option>
    </Select>
  )
}

type Loaded = { id: string; org: Organisation; perms: ReadonlySet<string> } | { id: string; error: unknown }

export function OrgLayout() {
  const { orgId = '' } = useParams()
  const { t, error: errorText } = useT()
  const [state, setState] = useState<Loaded | null>(null)
  useEffect(() => {
    let live = true
    Promise.all([getOrganisation(orgId), myPermissions(orgId)]).then(
      ([org, p]) => live && setState({ id: orgId, org, perms: new Set(p.permissions) }),
      (error) => live && setState({ id: orgId, error }),
    )
    return () => {
      live = false
    }
  }, [orgId])

  if (!state || state.id !== orgId) return <p role="status" className="py-12 text-center text-muted-foreground">{t('common.loading')}</p>
  if ('error' in state)
    return (
      <div className="mx-auto max-w-md p-4 pt-12">
        <Card>
          <CardContent className="grid gap-3 pt-6">
            <h1 className="text-xl font-semibold">{t('app.name')}</h1>
            <p role="alert" className="text-destructive">{errorText(state.error)}</p>
            <Link to="/feed" className="inline-flex min-h-11 items-center text-primary underline">{t('common.back')}</Link>
          </CardContent>
        </Card>
      </div>
    )
  const { org, perms } = state
  const usable = org.status === 'ACTIVE' || org.status === 'SUSPENDED' || org.status === 'ARCHIVED'
  const ctx: OrgCtx = { org, perms, usable, setOrg: (o) => setState({ id: orgId, org: o, perms }) }
  return <Shell tabs={orgTabs(org.id, perms, usable)} title={<OrgSwitcher current={org} />} context={ctx} />
}
