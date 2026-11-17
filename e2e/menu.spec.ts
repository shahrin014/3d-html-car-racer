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

  // Arrow keys and A/D share one steering channel, and space brakes. Holding
  // them must not throw inside the key handler or drop out of the race.
  for (const key of ['ArrowRight', 'ArrowLeft', 'KeyD', 'KeyA']) {
    await page.keyboard.down(key);
    await page.waitForTimeout(200);
    await page.keyboard.up(key);
  }
  await page.keyboard.down('Space');
  await page.waitForTimeout(300);
  await page.keyboard.up('Space');
  await expect(page.locator('body')).toHaveAttribute('data-screen', 'racing');
  await expect(page.locator('#speed')).not.toHaveText('0');

  expectNoIssues(issues);
});
