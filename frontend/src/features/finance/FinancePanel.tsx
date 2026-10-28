import { useState, type FormEvent } from 'react'
import { useT } from '@/i18n/index.tsx'
import { ConfirmDialog } from '@/components/ConfirmDialog.tsx'
import { FormDialog } from '@/components/FormDialog.tsx'
import { Button } from '@/components/ui/button.tsx'
import * as api from './api.ts'
import { CategoryFields, CollectionFields, ReasonField } from './SmallFields.tsx'
import { CollectionList } from './CollectionList.tsx'
import { FinanceList } from './FinanceList.tsx'
import { TransactionFields } from './TransactionFields.tsx'
import { useFinanceData } from './useFinanceData.ts'

type Dlg = 'tx' | 'cat' | 'col' | 'reason'
type Pending = { r: api.FinanceRecord; a: api.Action }
const CONFIRM: Partial<Record<api.Action, 'fin.confirmReject' | 'fin.confirmVoidApprove'>> = { reject: 'fin.confirmReject', 'void-approve': 'fin.confirmVoidApprove' }

// Phase 08: record → submit → approve; cancel / void request; copy to new draft; collections with
// progress; budgets with used/remaining. The server enforces states, keys, ADR-013 and entitlements.
export function FinancePanel({ orgId, myUserId, perms }: { orgId: string; myUserId: string; perms: ReadonlySet<string> }) {
  const { t, error: errorText } = useT()
  const [kind, setKind] = useState<api.Kind>('expense')
  const { records, setRecords, categories, collections, error: loadError, setError: setLoadError, load } = useFinanceData(orgId, kind)
  const [error, setError] = useState<string | null>(null) // action/dialog errors; load errors stay in loadError
  const [busyId, setBusyId] = useState<string | null>(null) // record with a row action in flight
  const [dlg, setDlg] = useState<Dlg>('tx')
  const [open, setOpen] = useState(false) // separate from `dlg`/`pend` so content stays put during the close animation
  const [pend, setPend] = useState<Pending | null>(null)
  const [confOpen, setConfOpen] = useState(false)
  const show = (d: Dlg) => (setError(null), setDlg(d), setOpen(true))

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
  const doAction = (r: api.FinanceRecord, a: api.Action) => {
    if (api.needsReason(a)) return setPend({ r, a }), show('reason')
    if (CONFIRM[a]) return setPend({ r, a }), setConfOpen(true)
    if (busyId) return
    setBusyId(r.id)
    run(() => api.act(orgId, kind, r.id, a)).finally(() => setBusyId(null))
  }
  async function sendReason(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const reason = String(new FormData(e.currentTarget).get('reason') ?? '').trim()
    if (!reason) return setError(t('fin.reasonRequired'))
    if (pend && (await run(() => api.act(orgId, kind, pend.r.id, pend.a, reason)))) setOpen(false)
  }
  async function create(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    const data = api.parseTransaction(kind, f)
    if (!data) return setError(t('fin.badAmount'))
    const file = f.get('receipt')
    const receipt = file instanceof File && file.size > 0 ? file : null
    if (receipt && !api.receiptOk(receipt)) return setError(t('fin.badReceipt'))
    let attachErr: string | null = null
    const ok = await run(async () => {
      const rec = await api.createRecord(orgId, kind, data)
      if (receipt) await api.uploadEvidence(orgId, rec.id, receipt).catch((err) => (attachErr = errorText(err)))
    })
    if (!ok) return
    setOpen(false)
    if (attachErr) setError(t('fin.attachFailed', { why: attachErr }))
  }
  async function addCategory(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    if (await run(() => api.createCategory(orgId, { name: String(f.get('name')), kind: f.get('kind') as api.Category['kind'] }))) setOpen(false)
  }
  async function addCollection(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    const target = String(f.get('target') ?? '').trim()
    const targetAmount = target ? api.toMinor(target) : null
    if (target && targetAmount === null) return setError(t('fin.badTarget'))
    if (await run(() => api.createCollection(orgId, { purpose: String(f.get('purpose')), targetAmount }))) setOpen(false)
  }
  const attach = (r: api.FinanceRecord, file: File) => (api.receiptOk(file) ? run(() => api.uploadEvidence(orgId, r.id, file)) : setError(t('fin.badReceipt')))

  const canCreate = perms.has({ income: 'finance.income.create', expense: 'finance.expense.create', budget: 'finance.budget.manage' }[kind])
  const canCategory = perms.has('finance.category.manage')
  const canCollection = perms.has('finance.collection.manage')
  const reasonLabel = pend ? t(`action.${pend.a}`) : ''
  const dialogs: Record<Dlg, { title: string; submit: string; onSubmit: (e: FormEvent<HTMLFormElement>) => Promise<unknown> | void }> = {
    tx: { title: t(`fin.new.${kind}`), submit: t('common.saveDraft'), onSubmit: create },
    cat: { title: t('fin.newCategory'), submit: t('fin.addCategory'), onSubmit: addCategory },
    col: { title: t('fin.newCollection'), submit: t('fin.addCollection'), onSubmit: addCollection },
    reason: { title: reasonLabel, submit: reasonLabel, onSubmit: sendReason },
  }
  const d = dialogs[dlg]

  return (
    <div className="grid gap-6 pt-6">
      <div className="grid gap-4">
        <h1 className="text-2xl font-medium">{t('fin.heading')}</h1>
        <p className="text-sm text-muted-foreground">{t('fin.disclaimer')}</p>
        <div role="group" aria-label={t('fin.heading')} className="grid grid-cols-3 gap-2">
          {(['expense', 'income', 'budget'] as const).map((k) => (
            <Button
              key={k}
              type="button"
              variant={k === kind ? 'default' : 'outline'}
              aria-pressed={k === kind}
              className="h-auto min-h-11 min-w-0 whitespace-normal px-1 text-xs leading-tight sm:px-2 sm:text-sm"
              onClick={() => k !== kind && (setRecords(null), setError(null), setLoadError(null), setKind(k))}
            >
              {t(`fin.kind.${k}`)}
            </Button>
          ))}
        </div>
        {(canCreate || canCategory) && (
          <div className="flex flex-wrap gap-2">
            {canCreate && (
              <Button type="button" className="h-auto min-h-11 whitespace-normal px-4" onClick={() => show('tx')}>
                {t(`fin.new.${kind}`)}
              </Button>
            )}
            {canCategory && (
              <Button type="button" variant="outline" className="h-auto min-h-11 whitespace-normal px-4" onClick={() => show('cat')}>
                {t('fin.newCategory')}
              </Button>
            )}
          </div>
        )}
        {(loadError ?? (!open && error)) && <p role="alert" className="text-sm text-destructive">{loadError ?? error}</p>}
        <FinanceList kind={kind} records={records} categories={categories} myUserId={myUserId} perms={perms} failed={!!loadError} busy={!!busyId} onAction={doAction} onAttach={attach} />
      </div>

      <section className="grid gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="min-w-0 text-lg font-medium">{t('fin.collections')}</h2>
          {canCollection && (
            <Button type="button" className="h-auto min-h-11 whitespace-normal px-4" onClick={() => show('col')}>
              {t('fin.newCollection')}
            </Button>
          )}
        </div>
        <CollectionList collections={collections} />
      </section>

      <ConfirmDialog
        open={confOpen}
        onOpenChange={setConfOpen}
        title={pend ? t(`action.${pend.a}`) : ''}
        body={pend && CONFIRM[pend.a] ? t(CONFIRM[pend.a]!) : ''}
        confirmLabel={pend ? t(`action.${pend.a}`) : ''}
        destructive
        onConfirm={() => pend && run(() => api.act(orgId, kind, pend.r.id, pend.a))}
      />
      <FormDialog open={open} onOpenChange={(o) => (setOpen(o), o || setError(null))} title={d.title} submitLabel={d.submit} onSubmit={d.onSubmit} error={open ? error : null}>
        {dlg === 'tx' && <TransactionFields kind={kind} categories={categories} collections={collections} />}
        {dlg === 'cat' && <CategoryFields />}
        {dlg === 'col' && <CollectionFields />}
        {dlg === 'reason' && <ReasonField />}
      </FormDialog>
    </div>
  )
}
