// Phase 09 — prayer times and Hijri dates (ADR-012, ADR-023, ISL-001..007). A self-contained module:
// no other module depends on it, and it reads no tenant data (ISL-001). Visitor locations are used per
// request and never stored (ADR-023 §1).
import { CalculationMethod, Coordinates, PrayerTimes } from "adhan";
import { z } from "zod";
import type { Prisma } from "../../../generated/prisma/client.ts";
import { prisma } from "../../db.ts";
import { ymd } from "../../dates.ts";
import { HttpError } from "../../errors.ts";

export const JAKIM_TIMEZONE = "Asia/Kuala_Lumpur"; // e-Solat publishes Malaysian local times (UTC+8, no DST)
const JAKIM_OFFSET_HOURS = 8;
const JAKIM_URL = "https://www.e-solat.gov.my/index.php?r=esolatApi/TakwimSolat&period=duration";
const FETCH_TIMEOUT_MS = 8000;
export const CALCULATION_LABEL = "Calculated (Fajr 20°, Isha 18°)";

const PRAYERS = ["imsak", "fajr", "syuruk", "dhuhr", "asr", "maghrib", "isha"] as const;
type Times = Partial<Record<(typeof PRAYERS)[number], string>>; // UTC ISO instants

// ---- JAKIM e-Solat (ADR-012 option C; terms confirmed by the product owner, ADR-023 §2) ----

const hms = z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/);
const jakimResponse = z.object({
  status: z.string(),
  prayerTime: z.array(
    z.object({
      hijri: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      date: z.string().regex(/^\d{2}-[A-Za-z]{3}-\d{4}$/), // e.g. "06-Oct-2026"
      imsak: hms,
      fajr: hms,
      syuruk: hms,
      dhuhr: hms,
      asr: hms,
      maghrib: hms,
      isha: hms,
    }),
  ),
});
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// Malaysian local wall time on a given day → UTC instant.
function jakimInstant(day: string, time: string) {
  const [d, mon, y] = day.split("-");
  const [h, mi, s] = time.split(":").map(Number);
  const m = MONTHS.findIndex((x) => x.toLowerCase() === mon!.toLowerCase());
  if (m < 0) throw new Error(`e-Solat: unknown month ${mon}`);
  return new Date(Date.UTC(Number(y), m, Number(d), h! - JAKIM_OFFSET_HOURS, mi!, s ?? 0));
}

