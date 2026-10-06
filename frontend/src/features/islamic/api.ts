import { call } from '../identity/api.ts'

// ADR-023: times for the visitor's zone or location. The location is sent per request, never stored.
export type PrayerTimes = {
  gregorian: { date: string; label: string }
  hijri: { date: string; label: string }
  timezone: string
  source: { kind: 'jakim'; zone: string; label: string } | { kind: 'calculated'; label: string; coordinates: { lat: number; lng: number } }
  times: Partial<Record<'imsak' | 'fajr' | 'syuruk' | 'dhuhr' | 'asr' | 'maghrib' | 'isha', string>>
}

export function prayerTimesPath(q: { zone?: string; lat?: number; lng?: number; tz?: string; date?: string }) {
  const qs = new URLSearchParams()
  if (q.zone) qs.set('zone', q.zone)
  if (q.lat !== undefined && q.lng !== undefined) {
    qs.set('lat', q.lat.toFixed(2)) // rounded before it leaves the browser too (~1 km)
    qs.set('lng', q.lng.toFixed(2))
  }
  if (q.tz) qs.set('tz', q.tz)
  if (q.date) qs.set('date', q.date)
  return `/islamic/prayer-times?${qs}`
}

export const getPrayerTimes = async (q: Parameters<typeof prayerTimesPath>[0]) =>
  (await call<{ prayerTimes: PrayerTimes }>(prayerTimesPath(q))).prayerTimes

export const formatTime = (iso: string, timeZone: string) =>
  new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit' }).format(new Date(iso))

// JAKIM zone codes by state (ADR-023: codes only; district names to come from JAKIM's official list).
export const JAKIM_ZONES: Record<string, string[]> = {
  Johor: ['JHR01', 'JHR02', 'JHR03', 'JHR04'],
  Kedah: ['KDH01', 'KDH02', 'KDH03', 'KDH04', 'KDH05', 'KDH06', 'KDH07'],
  Kelantan: ['KTN01', 'KTN02'],
  Melaka: ['MLK01'],
  'Negeri Sembilan': ['NGS01', 'NGS02', 'NGS03'],
  Pahang: ['PHG01', 'PHG02', 'PHG03', 'PHG04', 'PHG05', 'PHG06', 'PHG07'],
  Perlis: ['PLS01'],
  'Pulau Pinang': ['PNG01'],
  Perak: ['PRK01', 'PRK02', 'PRK03', 'PRK04', 'PRK05', 'PRK06', 'PRK07'],
  Sabah: ['SBH01', 'SBH02', 'SBH03', 'SBH04', 'SBH05', 'SBH06', 'SBH07', 'SBH08', 'SBH09'],
  Selangor: ['SGR01', 'SGR02', 'SGR03'],
  Sarawak: ['SWK01', 'SWK02', 'SWK03', 'SWK04', 'SWK05', 'SWK06', 'SWK07', 'SWK08', 'SWK09'],
  Terengganu: ['TRG01', 'TRG02', 'TRG03', 'TRG04'],
  'Wilayah Persekutuan': ['WLY01', 'WLY02'],
}

// ADR-023 §4: great-circle initial bearing from the device location to the Kaaba, computed in the
// browser (the location never leaves the device). Degrees clockwise from true north.
const KAABA = { lat: 21.4225, lng: 39.8262 }
export function qiblaBearing(lat: number, lng: number) {
  const rad = (d: number) => (d * Math.PI) / 180
  const φ1 = rad(lat)
  const φ2 = rad(KAABA.lat)
  const Δλ = rad(KAABA.lng - lng)
  const y = Math.sin(Δλ) * Math.cos(φ2)
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ)
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360
}

// A promise around the browser geolocation API; rejects honestly when unavailable (ISL-007).
export function currentPosition(geo: Geolocation | undefined = globalThis.navigator?.geolocation) {
  return new Promise<{ lat: number; lng: number }>((resolve, reject) => {
    if (!geo) return reject(new Error('Location unavailable on this device'))
    geo.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => reject(new Error('Location unavailable: permission denied or no signal')),
      { timeout: 10_000, maximumAge: 300_000 },
    )
  })
}
