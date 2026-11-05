# Public Events Homepage and Hub Images — Implementation Plan

**Spec:** ADR-033 (Accepted 2026-11-05; the two ⚠ defaults confirmed by "execute"), ADR-020, ADR-021, ADR-025, ADR-019, ADR-031 §5, ADR-027, ADR-028. Requirement IDs: **PUB-007**, **HUB-007**. Also keeps PUB-004, HUB-004/005, SEC-006, SEC-007, TENANT-*, LOC-001.

**Branch:** `claude/fervent-bell-r7nek8` (from `feature/phase-13-growth`).

**Style:** ponytail — the least code that works, reuse existing patterns (`uploads.ts`, `storage.ts`, the logo/cover routes, `hub.service.ts`), no speculative options.

## Shared API contract (both agents build to this)

`HubImage` JSON: `{ id: string, url: string, isMain: boolean }`. Arrays are in upload order (`createdAt`, then `id`). When an item has images, exactly one has `isMain: true`.

| Route | Auth | Body | Result |
|---|---|---|---|
| `POST /orgs/:orgId/hub/posts/:id/images` and `/hub/events/:id/images` | `bulletin.manage` / `event.manage`, ACTIVE org, item is DRAFT | raw image bytes (like logo upload) | `201 { image }` |
| `DELETE /orgs/:orgId/hub/{posts,events}/:id/images/:imageId` | same | — | `204` |
| `POST /orgs/:orgId/hub/{posts,events}/:id/images/:imageId/main` | same | — | `200 { images }` |
| `GET /public/events/upcoming?cursor=&limit=` | none (optional auth ignored) | — | `200 { events: UpcomingEvent[], nextCursor: string \| null }` |

- Errors: not a DRAFT → `409 INVALID_STATE_TRANSITION` (existing helper); 6th image → `409 TOO_MANY_IMAGES`; wrong type → `415 UNSUPPORTED_FILE_TYPE`; over 5 MB → `413 FILE_TOO_LARGE`; unknown image → `404 IMAGE_NOT_FOUND`.
- Every existing post/event response (tenant list/get, `/public/orgs/:orgId/posts|events`, `/me/feed`) gains `images: HubImage[]`.
- `UpcomingEvent` = `{ id, title, description, startsAt, endsAt, location, images, organisation: { id, name, type, state } }`. Only PUBLISHED events with `endsAt >= now` from organisations with `visibility = PUBLIC` and `status = ACTIVE`. Ordered `startsAt asc, id asc`; keyset cursor = event id; `limit` 1–50, default 20.

## Task A — backend (agent, Sonnet)

Owns `backend/` only. Never edits `frontend/` or `docs/`.

1. `backend/prisma/schema/hub.prisma`: model `HubImage` (`id`, `organisationId` + Restrict FK like Post, `postId?`, `eventId?` with FKs, `objectKey`, `isMain`, `createdAt`; index per parent). **No migration file**: apply the schema to your own test DB with `npx prisma db push`; the main session writes the migration at merge.
2. Metadata removal: a small pure function `stripImageMetadata(bytes, type)` (prefer no new dependency: drop JPEG APP1/APP13 segments, PNG `eXIf`/`tEXt`/`iTXt`/`zTXt` chunks, WebP `EXIF`/`XMP ` chunks and their VP8X flags). Unit tests with fixtures that carry GPS data prove it is gone and the image still decodes (header intact).
3. Upload/remove/set-main service + routes, built like the logo/cover routes: guards first, then `rawUpload(5 * MB)`, `checkUpload(IMAGE_TYPES)`, strip, `putObject` (scans) under `public/org/{organisationId}/hub/{uuid}`. First image is main; removing the main promotes the earliest remaining. Audited like other hub writes. Deleting a draft item deletes its images and files.
4. Add `images` to every post/event response listed above (one query per list, no N+1).
5. `GET /public/events/upcoming` in the public module, with the existing anonymous read rate limit.
6. Erasure: add `HubImage` to `registry.ts` before `Post`/`Event`; executor includes its object keys in the files deleted after commit.
7. Tests (`hub.db.test.ts`, `public.db.test.ts`, unit test for stripping): upload/limit 5/type/size; non-manager 403; other tenant 404; not DRAFT 409; main rules; draft delete removes files; public upcoming excludes DRAFT, ARCHIVED, past, UNLISTED, PRIVATE, SUSPENDED orgs and shows images; tenant B cannot touch A's images; registry completeness still passes.
8. Run the whole backend suite with `DATABASE_URL` set and confirm DB tests ran, not skipped. Typecheck and lint.

## Task B — frontend (agent, Sonnet)

Owns `frontend/` only. Builds against the contract; mocks `fetch` in tests.

1. API: `features/hub/api.ts` types gain `images`; `uploadHubImage`, `removeHubImage`, `setMainHubImage`; `features/public/api.ts` gains `upcomingEvents(cursor?)`. `HUB_IMAGE_MAX_BYTES = 5 MB`, max 5.
2. Homepage (`/`, no login): an **Upcoming events** section above discovery. Card: main photo (16:9, `object-cover`, lazy), title, organisation name, date/time in the org context timezone (existing formatting helpers), location. Tapping opens the event details with all images (simple swipeable/scroll-snap gallery, no library) and a link to the organisation page. Empty state text when there are none. "Load more" with the cursor.
3. Hub editor (`HubPanel`): on DRAFT posts and events, an image manager — file input (`accept` JPEG/PNG/WebP), client-side checks (type, 5 MB, max 5) with clear messages incl. "HEIC is not supported", thumbnails, "Main photo" badge, "Set as main", "Remove". Published/archived items show images read-only.
4. Public org page, feed and hub lists show the main photo; details show all images.
5. BM and EN strings for everything (`i18n.test.ts` parity must pass). Mobile-first, 44px targets, visible focus, `alt` text from the item title (ADR-028).
6. Tests for the api helpers and the client-side validation; `npm run build`, lint and all frontend tests pass.

## Merge and verification (main session, Opus)

1. Merge A then B onto the branch. Write the single migration (`prisma migrate diff` from the current migrations to the schema), `migrate deploy` on a fresh DB, run both full suites, confirm DB tests ran.
2. Review: tenant isolation of image routes, public endpoint leaks nothing internal (PUB-004), metadata stripping, erasure covers images.
3. Run the app, seed events with images, screenshot the homepage and editor (mobile), update the UI gallery.
4. Update `REQUIREMENTS_TRACEABILITY.md` (PUB-007, HUB-007 tests). Commit and push.
