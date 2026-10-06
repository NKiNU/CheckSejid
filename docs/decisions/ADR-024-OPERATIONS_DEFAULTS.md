# ADR-024-OPERATIONS_DEFAULTS

## Status
Accepted (2026-10-06) by the product owner, with §5 amended: tasks and roster entries are never deleted. Closes OQ-21 for operations.

## Context
- `modules/operations/OPERATIONS.md`: "Planning: programmes/objectives/dates/status. Tasks: assignment/due date/status. Roster: flexible people/time assignments. Generic models must not hard-code Masjid-specific job titles."
- ADR-015 §1: `operations.read`, `operations.manage`; "an assignee who holds `operations.read` may change the status of a task assigned to them."
- ADR-017: `task.assigned` and `roster.assigned` notification events. ADR-018: `operations` entitlement. ADR-016 §2: module writes need ACTIVE.

The spec gives no status values and no field list.

## Decision
1. **Programme:** `title`, `objectives` (free text), `startDate`, `endDate` (calendar dates, end ≥ start), status `PLANNED | ACTIVE | COMPLETED | CANCELLED` (any change allowed under `operations.manage`).
2. **Task:** `title`, `description`, optional `programmeId` (same organisation), optional assignee (a membership of the same organisation), optional `dueDate`, status `TODO | IN_PROGRESS | DONE | CANCELLED`. `operations.manage` edits everything. The assignee may change only the status of their own task (ADR-015 rule).
3. **Roster entry:** a membership, `startsAt`/`endsAt` (UTC instants, end > start), free-text `duty` label (e.g. "Imam", "Cleaning"; never an enum, ORG-007/OPS-004), optional `notes`, optional `programmeId`.
4. **Notifications:** assigning or reassigning a task emits `task.assigned`; creating or reassigning a roster entry emits `roster.assigned` (ADR-017: all members except the actor, title without details).
5. **No deletion of tasks or roster entries** (amended 2026-10-06, so the history answers "who was on duty that night?"). A task is cancelled by setting status `CANCELLED`. A roster entry is cancelled with `POST …/roster/:id/cancel` under `operations.manage`. That sets `cancelledAt`; the entry stays listed, and a cancelled entry cannot be changed or cancelled again (`409 ROSTER_ENTRY_CANCELLED`). Programmes are deleted only if no task or roster entry references them (else `409`); otherwise they are cancelled.
6. **Guards:** reads need `operations.read` + organisation ACTIVE/SUSPENDED/ARCHIVED, with no entitlement check, so data stays readable after a plan lapses (ADR-018 §2); writes need `operations.manage` (or the assignee rule) + `operations` + ACTIVE.

## Consequence
Phase 07 implements this. If the product owner changes the status sets, only enums and validation change.
