import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    env: {
      NODE_ENV: "test",
      // Test-only signing secret; real secrets come from the environment (ADR-009).
      JWT_ACCESS_SECRET: "test-secret-test-secret-test-secret-0123456789",
    },
  },
});
