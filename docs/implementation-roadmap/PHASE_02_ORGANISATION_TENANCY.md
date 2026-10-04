# Phase 02 — Organisation Tenancy

## Objective
Implement organisation tenant boundary and memberships.

## Business Value
Deliver a stable, testable increment.

## Required Documents
saas/MULTI_TENANCY.md; saas/ORGANISATION_ACCOUNT_MODEL.md; architecture/TENANT_DATA_ISOLATION.md

## Implementation Requirements
Inspect existing code, identify applicable requirement IDs, apply validation/authorisation/tenant rules, and keep permissions separate from entitlements.

## Backend Work
Implement the phase domain using approved patterns.

## Frontend Work
Implement only workflows needed for acceptance criteria.

## Testing Requirements
Test success, validation failures, authorisation failures, tenant isolation where applicable, and important state transitions.

## Acceptance Criteria
Cross-tenant tests pass and tenant context is server-controlled.

## Definition of Done
Acceptance criteria and relevant tests pass; no known tenant isolation violation is introduced; approved documentation remains accurate.

## Explicitly Out of Scope
Public discovery.