// Fetches a whole year for one zone and caches it (PrayerTimeCache, global reference data).
export async function fetchJakimYear(zone: string, year: number) {
  const res = await fetch(`${JAKIM_URL}&zone=${encodeURIComponent(zone)}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ datestart: `${year}-01-01`, dateend: `${year}-12-31` }),
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`e-Solat: HTTP ${res.status}`);
  const body = jakimResponse.parse(await res.json());
  if (!body.status.toUpperCase().startsWith("OK") || body.prayerTime.length === 0) throw new Error(`e-Solat: status ${body.status}`);
  const rows: Prisma.PrayerTimeCacheCreateManyInput[] = body.prayerTime.map((p) => {
    const date = jakimInstant(p.date, "08:00:00"); // midnight UTC of that calendar day
    const times = Object.fromEntries(PRAYERS.map((k) => [k, jakimInstant(p.date, p[k]).toISOString()]));
    return { source: "jakim", zone, date, times, hijri: p.hijri ?? null };
  });
  await prisma.prayerTimeCache.createMany({ data: rows, skipDuplicates: true });
  return rows.length;
}

const cached = (zone: string, date: Date) => prisma.prayerTimeCache.findUnique({ where: { source_zone_date: { source: "jakim", zone, date } } });

// ---- local calculation (ADR-023 §2): deterministic, never cached ----

export function calculate(lat: number, lng: number, date: Date): Times {
  // adhan reads the calendar day from the Date's local fields.
  const day = new Date(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  const t = new PrayerTimes(new Coordinates(lat, lng), day, CalculationMethod.Singapore());
  const times = { fajr: t.fajr, syuruk: t.sunrise, dhuhr: t.dhuhr, asr: t.asr, maghrib: t.maghrib, isha: t.isha };
  return Object.fromEntries(Object.entries(times).map(([k, v]) => [k, v.toISOString()]));
}

// ---- Hijri (ADR-023 §3) ----

export function umalquraHijri(date: Date) {
  const parts = new Intl.DateTimeFormat("en-u-ca-islamic-umalqura", { timeZone: "UTC", year: "numeric", month: "numeric", day: "numeric" }).formatToParts(date);
  const get = (t: string) => parts.find((p) => p.type === t)!.value;
  return `${get("year").padStart(4, "0")}-${get("month").padStart(2, "0")}-${get("day").padStart(2, "0")}`;
}
const HIJRI_JAKIM = "Hijri (JAKIM)";
const HIJRI_CALCULATED = "Hijri (Umm al-Qura calculation; local moon sighting may differ by a day)";

// ---- the request ----

export type PrayerQuery = { date: Date; zone?: string; lat?: number; lng?: number; tz?: string };
export const unavailable = () =>
  new HttpError(503, "PRAYER_TIMES_UNAVAILABLE", "Prayer times are unavailable for this zone right now. Share your location to see calculated times.");

// Coordinates are rounded to ~1 km before use (ADR-023 §1).
export const round2 = (n: number) => Math.round(n * 100) / 100;

export async function prayerTimes(q: PrayerQuery) {
  const gregorian = { date: ymd(q.date), label: "Gregorian" };
  if (q.zone) {
    let row = await cached(q.zone, q.date);
    if (!row) {
      try {
        await fetchJakimYear(q.zone, q.date.getUTCFullYear());
        row = await cached(q.zone, q.date);
      } catch (e) {
        // Logged without secrets; serve calculation if the visitor shared a location (ADR-012).
        console.error("prayer-times: e-Solat fetch failed", q.zone, e instanceof Error ? e.message : "error");
      }
    }
    if (row) {
      return {
        gregorian,
        hijri: row.hijri ? { date: row.hijri, label: HIJRI_JAKIM } : { date: umalquraHijri(q.date), label: HIJRI_CALCULATED },
        timezone: JAKIM_TIMEZONE,
        source: { kind: "jakim" as const, zone: q.zone, label: `JAKIM e-Solat, zone ${q.zone}` },
        times: row.times as Times,
      };
    }
    if (q.lat === undefined || q.lng === undefined) throw unavailable();
  }
  if (q.lat === undefined || q.lng === undefined) throw new HttpError(400, "LOCATION_REQUIRED", "Choose a zone or share your location");
  const lat = round2(q.lat);
  const lng = round2(q.lng);
  return {
    gregorian,
    hijri: { date: umalquraHijri(q.date), label: HIJRI_CALCULATED },
    timezone: q.tz ?? "UTC",
    source: { kind: "calculated" as const, label: CALCULATION_LABEL, coordinates: { lat, lng } },
    times: calculate(lat, lng, q.date),
  };
}

// ADR-023 §2 refresh: in December, fetch next year's timetable for every zone already cached.
// Failures are logged; cached data keeps being served.
export async function refreshCachedZones(now = new Date()) {
  if (now.getUTCMonth() !== 11) return { fetched: [] as string[] };
  const next = now.getUTCFullYear() + 1;
  const zones = await prisma.prayerTimeCache.findMany({ where: { source: "jakim" }, distinct: ["zone"], select: { zone: true } });
  const fetched: string[] = [];
  for (const { zone } of zones) {
    const has = await prisma.prayerTimeCache.count({ where: { source: "jakim", zone, date: { gte: new Date(Date.UTC(next, 0, 1)) } } });
    if (has > 0) continue;
    try {
      await fetchJakimYear(zone, next);
      fetched.push(zone);
    } catch (e) {
      console.error("prayer-times: refresh failed", zone, e instanceof Error ? e.message : "error");
    }
  }
  return { fetched };
}

const DAY_MS = 24 * 60 * 60 * 1000;
export function startPrayerTimeRefresh() {
  const run = () => void refreshCachedZones().catch((e: unknown) => console.error("prayer-times: refresh job failed", e instanceof Error ? e.message : "error"));
  run();
  setInterval(run, DAY_MS).unref();
}
