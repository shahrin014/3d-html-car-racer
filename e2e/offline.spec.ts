import { expect, test } from '@playwright/test';
import { gotoApp } from './helpers.ts';

test.describe('offline', () => {
  test.use({ serviceWorkers: 'allow' });

  test('reloads from cache after one online visit', async ({ page, context }) => {
    test.setTimeout(90_000);
    await gotoApp(page);
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
