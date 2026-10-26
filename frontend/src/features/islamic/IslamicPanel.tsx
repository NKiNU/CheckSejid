import { useEffect, useState } from 'react'
import { useT } from '../../i18n/index.tsx'
import { Badge } from '@/components/ui/badge.tsx'
import { Button } from '@/components/ui/button.tsx'
import { Card, CardContent } from '@/components/ui/card.tsx'
import { Label } from '@/components/ui/label.tsx'
import { Select } from '@/components/ui/select.tsx'
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
  const [busy, setBusy] = useState(false)
  const [at, setAt] = useState(0) // when the times were fetched; "next" is judged against it

  useEffect(() => {
    if (!times) return
    const id = setInterval(() => setAt(Date.now()), 60_000)
    return () => clearInterval(id)
  }, [times])

  async function show(useLocation: boolean) {
    setError(null)
    setBusy(true)
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
      setAt(Date.now())
    } catch (e) {
      setError(errorText(e))
    } finally {
      setBusy(false)
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

  const next = times && api.nextPrayer(times.times, at)
  const wrap = '[overflow-wrap:anywhere]'

  return (
    <div className="grid gap-4 pt-2">
      <Card>
        <CardContent>
          <h2 className="text-xl font-medium">{t('prayer.heading')}</h2>
          <div className="grid min-w-0 gap-2">
            <Label htmlFor="prayer-zone">{t('prayer.zone')}</Label>
            <Select id="prayer-zone" value={zone} onChange={(e) => setZone(e.target.value)}>
              <option value="">{t('prayer.chooseZone')}</option>
              {Object.entries(api.JAKIM_ZONES).map(([state, zones]) => (
                <optgroup key={state} label={state}>
                  {zones.map((z) => (
                    <option key={z}>{z}</option>
                  ))}
                </optgroup>
              ))}
            </Select>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" className="h-auto min-h-11 whitespace-normal" disabled={busy} onClick={() => show(false)}>
              {t('prayer.showZone')}
            </Button>
            <Button type="button" variant="outline" className="h-auto min-h-11 whitespace-normal" disabled={busy} onClick={() => show(true)}>
              {t('prayer.useLocation')}
            </Button>
          </div>
          {busy && <p role="status" className="text-muted-foreground">{t('common.loading')}</p>}
          {times && (
            <>
              <p className={`text-sm ${wrap}`}>
                {t('prayer.gregorian')}: {times.gregorian.date}
                <br />
                {hijriLabel}: {times.hijri.date}
              </p>
              <ul className="grid gap-1">
                {PRAYERS.filter((k) => times.times[k]).map((k) => (
                  <li
                    key={k}
                    aria-current={k === next ? 'time' : undefined}
                    className={`flex min-h-11 flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-lg px-3 py-2 ${k === next ? 'bg-primary/10 font-medium' : ''}`}
                  >
                    <span className={`min-w-0 ${wrap}`}>
                      {t(`prayer.${k}`)} {k === next && <Badge variant="success">{t('prayer.next')}</Badge>}
                    </span>
                    <span className="tabular-nums">{api.formatTime(times.times[k]!, times.timezone, locale)}</span>
                  </li>
                ))}
              </ul>
              <p className={`text-xs text-muted-foreground ${wrap}`}>{t('prayer.source', { source, tz: times.timezone })}</p>
            </>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardContent>
          <h2 className="text-xl font-medium">{t('qibla.heading')}</h2>
          <Button type="button" variant="outline" className="h-auto min-h-11 w-fit max-w-full whitespace-normal" onClick={findQibla}>
            {t('qibla.find')}
          </Button>
          {qibla !== null && (
            <div className="flex items-center gap-4">
              {/* ponytail: static arrow pointing at the bearing from the top (true north); no animation, so reduced-motion needs nothing extra */}
              <div className="relative size-14 shrink-0 pt-3 text-primary" aria-hidden="true">
                <span className="absolute inset-x-0 top-0 text-center text-xs font-medium leading-none text-muted-foreground">N</span>
                <svg viewBox="0 0 24 24" className="size-11 mx-auto" style={{ transform: `rotate(${qibla}deg)` }}>
                  <path d="M12 2 L18 20 L12 16 L6 20 Z" fill="currentColor" />
                </svg>
              </div>
              <p className={`min-w-0 text-sm ${wrap}`}>{t('qibla.result', { deg: number(qibla, 1) })}</p>
            </div>
          )}
        </CardContent>
      </Card>
      {error && <p role="alert" className="text-sm text-destructive [overflow-wrap:anywhere]">{error}</p>}
    </div>
  )
}
