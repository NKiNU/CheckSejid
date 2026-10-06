# ADR-023-ISLAMIC_FEATURES_LOCATION_HIJRI_QIBLA

## Status
Accepted (2026-10-06) by the product owner for §1 and §2 (closes OQ-16 and the ADR-012 e-Solat confirmation). §3 and §4 are implementer choices that the product owner has not yet confirmed. Amends ADR-012 (location context).

## Context
- `modules/islamic-features/PRAYER_TIMES.md`, `HIJRI_CALENDAR.md`, `QIBLA.md`, `ISLAMIC_FEATURES_OVERVIEW.md`; ADR-012 (hybrid JAKIM + calculation, provenance, explicit caching).
- ADR-012 left open whether prayer times follow the organisation's location or the viewer's, and required confirming the e-Solat terms before Phase 09. It decided nothing about Hijri or Qibla.

Product-owner answers (2026-10-06):
- Prayer times are **always shown for the visitor's location**.
- The e-Solat terms of use are **confirmed**: use JAKIM.

## Decision

### 1. Location (OQ-16), amending ADR-012
- Prayer times follow the **visitor's** location, never the organisation's. The visitor either picks a JAKIM zone (Malaysia) or shares the browser's location.
- Location is sent per request and **never stored**. Coordinates are rounded to 2 decimal places (about 1 km) before use. The chosen zone may be remembered in the visitor's own browser.
- No location → the UI says so and asks for a zone or location permission. It does not fall back to another place (ISL-007 spirit).
- Organisations therefore store no prayer-time location context. ADR-015's note that `organisation.update` edits it no longer applies.

### 2. Providers (ADR-012 option C, terms confirmed)
- **Zone given:** JAKIM e-Solat timetable for that zone, fetched for the whole year and cached in PostgreSQL (`PrayerTimeCache`, global reference data, keyed by source + zone + date). Provenance: "JAKIM e-Solat, zone X".
- **Coordinates only**, or JAKIM unavailable and coordinates given: calculated locally (`adhan` library, Singapore/JAKIM-style parameters: Fajr 20°, Isha 18°). Provenance: "Calculated (Fajr 20°, Isha 18°)". Never cached; it is cheap and deterministic.
- JAKIM unavailable and no coordinates: `503 PRAYER_TIMES_UNAVAILABLE`.
- Refresh is explicit: an in-process daily job (started by the server, not in tests) fetches the next year's timetable for every zone already in the cache during December. Fetch failures are logged without secrets, and cached data keeps being served.
- Times are returned as UTC instants plus the timezone they are rendered in (Asia/Kuala_Lumpur for JAKIM zones; the visitor's browser timezone, validated as an IANA name, for calculated times).

### 3. Hijri (implementer choice)
- For JAKIM responses, the Hijri date is JAKIM's own, labelled "Hijri (JAKIM)".
- Otherwise it is computed with the built-in Umm al-Qura calendar (`Intl`, `islamic-umalqura`), labelled "Hijri (Umm al-Qura calculation; local moon sighting may differ by a day)".
- Gregorian and Hijri dates are always labelled separately (ISL-005/006).

### 4. Qibla (implementer choice)
Computed in the browser from the device location (great-circle initial bearing to the Kaaba, 21.4225° N, 39.8262° E). The location never leaves the device. Without location, the UI says "Location unavailable" and shows no direction. It says that accuracy depends on the device compass.

## Consequence
Phase 09 implements `/islamic/prayer-times` (public, rate limited) and the browser Qibla utility. JAKIM zone codes are validated by format (`^[A-Z]{3}\d{2}$`); JAKIM rejects unknown zones. The frontend offers the zone codes by state. District names are to be added from JAKIM's official list, because they are not invented here.
