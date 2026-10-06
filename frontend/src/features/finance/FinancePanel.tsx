import { useEffect, useState, type FormEvent } from 'react'
import { useT } from '../../i18n/index.tsx'
import * as api from './api.ts'

// Phase 08: record → submit → approve; cancel / void request; copy to new draft; collections with
// progress; budgets with used/remaining. The server enforces states, keys, ADR-013 and entitlements.
export function FinancePanel({ orgId, myUserId, perms }: { orgId: string; myUserId: string; perms: Set<string> }) {
  const { t, locale, error: errorText } = useT()
  const [kind, setKind] = useState<api.Kind>('expense')
  const [records, setRecords] = useState<api.FinanceRecord[]>([])
  const [categories, setCategories] = useState<api.Category[]>([])
  const [collections, setCollections] = useState<api.Collection[]>([])
  const [error, setError] = useState<string | null>(null)

  const load = () =>
    Promise.all([api.listRecords(orgId, kind), api.listCategories(orgId), api.listCollections(orgId)]).then(
      ([r, c, col]) => (setRecords(r), setCategories(c), setCollections(col)),
      (e) => setError(errorText(e)),
    )
  useEffect(() => {
    Promise.all([api.listRecords(orgId, kind), api.listCategories(orgId), api.listCollections(orgId)]).then(
      ([r, c, col]) => (setRecords(r), setCategories(c), setCollections(col)),
      (e) => setError(errorText(e)),
    )
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
    <section>
      <h3>{t('fin.heading')}</h3>
      <p>{t('fin.disclaimer')}</p>
      <select value={kind} onChange={(e) => setKind(e.target.value as api.Kind)}>
        {(['expense', 'income', 'budget'] as const).map((k) => (
          <option key={k} value={k}>
            {t(`fin.kind.${k}`)}
          </option>
        ))}
      </select>
      <ul>
        {records.map((r) => (
          <li key={r.id}>
            {r.name ?? r.description} — {api.formatMoney(r.amount, r.currency, locale)} [{t(`state.${r.state}`)}
            {r.voidRequested ? `, ${t('fin.voidRequested')}` : ''}]
            {r.used !== undefined &&
              ` ${t('fin.usedRemaining', { used: api.formatMoney(r.used, r.currency, locale), remaining: api.formatMoney(r.remaining!, r.currency, locale) })}`}
            {api.availableActions(kind, r, myUserId, perms).map((a) => (
              <button key={a} type="button" onClick={() => doAction(r, a)}>
                {t(`action.${a}`)}
              </button>
            ))}
            {kind === 'expense' && r.state === 'DRAFT' && r.createdById === myUserId && (
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,application/pdf"
                aria-label={t('fin.attach')}
                onChange={(e) => e.target.files?.[0] && run(() => api.uploadEvidence(orgId, r.id, e.target.files![0]!))}
              />
            )}
          </li>
        ))}
      </ul>
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
      {error && <p role="alert">{error}</p>}
    </section>
  )
}
