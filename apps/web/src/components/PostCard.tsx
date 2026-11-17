import { Link } from 'react-router-dom';
import { formatGregorian, formatHijri, formatTime, relativeTime } from '../domain/calendar';
import type { Organisation, Post } from '../domain/types';
import { useApp } from '../store';
import { Star } from './Icon';
import { OrgAvatar, cx } from './ui';

export function EventDate({ post }: { post: Post }) {
  const { lang } = useApp();
  if (!post.startsAt) return null;
  const d = new Date(post.startsAt);
  return (
    <p className="m-0 text-xs text-gold-ink">
      {formatGregorian(d, lang, { weekday: 'short', day: 'numeric', month: 'short' })}, {formatTime(d, lang)} · <span title="Hijri (calculated)">{formatHijri(d, lang)}</span>
    </p>
  );
}

function DateBlock({ iso }: { iso: string }) {
  const { lang } = useApp();
  const d = new Date(iso);
  return (
    <div className="w-[52px] flex-none self-start rounded-[14px] bg-gold-soft py-2 text-center text-gold-ink">
      <p className="m-0 text-[11px] font-bold uppercase">{formatGregorian(d, lang, { month: 'short' })}</p>
      <p className="m-0 text-xl leading-6 font-bold">{formatGregorian(d, lang, { day: 'numeric' })}</p>
    </div>
  );
}

export function PostCard({ post, org, showOrg = true }: { post: Post; org: Organisation; showOrg?: boolean }) {
  const { t, lang } = useApp();
  const isEvent = post.kind !== 'announcement';
  return (
    <article className="flex gap-3 rounded-[var(--radius-card)] border border-line bg-surface p-3">
      {isEvent && post.startsAt ? <DateBlock iso={post.startsAt} /> : showOrg && <OrgAvatar org={org} />}
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="m-0 text-xs text-muted">
          <span className={cx('font-bold', isEvent ? 'text-gold-ink' : 'text-brand')}>{t(post.kind)}</span>
          {showOrg && (
            <>
              {' · '}
              <Link to={`/o/${org.slug}`} className="text-muted underline-offset-2 hover:underline">{org.name}</Link>
            </>
          )}
          {post.publishedAt && ` · ${relativeTime(new Date(post.publishedAt), new Date(), lang)}`}
        </p>
        <h3 className="m-0 text-[15px] leading-[21px] font-bold">{post.title}</h3>
        <p className="m-0 line-clamp-3 text-[13px] leading-[19px] text-muted">{post.body}</p>
        {isEvent && <EventDate post={post} />}
      </div>
    </article>
  );
}

export function FeaturedPost({ post, org }: { post: Post; org: Organisation }) {
  const { t, lang } = useApp();
  return (
    <article className="relative flex flex-col gap-2 overflow-hidden rounded-[22px] bg-brand p-[18px] text-surface">
      <Star size={170} strokeWidth={2} className="pointer-events-none absolute -right-10 -bottom-12 text-surface opacity-15" />
      <div className="flex items-center gap-2">
        <span className="rounded-full bg-gold px-2 py-1 text-[11px] font-bold text-ink">{t('pinned')}</span>
        <span className="text-xs opacity-85">
          <Link to={`/o/${org.slug}`} className="text-surface hover:underline">{org.name}</Link>
          {post.publishedAt && ` · ${relativeTime(new Date(post.publishedAt), new Date(), lang)}`}
        </span>
      </div>
      <h2 className="m-0 text-[22px] leading-7 font-bold tracking-tight">{post.title}</h2>
      <p className="m-0 text-sm leading-5 opacity-90">{post.body}</p>
      {post.startsAt && (
        <p className="m-0 mt-0.5 text-[13px] font-bold">
          {formatGregorian(new Date(post.startsAt), lang, { weekday: 'short', day: 'numeric', month: 'short' })} · {formatHijri(new Date(post.startsAt), lang)}
        </p>
      )}
    </article>
  );
}
