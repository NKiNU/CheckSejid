import { localParts } from './calendar';

export const PRAYERS = ['Subuh', 'Syuruk', 'Zohor', 'Asar', 'Maghrib', 'Isyak'] as const;
export type PrayerName = (typeof PRAYERS)[number];

export interface PrayerDay {
  zone: string;
  zoneName: string;
  /** Provider and when the data was fetched (PRAYER_TIMES.md: provenance). */
  source: string;
  fetchedAt: string;
  /** Local times "HH:mm", Asia/Kuala_Lumpur. */
  times: Record<PrayerName, string>;
}

const toMinutes = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};

export interface NextPrayer {
  name: PrayerName;
  time: string;
  minutesAway: number;
  tomorrow: boolean;
}

/** Next obligatory prayer (Syuruk is shown but is not a prayer time to wait for). */
export function nextPrayer(day: PrayerDay, now: Date): NextPrayer {
  const { minutes } = localParts(now);
  const order = PRAYERS.filter((p) => p !== 'Syuruk');
  for (const name of order) {
    const at = toMinutes(day.times[name]);
    if (at > minutes) return { name, time: day.times[name], minutesAway: at - minutes, tomorrow: false };
  }
  const first = order[0];
  return { name: first, time: day.times[first], minutesAway: 24 * 60 - minutes + toMinutes(day.times[first]), tomorrow: true };
}

export function prayerState(day: PrayerDay, name: PrayerName, now: Date): 'past' | 'next' | 'later' {
  const next = nextPrayer(day, now);
  if (!next.tomorrow && next.name === name) return 'next';
  return toMinutes(day.times[name]) <= localParts(now).minutes ? 'past' : 'later';
}

export function formatClock(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  const suffix = h >= 12 ? 'PM' : 'AM';
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${suffix}`;
}

export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h ? `${h} h ${m} min` : `${m} min`;
}
