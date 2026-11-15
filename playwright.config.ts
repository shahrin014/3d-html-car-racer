import { defineConfig } from '@playwright/test';
import { E2E_BASE_URL, E2E_PORT } from './e2e/base-url.ts';

/**
 * Browser smoke tests run against the production build served by `vite
 * preview`, so they exercise the same bundles, manifest, and service worker
 * that GitHub Pages publishes. Unit tests stay in Vitest; this suite exists for
 * the parts that need a real WebGL context and a real page lifecycle.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  ...(process.env.CI ? { workers: 2 } : {}),
  reporter: process.env.CI
    ? [['list'], ['html', { open: 'never' }]]
    : [['list']],
  use: {
    baseURL: E2E_BASE_URL,
    // Service workers are blocked by default so tests never race an old cache.
    // The offline spec opts back in explicitly.
    serviceWorkers: 'block',
    viewport: { width: 390, height: 844 },
    // Headless Chromium renders WebGL in software. A 1x device pixel ratio keeps
    // the suite fast enough that simulated time tracks wall-clock time.
    deviceScaleFactor: 1,
    isMobile: true,
    hasTouch: true,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'mobile-chromium', use: { browserName: 'chromium' } }],
  webServer: {
    // Build first so the suite always tests what would ship, including the
    // stamped service worker and the enforced gzip budget.
    command: `npm run build && npm run preview -- --port ${E2E_PORT} --strictPort`,
    url: E2E_BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
