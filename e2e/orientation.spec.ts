import { expect, test } from '@playwright/test';

test('portrait shows the rotate prompt', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.locator('#rotate')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Start race' })).toBeAttached();
});
