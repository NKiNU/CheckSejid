import { app } from "./app.ts";
import { accessSecret } from "./modules/identity/auth.ts";
import { startPrayerTimeRefresh } from "./modules/islamic/prayer.service.ts";

accessSecret(); // fail fast on a missing or weak signing secret

const port = Number(process.env.PORT ?? 3000);

startPrayerTimeRefresh(); // ADR-023 §2: explicit in-process refresh of cached JAKIM timetables

app.listen(port, () => {
  console.log(`API listening on http://localhost:${port}`);
});
