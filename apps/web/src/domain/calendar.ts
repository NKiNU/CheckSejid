export const TIMEZONE = 'Asia/Kuala_Lumpur';
export type Lang = 'en' | 'ms';

const locale = (lang: Lang) => (lang === 'ms' ? 'ms-MY' : 'en-MY');

export function formatGregorian(date: Date, lang: Lang, opts: Intl.DateTimeFormatOptions = { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }): string {
  return new Intl.DateTimeFormat(locale(lang), { timeZone: TIMEZONE, ...opts }).format(date);
}

/** HIJRI_CALENDAR.md: calculated (Umm al-Qura); always labelled, never presented as authoritative. */
export function formatHijri(date: Date, lang: Lang, withYear = true): string {
  const fmt = new Intl.DateTimeFormat(`${locale(lang)}-u-ca-islamic-umalqura`, {
    timeZone: TIMEZONE,
    day: 'numeric',
    month: 'long',
    ...(withYear ? { year: 'numeric' } : {}),
  });
  return fmt.format(date).replace(/\s?(AH|H|SH)$/i, '').trim() + (withYear ? ' H' : '');
}

export function formatTime(date: Date, lang: Lang): string {
  return new Intl.DateTimeFormat(locale(lang), { timeZone: TIMEZONE, hour: 'numeric', minute: '2-digit' }).format(date);
}

export function relativeTime(from: Date, now: Date, lang: Lang): string {
  const rtf = new Intl.RelativeTimeFormat(locale(lang), { numeric: 'auto' });
  const mins = Math.round((from.getTime() - now.getTime()) / 60000);
  if (Math.abs(mins) < 60) return rtf.format(mins, 'minute');
  const hours = Math.round(mins / 60);
  if (Math.abs(hours) < 24) return rtf.format(hours, 'hour');
  return rtf.format(Math.round(hours / 24), 'day');
}

/** Wall-clock parts of `date` in Malaysia time. */
export function localParts(date: Date): { y: number; m: number; d: number; minutes: number } {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', { timeZone: TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
      .formatToParts(date)
      .map((p) => [p.type, p.value]),
  );
  return { y: +parts.year, m: +parts.month, d: +parts.day, minutes: +parts.hour * 60 + +parts.minute };
}
