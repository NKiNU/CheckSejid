// Phase 09 (ADR-012, ADR-023) integration tests. The e-Solat endpoint is stubbed (global fetch); the
// cache is a real PostgreSQL table.
import request from "supertest";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { app } from "../../app.ts";
import { prisma } from "../../db.ts";
import { resetStores } from "../../test/fixtures.ts";
import { islamicRateLimitStores } from "./islamic.routes.ts";
import { CALCULATION_LABEL, refreshCachedZones, umalquraHijri } from "./prayer.service.ts";

const hasDb = Boolean(process.env.DATABASE_URL);
if (!hasDb) console.warn("islamic.db.test: DATABASE_URL not set — DB integration tests SKIPPED");

const ZONES = ["TST01", "TST02", "TST03", "TST04", "TST05"];
const day = (date: string, hijri = "1448-04-25") => ({
  hijri,
  date,
  day: "Tuesday",
  imsak: "05:37:00",
  fajr: "05:47:00",
  syuruk: "06:55:00",
  dhuhr: "13:01:00",
  asr: "16:09:00",
  maghrib: "19:04:00",
  isha: "20:13:00",
});
const ok = (days = [day("06-Oct-2026"), day("07-Oct-2026", "1448-04-26")]) =>
  new Response(JSON.stringify({ prayerTime: days, status: "OK!", serverTime: "2026-10-06 08:00:00", periodType: "duration", lang: "ms_my", zone: "X" }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
const get = (q: Record<string, string | number>) => request(app).get("/islamic/prayer-times").query(q);

describe.skipIf(!hasDb)("Islamic features (database)", () => {
  const fetchMock = vi.fn<typeof fetch>();
  beforeEach(async () => {
    await resetStores(islamicRateLimitStores);
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });
  afterAll(async () => {
    await prisma.prayerTimeCache.deleteMany({ where: { zone: { in: ZONES } } });
    await prisma.$disconnect();
  });

  it("zone: fetches the JAKIM year once, caches it, converts Malaysian time to UTC, with provenance (ISL-002/004)", async () => {
    fetchMock.mockResolvedValueOnce(ok());
    const res = await get({ zone: "TST01", date: "2026-10-06" }).expect(200);
    expect(res.body.prayerTimes).toEqual({
      gregorian: { date: "2026-10-06", label: "Gregorian" },
      hijri: { date: "1448-04-25", label: "Hijri (JAKIM)" },
      timezone: "Asia/Kuala_Lumpur",
      source: { kind: "jakim", zone: "TST01", label: "JAKIM e-Solat, zone TST01" },
      times: {
        imsak: "2026-10-05T21:37:00.000Z",
        fajr: "2026-10-05T21:47:00.000Z", // 05:47 MYT = 21:47 UTC the previous day
        syuruk: "2026-10-05T22:55:00.000Z",
        dhuhr: "2026-10-06T05:01:00.000Z",
        asr: "2026-10-06T08:09:00.000Z",
        maghrib: "2026-10-06T11:04:00.000Z",
        isha: "2026-10-06T12:13:00.000Z",
      },
    });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe("https://www.e-solat.gov.my/index.php?r=esolatApi/TakwimSolat&period=duration&zone=TST01");
    expect(init?.method).toBe("POST");
    expect(String(init?.body)).toBe("datestart=2026-01-01&dateend=2026-12-31");

    // The next day comes from the cache: no second fetch.
    expect((await get({ zone: "TST01", date: "2026-10-07" }).expect(200)).body.prayerTimes.hijri.date).toBe("1448-04-26");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(await prisma.prayerTimeCache.count({ where: { zone: "TST01" } })).toBe(2);
  });

  it("JAKIM unavailable or malformed: calculated times if a location was shared, else 503 (ADR-012)", async () => {
    fetchMock.mockRejectedValueOnce(new Error("network down"));
    const calc = await get({ zone: "TST02", date: "2026-10-06", lat: 3.139, lng: 101.6869, tz: "Asia/Kuala_Lumpur" }).expect(200);
    expect(calc.body.prayerTimes.source).toEqual({ kind: "calculated", label: CALCULATION_LABEL, coordinates: { lat: 3.14, lng: 101.69 } });

    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ status: "NO_RECORD!", prayerTime: [] }), { status: 200 }));
    const none = await get({ zone: "TST03", date: "2026-10-06" });
    expect([none.status, none.body.error.code]).toEqual([503, "PRAYER_TIMES_UNAVAILABLE"]);
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ status: "OK!", prayerTime: [{ date: "garbage" }] }), { status: 200 }));
    expect((await get({ zone: "TST03", date: "2026-10-06" })).status).toBe(503);
    expect(await prisma.prayerTimeCache.count({ where: { zone: { in: ["TST02", "TST03"] } } })).toBe(0);
  });

  it("coordinates only: labelled local calculation, rounded location, never stored (ISL-003, ADR-023 §1)", async () => {
    const before = await prisma.prayerTimeCache.count();
    const res = await get({ lat: 3.13912, lng: 101.68685, tz: "Asia/Kuala_Lumpur", date: "2026-10-06" }).expect(200);
    const p = res.body.prayerTimes;
    expect(p).toMatchObject({
      timezone: "Asia/Kuala_Lumpur",
      hijri: { date: "1448-04-25", label: "Hijri (Umm al-Qura calculation; local moon sighting may differ by a day)" },
      source: { kind: "calculated", coordinates: { lat: 3.14, lng: 101.69 } },
    });
    const order = ["fajr", "syuruk", "dhuhr", "asr", "maghrib", "isha"].map((k) => Date.parse(p.times[k]));
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(p.times.fajr.slice(0, 10)).toBe("2026-10-05"); // ~05:4x MYT
    expect(fetchMock).not.toHaveBeenCalled();
    expect(await prisma.prayerTimeCache.count()).toBe(before);
    // A different place gives different times: nothing is hard-coded.
    const london = (await get({ lat: 51.5, lng: -0.12, tz: "Europe/London", date: "2026-10-06" }).expect(200)).body.prayerTimes;
    expect(london.times.dhuhr).not.toBe(p.times.dhuhr);
  });

  it("validates input; with no zone or location it asks for one (ISL-007)", async () => {
    for (const q of [{ zone: "wly01" }, { lat: 100, lng: 1 }, { lat: 3 }, { lat: 3, lng: 101, tz: "Mars/Olympus" }, { zone: "WLY01", date: "2026-13-01" }, { foo: 1 }] as Record<string, string | number>[]) {
      expect((await get(q)).body.error.code, JSON.stringify(q)).toBe("VALIDATION_ERROR");
    }
    const none = await get({});
    expect([none.status, none.body.error.code]).toEqual([400, "LOCATION_REQUIRED"]);
  });

  it("refresh: in December, fetches next year for cached zones; otherwise does nothing; failures do not throw", async () => {
    fetchMock.mockResolvedValueOnce(ok([day("01-Dec-2026")]));
    await get({ zone: "TST04", date: "2026-12-01" }).expect(200);
    fetchMock.mockReset();
    expect(await refreshCachedZones(new Date("2026-11-15T00:00:00Z"))).toEqual({ fetched: [] });
    expect(fetchMock).not.toHaveBeenCalled();

    fetchMock.mockImplementation(async (_url, init) =>
      String(init?.body).startsWith("datestart=2027") ? ok([day("01-Jan-2027", "1448-07-22")]) : ok([]),
    );
    const { fetched } = await refreshCachedZones(new Date("2026-12-15T00:00:00Z"));
    expect(fetched).toContain("TST04");
    expect(await prisma.prayerTimeCache.count({ where: { zone: "TST04", date: new Date("2027-01-01T00:00:00Z") } })).toBe(1);

    fetchMock.mockRejectedValue(new Error("down"));
    await prisma.prayerTimeCache.createMany({ data: [{ source: "jakim", zone: "TST05", date: new Date("2026-12-01T00:00:00Z"), times: {} }] });
    await expect(refreshCachedZones(new Date("2026-12-16T00:00:00Z"))).resolves.toMatchObject({ fetched: [] });
  });

  it("Umm al-Qura Hijri dates are computed, not hard-coded (ISL-005)", () => {
    expect(umalquraHijri(new Date("2026-10-06T00:00:00Z"))).toBe("1448-04-25");
    expect(umalquraHijri(new Date("2027-02-08T00:00:00Z"))).toMatch(/^1448-0[89]-\d{2}$/); // around Ramadan 1448
  });
});
