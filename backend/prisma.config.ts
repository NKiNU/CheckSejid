import { defineConfig } from "prisma/config";

try {
  process.loadEnvFile();
} catch {
  // no .env (e.g. CI) — rely on real environment variables
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  datasource: { url: process.env["DATABASE_URL"] },
});
