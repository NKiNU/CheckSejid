# Lifecycle State Machines

Organisation: DRAFT → ONBOARDING → ACTIVE; ACTIVE → SUSPENDED; SUSPENDED → ACTIVE (reinstate, platform administrator, with reason; approved 2026-10-05, see ADR-015 §5); ACTIVE/SUSPENDED → ARCHIVED.
Subscription: TRIAL → ACTIVE/EXPIRED; ACTIVE → PAST_DUE/CANCELLED; PAST_DUE → ACTIVE/EXPIRED.
Internal states remain independent from provider-specific events.
