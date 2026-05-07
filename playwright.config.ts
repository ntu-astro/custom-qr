import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright config for the Astro QR app.
 *
 * The webServer launches a production-mode Vite preview on port 4173 so the
 * E2E suite exercises the same bundle that ships, not the dev server. Tests
 * live in `./e2e`; Vitest's `include` is `src/**\/*.test.ts(x)` so there is
 * no collision between the two runners.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://localhost:4173',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'npm run build && npm run preview -- --port 4173 --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
