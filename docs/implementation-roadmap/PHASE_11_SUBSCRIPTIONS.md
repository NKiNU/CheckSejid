# Phase 11 — Subscriptions

## Objective
Implement plans, trials and entitlement enforcement.

## Business Value
Deliver a stable, testable increment.

## Required Documents
business/SUBSCRIPTION_PLANS.md; saas/SUBSCRIPTION_AND_BILLING.md; saas/FEATURE_ENTITLEMENTS.md

## Implementation Requirements
Inspect existing code, identify applicable requirement IDs, apply validation/authorisation/tenant rules, and keep permissions separate from entitlements.

## Backend Work
Implement the phase domain using approved patterns.

## Frontend Work
Implement only workflows needed for acceptance criteria.

## Testing Requirements
Test success, validation failures, authorisation failures, tenant isolation where applicable, and important state transitions.

## Acceptance Criteria
Centralised gating and 30-day trial work.

## Definition of Done
Acceptance criteria and relevant tests pass; no known tenant isolation violation is introduced; approved documentation remains accurate.

## Explicitly Out of Scope
Hard-coded plan checks.
