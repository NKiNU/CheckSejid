import { useEffect, useState, type FormEvent } from 'react'
import * as api from './api.ts'

// Minimal Phase 02 UI: list my organisations, switch the current one, create one.
// The current organisation is loaded through the tenant-scoped GET /orgs/:id, so the
// server decides access; the client only remembers which id was picked.
export function OrganisationsPanel() {
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
          {current.isOwner ? ' (owner)' : ''}
        </p>
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
