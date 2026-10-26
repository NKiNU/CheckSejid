import { useEffect, useState, type FormEvent } from 'react'
import { useT } from '../../i18n/index.tsx'
import { listMembers, type Member } from '../rbac/api.ts'
import * as api from './api.ts'
import { dayKey, groupByDay, taskStatusVariant } from './status.ts'
import { FormDialog } from '@/components/FormDialog.tsx'
import { Badge } from '@/components/ui/badge.tsx'
import { Button } from '@/components/ui/button.tsx'
import { Card, CardContent } from '@/components/ui/card.tsx'
import { Input } from '@/components/ui/input.tsx'
import { Label } from '@/components/ui/label.tsx'
import { Select } from '@/components/ui/select.tsx'

type Kind = 'task' | 'roster'

// Phase 07: tasks (assign, status) and roster. Plan limits show an upgrade message (ADR-018). Tasks and roster are never deleted (ADR-024).
export function OperationsPanel({ orgId, myUserId, perms }: { orgId: string; myUserId: string; perms: ReadonlySet<string> }) {
  const { t, error: errorText, dateTime, time, date } = useT()
  const [tasks, setTasks] = useState<api.Task[] | null>(null)
  const [roster, setRoster] = useState<api.RosterEntry[] | null>(null)
  const [members, setMembers] = useState<Member[]>([])
  const [error, setError] = useState<string | null>(null)
  const [dialog, setDialog] = useState<Kind>('task')
  const [open, setOpen] = useState(false) // separate from `dialog` so the form stays put during the close animation
  const manage = perms.has('operations.manage')
  const show = (k: Kind) => (setError(null), setDialog(k), setOpen(true))

  const load = () =>
    Promise.all([api.listTasks(orgId), api.listRoster(orgId), listMembers(orgId)]).then(
      ([tk, r, m]) => (setTasks(tk), setRoster(r), setMembers(m)),
      (e) => setError(errorText(e)),
    )
  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load/errorText identity changes with locale
  }, [orgId])
  const name = (userId: string | null) => members.find((m) => m.userId === userId)?.displayName ?? (userId ? t('ops.formerMember') : t('ops.unassigned'))

  // Resolves true when the call succeeded, so a dialog only closes on success.
  const run = async (fn: () => Promise<unknown>) => {
    setError(null)
    try {
      await fn()
      await load()
      return true
    } catch (e) {
      setError(errorText(e))
      return false
    }
  }
  async function addTask(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    const v = (k: string) => String(f.get(k) ?? '').trim() || null
    if (await run(() => api.createTask(orgId, { title: String(f.get('title')), assigneeUserId: v('assignee'), dueDate: v('dueDate') }))) setOpen(false)
  }
  async function addRoster(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    const iso = (k: string) => new Date(String(f.get(k))).toISOString()
    if (await run(() => api.createRosterEntry(orgId, { userId: String(f.get('userId')), duty: String(f.get('duty')), startsAt: iso('startsAt'), endsAt: iso('endsAt') }))) setOpen(false)
  }
  const memberOptions = members.map((m) => (
    <option key={m.userId} value={m.userId}>
      {m.displayName}
    </option>
  ))

  const head = (title: string, kind: Kind, label: string) => (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h2 className="min-w-0 text-lg font-medium">{title}</h2>
      {manage && (
        <Button type="button" className="h-11 px-4" onClick={() => show(kind)}>
          {label}
        </Button>
      )}
    </div>
  )
  const loading = <p role="status" className="text-muted-foreground">{t('common.loading')}</p>
  const field = 'grid min-w-0 gap-2'

  return (
    <div className="grid gap-6 pt-6">
      <h1 className="text-2xl font-medium">{t('nav.ops')}</h1>

      <section className="grid gap-3">
        {head(t('ops.tasks'), 'task', t('ops.newTask'))}
        {!tasks && !error && loading}
        {tasks?.length === 0 && <p className="text-muted-foreground">{t('ops.noTasks')}</p>}
        {tasks && tasks.length > 0 && (
          <ul className="grid gap-3 lg:grid-cols-2">
            {tasks.map((task) => (
              <li key={task.id} className="min-w-0">
                <Card size="sm">
                  <CardContent className="gap-2">
                    <h3 className="min-w-0 text-base font-medium [overflow-wrap:anywhere]">{task.title}</h3>
                    <p id={`tm-${task.id}`} className="text-sm text-muted-foreground [overflow-wrap:anywhere]">
                      {name(task.assigneeUserId)}
                      {task.dueDate && ` · ${t('ops.due', { date: date(task.dueDate) })}`}
                    </p>
                    {api.canChangeStatus(task, myUserId, perms) ? (
                      <div className="grid min-w-0 gap-1">
                        <Label htmlFor={`st-${task.id}`} className="sr-only">
                          {t('ops.status', { title: task.title })}
                        </Label>
                        <Select id={`st-${task.id}`} aria-describedby={`tm-${task.id}`} value={task.status} onChange={(e) => run(() => api.setTaskStatus(orgId, task.id, e.target.value as api.TaskStatus))}>
                          {api.TASK_STATUSES.map((s) => (
                            <option key={s} value={s}>
                              {t(`state.${s}`)}
                            </option>
                          ))}
                        </Select>
                      </div>
                    ) : (
                      <div>
                        <Badge variant={taskStatusVariant(task.status)}>{t(`state.${task.status}`)}</Badge>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="grid gap-3">
        {head(t('ops.roster'), 'roster', t('ops.newRoster'))}
        {!roster && !error && loading}
        {roster?.length === 0 && <p className="text-muted-foreground">{t('ops.noRoster')}</p>}
        {roster &&
          groupByDay(roster, (r) => r.startsAt).map((g) => (
            <div key={g.day} className="grid gap-2">
              <h3 className="text-sm font-medium text-muted-foreground">{date(g.day)}</h3>
              <ul className="grid gap-3 lg:grid-cols-2">
                {g.items.map((r) => (
                  <li key={r.id} className="min-w-0">
                    <Card size="sm">
                      <CardContent className="gap-2">
                        <p className="min-w-0 text-base font-medium [overflow-wrap:anywhere]">{r.duty}</p>
                        <p className="text-sm text-muted-foreground [overflow-wrap:anywhere]">
                          {name(r.userId)} · {time(r.startsAt)} – {dayKey(r.endsAt) === g.day ? time(r.endsAt) : dateTime(r.endsAt)}
                        </p>
                        {r.cancelledAt && (
                          <div>
                            <Badge>{t('ops.cancelled')}</Badge>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </li>
                ))}
              </ul>
            </div>
          ))}
      </section>

      {error && !open && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <FormDialog
        open={open}
        onOpenChange={(o) => (setOpen(o), o || setError(null))}
        title={dialog === 'task' ? t('ops.newTask') : t('ops.newRoster')}
        submitLabel={dialog === 'task' ? t('ops.addTask') : t('ops.addRoster')}
        onSubmit={dialog === 'task' ? addTask : addRoster}
        error={error}
      >
        {dialog === 'task' ? (
          <>
            <div className={field}>
              <Label htmlFor="ops-title">{t('ops.task')}</Label>
              <Input id="ops-title" name="title" className="h-11" required maxLength={200} />
            </div>
            <div className={field}>
              <Label htmlFor="ops-assignee">{t('ops.assignee')}</Label>
              <Select id="ops-assignee" name="assignee" defaultValue="">
                <option value="">{t('ops.unassigned')}</option>
                {memberOptions}
              </Select>
            </div>
            <div className={field}>
              <Label htmlFor="ops-due">{t('ops.dueDate')}</Label>
              <Input id="ops-due" name="dueDate" type="date" className="h-11" />
            </div>
          </>
        ) : (
          <>
            <div className={field}>
              <Label htmlFor="ops-person">{t('ops.member')}</Label>
              <Select id="ops-person" name="userId" required defaultValue="">
                <option value="" disabled>
                  {t('ops.person')}
                </option>
                {memberOptions}
              </Select>
            </div>
            <div className={field}>
              <Label htmlFor="ops-duty">{t('ops.duty')}</Label>
              <Input id="ops-duty" name="duty" className="h-11" required maxLength={100} />
            </div>
            <div className={field}>
              <Label htmlFor="ops-starts">{t('ops.starts')}</Label>
              <Input id="ops-starts" name="startsAt" type="datetime-local" className="h-11" required />
            </div>
            <div className={field}>
              <Label htmlFor="ops-ends">{t('ops.ends')}</Label>
              <Input id="ops-ends" name="endsAt" type="datetime-local" className="h-11" required />
            </div>
          </>
        )}
      </FormDialog>
    </div>
  )
}
