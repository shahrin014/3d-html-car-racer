import { expect, test } from '@playwright/test';
import { expectNoIssues, gotoApp, startRace, watchPage } from './helpers.ts';

/**
 * Boot, menu, and first race. Split into its own file so the runner can give it
 * a fresh browser process on memory-constrained environments.
 */
test('menu boots in landscape and starts a race', async ({ page }) => {
  test.setTimeout(90_000);
  const issues = watchPage(page);
  await gotoApp(page);

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
