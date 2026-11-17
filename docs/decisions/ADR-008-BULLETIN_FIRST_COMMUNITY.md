# ADR-008-BULLETIN_FIRST_COMMUNITY

## Status
Accepted

## Context
The community journey is discover → view public organisation → follow → consume information. Most repeat visits by community users are to read what their organisations have published. The first UI designs led with discovery, which serves a one-off need.

## Decision
The bulletin (announcements, events and classes from the Information Hub) is the primary community experience:
- The community home screen is the bulletin feed of organisations the user follows.
- A public organisation profile opens on its bulletin.
- In the management workspace, the bulletin is the first module after the overview, and the overview shows recent bulletin posts first.

Discovery, Prayer Times and the profile remain first-class but secondary navigation.

## Consequence
- `modules/information-hub/INFORMATION_HUB.md` defines the feed rules (HUB-002 to HUB-005).
- `product/UI_DESIGN.md` records the navigation order and design tokens.
- Visibility, tenancy and draft rules are unchanged: the feed only shows PUBLISHED posts that the organisation's visibility allows.
