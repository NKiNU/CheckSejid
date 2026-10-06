import { useEffect, useState, type FormEvent } from 'react'
import { listMembers, type Member } from '../rbac/api.ts'
import { errorMessage } from '../subscriptions/api.ts'
import * as api from './api.ts'

// Phase 07: tasks (assign, status) and roster. Plan limits show an upgrade message (ADR-018).
export function OperationsPanel({ orgId, myUserId, perms }: { orgId: string; myUserId: string; perms: Set<string> }) {
  const [tasks, setTasks] = useState<api.Task[]>([])
  const [roster, setRoster] = useState<api.RosterEntry[]>([])
  const [members, setMembers] = useState<Member[]>([])
  const [error, setError] = useState<string | null>(null)
  const manage = perms.has('operations.manage')

  const load = () =>
    Promise.all([api.listTasks(orgId), api.listRoster(orgId), listMembers(orgId)]).then(
      ([t, r, m]) => (setTasks(t), setRoster(r), setMembers(m)),
      (e) => setError(errorMessage(e)),
    )
  useEffect(() => {
    Promise.all([api.listTasks(orgId), api.listRoster(orgId), listMembers(orgId)]).then(
      ([t, r, m]) => (setTasks(t), setRoster(r), setMembers(m)),
      (e) => setError(errorMessage(e)),
    )
  }, [orgId])
  const name = (userId: string | null) => members.find((m) => m.userId === userId)?.displayName ?? (userId ? 'former member' : 'unassigned')

  const run = async (fn: () => Promise<unknown>, form?: HTMLFormElement) => {
    setError(null)
    try {
      await fn()
      form?.reset()
      await load()
    } catch (e) {
      setError(errorMessage(e))
    }
  }
  function addTask(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    const v = (k: string) => String(f.get(k) ?? '').trim() || null
    run(() => api.createTask(orgId, { title: String(f.get('title')), assigneeUserId: v('assignee'), dueDate: v('dueDate') }), e.currentTarget)
  }
  function addRoster(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    const iso = (k: string) => new Date(String(f.get(k))).toISOString()
    run(() => api.createRosterEntry(orgId, { userId: String(f.get('userId')), duty: String(f.get('duty')), startsAt: iso('startsAt'), endsAt: iso('endsAt') }), e.currentTarget)
  }
  const memberOptions = members.map((m) => (
    <option key={m.userId} value={m.userId}>
      {m.displayName}
    </option>
  ))

  return (
    <section>
      <h3>Tasks</h3>
      <ul>
        {tasks.map((t) => (
          <li key={t.id}>
            {t.title} — {name(t.assigneeUserId)} {t.dueDate && `(due ${t.dueDate})`}{' '}
            {api.canChangeStatus(t, myUserId, perms) ? (
              <select value={t.status} onChange={(e) => run(() => api.setTaskStatus(orgId, t.id, e.target.value as api.TaskStatus))}>
                {api.TASK_STATUSES.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            ) : (
              t.status
            )}
          </li>
        ))}
      </ul>
      {manage && (
        <form onSubmit={addTask}>
          <input name="title" placeholder="Task" required maxLength={200} />
          <select name="assignee" defaultValue="">
            <option value="">Unassigned</option>
            {memberOptions}
          </select>
          <input name="dueDate" type="date" />
          <button type="submit">Add task</button>
        </form>
      )}
      <h3>Roster</h3>
      <ul>
        {roster.map((r) => (
          <li key={r.id}>
            {new Date(r.startsAt).toLocaleString()} – {new Date(r.endsAt).toLocaleTimeString()}: {r.duty} — {name(r.userId)}
          </li>
        ))}
      </ul>
      {manage && (
        <form onSubmit={addRoster}>
          <select name="userId" required defaultValue="">
            <option value="" disabled>
              Person…
            </option>
            {memberOptions}
          </select>
          <input name="duty" placeholder="Duty (e.g. Imam, Cleaning)" required maxLength={100} />
          <input name="startsAt" type="datetime-local" required />
          <input name="endsAt" type="datetime-local" required />
          <button type="submit">Add to roster</button>
        </form>
      )}
      {error && <p role="alert">{error}</p>}
    </section>
  )
}
