// Calendar dates (Postgres DATE) travel as "YYYY-MM-DD" strings; instants as ISO 8601 UTC (LOC-003).
import { z } from "zod";

// Validates a real calendar date (rejects 2026-02-30) and maps it to UTC midnight for a DATE column.
export const dateOnly = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Expected a date as YYYY-MM-DD")
  .transform((s, ctx) => {
    const d = new Date(`${s}T00:00:00.000Z`);
    if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== s) {
      ctx.addIssue({ code: "custom", message: "Not a valid calendar date" });
      return z.NEVER;
    }
    return d;
  });

export const ymd = (d: Date) => d.toISOString().slice(0, 10);
export const ymdOrNull = (d: Date | null) => (d ? ymd(d) : null);
