# UI Design

Purpose: the agreed navigation and visual language for the web frontend (`apps/web`). Design canvas: "Masyarakat UI Design" (Claude artifact).

## Navigation
- Community (mobile first): **Bulletin** (home) · Discover · Prayer · Me. Organisation profile tabs: Bulletin · Events · About.
- Workspace (web): Overview · Bulletin & events · Profile & visibility · Operations · Finance · Members & roles · Subscription · Settings.

## Rules
- Gregorian and Hijri dates are always labelled; Hijri is marked as calculated.
- Prayer times show their source and zone. Qibla says when it is approximate.
- Money: MYR, two decimals, tabular figures, right-aligned. Status is a word plus a colour, never colour alone.
- Community screens never show finance or management data.
- Touch targets at least 44 px; inputs 16 px or larger; text contrast at least 4.5:1.

## Tokens
All colours and fonts are CSS variables in `apps/web/src/styles.css`.

| Token | Value | Use |
| --- | --- | --- |
| brand | #0F5A47 | primary, active |
| brand-soft | #E4EFEA | selected, approved |
| gold | #C9973A | motif, highlight |
| gold-soft / gold-ink | #F5ECDA / #7A5310 | Hijri, pending |
| ink / muted | #10201B / #56655F | text |
| line / ground | #E3E7E2 / #F4F5F1 | borders, background |
| danger | #A13A2E | reject, overdue |

Font: Plus Jakarta Sans.
