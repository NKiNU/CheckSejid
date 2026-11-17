import { useState } from 'react';
import { PageHeader } from '../../components/CommunityLayout';
import { Icon } from '../../components/Icon';
import { cx } from '../../components/ui';
import { formatGregorian, formatHijri } from '../../domain/calendar';
import { PRAYERS, formatClock, formatDuration, nextPrayer, prayerState } from '../../domain/prayer';
import { compassPoint, qiblaBearing } from '../../domain/qibla';
import { AREA, PRAYER_DAY } from '../../data/seed';
import { useApp } from '../../store';
import { LanguageToggle } from './LanguageToggle';

export function Prayer() {
  const { t, lang } = useApp();
  const now = new Date();
  const next = nextPrayer(PRAYER_DAY, now);
  const [where, setWhere] = useState<{ lat: number; lng: number; precise: boolean }>({ lat: AREA.lat, lng: AREA.lng, precise: false });
  const [locError, setLocError] = useState(false);
  const bearing = qiblaBearing(where.lat, where.lng);

  const usePrecise = () => {
    if (!navigator.geolocation) return setLocError(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => { setWhere({ lat: pos.coords.latitude, lng: pos.coords.longitude, precise: true }); setLocError(false); },
      () => setLocError(true),
      { timeout: 10_000 },
    );
  };

  return (
    <>
      <PageHeader title={t('prayer')} right={<LanguageToggle />} />
      <p className="-mt-2 flex items-center gap-1 px-5 text-[13px] font-semibold text-brand">
        <Icon name="pin" size={14} strokeWidth={2} /> {PRAYER_DAY.zoneName} · {PRAYER_DAY.zone}
      </p>

      <section aria-label="Today" className="mx-5 mt-2 grid grid-cols-2 gap-2">
        <div className="rounded-2xl border border-line bg-surface px-3.5 py-3">
          <p className="m-0 text-[11px] font-bold tracking-wider text-muted uppercase">{t('gregorian')}</p>
          <p className="m-0 mt-1 font-bold">{formatGregorian(now, lang)}</p>
        </div>
        <div className="rounded-2xl bg-gold-soft px-3.5 py-3 text-gold-ink">
          <p className="m-0 text-[11px] font-bold tracking-wider uppercase">{t('hijri')}</p>
          <p className="m-0 mt-1 font-bold">{formatHijri(now, lang)}</p>
        </div>
      </section>
      <p className="mx-5 mt-1.5 text-[11px] leading-4 text-muted">{t('hijriNote')}</p>

      <section aria-label="Prayer times today" className="mx-5 mt-3 overflow-hidden rounded-[20px] border border-line bg-surface">
        {PRAYERS.map((name) => {
          const state = prayerState(PRAYER_DAY, name, now);
          const isNext = state === 'next';
          return (
            <div key={name} aria-current={isNext ? 'time' : undefined} className={cx('flex h-[50px] items-center gap-3 border-t border-neutral-soft px-4 first:border-t-0', isNext && 'border-transparent bg-brand text-surface', state === 'past' && 'text-muted')}>
              <span className={cx('flex-1', isNext ? 'font-bold' : 'font-medium')}>{name}</span>
              {isNext && <span className="text-xs font-semibold opacity-90">{t('in')} {formatDuration(next.minutesAway)}</span>}
              <span className="tabular w-[76px] text-right font-bold">{formatClock(PRAYER_DAY.times[name])}</span>
            </div>
          );
        })}
      </section>
      <p className="mx-5 mt-1.5 text-[11px] text-muted">{t('source')}: {PRAYER_DAY.source}</p>

      <section aria-label={t('qibla')} className="mx-5 mt-3.5 flex items-center gap-3.5 rounded-[20px] border border-line bg-surface p-3.5">
        <svg width="104" height="104" viewBox="0 0 104 104" role="img" aria-label={`Qibla is ${Math.round(bearing)} degrees from north`} className="flex-none">
          <circle cx="52" cy="52" r="48" className="fill-ground stroke-line" strokeWidth="2" />
          <g className="stroke-line-strong" strokeWidth="2" strokeLinecap="round"><path d="M52 8v8M52 88v8M8 52h8M88 52h8" /></g>
          <text x="52" y="28" textAnchor="middle" fontSize="10" fontWeight="700" className="fill-muted">N</text>
          <g transform={`rotate(${bearing} 52 52)`}>
            <path d="M52 14 58 52 52 58 46 52z" className="fill-brand" />
            <path d="M52 90 58 52 52 46 46 52z" className="fill-line-strong" />
            <rect x="47" y="8" width="10" height="10" rx="2" className="fill-gold" />
          </g>
          <circle cx="52" cy="52" r="4" className="fill-surface stroke-brand" strokeWidth="2" />
        </svg>
        <div className="min-w-0 flex-1">
          <p className="m-0 text-[11px] font-bold tracking-wider text-muted uppercase">{t('qibla')}</p>
          <p className="m-0 mt-0.5 text-[26px] leading-[30px] font-bold">
            {Math.round(bearing)}° <span className="text-sm font-semibold text-muted">{compassPoint(bearing)}</span>
          </p>
          {!where.precise && <p className="m-0 mt-1.5 text-xs leading-4 text-gold-ink">{locError ? t('preciseUnavailable') : t('qiblaNote')}</p>}
          {!where.precise && (
            <button type="button" onClick={usePrecise} className="mt-2 h-11 cursor-pointer rounded-[10px] border border-line-strong bg-surface px-3 text-[13px] font-semibold text-ink">
              {t('usePrecise')}
            </button>
          )}
        </div>
      </section>
    </>
  );
}
