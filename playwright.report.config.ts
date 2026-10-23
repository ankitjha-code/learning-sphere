import { defineConfig, devices } from '@playwright/test';

/**
 * Walkthrough scenarios for the HTML test report (pnpm report).
 * Runs against a production build on a fresh temporary database with demo data.
 * REPORT_PORT lets several scenario groups run side by side.
 */
const PORT = Number(process.env.REPORT_PORT ?? 4420);
process.env.REPORT_BASE = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: 'e2e/report',
  timeout: 180_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: { baseURL: `http://127.0.0.1:${PORT}`, ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
  webServer: {
    command: 'node scripts/e2e-server.mjs',
    url: `http://127.0.0.1:${PORT}/api/system/health`,
    timeout: 180_000,
    reuseExistingServer: false,
    env: { E2E_PORT: String(PORT), CODE_EXEC_DOCKER: 'auto', JOB_FEED_SYNC: 'false', E2E_LIVE_AI: 'true' },
  },
});
