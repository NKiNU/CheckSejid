import { app } from "./app.ts";
import { accessSecret } from "./modules/identity/auth.ts";
import { startPrayerTimeRefresh } from "./modules/islamic/prayer.service.ts";

accessSecret(); // fail fast on a missing or weak signing secret

// ADR-025: production never runs without the malware scanner or with public and private files in one Space.
if (process.env.NODE_ENV === "production") {
  if (!process.env.CLAMD_HOST?.trim()) throw new Error("CLAMD_HOST must be set in production (ADR-025 §2)");
  const pub = process.env.S3_PUBLIC_BUCKET?.trim();
  if (!pub || pub === process.env.S3_BUCKET?.trim()) throw new Error("S3_PUBLIC_BUCKET must be set and differ from S3_BUCKET (ADR-025 §1)");
}

const port = Number(process.env.PORT ?? 3000);

startPrayerTimeRefresh(); // ADR-023 §2: explicit in-process refresh of cached JAKIM timetables

app.listen(port, () => {
  console.log(`API listening on http://localhost:${port}`);
});
