import type { ReactNode } from 'react';
import type { FinStatus } from '../domain/finance';
import { STATUS_LABEL } from '../domain/finance';
import type { Organisation, PostStatus } from '../domain/types';

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');

const TONE: Record<Organisation['tone'], string> = {
  brand: 'bg-brand-soft text-brand',
  gold: 'bg-gold-soft text-gold-ink',
  info: 'bg-info-soft text-info',
  plum: 'bg-plum-soft text-plum',
};

export function OrgAvatar({ org, size = 'md' }: { org: Pick<Organisation, 'initials' | 'tone'>; size?: 'sm' | 'md' | 'lg' }) {
  const s = { sm: 'size-8 rounded-[10px] text-xs', md: 'size-11 rounded-[14px] text-sm', lg: 'size-20 rounded-3xl text-2xl border-4 border-ground' }[size];
  return (
    <span aria-hidden="true" className={cx('flex flex-none items-center justify-center font-bold', TONE[org.tone], size === 'lg' && 'bg-surface text-brand', s)}>
      {org.initials}
    </span>
  );
}

export function Pill({ pressed, onClick, children }: { pressed: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={cx(
        'h-9 flex-none cursor-pointer rounded-full border px-3.5 text-sm font-semibold transition-colors',
        pressed ? 'border-brand bg-brand text-surface' : 'border-line bg-surface text-ink hover:border-line-strong',
      )}
    >
      {children}
    </button>
  );
}

const FIN_TONE: Record<FinStatus, string> = {
  DRAFT: 'bg-neutral-soft text-muted',
  SUBMITTED: 'bg-info-soft text-info',
  PENDING_APPROVAL: 'bg-gold-soft text-gold-ink',
  APPROVED: 'bg-brand-soft text-brand',
  REJECTED: 'bg-danger-soft text-danger',
  VOIDED: 'bg-neutral-soft text-muted line-through',
};

export function FinBadge({ status }: { status: FinStatus }) {
  return <span className={cx('whitespace-nowrap rounded-full px-2 py-1 text-xs font-bold', FIN_TONE[status])}>{STATUS_LABEL[status]}</span>;
}

const POST_TONE: Record<PostStatus, [string, string]> = {
  DRAFT: ['bg-neutral-soft text-muted', 'Draft'],
  PUBLISHED: ['bg-brand-soft text-brand', 'Published'],
  ARCHIVED: ['bg-neutral-soft text-muted', 'Archived'],
};

export function PostBadge({ status }: { status: PostStatus }) {
  const [tone, label] = POST_TONE[status];
  return <span className={cx('whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-bold', tone)}>{label}</span>;
}

export function Card({ children, className, as: As = 'div', ...rest }: { children: ReactNode; className?: string; as?: 'div' | 'section' | 'article' | 'aside' } & Record<string, unknown>) {
  return (
    <As className={cx('rounded-[var(--radius-card)] border border-line bg-surface', className)} {...rest}>
      {children}
    </As>
  );
}

export function Button({ variant = 'primary', className, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'danger' }) {
  const v = {
    primary: 'bg-brand text-surface hover:bg-brand-strong border-transparent',
    secondary: 'bg-surface text-ink border-line-strong hover:bg-subtle',
    danger: 'bg-surface text-danger border-danger-line hover:bg-danger-soft',
  }[variant];
  return (
    <button
      type="button"
      {...props}
      className={cx('h-11 cursor-pointer rounded-xl border px-4 text-sm font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-50', v, className)}
    />
  );
}
