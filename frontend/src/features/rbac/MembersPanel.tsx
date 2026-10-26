import { useEffect, useState, type FormEvent } from 'react'
import { useT } from '@/i18n/index.tsx'
import { ConfirmDialog } from '@/components/ConfirmDialog.tsx'
import { Badge } from '@/components/ui/badge.tsx'
import { Button } from '@/components/ui/button.tsx'
import { Card, CardContent, CardHeader } from '@/components/ui/card.tsx'
import { Input } from '@/components/ui/input.tsx'
import { Label } from '@/components/ui/label.tsx'
import * as api from './api.ts'

// Phase 03 UI: members with roles, role changes, add/remove, leave, ownership transfer.
// Controls are hidden from members who lack the permission; the server enforces it regardless.
export function MembersPanel({ orgId, myUserId, onLeft }: { orgId: string; myUserId: string; onLeft: () => void }) {
  const { t, error: errorText } = useT()
  const [perms, setPerms] = useState<Set<string>>(new Set())
  const [members, setMembers] = useState<api.Member[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [ask, setAsk] = useState<{ kind: 'remove' | 'transfer'; m: api.Member } | 'leave' | null>(null)
  const [open, setOpen] = useState(false) // separate from `ask` so the copy stays put during the close animation
  const askFor = (a: NonNullable<typeof ask>) => (setAsk(a), setOpen(true))

  const run = async (fn: () => Promise<unknown>) => {
    setError(null)
    try {
      await fn()
    } catch (e) {
      setError(errorText(e)) // QUOTA_EXCEEDED on add → "upgrade your plan"
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
      .catch((e) => setError(errorText(e)))
      .finally(() => setLoaded(true))
    // eslint-disable-next-line react-hooks/exhaustive-deps -- errorText identity changes with locale; reload only on org change
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

  const confirmed = () => {
    if (ask === 'leave') return run(async () => (await api.leave(orgId), onLeft()))
    if (!ask) return
    const { kind, m } = ask
    return run(async () => (await (kind === 'remove' ? api.removeMember(orgId, m.id) : api.transferOwnership(orgId, m.id)), await load()))
  }
  const askName = ask && ask !== 'leave' ? ask.m.displayName : ''
  const copy =
    ask === 'leave'
      ? { title: t('members.leave'), body: t('members.leaveConfirm'), label: t('members.leave') }
      : ask?.kind === 'transfer'
        ? { title: t('members.makeOwner'), body: t('members.transferConfirm', { name: askName }), label: t('members.makeOwner') }
        : { title: t('members.remove'), body: t('members.removeConfirm', { name: askName }), label: t('members.remove') }

  return (
    <div className="grid gap-4 pt-6">
      <h1 className="text-2xl font-medium">{t('members.heading')}</h1>
      {!loaded && !error && <p role="status" className="text-muted-foreground">{t('common.loading')}</p>}
      {loaded && members.length === 0 && !error && <p className="text-muted-foreground">{t('members.empty')}</p>}
      {members.length > 0 && (
        <Card>
          <CardContent>
            <ul className="divide-y divide-border">
              {members.map((m) => {
                const editable = can('members.manage') && !m.isOwner && m.userId !== myUserId
                const canTransfer = can('organisation.ownership.transfer') && m.userId !== myUserId
                return (
                  <li key={m.id} className="grid gap-2 py-3 first:pt-0 last:pb-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <strong className="min-w-0 max-w-full [overflow-wrap:anywhere]">{m.displayName}</strong>
                      {m.userId === myUserId && <Badge variant="neutral">{t('members.you')}</Badge>}
                      {m.roles.length === 0 && <Badge variant="neutral">{t('members.noRole')}</Badge>}
                      {m.roles.map((r) => (
                        <Badge key={r} variant={r === 'owner' ? 'success' : 'neutral'}>{t(`role.${r}`)}</Badge>
                      ))}
                    </div>
                    {m.title && <p className="min-w-0 text-sm text-muted-foreground [overflow-wrap:anywhere]">{m.title}</p>}
                    {editable && (
                      <div className="grid grid-cols-[repeat(auto-fill,minmax(8.5rem,1fr))] gap-x-4">
                        {api.ASSIGNABLE_ROLES.map((r) => (
                          <label key={r} className="flex min-h-11 min-w-0 items-center gap-2 text-sm">
                            <input type="checkbox" className="size-5 shrink-0" checked={m.roles.includes(r)} onChange={() => toggle(m, r)} /> {t(`role.${r}`)}
                          </label>
                        ))}
                      </div>
                    )}
                    {(editable || canTransfer) && (
                      <div className="flex flex-wrap gap-2">
                        {editable && (
                          <Button type="button" variant="outline" className="h-11 px-4" onClick={() => askFor({ kind: 'remove', m })}>
                            {t('members.remove')}
                          </Button>
                        )}
                        {canTransfer && (
                          <Button type="button" variant="outline" className="h-11 px-4" onClick={() => askFor({ kind: 'transfer', m })}>
                            {t('members.makeOwner')}
                          </Button>
                        )}
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          </CardContent>
        </Card>
      )}
      {can('members.manage') && (
        <Card>
          <CardHeader>
            <h2 className="text-base font-medium">{t('members.addByEmail')}</h2>
          </CardHeader>
          <CardContent>
            <form onSubmit={add} className="grid gap-4">
              <Label className="grid gap-2">
                <span className="sr-only">{t('members.addByEmail')}</span>
                <Input name="email" type="email" required maxLength={254} className="h-11" />
              </Label>
              <Button type="submit" className="h-11 px-4">{t('members.add')}</Button>
            </form>
          </CardContent>
        </Card>
      )}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {me && !me.isOwner && (
        <Card>
          <CardHeader>
            <h2 className="text-base font-medium text-destructive">{t('members.leave')}</h2>
          </CardHeader>
          <CardContent className="grid gap-4">
            <Button type="button" variant="destructive" className="h-11 px-4" onClick={() => askFor('leave')}>
              {t('members.leave')}
            </Button>
          </CardContent>
        </Card>
      )}
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={copy.title}
        body={copy.body}
        confirmLabel={copy.label}
        destructive={ask === 'leave' || ask?.kind === 'remove'}
        onConfirm={confirmed}
      />
    </div>
  )
}

async function fetchState(orgId: string) {
  const { permissions } = await api.myPermissions(orgId)
  return { permissions, members: permissions.includes('members.read') ? await api.listMembers(orgId) : [] }
}
