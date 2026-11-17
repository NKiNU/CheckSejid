import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Button, Card, FinBadge, cx } from '../../components/ui';
import { formatGregorian, formatTime } from '../../domain/calendar';
import { hasCapability, lowestPlanWith } from '../../domain/entitlements';
import { LOCKED, STATUS_LABEL, canTransition, type FinKind, type FinStatus, type FinancialRecord } from '../../domain/finance';
import { formatMYR } from '../../domain/money';
import { can } from '../../domain/rbac';
import { BUDGETS, WORKSPACE_ORG_ID } from '../../data/seed';
import { useApp, type Outcome } from '../../store';

const KINDS: { kind: FinKind; label: string }[] = [
  { kind: 'expense', label: 'Expenses' },
  { kind: 'income', label: 'Income' },
  { kind: 'collection', label: 'Collections' },
];
const STATUSES: (FinStatus | 'ALL')[] = ['ALL', 'DRAFT', 'SUBMITTED', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'VOIDED'];
const STEPS: FinStatus[] = ['DRAFT', 'SUBMITTED', 'PENDING_APPROVAL', 'APPROVED'];

export function Finance() {
  const { records, orgs, lang } = useApp();
  const [params, setParams] = useSearchParams();
  const initial = records.find((r) => r.id === params.get('record'));
  const [kind, setKind] = useState<FinKind>(initial?.kind ?? 'expense');
  const [status, setStatus] = useState<FinStatus | 'ALL'>('ALL');
  const [selectedId, setSelectedId] = useState<string | undefined>(initial?.id);
  const [creating, setCreating] = useState(false);
  const org = orgs.find((o) => o.id === WORKSPACE_ORG_ID)!;

  if (!hasCapability(org.plan, 'finance')) {
    return <p>Finance is included from the {lowestPlanWith('finance')} plan.</p>;
  }

  const ofKind = records.filter((r) => r.kind === kind);
  const rows = ofKind.filter((r) => status === 'ALL' || r.status === status);
  const selected = ofKind.find((r) => r.id === selectedId) ?? rows[0];
  const select = (id: string) => { setSelectedId(id); setParams({ record: id }, { replace: true }); };
  const auditLocked = !hasCapability(org.plan, 'auditLogReport');

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="m-0 text-[28px] leading-[34px] font-bold tracking-tight">Finance</h1>
        <Button onClick={() => setCreating((c) => !c)}>{creating ? 'Close' : `+ Record ${kind}`}</Button>
      </div>

      <nav aria-label="Finance sections" className="flex flex-wrap gap-1 border-b border-line">
        {KINDS.map((k) => (
          <button key={k.kind} type="button" aria-current={kind === k.kind ? 'page' : undefined} onClick={() => { setKind(k.kind); setSelectedId(undefined); }} className={cx('h-11 cursor-pointer border-0 bg-transparent px-3.5 text-sm', kind === k.kind ? 'font-bold text-ink shadow-[inset_0_-2px_0_var(--color-brand)]' : 'font-semibold text-muted')}>
            {k.label}
          </button>
        ))}
        <span className="flex h-11 items-center gap-1.5 px-3.5 text-sm font-semibold text-muted">
          Audit log report
          {auditLocked && <span className="rounded-md bg-ground-2 px-1.5 py-0.5 text-[11px] font-bold">{lowestPlanWith('auditLogReport')[0] + lowestPlanWith('auditLogReport').slice(1).toLowerCase()}</span>}
        </span>
      </nav>

      {creating && <NewRecord kind={kind} onDone={() => setCreating(false)} />}

      <div role="group" aria-label="Filter by status" className="flex flex-wrap gap-2">
        {STATUSES.map((s) => {
          const on = status === s;
          const count = s === 'ALL' ? ofKind.length : ofKind.filter((r) => r.status === s).length;
          return (
            <button key={s} type="button" aria-pressed={on} onClick={() => setStatus(s)} className={cx('h-9 cursor-pointer rounded-full border px-3.5 text-[13px] font-semibold', on ? 'border-ink bg-ink text-surface' : 'border-line bg-surface text-ink')}>
              {s === 'ALL' ? 'All' : STATUS_LABEL[s]} <span className="opacity-70">{count}</span>
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-start gap-4">
        <Card as="section" aria-label="Records" className="min-w-0 flex-[3_1_520px] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[620px] border-collapse text-sm">
              <thead>
                <tr className="bg-subtle text-left text-xs text-muted">
                  <th scope="col" className="px-4 py-2.5 font-semibold">Date</th>
                  <th scope="col" className="px-2 py-2.5 font-semibold">Description</th>
                  <th scope="col" className="px-2 py-2.5 font-semibold">Created by</th>
                  <th scope="col" className="px-2 py-2.5 font-semibold">Status</th>
                  <th scope="col" className="px-4 py-2.5 text-right font-semibold">Amount (MYR)</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const isSel = r.id === selected?.id;
                  return (
                    <tr key={r.id} className={cx('border-t border-neutral-soft', isSel && 'bg-brand-soft/50')}>
                      <td className="tabular px-4 py-3 whitespace-nowrap text-muted">{formatGregorian(new Date(r.date), lang, { day: 'numeric', month: 'short' })}</td>
                      <td className="px-2 py-1.5">
                        <button type="button" aria-current={isSel ? 'true' : undefined} onClick={() => select(r.id)} className="block min-h-11 w-full cursor-pointer border-0 bg-transparent py-1 text-left text-ink">
                          <span className={cx('block font-semibold', r.status === 'VOIDED' && 'line-through')}>{r.description}</span>
                          <span className="block text-xs text-muted">{r.id} · {r.category}</span>
                        </button>
                      </td>
                      <td className="px-2 py-3 whitespace-nowrap text-muted">{r.createdByName}</td>
                      <td className="px-2 py-3"><FinBadge status={r.status} /></td>
                      <td className={cx('tabular px-4 py-3 text-right font-bold', r.status === 'VOIDED' && 'line-through')}>{formatMYR(r.amount)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {rows.length === 0 && <p className="px-4 py-8 text-center text-sm text-muted">No records with this status.</p>}
        </Card>

        {selected && <RecordDetail key={selected.id} record={selected} />}
      </div>
    </>
  );
}

function RecordDetail({ record }: { record: FinancialRecord }) {
  const { actor, moveRecord, lang } = useApp();
  const [reason, setReason] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const act = (to: FinStatus | 'SUBMIT', done: string) => {
    const r: Outcome = moveRecord(record.id, to, reason);
    setMsg(r.ok ? { ok: true, text: done } : { ok: false, text: r.message });
    if (r.ok) setReason('');
  };

  const s = record.status;
  const isApprover = can(actor.role, 'finance.approve');
  const selfMade = record.createdBy === actor.id;
  const canCreate = can(actor.role, record.kind === 'expense' ? 'finance.expense.create' : 'finance.income.create');
  const canVoid = canTransition(s, 'VOIDED') && (isApprover || selfMade);
  const reached = s === 'REJECTED' ? 3 : STEPS.indexOf(s);
  const steps = STEPS.map((st, i) => (i === 3 && s === 'REJECTED' ? 'REJECTED' : st));

  return (
    <Card as="aside" aria-label="Record detail" className="flex min-w-0 flex-[2_1_340px] flex-col gap-4 p-[18px]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="m-0 text-xs text-muted">{record.id} · {record.category}</p>
          <h2 className="m-0 mt-1 text-lg leading-6 font-bold">{record.description}</h2>
        </div>
        <FinBadge status={s} />
      </div>
      <p className={cx('tabular m-0 text-[32px] leading-[38px] font-bold tracking-tight', s === 'VOIDED' && 'text-muted line-through')}>{formatMYR(record.amount)}</p>

      <ol aria-label="Approval progress" className="m-0 grid list-none grid-cols-4 gap-1.5 p-0">
        {steps.map((st, i) => {
          const done = s !== 'VOIDED' && i <= reached;
          return (
            <li key={st} className="flex flex-col gap-1.5" aria-current={i === reached ? 'step' : undefined}>
              <span aria-hidden="true" className={cx('h-1.5 rounded', !done ? 'bg-line' : st === 'REJECTED' ? 'bg-danger' : 'bg-brand')} />
              <span className={cx('text-[11px] font-bold', done ? 'text-ink' : 'text-muted')}>{st === 'PENDING_APPROVAL' ? 'Pending' : STATUS_LABEL[st]}</span>
            </li>
          );
        })}
      </ol>

      <dl className="m-0 grid grid-cols-[110px_1fr] gap-x-3 gap-y-2 text-sm">
        <dt className="text-muted">Date</dt><dd className="m-0">{formatGregorian(new Date(record.date), lang)}</dd>
        <dt className="text-muted">Created by</dt><dd className="m-0">{record.createdByName}</dd>
        <dt className="text-muted">Category</dt><dd className="m-0">{record.category}</dd>
        <dt className="text-muted">Currency</dt><dd className="m-0">{record.currency}</dd>
      </dl>

      {s === 'PENDING_APPROVAL' && isApprover && !selfMade && (
        <div className="flex flex-col gap-2.5 border-t border-neutral-soft pt-2">
          <label className="flex flex-col gap-1.5 text-[13px] font-semibold">
            Reason (optional)
            <textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Quote from a second vendor needed" className="resize-y rounded-xl border border-line-strong px-3 py-2.5 font-normal text-ink" />
          </label>
          <div className="flex gap-2">
            <Button className="flex-1" onClick={() => act('APPROVED', 'Approved. The record is now locked.')}>Approve</Button>
            <Button variant="danger" className="flex-1" onClick={() => act('REJECTED', 'Rejected. The creator will see your reason.')}>Reject</Button>
          </div>
        </div>
      )}
      {s === 'PENDING_APPROVAL' && isApprover && selfMade && (
        <p className="m-0 rounded-xl bg-gold-soft px-3.5 py-3 text-[13px] leading-[19px] text-gold-ink">You created this record, so another treasurer or admin must approve it.</p>
      )}
      {s === 'PENDING_APPROVAL' && !isApprover && (
        <p className="m-0 rounded-xl bg-ground px-3.5 py-3 text-[13px] text-muted">Waiting for a treasurer or admin to approve.</p>
      )}
      {s === 'DRAFT' && canCreate && <Button onClick={() => act('SUBMIT', 'Submitted for approval.')}>Submit for approval</Button>}
      {s === 'SUBMITTED' && isApprover && <Button onClick={() => act('PENDING_APPROVAL', 'Sent to the approval queue.')}>Send for approval</Button>}
      {canVoid && <Button variant="secondary" onClick={() => act('VOIDED', 'Voided. It stays in the audit trail.')}>Void record</Button>}
      {LOCKED.includes(s) && (
        <p className="m-0 rounded-xl bg-ground px-3.5 py-3 text-[13px] leading-[19px] text-muted">
          This record is {STATUS_LABEL[s].toLowerCase()} and locked. Corrections are made as a new adjusting entry, and both stay in the audit trail.
        </p>
      )}
      {msg && <p role="status" className={cx('m-0 text-[13px] font-semibold', msg.ok ? 'text-brand' : 'text-danger')}>{msg.text}</p>}

      <div>
        <h3 className="m-0 mb-2.5 text-sm font-bold">Audit trail</h3>
        <ol className="m-0 flex list-none flex-col gap-3 p-0">
          {record.audit.map((e, i) => (
            <li key={i} className="flex gap-2.5">
              <span aria-hidden="true" className={cx('mt-1.5 size-2.5 flex-none rounded-full', e.to === 'APPROVED' ? 'bg-brand' : e.to === 'REJECTED' ? 'bg-danger' : e.to === 'PENDING_APPROVAL' ? 'bg-gold' : e.to === 'SUBMITTED' ? 'bg-info' : 'bg-line-strong')} />
              <div>
                <p className="m-0 text-[13px] font-semibold">{e.action}{e.reason ? `: ${e.reason}` : ''}</p>
                <p className="m-0 mt-0.5 text-xs text-muted">{e.actorName} · {formatGregorian(new Date(e.at), lang, { day: 'numeric', month: 'short' })}, {formatTime(new Date(e.at), lang)}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </Card>
  );
}

function NewRecord({ kind, onDone }: { kind: FinKind; onDone: () => void }) {
  const { createRecord } = useApp();
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState(BUDGETS[0].category);
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [error, setError] = useState('');
  const categories = kind === 'expense' ? BUDGETS.map((b) => b.category) : ['Friday collection', 'Welfare fund', 'Programme fees', 'Other'];

  const save = (submit: boolean) => {
    const r = createRecord({ kind, description, category: categories.includes(category) ? category : categories[0], amount, date, submit });
    if (!r.ok) return setError(r.message);
    onDone();
  };

  return (
    <Card as="section" aria-labelledby="nr" className="p-[18px]">
      <h2 id="nr" className="m-0 mb-3 text-base font-bold">New {kind}</h2>
      <form onSubmit={(e) => { e.preventDefault(); save(true); }} className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(200px,1fr))]">
        <label className="flex flex-col gap-1 text-[13px] font-semibold">Description
          <input value={description} onChange={(e) => setDescription(e.target.value)} className="h-11 rounded-xl border border-line-strong px-3 font-normal" />
        </label>
        <label className="flex flex-col gap-1 text-[13px] font-semibold">Category
          <select value={categories.includes(category) ? category : categories[0]} onChange={(e) => setCategory(e.target.value)} className="h-11 rounded-xl border border-line-strong bg-surface px-3 font-normal">
            {categories.map((c) => <option key={c}>{c}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-[13px] font-semibold">Amount (MYR)
          <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" className="tabular h-11 rounded-xl border border-line-strong px-3 font-normal" />
        </label>
        <label className="flex flex-col gap-1 text-[13px] font-semibold">Date
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-11 rounded-xl border border-line-strong px-3 font-normal" />
        </label>
        <div className="flex flex-wrap items-center gap-2 [grid-column:1/-1]">
          <Button type="submit">Submit for approval</Button>
          <Button variant="secondary" onClick={() => save(false)}>Save draft</Button>
          {error && <p role="alert" className="m-0 text-[13px] font-semibold text-danger">{error}</p>}
        </div>
      </form>
      <p className="m-0 mt-3 text-xs text-muted">Receipts upload arrives with file storage (Phase 08). <Link to="/workspace">Back to overview</Link></p>
    </Card>
  );
}
