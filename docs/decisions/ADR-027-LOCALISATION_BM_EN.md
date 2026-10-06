# ADR-027-LOCALISATION_BM_EN

## Status
Accepted (2026-10-06) by the product owner. Closes OQ-12 and assigns LOC-001 to Phase 12.

## Context
- `architecture/LOCALISATION_AND_TIMEZONE.md`: "MVP: Bahasa Melayu and English. Default context: Asia/Kuala_Lumpur and MYR."
- No phase owned LOC-001, so the UI built in Phases 00–11 is English only. The product owner chose to build BM/EN in Phase 12, before launch.

## Decision
1. **No library.** The frontend has one dictionary file per language (`ms`, `en`), with the same keys. A `t(key)` function returns the text, and a small React context holds the current language. A test fails if the two dictionaries' keys differ.
2. **Default language** follows the browser: Bahasa Melayu if the browser prefers `ms`, otherwise English. A BM/EN switch is always visible. The choice is saved in the browser (`localStorage`).
3. **What is translated:** all fixed UI text (labels, buttons, headings, messages, status names) and the messages for known API error codes. Content entered by users (organisation names, posts, duties) is never translated. An unknown API error shows the server's message.
4. **Dates and numbers** use `Intl` with the current language (`ms-MY` or `en-MY`), in Asia/Kuala_Lumpur time (LOC-002/003). Money is shown as MYR. Hijri and Gregorian dates stay clearly labelled in both languages (ISL-005/006).
5. **Malay text** is drafted by the implementer and reviewed by the product owner before launch.
6. **Future phases** add every new UI string to both dictionaries; the key-parity test enforces it.

## Consequence
Phase 12 adds `frontend/src/i18n/` (dictionaries, `t`, provider, language switch) and moves the existing screens' text into it. The API is unchanged (codes plus English messages).
