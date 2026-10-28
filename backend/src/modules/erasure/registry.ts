// ADR-031 §5: every tenant table (a Prisma model with an `organisationId` column), children first, so
// the Restrict foreign keys never block the delete. erasure.db.test.ts fails if a model is missing.
export const registry = [
  "FinanceAttachment",
  "FinanceApproval",
  "Income",
  "Expense",
  "Budget",
  "Collection",
  "FinancialCategory",
  "RosterEntry",
  "Task",
  "Programme",
  "Post",
  "Event",
  "Follow",
  "Notification",
  "MembershipRole",
  "OrganisationMembership",
  "AuditLog",
  "SupportAccessGrant", // Phase 13B (ADR-032)
  "Subscription",
  "RetentionSetting",
] as const;

// Tenant tables the executor keeps on purpose: the archive record outlives the organisation (ADR-031 §6).
export const survivesErasure = ["ArchiveRecord"] as const;

export const delegateOf = (model: string) => model[0]!.toLowerCase() + model.slice(1);
