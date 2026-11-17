import { useState } from 'react';
import { Button, Card, PostBadge, cx } from '../../components/ui';
import { canManage } from '../../domain/bulletin';
import { formatGregorian, formatHijri, formatTime, relativeTime } from '../../domain/calendar';
import type { PostKind, PostStatus } from '../../domain/types';
import { WORKSPACE_ORG_ID } from '../../data/seed';
import { useApp, type Outcome } from '../../store';

const KINDS: { kind: PostKind; label: string }[] = [
  { kind: 'announcement', label: 'Announcement' },
  { kind: 'event', label: 'Event' },
  { kind: 'class', label: 'Class' },
];

function useFlash() {
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const show = (o: Outcome, okText: string) => setMsg(o.ok ? { text: okText, ok: true } : { text: o.message, ok: false });
  const node = (
    <p role="status" aria-live="polite" className={cx('m-0 text-[13px] font-semibold empty:hidden', msg?.ok ? 'text-brand' : 'text-danger')}>
      {msg?.text}
    </p>
  );
  return { show, node };
}

/** Malaysia wall-clock "YYYY-MM-DDTHH:mm" from a datetime-local input → ISO. */
const fromLocalInput = (v: string) => (v ? new Date(`${v}:00+08:00`).toISOString() : undefined);

export function Composer({ compact = false }: { compact?: boolean }) {
  const { createPost, role } = useApp();
  const [kind, setKind] = useState<PostKind>('announcement');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [startsAt, setStartsAt] = useState('');
  const flash = useFlash();
  const allowed = canManage(role, { kind });
  const needsDate = kind !== 'announcement';

  const submit = (publish: boolean) => {
    if (title.trim().length < 3) return flash.show({ ok: false, message: 'Add a title (at least 3 characters).' }, '');
    if (needsDate && !startsAt) return flash.show({ ok: false, message: 'Events and classes need a date and time.' }, '');
    const r = createPost({ kind, title, body, startsAt: needsDate ? fromLocalInput(startsAt) : undefined, publish });
    flash.show(r, publish ? 'Published. Followers see it on their bulletin now.' : 'Saved as draft. Only your team can see it.');
    if (r.ok) { setTitle(''); setBody(''); setStartsAt(''); }
  };

  return (
    <form onSubmit={(e) => { e.preventDefault(); submit(true); }} className={cx('flex flex-col gap-2.5 rounded-[14px]', compact ? 'bg-ground p-2.5' : '')}>
      <div role="group" aria-label="Post type" className="flex flex-wrap gap-1.5">
        {KINDS.map((k) => (
          <button key={k.kind} type="button" aria-pressed={kind === k.kind} onClick={() => setKind(k.kind)} className={cx('h-9 cursor-pointer rounded-full border px-3 text-[13px] font-semibold', kind === k.kind ? 'border-ink bg-ink text-surface' : 'border-line bg-surface text-ink')}>
            {k.label}
          </button>
        ))}
      </div>
      <label className="flex flex-col gap-1 text-[13px] font-semibold">
        <span className={compact ? 'sr-only' : ''}>Title</span>
        <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} placeholder="Write an announcement, event or class..." className="h-11 rounded-xl border border-line bg-surface px-3.5 font-normal text-ink" />
      </label>
      {(!compact || title) && (
        <label className="flex flex-col gap-1 text-[13px] font-semibold">
          <span className={compact ? 'sr-only' : ''}>Details</span>
          <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={compact ? 2 : 4} maxLength={2000} placeholder="Details people need: time, place, what to bring" className="resize-y rounded-xl border border-line bg-surface px-3.5 py-2.5 font-normal text-ink" />
        </label>
      )}
      {needsDate && (
        <label className="flex flex-col gap-1 text-[13px] font-semibold">
          Date and time (Malaysia)
          <input type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} className="h-11 rounded-xl border border-line bg-surface px-3.5 font-normal text-ink" />
          {startsAt && <span className="text-xs font-normal text-gold-ink">Hijri (calculated): {formatHijri(new Date(fromLocalInput(startsAt)!), 'en')}</span>}
        </label>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" disabled={!allowed}>Publish</Button>
        <Button variant="secondary" onClick={() => submit(false)} disabled={!allowed}>Save draft</Button>
        {!allowed && <span className="text-[13px] text-muted">Your role can&rsquo;t post {kind === 'announcement' ? 'announcements' : 'events or classes'}.</span>}
      </div>
      {flash.node}
    </form>
  );
}

export const QuickPost = () => <Composer compact />;

