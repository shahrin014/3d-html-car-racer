import { defineConfig } from '@playwright/test';
import { E2E_BASE_URL, E2E_PORT } from './e2e/base-url.ts';

/**
 * Browser smoke tests run against the production build served by `vite
 * preview`, so they exercise the same bundles, manifest, and service worker
 * that GitHub Pages publishes. Unit tests stay in Vitest; this suite exists for
 * the parts that need a real WebGL context and a real page lifecycle.
 *
 * CI runners are memory constrained: the suite runs one test at a time, one
 * browser worker, with trace/video recording off. Chromium is capped so a
 * stray allocation fails the test instead of the runner.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI
    ? [['list'], ['html', { open: 'never' }]]
    : [['list']],
  use: {
    baseURL: E2E_BASE_URL,
    // Service workers are blocked by default so tests never race an old cache.
    // The offline spec opts back in explicitly.
    serviceWorkers: 'block',
    viewport: { width: 844, height: 390 },
    // Headless Chromium renders WebGL in software. A 1x device pixel ratio keeps
    // the suite fast enough that simulated time tracks wall-clock time.
    deviceScaleFactor: 1,
    isMobile: true,
    hasTouch: true,
    trace: 'off',
    video: 'off',
    screenshot: 'only-on-failure',
    launchOptions: {
      args: [
        // Do not map shared memory through /dev/shm, which is small in CI.
        '--disable-dev-shm-usage',
        // Keep the renderer heap bounded; the app is a small canvas game.
        '--js-flags=--max-old-space-size=256',
        '--renderer-process-limit=1',
      ],
    },
  },
  projects: [{ name: 'mobile-chromium', use: { browserName: 'chromium' } }],
  webServer: {
    // Build first so the suite always tests what would ship, including the
    // stamped service worker and the enforced gzip budget. Set E2E_SKIP_BUILD
    // when a workflow has already built dist/ and only needs to serve it.
    command: `${
      process.env.E2E_SKIP_BUILD ? '' : 'npm run build && '
    }npm run preview -- --port ${E2E_PORT} --strictPort`,
    url: E2E_BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
