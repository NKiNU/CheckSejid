import { useEffect, useState, type FormEvent } from 'react'
import { useT } from '../../i18n/index.tsx'
import { FinancePanel } from '../finance/FinancePanel.tsx'
import { HubPanel } from '../hub/HubPanel.tsx'
import { OperationsPanel } from '../operations/OperationsPanel.tsx'
import { VisibilityPanel } from '../public/PublicPanels.tsx'
import { MembersPanel } from '../rbac/MembersPanel.tsx'
import { myPermissions } from '../rbac/api.ts'
import { SubscriptionPanel } from '../subscriptions/SubscriptionPanel.tsx'
import * as api from './api.ts'

// Minimal Phase 02 UI: list my organisations, switch the current one, create one.
// The current organisation is loaded through the tenant-scoped GET /orgs/:id, so the
// server decides access; the client only remembers which id was picked.
export function OrganisationsPanel({ userId }: { userId: string }) {
  const { t, error: errorText } = useT()
  const [orgs, setOrgs] = useState<api.Organisation[]>([])
  const [current, setCurrent] = useState<api.Organisation | null>(null)
  const [error, setError] = useState<string | null>(null)

  const fail = (e: unknown) => setError(errorText(e))

  useEffect(() => {
    api.listMyOrganisations().then(setOrgs).catch(fail)
  }, [])

  async function select(id: string) {
    setError(null)
    try {
      setCurrent(await api.getOrganisation(id))
    } catch (e) {
      fail(e)
    }
  }

  async function create(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = e.currentTarget
    setError(null)
    try {
      const org = await api.createOrganisation(String(new FormData(form).get('name')))
      setOrgs([...orgs, org])
      setCurrent(org)
      form.reset()
    } catch (err) {
      fail(err)
    }
  }

  return (
    <section>
      <h2>{t('org.heading')}</h2>
      {orgs.length > 0 && (
        <label>
          {t('org.current')}{' '}
          <select value={current?.id ?? ''} onChange={(e) => select(e.target.value)}>
            <option value="" disabled>
              {t('common.choose')}
            </option>
            {orgs.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </label>
      )}
      {current && (
        <p>
          {t('org.managing')} <strong>{current.name}</strong>
          {current.isOwner ? ` (${t('org.owner')})` : ''} — {t(`state.${current.status}`)}
        </p>
      )}
      {current && <LifecyclePanel key={current.id} org={current} onChange={setCurrent} />}
      {current && <SubscriptionPanel key={current.id} orgId={current.id} />}
      {current && <ModulesPanel key={current.id} org={current} userId={userId} />}
      {current && (
        <MembersPanel
          key={current.id}
          orgId={current.id}
          myUserId={userId}
          onLeft={() => {
            setOrgs(orgs.filter((o) => o.id !== current.id))
            setCurrent(null)
          }}
        />
      )}
      {!orgs.some((o) => o.isOwner) && (
        <form onSubmit={create}>
          <label>
            {t('org.newName')} <input name="name" required maxLength={200} />
          </label>
          <button type="submit">{t('org.create')}</button>
        </form>
      )}
      {error && <p role="alert">{error}</p>}
    </section>
  )
}

// Phase 04: profile form + "Complete onboarding" while DRAFT/ONBOARDING, "Archive" for the owner.
// Controls are hidden by permission and status; the server enforces both (AUTH-003, ORG-009).
function LifecyclePanel({ org, onChange }: { org: api.Organisation; onChange: (o: api.Organisation) => void }) {
  const { t, error: errorText } = useT()
  const [perms, setPerms] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    myPermissions(org.id).then((p) => setPerms(new Set(p.permissions)), () => setPerms(new Set()))
  }, [org.id])

  const run = async (fn: () => Promise<api.Organisation>) => {
    setError(null)
    try {
      onChange(await fn())
    } catch (e) {
      setError(errorText(e))
    }
  }
  const onboarding = org.status === 'DRAFT' || org.status === 'ONBOARDING'

  function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    // Empty input clears an optional field (null); type/state/country cannot be cleared, so they are
    // omitted when empty. The server validates everything.
    const v = (k: string) => String(f.get(k) ?? '').trim() || null
    const req = (k: string) => v(k) ?? undefined
    return run(() =>
      api.updateProfile(org.id, {
        type: req('type') as NonNullable<api.Profile['type']> | undefined,
        description: v('description'),
        contactEmail: v('contactEmail'),
        contactPhone: v('contactPhone'),
        addressLine: v('addressLine'),
        state: req('state'),
        country: req('country')?.toUpperCase(),
      }),
    )
  }

  return (
    <div>
      {onboarding && perms.has('organisation.update') && (
        <form onSubmit={save}>
          <h3>{t('org.profile')}</h3>
          <label>
            {t('org.type')}{' '}
            <select name="type" defaultValue={org.type ?? ''}>
              <option value="">{t('common.choose')}</option>
              {api.ORG_TYPES.map((ty) => (
                <option key={ty} value={ty}>
                  {t(`orgType.${ty}`)}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t('common.description')} <textarea name="description" maxLength={2000} defaultValue={org.description ?? ''} />
          </label>
          <label>
            {t('org.contactEmail')} <input name="contactEmail" type="email" maxLength={254} defaultValue={org.contactEmail ?? ''} />
          </label>
          <label>
            {t('org.contactPhone')} <input name="contactPhone" maxLength={30} defaultValue={org.contactPhone ?? ''} />
          </label>
          <label>
            {t('org.address')} <input name="addressLine" maxLength={300} defaultValue={org.addressLine ?? ''} />
          </label>
          <label>
            {t('org.state')} <input name="state" maxLength={100} defaultValue={org.state ?? ''} />
          </label>
          <label>
            {t('org.country')} <input name="country" maxLength={2} pattern="[A-Za-z]{2}" defaultValue={org.country ?? ''} />
          </label>
          <button type="submit">{t('org.saveProfile')}</button>
          {org.status === 'ONBOARDING' && (
            <button type="button" onClick={() => run(() => api.completeOnboarding(org.id))}>
              {t('org.completeOnboarding')}
            </button>
          )}
        </form>
      )}
      {perms.has('organisation.archive') && (org.status === 'ACTIVE' || org.status === 'SUSPENDED') && (
        <button
          type="button"
          onClick={() => confirm(t('org.archiveConfirm', { name: org.name })) && run(() => api.archiveOrganisation(org.id))}
        >
          {t('org.archive')}
        </button>
      )}
      {error && <p role="alert">{error}</p>}
    </div>
  )
}

// Phases 05–08: module panels for an ACTIVE organisation (ADR-016 §2), shown by permission key only;
// the server re-checks permissions, entitlements and lifecycle on every request.
function ModulesPanel({ org, userId }: { org: api.Organisation; userId: string }) {
  const [perms, setPerms] = useState<Set<string> | null>(null)
  useEffect(() => {
    myPermissions(org.id).then((p) => setPerms(new Set(p.permissions)), () => setPerms(new Set()))
  }, [org.id])
  if (!perms) return null
  const usable = org.status === 'ACTIVE' || org.status === 'SUSPENDED' || org.status === 'ARCHIVED'
  return (
    <div>
      <VisibilityPanel orgId={org.id} visibility={org.visibility} canEdit={perms.has('organisation.update') && org.status !== 'SUSPENDED' && org.status !== 'ARCHIVED'} />
      {usable && <HubPanel orgId={org.id} perms={perms} />}
      {usable && perms.has('operations.read') && <OperationsPanel orgId={org.id} myUserId={userId} perms={perms} />}
      {usable && perms.has('finance.read') && <FinancePanel orgId={org.id} myUserId={userId} perms={perms} />}
    </div>
  )
}
