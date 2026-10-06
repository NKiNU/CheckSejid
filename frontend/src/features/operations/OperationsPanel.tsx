import { useEffect, useState, type FormEvent } from 'react'
import { useT } from '../../i18n/index.tsx'
import { listMembers, type Member } from '../rbac/api.ts'
import * as api from './api.ts'

// Phase 07: tasks (assign, status) and roster. Plan limits show an upgrade message (ADR-018).
export function OperationsPanel({ orgId, myUserId, perms }: { orgId: string; myUserId: string; perms: Set<string> }) {
  const { t, error: errorText, dateTime, time, date } = useT()
  const [tasks, setTasks] = useState<api.Task[]>([])
  const [roster, setRoster] = useState<api.RosterEntry[]>([])
  const [members, setMembers] = useState<Member[]>([])
  const [error, setError] = useState<string | null>(null)
  const manage = perms.has('operations.manage')

  const load = () =>
    Promise.all([api.listTasks(orgId), api.listRoster(orgId), listMembers(orgId)]).then(
      ([tk, r, m]) => (setTasks(tk), setRoster(r), setMembers(m)),
      (e) => setError(errorText(e)),
    )
  useEffect(() => {
    Promise.all([api.listTasks(orgId), api.listRoster(orgId), listMembers(orgId)]).then(
      ([tk, r, m]) => (setTasks(tk), setRoster(r), setMembers(m)),
      (e) => setError(errorText(e)),
    )
  }, [orgId])
  const name = (userId: string | null) => members.find((m) => m.userId === userId)?.displayName ?? (userId ? t('ops.formerMember') : t('ops.unassigned'))

  const run = async (fn: () => Promise<unknown>, form?: HTMLFormElement) => {
    setError(null)
    try {
      await fn()
      form?.reset()
      await load()
    } catch (e) {
      setError(errorText(e))
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
      <h3>{t('ops.tasks')}</h3>
      <ul>
        {tasks.map((task) => (
          <li key={task.id}>
            {task.title} — {name(task.assigneeUserId)} {task.dueDate && `(${t('ops.due', { date: date(task.dueDate) })})`}{' '}
            {api.canChangeStatus(task, myUserId, perms) ? (
              <select value={task.status} onChange={(e) => run(() => api.setTaskStatus(orgId, task.id, e.target.value as api.TaskStatus))}>
                {api.TASK_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {t(`state.${s}`)}
                  </option>
                ))}
              </select>
            ) : (
              t(`state.${task.status}`)
            )}
          </li>
        ))}
      </ul>
      {manage && (
        <form onSubmit={addTask}>
          <input name="title" placeholder={t('ops.task')} required maxLength={200} />
          <select name="assignee" defaultValue="">
            <option value="">{t('ops.unassigned')}</option>
            {memberOptions}
          </select>
          <input name="dueDate" type="date" />
          <button type="submit">{t('ops.addTask')}</button>
        </form>
      )}
      <h3>{t('ops.roster')}</h3>
      <ul>
        {roster.map((r) => (
          <li key={r.id}>
            {dateTime(r.startsAt)} – {time(r.endsAt)}: {r.duty} — {name(r.userId)}
            {r.cancelledAt && ` (${t('ops.cancelled')})`}
          </li>
        ))}
      </ul>
      {manage && (
        <form onSubmit={addRoster}>
          <select name="userId" required defaultValue="">
            <option value="" disabled>
              {t('ops.person')}
            </option>
            {memberOptions}
          </select>
          <input name="duty" placeholder={t('ops.duty')} required maxLength={100} />
          <input name="startsAt" type="datetime-local" required />
          <input name="endsAt" type="datetime-local" required />
          <button type="submit">{t('ops.addRoster')}</button>
        </form>
      )}
      {error && <p role="alert">{error}</p>}
    </section>
  )
}
