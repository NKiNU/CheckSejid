# ADR-019-PUBLIC_VISIBILITY_AND_FOLLOWING

## Status
Accepted (2026-10-06) by the product owner. Closes OQ-10.

## Context
- `modules/organisation/ORGANISATION_PROFILE.md`: "Visibility: Public discoverable/viewable; Private not public; Unlisted excluded from normal discovery. Internal finance/management data is never public."
- `modules/community/COMMUNITY_AND_DISCOVERY.md`: "PUB-001: community users can discover Public organisations. MVP discovery supports keyword/name, organisation type and location filters … Following is separate from management membership."
- ADR-016 §2: only ACTIVE organisations may ever appear publicly.
- A search of `docs/` (including `product/`, `business/` and `archive/`) found no further definition of Unlisted.

Product-owner answers (2026-10-06):
- **Public**: the organisation shares information with the public (profile, upcoming events, announcements).
- **Private**: the organisation uses the application only for internal management and internal events, like a normal management system.
- **Unlisted**: no definition in the docs, so it "opens only for logged-in users who have the link".
- **Following**: Public organisations only.

## Decision

### 1. Visibility
| Visibility | Discovery (search/list) | Profile page and published hub content | Follow |
|---|---|---|---|
| `PUBLIC` | yes | anyone, including anonymous visitors | yes (logged in) |
| `UNLISTED` | never | logged-in users who have the link; anonymous → `401 LOGIN_REQUIRED` | no |
| `PRIVATE` | never | nobody outside the organisation → `404` | no |

- Every public read also requires the organisation to be `ACTIVE` (ADR-016 §2). Any other state answers `404`, the same as an unknown id.
- The "link" is the organisation's id (a random UUID v4), so it cannot be guessed. Rotating a leaked Unlisted link is not supported in MVP; switching to Private hides it.
- Default for new organisations, and the backfill for existing ones: `PRIVATE` (fail closed). The owner/admin switches it under `organisation.update` (ADR-015 §1).
- Public responses contain profile fields only (name, type, description, contacts, address, state, country, links, logo, cover). Finance, members, operations and drafts are never included (PUB-004).

### 2. Discovery (PUB-001/002)
`GET /public/orgs` lists `PUBLIC` + `ACTIVE` organisations only, filtered by keyword (name, case-insensitive), `type`, `state` and `country`, with keyset pagination (SEC-006). Near-me is out of scope (spec: "evolves with privacy-aware geospatial capability").

### 3. Following (PUB-005/006)
- A logged-in user may follow any number of `PUBLIC` + `ACTIVE` organisations. Following creates a `Follow` row (user, organisation) and nothing else: no membership, no role, no permission and no notifications (ADR-017 §1).
- Followers see exactly what the public sees. Following only adds the organisation's published posts and events to the user's own feed.
- If an organisation stops being `PUBLIC` + `ACTIVE`, existing follows are kept but hidden from the user's follow list and feed. They reappear if it becomes public again. Unfollow always works.

## Consequence
- Phase 05 adds `Organisation.visibility`, the `Follow` model, `/public/orgs*` and `/me/follows*`. Phase 06 serves published hub content through the same visibility rule (HUB-005) and adds `/me/feed`.
- New requirement ID: PUB-007 (the visibility table in §1).
