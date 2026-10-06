import { useEffect, useState, type FormEvent } from 'react'
import { errorMessage } from '../subscriptions/api.ts'
import * as api from './api.ts'

// Minimal Phase 03 UI: members with roles, role changes, add/remove, leave, ownership transfer.
// Controls are hidden from members who lack the permission; the server enforces it regardless.
export function MembersPanel({ orgId, myUserId, onLeft }: { orgId: string; myUserId: string; onLeft: () => void }) {
  const [perms, setPerms] = useState<Set<string>>(new Set())
  const [members, setMembers] = useState<api.Member[]>([])
  const [error, setError] = useState<string | null>(null)

  const run = async (fn: () => Promise<unknown>) => {
    setError(null)
    try {
      await fn()
    } catch (e) {
      setError(errorMessage(e)) // QUOTA_EXCEEDED on add → "upgrade your plan"
    }
  }

  const apply = ({ permissions, members }: Awaited<ReturnType<typeof fetchState>>) => {
    setPerms(new Set(permissions))
    setMembers(members)
  }
  const load = () => fetchState(orgId).then(apply)
  useEffect(() => {
    fetchState(orgId)
      .then(apply)
      .catch((e) => setError(e instanceof Error ? e.message : 'Something went wrong'))
  }, [orgId])

  const can = (key: string) => perms.has(key)
  const me = members.find((m) => m.userId === myUserId)

  async function add(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = e.currentTarget
    await run(async () => {
      await api.addMember(orgId, String(new FormData(form).get('email')))
      form.reset()
      await load()
    })
  }

  function toggle(m: api.Member, role: api.Role) {
    const roles: api.Role[] = m.roles.filter((r) => r !== 'owner')
    const next = roles.includes(role) ? roles.filter((r) => r !== role) : [...roles, role]
    return run(async () => {
      await api.updateMember(orgId, m.id, { roles: next })
      await load()
    })
  }

  return (
    <section>
      <h3>Members</h3>
      <ul>
        {members.map((m) => {
          const editable = can('members.manage') && !m.isOwner && m.userId !== myUserId
          return (
            <li key={m.id}>
              <strong>{m.displayName}</strong>
              {m.title && ` (${m.title})`} — {m.roles.join(', ') || 'no role'}
              {editable && (
                <>
                  {' '}
                  {api.ASSIGNABLE_ROLES.map((r) => (
                    <label key={r}>
                      <input type="checkbox" checked={m.roles.includes(r)} onChange={() => toggle(m, r)} /> {r}{' '}
                    </label>
                  ))}
                  <button
                    type="button"
                    onClick={() => run(async () => (await api.removeMember(orgId, m.id), await load()))}
                  >
                    Remove
                  </button>
                </>
              )}
              {can('organisation.ownership.transfer') && m.userId !== myUserId && (
                <button
                  type="button"
                  onClick={() =>
                    confirm(`Transfer ownership to ${m.displayName}?`) &&
                    run(async () => (await api.transferOwnership(orgId, m.id), await load()))
                  }
                >
                  Make owner
                </button>
              )}
            </li>
          )
        })}
      </ul>
      {can('members.manage') && (
        <form onSubmit={add}>
          <label>
            Add member by email <input name="email" type="email" required maxLength={254} />
          </label>
          <button type="submit">Add</button>
        </form>
      )}
      {me && !me.isOwner && (
        <button
          type="button"
          onClick={() => confirm('Leave this organisation?') && run(async () => (await api.leave(orgId), onLeft()))}
        >
          Leave organisation
        </button>
      )}
      {error && <p role="alert">{error}</p>}
    </section>
  )
}

async function fetchState(orgId: string) {
  const { permissions } = await api.myPermissions(orgId)
  return { permissions, members: permissions.includes('members.read') ? await api.listMembers(orgId) : [] }
}
