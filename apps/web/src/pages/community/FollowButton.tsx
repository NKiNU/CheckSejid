import { cx } from '../../components/ui';
import { useApp } from '../../store';

export function FollowButton({ orgId, compact = false }: { orgId: string; compact?: boolean }) {
  const { t, followed, toggleFollow } = useApp();
  const on = followed.has(orgId);
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={() => toggleFollow(orgId)}
      className={cx(
        'cursor-pointer border font-semibold transition-colors',
        compact ? 'h-9 min-w-[88px] flex-none rounded-full px-3 text-[13px]' : 'h-11 flex-1 rounded-[14px] text-[15px] font-bold',
        on ? 'border-brand-soft bg-brand-soft text-brand' : compact ? 'border-line-strong bg-surface text-ink' : 'border-brand bg-brand text-surface',
      )}
    >
      {on ? t('following') : t('follow')}
    </button>
  );
}
