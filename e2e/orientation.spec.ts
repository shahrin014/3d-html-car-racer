import { expect, test } from '@playwright/test';
import { gotoApp } from './helpers.ts';

test('portrait shows the rotate prompt', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await gotoApp(page);
  await expect(page.locator('#rotate')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Start race' })).toBeAttached();
});
