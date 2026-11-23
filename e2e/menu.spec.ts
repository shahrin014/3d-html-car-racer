import { expect, test } from '@playwright/test';
import {
  expectNoIssues,
  gotoApp,
  startRace,
  watchPage,
  GAME_PATH,
} from './helpers.ts';

/**
 * Boot, menu, and first race. Split into its own file so the runner can give it
 * a fresh browser process on memory-constrained environments.
 */
test('menu boots in landscape and starts a race', async ({ page }) => {
  test.setTimeout(90_000);
  const issues = watchPage(page);
  await gotoApp(page);

  // The menu is its own full page with a live 3D car preview and no race HUD.
  await expect(page.locator('[data-overlay="menu"]')).toBeVisible();
  await expect(page.locator('#car-name')).toHaveText('Mach');
  await expect(page.locator('#car-preview canvas')).toHaveAttribute(
    'aria-label',
    'Car preview',
  );
  await expect(page.locator('#time')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Steer right' })).toHaveCount(0);

  await startRace(page);

  // The race now runs on its own page.
  await expect(page).toHaveURL(new RegExp(GAME_PATH.replace('/', '\\/') + '$'));
  await expect(page.getByRole('button', { name: 'Brake' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Drift' })).toBeVisible();
  await expect(page.locator('#lap')).toHaveText('1 / 3');
  await expect(page.locator('#speed')).not.toHaveText('0', { timeout: 10_000 });
  await expect(page.locator('#time')).not.toHaveText('00:00.0', {
    timeout: 10_000,
  });

  // Arrow keys and A/D share one steering channel, and space drifts. Holding
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
