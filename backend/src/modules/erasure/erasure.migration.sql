-- Phase 13A (ADR-031). Hand-written; merged into the single Phase 13 migration at merge time, after the
-- tables Prisma generates from erasure.prisma. Safe to run once on a database that has all earlier migrations.

-- ADR-031 §1: the tenant audit trail stays append-only (FIN-015) except inside an organisation erasure,
-- whose transaction runs SET LOCAL app.erasure = 'on'. SET LOCAL ends with the transaction, so no
-- other session or later statement can delete. UPDATE stays blocked always.
CREATE OR REPLACE FUNCTION "audit_log_append_only"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' AND current_setting('app.erasure', true) = 'on' THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'AuditLog is append-only' USING ERRCODE = 'insufficient_privilege';
END;
$$;

-- ADR-031 §6 / PDPA-002: retention is 1, 3, 5 or 7 years only.
ALTER TABLE "RetentionSetting" ADD CONSTRAINT "retention_years_allowed" CHECK ("years" IN (1, 3, 5, 7));

-- One open request per subject: a second one while PENDING_GRACE or RUNNING is a unique violation (409).
CREATE UNIQUE INDEX "ErasureRequest_open_subject" ON "ErasureRequest" ("kind", "subjectId") WHERE "status" IN ('PENDING_GRACE', 'RUNNING');

-- Not changed on purpose: the Restrict foreign keys (the executor deletes children before the
-- organisation, in registry order) and the owner-is-member triggers (deferred; deleting the memberships
-- and the organisation in one transaction leaves nothing for them to reject).
