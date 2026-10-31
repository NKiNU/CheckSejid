# ADR-029-DATA_RETENTION_AND_ERASURE

## Status
Accepted (2026-10-26) by the product owner, including the items marked ⚠ as written. Closes OQ-15. Supersedes ADR-026 §6 (manual-only handling) when built.

## Context
PDPA gives people the right to have personal data deleted. Organisations may still need to keep records (finance, audit). MVP keeps everything and handles requests by hand (ADR-026 §6).

## Decision (product owner, 2026-10-26)
1. **Erasure is the default.** A deletion request (user or organisation) permanently deletes the data. It is not kept "just in case".
2. **Retention is opt-in, by the owner.** If an organisation owner chooses a retention period, the data is not deleted at the end of the request. It is archived into an unreadable form (encrypted archive) and destroyed when the period ends.
3. **Unreadable means encrypted.** The archive is encrypted and cannot be opened by normal platform operation, support, or the app. Opening it needs a separate, audited, owner-consented process (ADR-030).
4. ⚠ **Retention period:** the owner picks from fixed choices (proposed: 1, 3, 5, 7 years), maximum 7 years. No "indefinite".
5. ⚠ **Keys:** one archive key per organisation, held outside the application database (platform secret store). Destroying the key at expiry counts as destruction.
6. ⚠ **Scope:** an organisation deletion removes all its data (finance, hub, operations, files). A user deletion removes the account and personal fields. Where the user's name sits on organisation records that the owner is retaining, those records move to the archive; where not retained, the records are deleted or the user reference is blanked.
7. **Record of the request:** the request, who approved it and the date are logged (without the deleted data).

## Consequence
- Needs: erasure job, archive/encrypt step, key handling, a retention setting on the organisation, and a runbook update.
- The ARCHIVED-organisation owner assumption in ADR-016 can be revisited once erasure exists.
- ⚠ Backups hold deleted data for up to 7 days (ADR-026, 7-day retention). Accept and document, or purge backups.
- ⚠ Legal review of the retention maximum and the backup window before launch.
