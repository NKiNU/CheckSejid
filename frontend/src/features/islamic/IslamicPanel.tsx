import { useState } from 'react'
import { useT } from '../../i18n/index.tsx'
import * as api from './api.ts'

const ZONE_KEY = 'masyarakat.jakimZone' // the visitor's own browser only (ADR-023 §1)
const readZone = () => {
  try {
    return localStorage.getItem(ZONE_KEY) ?? ''
  } catch {
    return ''
  }
}
const PRAYERS = ['imsak', 'fajr', 'syuruk', 'dhuhr', 'asr', 'maghrib', 'isha'] as const

// Phase 09: prayer times for the visitor's zone or location, with provenance; Qibla from the device.
export function IslamicPanel() {
  const { t, locale, number, error: errorText } = useT()
  const [zone, setZone] = useState(readZone)
  const [times, setTimes] = useState<api.PrayerTimes | null>(null)
  const [qibla, setQibla] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function show(useLocation: boolean) {
    setError(null)
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
      const pos = useLocation ? await api.currentPosition() : undefined
      if (!useLocation && !zone) return setError(t('prayer.needZone'))
      try {
        if (zone) localStorage.setItem(ZONE_KEY, zone)
      } catch {
        // storage unavailable: nothing to remember
      }
      setTimes(await api.getPrayerTimes({ zone: useLocation ? undefined : zone, ...pos, tz }))
    } catch (e) {
      setError(errorText(e))
    }
  }

  async function findQibla() {
    setError(null)
    try {
      const { lat, lng } = await api.currentPosition()
      setQibla(api.qiblaBearing(lat, lng))
    } catch (e) {
      setQibla(null)
      setError(errorText(e))
    }
  }

  // The server sends English labels; show them in the current language, keeping Hijri and Gregorian distinct.
  const hijriLabel = times && t(times.hijri.label === 'Hijri (JAKIM)' ? 'prayer.hijriJakim' : 'prayer.hijriCalc')
  const source = !times ? '' : times.source.kind === 'jakim' ? t('prayer.srcJakim', { zone: times.source.zone }) : t('prayer.srcCalc')

  return (
    <section>
      <h2>{t('prayer.heading')}</h2>
      <select value={zone} onChange={(e) => setZone(e.target.value)} aria-label={t('prayer.zone')}>
        <option value="">{t('prayer.chooseZone')}</option>
        {Object.entries(api.JAKIM_ZONES).map(([state, zones]) => (
          <optgroup key={state} label={state}>
            {zones.map((z) => (
              <option key={z}>{z}</option>
            ))}
          </optgroup>
        ))}
      </select>
      <button type="button" onClick={() => show(false)}>
        {t('prayer.showZone')}
      </button>
      <button type="button" onClick={() => show(true)}>
        {t('prayer.useLocation')}
      </button>
      {times && (
        <div>
          <p>
            {t('prayer.gregorian')}: {times.gregorian.date} · {hijriLabel}: {times.hijri.date}
          </p>
          <table>
            <tbody>
              {PRAYERS.filter((k) => times.times[k]).map((k) => (
                <tr key={k}>
                  <th>{t(`prayer.${k}`)}</th>
                  <td>{api.formatTime(times.times[k]!, times.timezone, locale)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p>
            {t('prayer.source', { source, tz: times.timezone })}
          </p>
        </div>
      )}
      <h2>{t('qibla.heading')}</h2>
      <button type="button" onClick={findQibla}>
        {t('qibla.find')}
      </button>
      {qibla !== null && <p>{t('qibla.result', { deg: number(qibla, 1) })}</p>}
      {error && <p role="alert">{error}</p>}
    </section>
  )
}
