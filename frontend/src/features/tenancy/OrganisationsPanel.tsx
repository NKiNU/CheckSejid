import { useEffect, useState, type FormEvent } from 'react'
import { MembersPanel } from '../rbac/MembersPanel.tsx'
import { myPermissions } from '../rbac/api.ts'
import * as api from './api.ts'

// Minimal Phase 02 UI: list my organisations, switch the current one, create one.
// The current organisation is loaded through the tenant-scoped GET /orgs/:id, so the
// server decides access; the client only remembers which id was picked.
export function OrganisationsPanel({ userId }: { userId: string }) {
  const [orgs, setOrgs] = useState<api.Organisation[]>([])
  const [current, setCurrent] = useState<api.Organisation | null>(null)
  const [error, setError] = useState<string | null>(null)

  const fail = (e: unknown) => setError(e instanceof Error ? e.message : 'Something went wrong')

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
      <h2>Organisations</h2>
      {orgs.length > 0 && (
        <label>
          Current organisation{' '}
          <select value={current?.id ?? ''} onChange={(e) => select(e.target.value)}>
            <option value="" disabled>
              Choose…
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
          Managing <strong>{current.name}</strong>
          {current.isOwner ? ' (owner)' : ''} — {current.status}
        </p>
      )}
      {current && <LifecyclePanel key={current.id} org={current} onChange={setCurrent} />}
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
            New organisation name <input name="name" required maxLength={200} />
          </label>
          <button type="submit">Create organisation</button>
        </form>
      )}
      {error && <p role="alert">{error}</p>}
    </section>
  )
}

// Phase 04: profile form + "Complete onboarding" while DRAFT/ONBOARDING, "Archive" for the owner.
// Controls are hidden by permission and status; the server enforces both (AUTH-003, ORG-009).
function LifecyclePanel({ org, onChange }: { org: api.Organisation; onChange: (o: api.Organisation) => void }) {
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
      setError(e instanceof Error ? e.message : 'Something went wrong')
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
          <h3>Organisation profile</h3>
          <label>
            Type{' '}
            <select name="type" defaultValue={org.type ?? ''}>
              <option value="">Choose…</option>
              {api.ORG_TYPES.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </label>
          <label>
            Description <textarea name="description" maxLength={2000} defaultValue={org.description ?? ''} />
          </label>
          <label>
            Contact email <input name="contactEmail" type="email" maxLength={254} defaultValue={org.contactEmail ?? ''} />
          </label>
          <label>
            Contact phone <input name="contactPhone" maxLength={30} defaultValue={org.contactPhone ?? ''} />
          </label>
          <label>
            Address <input name="addressLine" maxLength={300} defaultValue={org.addressLine ?? ''} />
          </label>
          <label>
            State <input name="state" maxLength={100} defaultValue={org.state ?? ''} />
          </label>
          <label>
            Country (2-letter code) <input name="country" maxLength={2} pattern="[A-Za-z]{2}" defaultValue={org.country ?? ''} />
          </label>
          <button type="submit">Save profile</button>
          {org.status === 'ONBOARDING' && (
            <button type="button" onClick={() => run(() => api.completeOnboarding(org.id))}>
              Complete onboarding
            </button>
          )}
        </form>
      )}
      {perms.has('organisation.archive') && (org.status === 'ACTIVE' || org.status === 'SUSPENDED') && (
        <button
          type="button"
          onClick={() => confirm(`Archive ${org.name}? This cannot be undone.`) && run(() => api.archiveOrganisation(org.id))}
        >
          Archive organisation
        </button>
      )}
      {error && <p role="alert">{error}</p>}
    </div>
  )
}
