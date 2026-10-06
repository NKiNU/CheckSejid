# ADR-021-INFORMATION_HUB

## Status
Accepted (2026-10-06) by the product owner. Closes OQ-17. Approves one spec extension: ARCHIVED → PUBLISHED (republish), recorded in `modules/information-hub/INFORMATION_HUB.md`.

## Context
- `modules/information-hub/INFORMATION_HUB.md`: "Includes announcements/bulletin posts and events. Content lifecycle: DRAFT → PUBLISHED → ARCHIVED. Only authorised users manage tenant content; drafts are not public; publication respects organisation visibility."
- `product/LEGACY_FEATURE_DISPOSITION.md` lists "events/classes"; the hub spec has no "classes".
- ADR-015 §1: `bulletin.manage`/`event.manage` create, edit and delete DRAFTs; `bulletin.publish`/`event.publish` publish and archive.
- ADR-017: `event.published` is a notification event. ADR-019: visibility rules.

Product-owner answer (2026-10-06): basic event fields; archived content can be republished.

## Decision
1. **Content types.** Bulletin posts (`title`, `body`) and events (`title`, `description`, `startsAt`, `endsAt`, optional free-text `location`). A class is an event; there is no separate type or recurrence.
2. **Times.** `startsAt`/`endsAt` are UTC instants (LOC-003), `endsAt` ≥ `startsAt`, rendered in the organisation's context timezone (default Asia/Kuala_Lumpur).
3. **Lifecycle.** DRAFT → PUBLISHED → ARCHIVED, plus ARCHIVED → PUBLISHED (republish). Publish, archive and republish use the `*.publish` key. Only DRAFTs are edited or deleted (`*.manage`). Other transitions return `409 INVALID_STATE_TRANSITION`. `publishedAt` records the latest publication.
4. **Who sees what.** Members holding `organisation.read` see PUBLISHED and ARCHIVED items. Drafts are visible only to holders of the matching `*.manage` key. The public (ADR-019) sees PUBLISHED items only, and only for `PUBLIC` organisations (anyone) or `UNLISTED` ones (logged-in users with the link). Private organisations' content is internal only (HUB-005).
5. **Notifications.** Publishing or republishing an event emits `event.published` to members (ADR-017), title without content details.
6. **Lifecycle guard.** Hub writes require an ACTIVE organisation. Hub reads are allowed while ACTIVE, SUSPENDED or ARCHIVED (ADR-016 §2). No entitlement gate (ADR-018 §1).

## Consequence
Phase 06 implements this. New requirement ID: HUB-006 (republish and event fields).
