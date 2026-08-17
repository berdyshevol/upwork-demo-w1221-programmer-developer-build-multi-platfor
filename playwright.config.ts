import { defineConfig, devices } from '@playwright/test';

// Build machines routinely have something else on 3000, so the suite gets its
// own port and never reuses a server it did not start — a foreign listener on
// the port makes every assertion fail against an app that is not this one.
const port = Number(process.env.PORT ?? 3711);
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL,
    trace: 'off',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `pnpm dev --port ${port}`,
    url: baseURL,
    reuseExistingServer: false,
    timeout: 180_000,
    // Tests must never queue a job on the author's shared key.
    env: { DEMO_LLM_URL: '' },
  },
});
