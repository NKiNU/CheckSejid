# ADR-012-PRAYER_TIME_PROVIDER

## Status
Accepted (2026-10-05) by the product owner, with the recommended option.

## Context
Spec lines that drive this decision:
- `modules/islamic-features/PRAYER_TIMES.md`: "Use a documented source/provider strategy with location context, provenance and timezone awareness. Do not hard-code times. External data refresh/caching must be explicit when applicable."
- `implementation-roadmap/PHASE_09_ISLAMIC_FEATURES.md`, out of scope: "Claims of universal religious authority."
- `modules/islamic-features/ISLAMIC_FEATURES_OVERVIEW.md`: features are modular and must not force generic organisation modules to become Masjid-only.
- `architecture/LOCALISATION_AND_TIMEZONE.md`: default context Asia/Kuala_Lumpur; store timestamps in UTC and render in context.
- `architecture/SYSTEM_ARCHITECTURE.md`: no Redis/queues unless measurable requirements justify them.

The initial market is Malaysia (default timezone and currency), where JAKIM publishes official zone-based prayer timetables (e-Solat). Organisations outside Malaysia are not excluded by any spec.

## Options

### A. JAKIM e-Solat only
Fetch the timetable for the organisation's JAKIM zone (e.g. `WLY01`) from the public e-Solat endpoint.
- Pro: matches what Malaysian mosques and communities actually follow; strong provenance ("JAKIM e-Solat, zone WLY01").
- Con: Malaysia only; the endpoint is a public web endpoint, not a versioned API with published terms or an SLA; organisations must pick a zone.

### B. Local calculation library only (e.g. `adhan` for JS)
Compute times from latitude/longitude with a configured calculation method (e.g. a JAKIM-like method: Fajr 20°, Isha 18°).
- Pro: no external dependency, works anywhere, deterministic and easy to test.
- Con: may differ by a minute or two from the official JAKIM timetable, which users will notice and report as "wrong"; the method choice is itself a religious-authority choice that has to be shown to users.

### C. Hybrid: JAKIM for Malaysian zones, labelled calculation elsewhere (recommended)
Malaysian organisations select a JAKIM zone; the backend fetches that zone's timetable (by year or month) and caches it in PostgreSQL. Organisations without a zone, or outside Malaysia, get times calculated locally with an explicit, displayed method.
- Pro: official source where it exists, still works elsewhere; every displayed time carries provenance.
- Con: two code paths; still depends on an endpoint without published terms.

### D. Third-party global API (e.g. Aladhan)
- Pro: little code, global coverage.
- Con: an external dependency with no Malaysian authority; offers nothing over B except less code, and adds an outage risk.

## Decision
Option C.
- A prayer-time source is global reference data, not tenant data. Cached timetables are keyed by `(source, zone or rounded coordinates, date)` and shared across tenants. Organisations store only their location context (JAKIM zone and/or coordinates, plus timezone).
- Refresh is explicit: a scheduled job (in-process cron, no queue) fetches the timetable well ahead of use, for example the next month or year per zone in use. On fetch failure the system keeps serving cached data and logs the failure. If no cached data exists for a date, it falls back to calculation, labelled as calculated.
- Every API response and UI rendering states its provenance: source (JAKIM e-Solat zone X, or "calculated, method Y"), the location it applies to, and the timezone. No copy claims universal or authoritative correctness.
- Times are stored as UTC instants and rendered in the organisation's timezone (LOCALISATION_AND_TIMEZONE).

Lean alternative if the user prefers: ship Option A only in MVP (Malaysia-only, with the zone required), and add calculation later. The provenance and caching rules above apply unchanged.

## Amendment (2026-10-06)
ADR-023: prayer times follow the visitor's location (zone or browser location, never stored), not the organisation's; the e-Solat terms are confirmed by the product owner. Hijri and Qibla are decided there.

## Consequence
- Phase 09 implements a provider interface with two implementations (JAKIM and calculation). This is the one place in the codebase where a second implementation is required on day one.
- Before Phase 09 starts, someone must confirm the terms of use and stability of the e-Solat endpoint. If use is not permitted, fall back to Option B with a JAKIM-like method and say so in the UI.
- The scope of this ADR is prayer times only. The Hijri date source (`HIJRI_CALENDAR.md`) and the Qibla computation (`QIBLA.md`) are not decided here.
- Open question: whether prayer times are shown for the organisation's location only or also for the viewer's location. The specs do not say.
