import { expect, test } from '@playwright/test';
import { gotoApp } from './helpers.ts';

test('portrait only blocks the race, not the menu or preview', async ({
  page,
}) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 390, height: 844 });

  await gotoApp(page);
  await expect(page.locator('#rotate')).toBeHidden();
  await expect(page.getByRole('button', { name: 'Start race' })).toBeAttached();

  await page.goto('/track.html?seed=orientation-preview');
  await expect(page.locator('#rotate')).toBeHidden();

  await gotoApp(page);
  await expect(page.getByRole('button', { name: 'Start race' })).toBeEnabled({
    timeout: 30_000,
  });
  await page.getByRole('button', { name: 'Start race' }).click();
  await page.waitForURL(/game\.html$/);
  await expect(page.locator('#rotate')).toBeVisible();
});
