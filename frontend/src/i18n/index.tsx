import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { ApiError } from '../features/identity/api.ts'
import { en, type Key } from './en.ts'
import { ms } from './ms.ts'

// ADR-027: no library. One dictionary per language, `t(key, vars)`, and a small context for the current language.
export type Lang = 'ms' | 'en'
export type T = (key: Key, vars?: Record<string, string | number>) => string

const dict: Record<Lang, Record<Key, string>> = { en, ms }
const LOCALES = { ms: 'ms-MY', en: 'en-MY' } as const
export const TIME_ZONE = 'Asia/Kuala_Lumpur'
const STORE = 'lang'

export const translate = (lang: Lang, key: Key, vars?: Record<string, string | number>) =>
  (dict[lang][key] ?? key).replace(/\{(\w+)\}/g, (m, k: string) => (vars && k in vars ? String(vars[k]) : m))

// A saved choice wins; else the first browser language that is ms or en decides (default en).
export function detectLang(stored: string | null, prefs: readonly string[]): Lang {
  if (stored === 'ms' || stored === 'en') return stored
  const first = prefs.map((l) => l.slice(0, 2).toLowerCase()).find((l) => l === 'ms' || l === 'en')
  return first === 'ms' ? 'ms' : 'en'
}

// Known API error codes get a translated message; unknown codes show the server's message.
export function errorMessage(e: unknown, t: T): string {
  if (!(e instanceof ApiError)) return t('err.generic')
  const own = `err.${e.code}` in en ? (`err.${e.code}` as Key) : null
  const notFound = e.code.endsWith('_NOT_FOUND') ? 'err.NOT_FOUND' : null
  const key = own ?? notFound
  return key ? t(key) : e.message
}

export const formatDateTime = (iso: string, locale: string) =>
  new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short', timeZone: TIME_ZONE }).format(new Date(iso))
export const formatTimeOfDay = (iso: string, locale: string) =>
  new Intl.DateTimeFormat(locale, { timeStyle: 'short', timeZone: TIME_ZONE }).format(new Date(iso))
// A calendar date with no time ("2026-10-06") must not shift with the zone.
export const formatDate = (ymd: string, locale: string) =>
  new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(ymd))

const read = () => {
  try {
    return localStorage.getItem(STORE)
  } catch {
    return null
  }
}

const make = (lang: Lang, setLang: (l: Lang) => void) => {
  const locale = LOCALES[lang]
  const t: T = (key, vars) => translate(lang, key, vars)
  return {
    t,
    lang,
    setLang,
    locale,
    dateTime: (iso: string) => formatDateTime(iso, locale),
    time: (iso: string) => formatTimeOfDay(iso, locale),
    date: (ymd: string) => formatDate(ymd, locale),
    number: (n: number, digits = 0) => new Intl.NumberFormat(locale, { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(n),
    error: (e: unknown) => errorMessage(e, t),
  }
}

const Ctx = createContext(make('en', () => undefined))
export const useT = () => useContext(Ctx)

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => detectLang(read(), [...(globalThis.navigator?.languages ?? []), globalThis.navigator?.language ?? '']))
  useEffect(() => {
    document.documentElement.lang = lang
  }, [lang])
  // Only an explicit choice is saved, so an unset browser keeps following its own language.
  const setLang = (l: Lang) => {
    setLangState(l)
    try {
      localStorage.setItem(STORE, l)
    } catch {
      // storage unavailable: the choice lasts for this visit only
    }
  }
  return <Ctx.Provider value={make(lang, setLang)}>{children}</Ctx.Provider>
}

// Always visible; language names are shown in their own language on purpose.
export function LanguageSwitch() {
  const { t, lang, setLang } = useT()
  return (
    <div role="group" aria-label={t('lang.switch')}>
      {(['ms', 'en'] as const).map((l) => (
        <button key={l} type="button" lang={l} aria-pressed={lang === l} onClick={() => setLang(l)}>
          {l === 'ms' ? 'BM' : 'EN'}
        </button>
      ))}
    </div>
  )
}
