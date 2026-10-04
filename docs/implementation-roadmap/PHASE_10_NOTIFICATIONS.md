# Phase 10 — Notifications

## Objective
Implement in-app notifications.

## Business Value
Deliver a stable, testable increment.

## Required Documents
architecture/NOTIFICATION_ARCHITECTURE.md; modules/notifications/NOTIFICATIONS.md

## Implementation Requirements
Inspect existing code, identify applicable requirement IDs, apply validation/authorisation/tenant rules, and keep permissions separate from entitlements.

## Backend Work
Implement the phase domain using approved patterns.

## Frontend Work
Implement only workflows needed for acceptance criteria.

## Testing Requirements
Test success, validation failures, authorisation failures, tenant isolation where applicable, and important state transitions.

## Acceptance Criteria
Domain events produce notifications with read state.

## Definition of Done
Acceptance criteria and relevant tests pass; no known tenant isolation violation is introduced; approved documentation remains accurate.

## Explicitly Out of Scope
Push/email unless approved.
