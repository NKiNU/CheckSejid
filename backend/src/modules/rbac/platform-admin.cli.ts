// Out-of-band Platform Administrator management (ADR-015 §5). Run on the server:
//   npm run platform-admin -- grant user@example.com "reason"
//   npm run platform-admin -- revoke user@example.com "reason"
import { prisma } from "../../db.ts";
import { setPlatformAdmin } from "./platform-admin.ts";

const [cmd, email, reason] = process.argv.slice(2);
if ((cmd !== "grant" && cmd !== "revoke") || !email) {
  console.error("usage: platform-admin grant|revoke <email> [reason]");
  process.exit(2);
}
try {
  const user = await setPlatformAdmin(email, cmd === "grant", reason);
  console.log(`${user.email}: isPlatformAdmin=${user.isPlatformAdmin}`);
} catch (e) {
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
