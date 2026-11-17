import { Link } from 'react-router-dom';
import { Card, FinBadge, PostBadge, cx } from '../../components/ui';
import { formatGregorian, formatHijri, formatTime } from '../../domain/calendar';
import { formatMYR, sumSen } from '../../domain/money';
import { BUDGETS, ROSTER, TASKS, WORKSPACE_ORG_ID } from '../../data/seed';
import { useApp } from '../../store';
import { QuickPost } from './BulletinManager';

export function Overview() {
  const { posts, records, lang } = useApp();
  const now = new Date();
  const month = now.toISOString().slice(0, 7);
  const mine = posts.filter((p) => p.orgId === WORKSPACE_ORG_ID && p.status !== 'ARCHIVED');
  const recent = [...mine].sort((a, b) => Number(b.pinned) - Number(a.pinned) || (b.publishedAt ?? b.createdAt).localeCompare(a.publishedAt ?? a.createdAt)).slice(0, 3);
  const approved = records.filter((r) => r.status === 'APPROVED' && r.date.startsWith(month));
  const pending = records.filter((r) => r.status === 'PENDING_APPROVAL');
  const upcoming = mine.filter((p) => p.status === 'PUBLISHED' && p.startsAt && p.startsAt > now.toISOString()).sort((a, b) => a.startsAt!.localeCompare(b.startsAt!));
  const expenses = records.filter((r) => r.kind === 'expense' && r.status === 'APPROVED' && r.date.startsWith(month));

  const kpis = [
    { label: 'Income recorded this month', value: formatMYR(sumSen(approved.filter((r) => r.kind !== 'expense').map((r) => r.amount))), note: 'Approved only' },
    { label: 'Expenses recorded this month', value: formatMYR(sumSen(expenses.map((r) => r.amount))), note: 'Approved only' },
    { label: 'Awaiting approval', value: `${pending.length} records`, note: `${formatMYR(sumSen(pending.map((r) => r.amount)))} in total`, tone: 'text-gold-ink' },
    { label: 'Upcoming events', value: String(upcoming.length), note: upcoming[0] ? `Next: ${upcoming[0].title}` : 'None scheduled', tone: 'text-brand' },
  ];

  return (
    <>
      <h1 className="m-0 text-[28px] leading-[34px] font-bold tracking-tight">Overview</h1>

      <Card as="section" aria-labelledby="bl" className="flex flex-col gap-3.5 rounded-[20px] p-[18px]">
        <div className="flex flex-wrap items-center justify-between gap-2.5">
          <div>
            <h2 id="bl" className="m-0 text-lg font-bold">Bulletin</h2>
            <p className="m-0 mt-0.5 text-[13px] text-muted">What your followers see first on their home screen</p>
          </div>
          <Link to="/workspace/bulletin" className="text-[13px] font-bold">All posts</Link>
        </div>
        <QuickPost />
        <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(240px,1fr))]">
          {recent.map((p) => (
            <article key={p.id} className={cx('flex flex-col gap-1.5 rounded-2xl border border-line p-3.5', p.status === 'DRAFT' ? 'bg-subtle' : 'bg-surface')}>
              <div className="flex items-center justify-between gap-2">
                <span className={cx('text-xs font-bold', p.kind === 'announcement' ? 'text-brand' : 'text-gold-ink')}>
                  {p.kind[0].toUpperCase() + p.kind.slice(1)}{p.pinned ? ' · Pinned' : ''}
                </span>
                <PostBadge status={p.status} />
              </div>
              <h3 className="m-0 text-[15px] leading-[21px] font-bold">{p.title}</h3>
              <p className="m-0 text-xs text-muted">
                {p.startsAt ? `${formatGregorian(new Date(p.startsAt), lang, { weekday: 'short', day: 'numeric', month: 'short' })}, ${formatTime(new Date(p.startsAt), lang)} · ${formatHijri(new Date(p.startsAt), lang, false)}` : p.status === 'DRAFT' ? 'Only your team can see drafts' : 'Visible to the public'}
              </p>
            </article>
          ))}
        </div>
      </Card>

      <section aria-label="This month" className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(200px,1fr))]">
        {kpis.map((k) => (
          <Card key={k.label} className="flex flex-col gap-1.5 p-4">
            <p className="m-0 text-[13px] text-muted">{k.label}</p>
            <p className="tabular m-0 text-2xl leading-[30px] font-bold tracking-tight">{k.value}</p>
            <p className={cx('m-0 truncate text-xs font-semibold', k.tone ?? 'text-muted')}>{k.note}</p>
          </Card>
        ))}
      </section>

      <div className="flex flex-wrap items-start gap-4">
        <Card as="section" aria-labelledby="ap" className="min-w-0 flex-[3_1_480px] overflow-hidden">
          <div className="flex items-center justify-between px-[18px] py-4">
            <h2 id="ap" className="m-0 text-base font-bold">Awaiting approval</h2>
            <Link to="/workspace/finance" className="text-[13px] font-bold">Open finance</Link>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] border-collapse text-sm">
              <thead>
                <tr className="bg-subtle text-left text-xs text-muted">
                  <th scope="col" className="px-[18px] py-2.5 font-semibold">Record</th>
                  <th scope="col" className="px-2 py-2.5 font-semibold">Created by</th>
                  <th scope="col" className="px-2 py-2.5 font-semibold">Status</th>
                  <th scope="col" className="px-[18px] py-2.5 text-right font-semibold">Amount</th>
                </tr>
              </thead>
              <tbody>
                {pending.map((r) => (
                  <tr key={r.id} className="border-t border-neutral-soft">
                    <td className="px-[18px] py-3"><Link to={`/workspace/finance?record=${r.id}`} className="block font-semibold text-ink">{r.description}</Link><span className="text-xs text-muted">{r.id} · {r.category}</span></td>
                    <td className="px-2 py-3 text-muted">{r.createdByName}</td>
                    <td className="px-2 py-3"><FinBadge status={r.status} /></td>
                    <td className="tabular px-[18px] py-3 text-right font-bold">{formatMYR(r.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {pending.length === 0 && <p className="px-[18px] pb-5 text-sm text-muted">Nothing is waiting for approval.</p>}
          </div>
        </Card>

        <Card as="section" aria-labelledby="bud" className="flex min-w-0 flex-[2_1_320px] flex-col gap-3.5 p-[18px]">
          <div className="flex items-baseline justify-between">
            <h2 id="bud" className="m-0 text-base font-bold">Budget vs actual</h2>
            <p className="m-0 text-xs text-muted">{formatGregorian(now, lang, { month: 'short', year: 'numeric' })}</p>
          </div>
          {BUDGETS.map((b) => {
            const actual = sumSen(expenses.filter((r) => r.category === b.category).map((r) => r.amount));
            const pct = Math.round((actual / b.planned) * 100);
            return (
              <div key={b.category} className="flex flex-col gap-1.5">
                <div className="flex justify-between text-[13px]">
                  <span className="font-semibold">{b.category}</span>
                  <span className="tabular text-muted">{formatMYR(actual)} / {formatMYR(b.planned)}</span>
                </div>
                <div aria-hidden="true" className="h-2 overflow-hidden rounded bg-neutral-soft"><div className={cx('h-2 rounded', pct >= 90 ? 'bg-gold' : 'bg-brand')} style={{ width: `${Math.min(100, pct)}%` }} /></div>
                <p className={cx('m-0 text-xs font-semibold', pct >= 90 ? 'text-gold-ink' : 'text-muted')}>{pct}% used</p>
              </div>
            );
          })}
          <p className="m-0 text-xs text-muted">Actual counts approved expenses only. Source records are never changed by budgets.</p>
        </Card>
      </div>

      <div className="flex flex-wrap items-start gap-4">
        <Card as="section" aria-labelledby="tk" className="flex min-w-0 flex-[1_1_320px] flex-col p-[18px]">
          <h2 id="tk" className="m-0 mb-2 text-base font-bold">Tasks due this week</h2>
          {TASKS.map((t) => (
            <label key={t.title} className="flex min-h-11 items-center gap-3 border-t border-neutral-soft py-1.5 text-sm">
              <input type="checkbox" className="size-[18px] accent-brand" />
              <span className="flex-1">{t.title}<span className="block text-xs text-muted">{t.who}</span></span>
              <span className={cx('text-xs font-bold', t.overdue ? 'text-danger' : 'text-muted')}>{t.due}</span>
            </label>
          ))}
        </Card>
        <Card as="section" aria-labelledby="ro" className="flex min-w-0 flex-[1_1_320px] flex-col gap-2.5 p-[18px]">
          <h2 id="ro" className="m-0 text-base font-bold">Roster · this Friday</h2>
          {ROSTER.map((r) => (
            <div key={r.name} className="flex items-center gap-3">
              <span aria-hidden="true" className="flex size-9 items-center justify-center rounded-full bg-ground text-xs font-bold">{r.initials}</span>
              <span className="flex-1 text-sm font-semibold">{r.name}</span>
              <span className="text-[13px] text-muted">{r.duty}</span>
              <span className="tabular w-32 text-right text-[13px] text-muted">{r.time}</span>
            </div>
          ))}
          <p className="m-0 mt-1 rounded-xl bg-gold-soft px-3 py-2.5 text-[13px] text-gold-ink">1 slot unfilled: Parking, 12:15 – 2:00 PM</p>
        </Card>
      </div>
    </>
  );
}
