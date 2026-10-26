import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useT } from '../../i18n/index.tsx'
import { Button } from '@/components/ui/button.tsx'
import * as api from './api.ts'
import { FinanceList } from './FinanceList.tsx'

// Phase 08: record → submit → approve; cancel / void request; copy to new draft; collections with
// progress; budgets with used/remaining. The server enforces states, keys, ADR-013 and entitlements.
export function FinancePanel({ orgId, myUserId, perms }: { orgId: string; myUserId: string; perms: ReadonlySet<string> }) {
  const { t, locale, error: errorText } = useT()
  const [kind, setKind] = useState<api.Kind>('expense')
  const [records, setRecords] = useState<api.FinanceRecord[] | null>(null)
  const [categories, setCategories] = useState<api.Category[]>([])
  const [collections, setCollections] = useState<api.Collection[]>([])
  const [error, setError] = useState<string | null>(null)

  const kindRef = useRef(kind)
  useEffect(() => {
    kindRef.current = kind
  }, [kind])
  // Drops the result when it is no longer wanted (kind switched or unmounted), so a slow response cannot overwrite a newer list.
  const fetchAll = (k: api.Kind, live: () => boolean) =>
    Promise.all([api.listRecords(orgId, k), api.listCategories(orgId), api.listCollections(orgId)]).then(
      ([r, c, col]) => live() && (setRecords(r), setCategories(c), setCollections(col)),
      (e) => live() && setError(errorText(e)),
    )
  const load = () => fetchAll(kind, () => kindRef.current === kind)
  useEffect(() => {
    let live = true
    fetchAll(kind, () => live)
    return () => {
      live = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fetchAll closes over orgId/errorText; reload only on org or kind change
  }, [orgId, kind])

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
  const doAction = (r: api.FinanceRecord, a: api.Action) => {
    let reason: string | undefined
    if (api.needsReason(a)) {
      reason = prompt(t('fin.reason'))?.trim()
      if (!reason) return
    }
    run(() => api.act(orgId, kind, r.id, a, reason))
  }

  function create(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    const amount = api.toMinor(String(f.get('amount')))
    if (amount === null) return setError(t('fin.badAmount'))
    const s = (k: string) => String(f.get(k) ?? '').trim()
    const common = { amount, categoryId: s('categoryId'), description: s('description') }
    const data =
      kind === 'income'
        ? { ...common, receivedOn: s('date'), collectionId: s('collectionId') || null }
        : kind === 'expense'
          ? { ...common, spentOn: s('date'), payee: s('payee') || null }
          : { ...common, name: s('name'), periodStart: s('periodStart'), periodEnd: s('periodEnd') }
    run(() => api.createRecord(orgId, kind, data), e.currentTarget)
  }

  const catKind = kind === 'income' ? 'INCOME' : 'EXPENSE'
  const canCreate = perms.has({ income: 'finance.income.create', expense: 'finance.expense.create', budget: 'finance.budget.manage' }[kind])

  return (
    <div className="grid gap-4 pt-6">
      <h1 className="text-2xl font-medium">{t('fin.heading')}</h1>
      <p className="text-sm text-muted-foreground">{t('fin.disclaimer')}</p>
      <div role="group" aria-label={t('fin.heading')} className="grid grid-cols-3 gap-2">
        {(['expense', 'income', 'budget'] as const).map((k) => (
          <Button
            key={k}
            type="button"
            variant={k === kind ? 'default' : 'outline'}
            aria-pressed={k === kind}
            className="h-auto min-h-11 min-w-0 whitespace-normal px-2 leading-tight [overflow-wrap:anywhere]"
            onClick={() => k !== kind && (setRecords(null), setError(null), setKind(k))}
          >
            {t(`fin.kind.${k}`)}
          </Button>
        ))}
      </div>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <FinanceList
        kind={kind}
        records={records}
        categories={categories}
        myUserId={myUserId}
        perms={perms}
        failed={!!error}
        onAction={doAction}
        onAttach={(r, file) => run(() => api.uploadEvidence(orgId, r.id, file))}
      />
      <div className="legacy"> {/* 7b: forms and collections move to dialogs/cards */}
      {canCreate && (
        <form onSubmit={create}>
          {kind === 'budget' && <input name="name" placeholder={t('fin.budgetName')} required maxLength={200} />}
          <input name="amount" placeholder={t('fin.amount')} required inputMode="decimal" />
          <select name="categoryId" required defaultValue="">
            <option value="" disabled>
              {t('fin.category')}
            </option>
            {categories
              .filter((c) => c.kind === catKind && c.active)
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
          </select>
          {kind === 'budget' ? (
            <>
              <input name="periodStart" type="date" required />
              <input name="periodEnd" type="date" required />
            </>
          ) : (
            <input name="date" type="date" required />
          )}
          {kind === 'expense' && <input name="payee" placeholder={t('fin.payee')} maxLength={200} />}
          {kind === 'income' && (
            <select name="collectionId" defaultValue="">
              <option value="">{t('fin.noCollection')}</option>
              {collections
                .filter((c) => c.status === 'OPEN')
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.purpose}
                  </option>
                ))}
            </select>
          )}
          <input name="description" placeholder={t('common.description')} required maxLength={1000} />
          <button type="submit">{t('common.saveDraft')}</button>
        </form>
      )}
      {perms.has('finance.category.manage') && (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            const f = new FormData(e.currentTarget)
            run(() => api.createCategory(orgId, { name: String(f.get('name')), kind: f.get('kind') as api.Category['kind'] }), e.currentTarget)
          }}
        >
          <input name="name" placeholder={t('fin.newCategory')} required maxLength={100} />
          <select name="kind">
            <option value="EXPENSE">{t('cat.EXPENSE')}</option>
            <option value="INCOME">{t('cat.INCOME')}</option>
          </select>
          <button type="submit">{t('fin.addCategory')}</button>
        </form>
      )}
      <h4>{t('fin.collections')}</h4>
      <ul>
        {collections.map((c) => (
          <li key={c.id}>
            {c.purpose}: {api.formatMoney(c.collected, c.currency, locale)}
            {c.targetAmount !== null &&
              ` ${t('fin.ofTarget', { target: api.formatMoney(c.targetAmount, c.currency, locale), percent: c.percent ?? 0 })}`}{' '}
            [{t(`state.${c.status}`)}]
          </li>
        ))}
      </ul>
      {perms.has('finance.collection.manage') && (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            const f = new FormData(e.currentTarget)
            const target = String(f.get('target') ?? '').trim()
            const targetAmount = target ? api.toMinor(target) : null
            if (target && targetAmount === null) return setError(t('fin.badTarget'))
            run(() => api.createCollection(orgId, { purpose: String(f.get('purpose')), targetAmount }), e.currentTarget)
          }}
        >
          <input name="purpose" placeholder={t('fin.purpose')} required maxLength={200} />
          <input name="target" placeholder={t('fin.target')} inputMode="decimal" />
          <button type="submit">{t('fin.addCollection')}</button>
        </form>
      )}
      </div>
    </div>
  )
}
