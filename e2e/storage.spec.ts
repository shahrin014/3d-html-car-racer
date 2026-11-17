import { expect, test } from '@playwright/test';
import { gotoApp } from './helpers.ts';

test('best time is restored from storage and corrupt values are ignored', async ({
  page,
}) => {
  test.setTimeout(90_000);
  // Best times are per level, because the circuit is reseeded on every load.
  const key = 'neon-racer.best-time.1';

  await gotoApp(page);
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
