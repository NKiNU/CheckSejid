import { formatGregorian, formatHijri, formatTime, localParts, relativeTime } from './calendar';
import { formatClock, formatDuration, nextPrayer, prayerState, type PrayerDay } from './prayer';
import { compassPoint, qiblaBearing } from './qibla';

const day: PrayerDay = {
  zone: 'WLY01', zoneName: 'Kuala Lumpur', source: 'JAKIM e-Solat', fetchedAt: '2026-11-16T16:00:00Z',
  times: { Subuh: '05:52', Syuruk: '07:03', Zohor: '13:04', Asar: '16:23', Maghrib: '19:05', Isyak: '20:17' },
};
// 3:11 PM in Kuala Lumpur (UTC+8)
const afternoon = new Date('2026-11-17T07:11:00Z');

describe('calendar', () => {
  it('reads wall-clock time in Malaysia', () => {
    expect(localParts(afternoon)).toEqual({ y: 2026, m: 11, d: 17, minutes: 15 * 60 + 11 });
  });
  it('labels Hijri and Gregorian dates', () => {
    expect(formatHijri(afternoon, 'en')).toMatch(/1448 H$/);
    expect(formatHijri(afternoon, 'en', false)).not.toMatch(/1448/);
    expect(formatGregorian(afternoon, 'en')).toMatch(/17 Nov 2026/);
    expect(formatTime(afternoon, 'en')).toMatch(/3:11/);
  });
  it('formats relative time', () => {
    const now = new Date('2026-11-17T10:00:00Z');
    expect(relativeTime(new Date('2026-11-17T09:30:00Z'), now, 'en')).toBe('30 minutes ago');
    expect(relativeTime(new Date('2026-11-17T08:00:00Z'), now, 'en')).toBe('2 hours ago');
    expect(relativeTime(new Date('2026-11-16T10:00:00Z'), now, 'en')).toBe('yesterday');
  });
});

describe('prayer times', () => {
  it('finds the next prayer and skips Syuruk', () => {
    expect(nextPrayer(day, afternoon)).toEqual({ name: 'Asar', time: '16:23', minutesAway: 72, tomorrow: false });
    expect(nextPrayer(day, new Date('2026-11-16T22:00:00Z')).name).toBe('Zohor'); // 6:00 AM
  });
  it('rolls over to Subuh after Isyak', () => {
    const late = new Date('2026-11-17T14:00:00Z'); // 10 PM
    expect(nextPrayer(day, late)).toMatchObject({ name: 'Subuh', tomorrow: true, minutesAway: 120 + 352 });
    expect(prayerState(day, 'Subuh', late)).toBe('past');
  });
  it('marks past, next and later', () => {
    expect(prayerState(day, 'Zohor', afternoon)).toBe('past');
    expect(prayerState(day, 'Asar', afternoon)).toBe('next');
    expect(prayerState(day, 'Isyak', afternoon)).toBe('later');
  });
  it('formats clock times and durations', () => {
    expect(formatClock('13:04')).toBe('1:04 PM');
    expect(formatClock('00:05')).toBe('12:05 AM');
    expect(formatDuration(72)).toBe('1 h 12 min');
    expect(formatDuration(9)).toBe('9 min');
  });
});

describe('qibla', () => {
  it('points about 292° (WNW) from Kuala Lumpur', () => {
    const b = qiblaBearing(3.139, 101.6869);
    expect(b).toBeGreaterThan(291);
    expect(b).toBeLessThan(294);
    expect(compassPoint(b)).toBe('WNW');
    expect(compassPoint(359)).toBe('N');
  });
});
