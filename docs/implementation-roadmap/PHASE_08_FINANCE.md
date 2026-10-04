# Phase 08 — Finance

## Objective
Implement finance, governance, approvals and audit.

## Business Value
Deliver a stable, testable increment.

## Required Documents
finance/FINANCIAL_OVERVIEW.md; finance/MONEY_AND_AMOUNT_RULES.md; finance/FINANCIAL_STATE_MACHINE.md; finance/FINANCIAL_APPROVALS.md; finance/FINANCIAL_AUDIT_LOGS.md

## Implementation Requirements
Inspect existing code, identify applicable requirement IDs, apply validation/authorisation/tenant rules, and keep permissions separate from entitlements.

## Backend Work
Implement the phase domain using approved patterns.

## Frontend Work
Implement only workflows needed for acceptance criteria.

## Testing Requirements
Test success, validation failures, authorisation failures, tenant isolation where applicable, and important state transitions.

## Acceptance Criteria
Money, tenant, transition and audit tests pass.

## Definition of Done
Acceptance criteria and relevant tests pass; no known tenant isolation violation is introduced; approved documentation remains accurate.

## Explicitly Out of Scope
Online donations.