const TABS: { status: PostStatus; label: string }[] = [
  { status: 'PUBLISHED', label: 'Published' },
  { status: 'DRAFT', label: 'Drafts' },
  { status: 'ARCHIVED', label: 'Archived' },
];

export function BulletinManager() {
  const { posts, setPostStatus, togglePin, role, lang } = useApp();
  const [tab, setTab] = useState<PostStatus>('PUBLISHED');
  const flash = useFlash();
  const mine = posts.filter((p) => p.orgId === WORKSPACE_ORG_ID);
  const list = mine
    .filter((p) => p.status === tab)
    .sort((a, b) => Number(b.pinned) - Number(a.pinned) || (b.publishedAt ?? b.createdAt).localeCompare(a.publishedAt ?? a.createdAt));

  return (
    <>
      <div>
        <h1 className="m-0 text-[28px] leading-[34px] font-bold tracking-tight">Bulletin & events</h1>
        <p className="m-0 mt-1 text-sm text-muted">Published posts appear first on your followers&rsquo; home screen. Pin one to feature it.</p>
      </div>
      <div className="flex flex-wrap items-start gap-4">
        <Card as="section" aria-labelledby="new" className="min-w-0 flex-[2_1_340px] p-[18px]">
          <h2 id="new" className="m-0 mb-3 text-base font-bold">New post</h2>
          <Composer />
        </Card>
        <section aria-label="Posts" className="flex min-w-0 flex-[3_1_480px] flex-col gap-3">
          <div role="tablist" aria-label="Post status" className="flex gap-1 border-b border-line">
            {TABS.map((t) => (
              <button key={t.status} role="tab" type="button" aria-selected={tab === t.status} onClick={() => setTab(t.status)} className={cx('h-11 cursor-pointer border-0 bg-transparent px-3.5 text-sm', tab === t.status ? 'font-bold text-ink shadow-[inset_0_-2px_0_var(--color-brand)]' : 'font-semibold text-muted')}>
                {t.label} <span className="text-muted">{mine.filter((p) => p.status === t.status).length}</span>
              </button>
            ))}
          </div>
          {flash.node}
          {list.map((p) => {
            const allowed = canManage(role, p);
            return (
              <Card as="article" key={p.id} className="flex flex-col gap-2 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={cx('text-xs font-bold', p.kind === 'announcement' ? 'text-brand' : 'text-gold-ink')}>{p.kind[0].toUpperCase() + p.kind.slice(1)}</span>
                  {p.pinned && <span className="rounded-full bg-gold px-2 py-0.5 text-[11px] font-bold text-ink">Pinned</span>}
                  <span className="ml-auto"><PostBadge status={p.status} /></span>
                </div>
                <h3 className="m-0 text-base font-bold">{p.title}</h3>
                {p.body && <p className="m-0 text-sm text-muted">{p.body}</p>}
                <p className="m-0 text-xs text-muted">
                  {p.startsAt && `${formatGregorian(new Date(p.startsAt), lang, { weekday: 'short', day: 'numeric', month: 'short' })}, ${formatTime(new Date(p.startsAt), lang)} · ${formatHijri(new Date(p.startsAt), lang)} · `}
                  {p.publishedAt ? `Published ${relativeTime(new Date(p.publishedAt), new Date(), lang)}` : `Created ${relativeTime(new Date(p.createdAt), new Date(), lang)}`}
                </p>
                {allowed && p.status !== 'ARCHIVED' && (
                  <div className="flex flex-wrap gap-2 pt-1">
                    {p.status === 'DRAFT' && <Button onClick={() => flash.show(setPostStatus(p.id, 'PUBLISHED'), `Published “${p.title}”.`)}>Publish</Button>}
                    {p.status === 'PUBLISHED' && (
                      <Button variant="secondary" onClick={() => flash.show(togglePin(p.id), p.pinned ? 'Unpinned.' : 'Pinned. It now leads your followers’ bulletin.')}>
                        {p.pinned ? 'Unpin' : 'Pin to top'}
                      </Button>
                    )}
                    {p.status === 'PUBLISHED' && <Button variant="secondary" onClick={() => flash.show(setPostStatus(p.id, 'ARCHIVED'), 'Archived. It is no longer public.')}>Archive</Button>}
                  </div>
                )}
              </Card>
            );
          })}
          {list.length === 0 && <p className="rounded-[var(--radius-card)] border border-dashed border-line-strong p-6 text-center text-sm text-muted">No {tab.toLowerCase()} posts.</p>}
        </section>
      </div>
    </>
  );
}
