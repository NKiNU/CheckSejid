import { defineConfig, devices } from '@playwright/test'

// E2E against an isolated stack (own database): API on :3190, `API_URL=http://localhost:3190 vite --port 5174`.
// Specs share one database and build on each other, so they run in file order with one worker.
export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.e2e.ts',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  outputDir: './e2e/results',
  use: { baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:5174', trace: 'off' },
  // Mobile-first (ADR-028): the whole suite runs at phone width.
  projects: [{ name: 'mobile', use: { ...devices['Pixel 7'], browserName: 'chromium' } }],
})
