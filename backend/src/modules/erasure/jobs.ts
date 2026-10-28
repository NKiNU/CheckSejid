// ADR-031: due requests run and expired archives are destroyed on a timer, in-process like the prayer
// time refresh (ADR-023 §2). ponytail: one instance only; use a DB lock/queue before running several.
import { destroyExpiredArchives } from "./archive.ts";
import { runDueErasures } from "./executor.ts";

const HOUR_MS = 60 * 60 * 1000;

export function startErasureJobs() {
  const run = async () => {
    const now = new Date();
    await runDueErasures(now);
    await destroyExpiredArchives(now);
  };
  const tick = () => void run().catch((e: unknown) => console.error("erasure: job failed", e instanceof Error ? e.name : "error"));
  tick();
  setInterval(tick, HOUR_MS).unref();
}
