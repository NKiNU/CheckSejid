import { describe, expect, it } from 'vitest'
import { ApiError } from '../features/identity/api.ts'
import { en } from './en.ts'
import { detectLang, errorMessage, formatDateTime, translate, type T } from './index.tsx'
import { ms } from './ms.ts'

describe('i18n', () => {
  it('has the same keys in ms and en, and no empty text', () => {
    expect(new Set(Object.keys(ms))).toEqual(new Set(Object.keys(en)))
    for (const d of [en, ms]) for (const [k, v] of Object.entries(d)) expect(v.trim(), k).not.toBe('')
  })

  it('uses the same {placeholders} in both languages', () => {
    const vars = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort()
    for (const k of Object.keys(en) as (keyof typeof en)[]) expect(vars(ms[k]), k).toEqual(vars(en[k]))
  })

  it('interpolates {name} and leaves unknown placeholders alone', () => {
    expect(translate('en', 'auth.welcome', { name: 'Aminah' })).toBe('Welcome, Aminah')
    expect(translate('ms', 'auth.welcome', { name: 'Aminah' })).toBe('Selamat datang, Aminah')
    expect(translate('en', 'auth.welcome')).toBe('Welcome, {name}')
  })

  it('defaults to ms only when the browser prefers Malay; a saved choice wins', () => {
    expect(detectLang(null, ['ms-MY', 'en'])).toBe('ms')
    expect(detectLang(null, ['en-US', 'ms'])).toBe('en')
    expect(detectLang(null, ['id', 'ms'])).toBe('ms')
    expect(detectLang(null, ['fr'])).toBe('en')
    expect(detectLang(null, [])).toBe('en')
    expect(detectLang('en', ['ms-MY'])).toBe('en')
    expect(detectLang('xx', ['ms-MY'])).toBe('ms')
  })

  it('translates known error codes, keeps the upgrade meaning, and falls back to the server message', () => {
    const tms: T = (k, v) => translate('ms', k, v)
    const ten: T = (k, v) => translate('en', k, v)
    expect(errorMessage(new ApiError(403, 'FORBIDDEN', 'no permission'), tms)).toBe(ms['err.FORBIDDEN'])
    for (const code of ['ENTITLEMENT_REQUIRED', 'QUOTA_EXCEEDED']) {
      expect(errorMessage(new ApiError(403, code, 'limit'), ten)).toMatch(/^Your plan does not allow this\. Upgrade your plan/)
    }
    expect(errorMessage(new ApiError(404, 'TASK_NOT_FOUND', 'x'), tms)).toBe(ms['err.NOT_FOUND'])
    expect(errorMessage(new ApiError(400, 'SOMETHING_NEW', 'Server says no'), tms)).toBe('Server says no')
    expect(errorMessage('x', tms)).toBe(ms['err.generic'])
  })

  it('formats dates in Asia/Kuala_Lumpur', () => {
    expect(formatDateTime('2026-10-05T21:47:00.000Z', 'en-MY')).toMatch(/6 Oct 2026/)
  })
})
