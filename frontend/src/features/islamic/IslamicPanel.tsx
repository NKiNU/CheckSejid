import { useState } from 'react'
import * as api from './api.ts'

const ZONE_KEY = 'masyarakat.jakimZone' // the visitor's own browser only (ADR-023 §1)
const readZone = () => {
  try {
    return localStorage.getItem(ZONE_KEY) ?? ''
  } catch {
    return ''
  }
}
const LABELS: [keyof api.PrayerTimes['times'], string][] = [
  ['imsak', 'Imsak'],
  ['fajr', 'Subuh'],
  ['syuruk', 'Syuruk'],
  ['dhuhr', 'Zohor'],
  ['asr', 'Asar'],
  ['maghrib', 'Maghrib'],
  ['isha', 'Isyak'],
]

// Phase 09: prayer times for the visitor's zone or location, with provenance; Qibla from the device.
export function IslamicPanel() {
  const [zone, setZone] = useState(readZone)
  const [times, setTimes] = useState<api.PrayerTimes | null>(null)
  const [qibla, setQibla] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function show(useLocation: boolean) {
    setError(null)
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
      const pos = useLocation ? await api.currentPosition() : undefined
      if (!useLocation && !zone) return setError('Choose your zone or use your location')
      try {
        if (zone) localStorage.setItem(ZONE_KEY, zone)
      } catch {
        // storage unavailable: nothing to remember
      }
      setTimes(await api.getPrayerTimes({ zone: useLocation ? undefined : zone, ...pos, tz }))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
    }
  }

  async function findQibla() {
    setError(null)
    try {
      const { lat, lng } = await api.currentPosition()
      setQibla(api.qiblaBearing(lat, lng))
    } catch (e) {
      setQibla(null)
      setError(e instanceof Error ? e.message : 'Location unavailable')
    }
  }

  return (
    <section>
      <h2>Prayer times</h2>
      <select value={zone} onChange={(e) => setZone(e.target.value)} aria-label="JAKIM zone">
        <option value="">Choose your zone…</option>
        {Object.entries(api.JAKIM_ZONES).map(([state, zones]) => (
          <optgroup key={state} label={state}>
            {zones.map((z) => (
              <option key={z}>{z}</option>
            ))}
          </optgroup>
        ))}
      </select>
      <button type="button" onClick={() => show(false)}>
        Show for zone
      </button>
      <button type="button" onClick={() => show(true)}>
        Use my location
      </button>
      {times && (
        <div>
          <p>
            {times.gregorian.label}: {times.gregorian.date} · {times.hijri.label}: {times.hijri.date}
          </p>
          <table>
            <tbody>
              {LABELS.filter(([k]) => times.times[k]).map(([k, label]) => (
                <tr key={k}>
                  <th>{label}</th>
                  <td>{api.formatTime(times.times[k]!, times.timezone)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p>
            Source: {times.source.label}. Times shown in {times.timezone}. Follow your local religious authority where it differs.
          </p>
        </div>
      )}
      <h2>Qibla</h2>
      <button type="button" onClick={findQibla}>
        Find Qibla direction
      </button>
      {qibla !== null && <p>Qibla: {qibla.toFixed(1)}° from true north. Accuracy depends on your device's compass and location.</p>}
      {error && <p role="alert">{error}</p>}
    </section>
  )
}
