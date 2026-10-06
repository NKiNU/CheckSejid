import { describe, expect, it } from 'vitest'
import { currentPosition, formatTime, prayerTimesPath, qiblaBearing } from './api.ts'

describe('islamic api', () => {
  it('rounds the location before sending it (ADR-023 §1)', () => {
    expect(prayerTimesPath({ lat: 3.139123, lng: 101.686855, tz: 'Asia/Kuala_Lumpur' })).toBe('/islamic/prayer-times?lat=3.14&lng=101.69&tz=Asia%2FKuala_Lumpur')
    expect(prayerTimesPath({ zone: 'WLY01', date: '2026-10-06' })).toBe('/islamic/prayer-times?zone=WLY01&date=2026-10-06')
  })

  it('renders times in the given timezone', () => {
    expect(formatTime('2026-10-05T21:47:00.000Z', 'Asia/Kuala_Lumpur')).toBe('05:47')
  })

  it('computes the Qibla bearing (great circle to the Kaaba)', () => {
    expect(qiblaBearing(3.139, 101.6869)).toBeCloseTo(292.5, 0) // Kuala Lumpur ≈ 292.5°
    expect(qiblaBearing(51.5074, -0.1278)).toBeCloseTo(118.99, 0) // London ≈ 119°
  })

  it('reports unavailable location honestly (ISL-007)', async () => {
    await expect(currentPosition(undefined)).rejects.toThrow(/Location unavailable/)
    const denied = { getCurrentPosition: (_ok: unknown, fail: () => void) => fail() } as unknown as Geolocation
    await expect(currentPosition(denied)).rejects.toThrow(/permission denied/)
  })
})
