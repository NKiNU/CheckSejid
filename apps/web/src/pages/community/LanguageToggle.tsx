import { cx } from '../../components/ui';
import type { Lang } from '../../domain/calendar';
import { useApp } from '../../store';

export function LanguageToggle({ dark = false }: { dark?: boolean }) {
  const { lang, setLang, t } = useApp();
  return (
    <div role="group" aria-label={t('language')} className={cx('flex rounded-[10px] p-[3px]', dark ? 'bg-ink-3' : 'bg-ground-2')}>
      {(['ms', 'en'] as Lang[]).map((l) => (
        <button
          key={l}
          type="button"
          aria-pressed={lang === l}
          onClick={() => setLang(l)}
          className={cx(
            'h-[38px] min-w-11 cursor-pointer rounded-lg border-0 px-2.5 text-xs font-bold',
            lang === l ? (dark ? 'bg-ink-2 text-surface' : 'bg-surface text-ink') : cx('bg-transparent', dark ? 'text-on-ink-muted' : 'text-muted'),
          )}
        >
          {l === 'ms' ? 'BM' : 'EN'}
        </button>
      ))}
    </div>
  );
}
