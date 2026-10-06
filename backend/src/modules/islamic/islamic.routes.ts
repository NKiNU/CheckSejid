import { Router } from "express";
import { MemoryStore } from "express-rate-limit";
import { z } from "zod";
import { dateOnly } from "../../dates.ts";
import { limiter } from "../identity/identity.routes.ts";
import { JAKIM_TIMEZONE, prayerTimes } from "./prayer.service.ts";

// Public, no permission (ADR-015 §1) and no entitlement (ADR-018 §1). Keyed per IP.
export const islamicRateLimitStores = { read: new MemoryStore() };
const readLimit = limiter(300, islamicRateLimitStores.read);

const isTimeZone = (tz: string) => {
  try {
    new Intl.DateTimeFormat("en", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
};
const todayIn = (tz: string) => new Date(`${new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date())}T00:00:00.000Z`);

const query = z
  .strictObject({
    zone: z.string().regex(/^[A-Z]{3}\d{2}$/, "A JAKIM zone code such as WLY01").optional(),
    lat: z.coerce.number().min(-90).max(90).optional(),
    lng: z.coerce.number().min(-180).max(180).optional(),
    tz: z.string().max(64).refine(isTimeZone, "An IANA timezone such as Asia/Kuala_Lumpur").optional(),
    date: dateOnly.optional(),
  })
  .refine((q) => (q.lat === undefined) === (q.lng === undefined), "lat and lng go together");

export const islamicRouter = Router();

// ADR-023 §1: times for the visitor's zone or location; the location is not stored or logged.
islamicRouter.get("/islamic/prayer-times", readLimit, async (req, res) => {
  const q = query.parse(req.query);
  const date = q.date ?? todayIn(q.zone ? JAKIM_TIMEZONE : (q.tz ?? "UTC"));
  res.json({ prayerTimes: await prayerTimes({ ...q, date }) });
});
