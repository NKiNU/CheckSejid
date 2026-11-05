# ADR-033-PUBLIC_EVENTS_HOMEPAGE_AND_HUB_IMAGES

## Status
Accepted (2026-11-05) by the product owner, including the items marked ⚠ as written; those are implementer defaults to confirm. Amends ADR-020 §1 (new upload use), ADR-021 §1 (images on hub items) and ADR-025 (metadata removal for hub images). Phase 13 (growth).

## Context
- The homepage (`/`, no login) shows organisation discovery, prayer times and Qibla. Published hub content is public only on each organisation's own page (ADR-019, ADR-021 §4), and signed-in followers see it in `/me/feed`.
- Hub posts and events are text only (ADR-021 §1). Masjid programmes are usually announced with a poster.
- ADR-020 allows public images only for logo and cover (JPEG, PNG, WebP, 2 MB). ADR-025 scans every upload and defers removing image metadata until after MVP.

Product-owner answers (2026-11-05): the homepage shows upcoming events only; announcements stay on each organisation's page. Each announcement and event can have up to 5 images of up to 5 MB each. The owner of the content chooses which image is the main photo, and the main photo is the one shown on the homepage. Location and camera metadata is removed. Archiving hides images but keeps the files.

## Decision
1. **Homepage events.** The homepage shows an "Upcoming events" list to everyone, without login. It lists PUBLISHED events whose `endsAt` has not passed, from organisations that are `PUBLIC` and `ACTIVE` only. `UNLISTED` and `PRIVATE` organisations never appear, matching discovery (ADR-019). Soonest first. Each card shows the main photo (if any), title, organisation name, date and time, and location, and opens the event's full details with all its images. The existing discovery search, prayer times and Qibla stay on the page below it. The list uses bounded keyset pagination (SEC-006) and returns public fields only (PUB-004).
2. **Images on hub items.** A bulletin post or event can have 0 to 5 images. Each image is JPEG, PNG or WebP, at most 5 MB, type checked by content, and scanned before storage (ADR-020 §1–3, ADR-025). They are stored in the public Space under `public/org/{organisationId}/hub/…` with server-generated names.
3. **Main photo.** When an item has images, exactly one is the main photo. The person editing the item chooses it and can change it. ⚠ The first image uploaded becomes the main photo until another is chosen; if the main photo is removed, the earliest remaining image takes its place. The main photo is the one used on the homepage card and in lists. The order of the other images is the upload order.
4. **Who manages images.** Images follow the item's own rules (ADR-021 §3): they are added, removed and the main photo chosen with `bulletin.manage` or `event.manage`, while the item is a DRAFT. ⚠ A published item's images cannot be changed, the same as its text today.
5. **Metadata removal.** Every hub image has its metadata (EXIF, including GPS location, camera details and embedded thumbnails) removed on upload, before it is stored. The stored file is the cleaned file. This applies to hub images only; logo, cover and expense evidence stay as ADR-025 says.
6. **Visibility.** Images are shown wherever their item is shown, under ADR-021 §4. When an item is archived, or its organisation stops being `PUBLIC` + `ACTIVE`, the images disappear from every page at once. The files are kept, so republishing works. A file is deleted when its image is removed from a draft, when the item is deleted, or when the organisation is erased (ADR-031). Accepted limitation, as for logos (ADR-025): someone holding an image's direct URL can still open it until it is deleted, and a deleted file's CDN copy expires with the cache TTL.

## Consequence
- Backend: a `HubImage` model (organisation, post or event, storage key, main flag, order) in `hub.prisma`, created by one committed migration; image upload, remove and set-main routes on draft items; a public, unauthenticated upcoming-events endpoint; public post and event responses include their images.
- The erasure registry gains `HubImage`; the registry completeness test enforces it, and the executor deletes the image files with the organisation's other files.
- Metadata removal needs an image library that re-encodes or rewrites the file (to be chosen at implementation; it must not add a native build step the Droplet cannot run).
- Frontend: an "Upcoming events" section on the homepage; image upload, removal and main-photo choice in the Hub editor; an image gallery on the event and announcement details. BM/EN strings (ADR-027), 44px targets (ADR-028).
- Phones often save photos as HEIC, which is not accepted. The upload error must say which types are allowed.
- New requirement IDs: PUB-007 (homepage upcoming events) and HUB-007 (hub images and main photo).
