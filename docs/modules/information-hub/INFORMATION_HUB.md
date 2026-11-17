# Information Hub

Includes announcements/bulletin posts and events (including classes). Content lifecycle: DRAFT → PUBLISHED → ARCHIVED. Only authorised users manage tenant content; drafts are not public; publication respects organisation visibility.

The bulletin is the primary community experience (ADR-008).

## Rules
- **HUB-001:** only users with `bulletin.publish` (posts) or `event.manage` (events/classes) may create, publish or archive. Transitions other than DRAFT → PUBLISHED and PUBLISHED → ARCHIVED are rejected.
- **HUB-002:** the community home feed shows PUBLISHED posts from organisations the user follows, newest first.
- **HUB-003:** a feed never shows DRAFT or ARCHIVED posts, or posts of a Private organisation. Unlisted organisations appear only to users who already follow them or open their link.
- **HUB-004:** an organisation may pin at most one published post. The newest pinned post among followed organisations is shown first as the feature of the home feed.
- **HUB-005:** events and classes show the Gregorian date with the Hijri date clearly labelled (see `islamic-features/HIJRI_CALENDAR.md`).

## Out of scope
Comments, reactions and other social features.
