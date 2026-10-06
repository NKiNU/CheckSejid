import { useEffect, useState, type FormEvent } from 'react'
import { errorMessage } from '../subscriptions/api.ts'
import * as api from './api.ts'

// Phase 08: record → submit → approve; cancel / void request; copy to new draft; collections with
// progress; budgets with used/remaining. The server enforces states, keys, ADR-013 and entitlements.
export function FinancePanel({ orgId, myUserId, perms }: { orgId: string; myUserId: string; perms: Set<string> }) {
  const [kind, setKind] = useState<api.Kind>('expense')
  const [records, setRecords] = useState<api.FinanceRecord[]>([])
  const [categories, setCategories] = useState<api.Category[]>([])
  const [collections, setCollections] = useState<api.Collection[]>([])
  const [error, setError] = useState<string | null>(null)

  const load = () =>
    Promise.all([api.listRecords(orgId, kind), api.listCategories(orgId), api.listCollections(orgId)]).then(
      ([r, c, col]) => (setRecords(r), setCategories(c), setCollections(col)),
      (e) => setError(errorMessage(e)),
    )
  useEffect(() => {
    Promise.all([api.listRecords(orgId, kind), api.listCategories(orgId), api.listCollections(orgId)]).then(
      ([r, c, col]) => (setRecords(r), setCategories(c), setCollections(col)),
      (e) => setError(errorMessage(e)),
    )
  }, [orgId, kind])

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
  const doAction = (r: api.FinanceRecord, a: api.Action) => {
    let reason: string | undefined
    if (api.needsReason(a)) {
      reason = prompt('Reason (required)')?.trim()
      if (!reason) return
    }
    run(() => api.act(orgId, kind, r.id, a, reason))
  }

  function create(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    const amount = api.toMinor(String(f.get('amount')))
    if (amount === null) return setError('Enter a positive amount with at most 2 decimals')
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
      <h3>Finance</h3>
      <p>Records are kept for your organisation's own management; this is not certified accounting (ADR-003).</p>
      <select value={kind} onChange={(e) => setKind(e.target.value as api.Kind)}>
        <option value="expense">Expenses</option>
        <option value="income">Income</option>
        <option value="budget">Budgets</option>
      </select>
      <ul>
        {records.map((r) => (
          <li key={r.id}>
            {r.name ?? r.description} — {api.formatMoney(r.amount, r.currency)} [{r.state}
            {r.voidRequested ? ', void requested' : ''}]
            {r.used !== undefined && ` used ${api.formatMoney(r.used, r.currency)}, remaining ${api.formatMoney(r.remaining!, r.currency)}`}
            {api.availableActions(kind, r, myUserId, perms).map((a) => (
              <button key={a} type="button" onClick={() => doAction(r, a)}>
                {a}
              </button>
            ))}
            {kind === 'expense' && r.state === 'DRAFT' && r.createdById === myUserId && (
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,application/pdf"
                aria-label="Attach evidence"
                onChange={(e) => e.target.files?.[0] && run(() => api.uploadEvidence(orgId, r.id, e.target.files![0]!))}
              />
            )}
          </li>
        ))}
      </ul>
      {canCreate && (
        <form onSubmit={create}>
          {kind === 'budget' && <input name="name" placeholder="Budget name" required maxLength={200} />}
          <input name="amount" placeholder="Amount (RM)" required inputMode="decimal" />
          <select name="categoryId" required defaultValue="">
            <option value="" disabled>
              Category…
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
          {kind === 'expense' && <input name="payee" placeholder="Payee" maxLength={200} />}
          {kind === 'income' && (
            <select name="collectionId" defaultValue="">
              <option value="">No collection</option>
              {collections
                .filter((c) => c.status === 'OPEN')
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.purpose}
                  </option>
                ))}
            </select>
          )}
          <input name="description" placeholder="Description" required maxLength={1000} />
          <button type="submit">Save draft</button>
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
          <input name="name" placeholder="New category" required maxLength={100} />
          <select name="kind">
            <option value="EXPENSE">Expense</option>
            <option value="INCOME">Income</option>
          </select>
          <button type="submit">Add category</button>
        </form>
      )}
      <h4>Collections</h4>
      <ul>
        {collections.map((c) => (
          <li key={c.id}>
            {c.purpose}: {api.formatMoney(c.collected, c.currency)}
            {c.targetAmount !== null && ` of ${api.formatMoney(c.targetAmount, c.currency)} (${c.percent}%)`} [{c.status}]
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
            if (target && targetAmount === null) return setError('Enter a valid target')
            run(() => api.createCollection(orgId, { purpose: String(f.get('purpose')), targetAmount }), e.currentTarget)
          }}
        >
          <input name="purpose" placeholder="Purpose (e.g. Roof Repair Fund)" required maxLength={200} />
          <input name="target" placeholder="Target (RM, optional)" inputMode="decimal" />
          <button type="submit">Add collection</button>
        </form>
      )}
      {error && <p role="alert">{error}</p>}
    </section>
  )
}
