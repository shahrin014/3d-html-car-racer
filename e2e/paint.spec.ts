import { expect, test } from '@playwright/test';
import { expectNoIssues, gotoApp, watchPage } from './helpers.ts';

test('paint picker offers ten paints and remembers the choice', async ({
  page,
}) => {
  test.setTimeout(90_000);
  const issues = watchPage(page);
  await gotoApp(page);

  const swatches = page.locator('#paint-picker button[data-paint]');
  await expect(swatches).toHaveCount(10);
  await expect(swatches.first()).toHaveAttribute('aria-pressed', 'true');

  const names = await swatches.evaluateAll((buttons) =>
    buttons.map((button) => button.getAttribute('aria-label')),
  );
  expect(new Set(names).size).toBe(10);

  // Pick a paint the default is not, and check the pressed state moved with it.
  const violet = page.locator('#paint-picker button[data-paint="violet"]');
  await expect(violet).toHaveAttribute('aria-label', 'Violet');
  await violet.click();
  await expect(violet).toHaveAttribute('aria-pressed', 'true');
  await expect(
    page.locator('#paint-picker button[data-paint="pearl"]'),
  ).toHaveAttribute('aria-pressed', 'false');

  // It survives a reload, including the swatch state.
  await page.reload();
  await expect(
    page.locator('#paint-picker button[data-paint="violet"]'),
  ).toHaveAttribute('aria-pressed', 'true');

  // A corrupt stored id falls back to the default instead of breaking the menu.
  await page.evaluate(() =>
    window.localStorage.setItem('neon-racer.paint', 'not-a-paint'),
  );
  await page.reload();
  await expect(
    page.locator('#paint-picker button[data-paint="pearl"]'),
  ).toHaveAttribute('aria-pressed', 'true');

  expectNoIssues(issues);
});
