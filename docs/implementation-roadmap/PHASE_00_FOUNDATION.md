# Phase 00 — Foundation

## Objective
Create repository, environment, conventions and test baseline.

## Business Value
Deliver a stable, testable increment.

## Required Documents
README.md; CLAUDE.md; architecture/SYSTEM_ARCHITECTURE.md

## Implementation Requirements
Inspect existing code, identify applicable requirement IDs, apply validation/authorisation/tenant rules, and keep permissions separate from entitlements.

## Backend Work
Implement the phase domain using approved patterns.

## Frontend Work
Implement only workflows needed for acceptance criteria.

## Testing Requirements
Test success, validation failures, authorisation failures, tenant isolation where applicable, and important state transitions.

## Acceptance Criteria
Project runs locally; secrets are not committed; test/lint commands exist.

## Definition of Done
Acceptance criteria and relevant tests pass; no known tenant isolation violation is introduced; approved documentation remains accurate.

## Explicitly Out of Scope
Business modules.
