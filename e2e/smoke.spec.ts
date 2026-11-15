import { expect, test, type Page } from '@playwright/test';
import { E2E_BASE_URL } from './base-url.ts';

/**
 * Browser smoke tests for the circuit racer: boot, race start, HUD, cameras,
 * pause, persistence, orientation, and offline startup.
 */

interface PageIssues {
  consoleErrors: string[];
  pageErrors: string[];
  foreignRequests: string[];
}

function watchPage(page: Page): PageIssues {
  const issues: PageIssues = {
    consoleErrors: [],
    pageErrors: [],
    foreignRequests: [],
  };
  page.on('console', (message) => {
    if (message.type() === 'error') {
      issues.consoleErrors.push(message.text());
    }
  });
  page.on('pageerror', (error) => {
    issues.pageErrors.push(error.message);
  });
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.origin !== new URL(E2E_BASE_URL).origin) {
      issues.foreignRequests.push(url.href);
    }
  });
  return issues;
}

function expectNoIssues(issues: PageIssues): void {
  expect(issues.pageErrors, 'uncaught page errors').toEqual([]);
  expect(issues.consoleErrors, 'console errors').toEqual([]);
  expect(issues.foreignRequests, 'third-party requests').toEqual([]);
}

async function startRace(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Start race' }).click();
  await expect(page.locator('body')).toHaveAttribute('data-screen', 'racing', {
    timeout: 10_000,
  });
}

test('menu boots in landscape and starts a race', async ({ page }) => {
  test.setTimeout(90_000);
  const issues = watchPage(page);
  await page.goto('/');

  await expect(page.locator('[data-overlay="menu"]')).toBeVisible();
  await expect(page.locator('#time')).toHaveText('--:--.-');
  await expect(page.locator('#lap')).toHaveText('1 / 3');
  await expect(page.locator('#app canvas')).toHaveAttribute(
    'aria-label',
    '3D race circuit',
  );

  await startRace(page);
  await expect(page.locator('#speed')).not.toHaveText('0', {
    timeout: 10_000,
  });
  await expect(page.locator('#time')).not.toHaveText('00:00.0', {
    timeout: 10_000,
  });

  expectNoIssues(issues);
});

test('camera toggle and pause keep the race state', async ({ page }) => {
  test.setTimeout(90_000);
  const issues = watchPage(page);
  await page.goto('/');
  await startRace(page);

  await expect(page.locator('#camera')).toHaveAttribute(
    'aria-label',
    'Switch camera',
  );
  await page.locator('#camera').click({ force: true });
  await expect(page.locator('#camera')).toHaveAttribute(
    'aria-label',
    'Switch to chase camera',
  );

  await page.locator('#pause').click({ force: true });
  await expect(page.locator('body')).toHaveAttribute('data-screen', 'paused');
  const frozen = (await page.locator('#time').textContent()) ?? '';
  await page.waitForTimeout(700);
  await expect(page.locator('#time')).toHaveText(frozen);
  await page.getByRole('button', { name: 'Resume' }).click();
  await expect(page.locator('body')).toHaveAttribute('data-screen', 'racing');
  await expect(page.locator('#time')).not.toHaveText(frozen, {
    timeout: 10_000,
  });

  expectNoIssues(issues);
});

test('best time is restored from storage and corrupt values are ignored', async ({
  page,
}) => {
  test.setTimeout(90_000);
  const seed = new Date().toISOString().slice(0, 10);
  const key = `neon-racer.best-time.${seed}.1`;

  await page.goto('/');
  await page.evaluate(
    ({ storageKey, value }) => window.localStorage.setItem(storageKey, value),
    { storageKey: key, value: '81.4' },
  );
  await page.reload();
  await expect(page.locator('#best')).toHaveText('01:21.4');
  await expect(page.locator('#menu-best')).toHaveText('01:21.4');

  await page.evaluate(
    ({ storageKey }) => window.localStorage.setItem(storageKey, 'not-a-time'),
    { storageKey: key },
  );
  await page.reload();
  await expect(page.locator('#best')).toHaveText('--:--.-');
});

test('portrait shows the rotate prompt', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.locator('#rotate')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Start race' })).toBeAttached();
});

test.describe('offline', () => {
  test.use({ serviceWorkers: 'allow' });

  test('reloads from cache after one online visit', async ({ page, context }) => {
    await page.goto('/');
    await page.evaluate(async () => {
      const registration = await navigator.serviceWorker.ready;
      if (!registration.active) {
        throw new Error('service worker did not activate');
      }
    });

    await expect
      .poll(
        async () =>
          page.evaluate(async () => {
            const keys = await caches.keys();
            let entries = 0;
            for (const key of keys) {
              const cache = await caches.open(key);
              entries += (await cache.keys()).length;
            }
            return entries;
          }),
        { timeout: 20_000 },
      )
      .toBeGreaterThanOrEqual(7);

    await context.setOffline(true);
    await page.reload();
    await expect(page.locator('[data-overlay="menu"]')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Start race' })).toBeEnabled();
  });
});
