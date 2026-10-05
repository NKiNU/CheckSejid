# ADR-017-NOTIFICATION_RECIPIENTS

## Status
Accepted (2026-10-05) by the product owner. Closes OQ-11.

## Context
- `architecture/NOTIFICATION_ARCHITECTURE.md`: "notifications originate from domain events. MVP channel: in-app … Events include task assignment, roster assignment, finance approval requirement, event publication and subscription changes. Notification failure must not silently corrupt the originating transaction."
- `modules/notifications/NOTIFICATIONS.md`: "MVP focuses on in-app notification records and read/unread state."
- ADR-015 §1: notifications need no permission key. Each user reads and marks only their own.
- OQ-11 asked who receives each event and whether community users receive notifications.

## Decision
1. **Recipients.** MVP notifications go only to management members, meaning users with an `OrganisationMembership`. Community users (followers) receive none. Every member of the organisation receives every event, except the actor who caused it.
2. **Minimal content.** Because every member receives every event, a notification stores only `type`, a short non-sensitive `title`, and `targetType`/`targetId`. It never holds amounts, finance details or other content that needs a permission to view. Opening the target goes through the normal permission-checked endpoint.
3. **Delivery.** `notify(tx, event)` writes the notification rows inside the originating transaction. If it fails, the whole action fails with an error, so nothing is half-written and nothing fails silently (NOTIF-005). In-app is the only channel (NOTIF-002).
4. **Read state.** Each notification has `readAt` (NOTIF-003). A user may mark only their own notifications read.
5. **Isolation.** The inbox shows only notifications from organisations the user still belongs to. Rows from organisations the user has left or been removed from are hidden, not deleted.
6. **First real event.** Phase 10 wires `member.added`, sent when a member is added to an organisation. The spec events (task and roster assignment, finance approval required, event published, subscription changed) are emitted by Phases 06, 07, 08 and 11 through the same `notify()` contract.

## Consequence
Phase 10 builds the `Notification` model, `notify()`, the inbox and mark-read API, and a minimal UI. A per-event recipient narrowing (e.g. finance approval to approvers only) can replace rule 1 later by amending this ADR. No call sites change.
