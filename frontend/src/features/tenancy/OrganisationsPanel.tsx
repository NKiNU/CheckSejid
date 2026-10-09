import { useEffect, useState, type FormEvent } from 'react'
import { useT } from '../../i18n/index.tsx'
import { myPermissions } from '../rbac/api.ts'
import * as api from './api.ts'

// Phase 04: profile form + "Complete onboarding" while DRAFT/ONBOARDING, "Archive" for the owner.
// Controls are hidden by permission and status; the server enforces both (AUTH-003, ORG-009).
export function LifecyclePanel({ org, onChange }: { org: api.Organisation; onChange: (o: api.Organisation) => void }) {
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

