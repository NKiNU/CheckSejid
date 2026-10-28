// ADR-031: due requests run and expired archives are destroyed on a timer, in-process like the prayer
// time refresh (ADR-023 §2). ponytail: one instance only; use a DB lock/queue before running several.
import { destroyExpiredArchives } from "./archive.ts";
import { failInterrupted, runDueErasures } from "./executor.ts";
import { endExpired } from "../support/support.service.ts";

const HOUR_MS = 60 * 60 * 1000;

export function startErasureJobs() {
  const run = async () => {
    const now = new Date();
    await runDueErasures(now);
    await destroyExpiredArchives(now);
    await endExpired(now); // ADR-032: persists expired support grants (access is already denied at expiry by the guard)
  };
  const tick = () => void run().catch((e: unknown) => console.error("erasure: job failed", e instanceof Error ? e.name : "error"));
  void failInterrupted().catch(() => console.error("erasure: interrupted-request recovery failed")).then(tick);
  setInterval(tick, HOUR_MS).unref();
}
