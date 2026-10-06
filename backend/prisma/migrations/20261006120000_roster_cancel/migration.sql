-- ADR-024 §5 (amended): roster entries are cancelled, never deleted.
ALTER TABLE "RosterEntry" ADD COLUMN "cancelledAt" TIMESTAMP(3);
