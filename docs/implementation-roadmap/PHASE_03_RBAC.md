# Phase 03 — Rbac

## Objective
Implement roles and permissions separately from subscriptions.

## Business Value
Deliver a stable, testable increment.

## Required Documents
architecture/ROLE_PERMISSION_MATRIX.md; saas/FEATURE_ENTITLEMENTS.md

## Implementation Requirements
Inspect existing code, identify applicable requirement IDs, apply validation/authorisation/tenant rules, and keep permissions separate from entitlements.

## Backend Work
Implement the phase domain using approved patterns.

## Frontend Work
Implement only workflows needed for acceptance criteria.

## Testing Requirements
Test success, validation failures, authorisation failures, tenant isolation where applicable, and important state transitions.

## Acceptance Criteria
Sensitive actions are denied without permission.

## Definition of Done
Acceptance criteria and relevant tests pass; no known tenant isolation violation is introduced; approved documentation remains accurate.

## Explicitly Out of Scope
Complex workflow engine.
