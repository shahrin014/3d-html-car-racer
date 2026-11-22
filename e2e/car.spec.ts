import { expect, test } from '@playwright/test';
import { expectNoIssues, gotoApp, watchPage } from './helpers.ts';

test('car picker offers the catalog cars and remembers the choice', async ({
  page,
}) => {
  test.setTimeout(90_000);
  const issues = watchPage(page);
  const requested: string[] = [];
  page.on('request', (request) => requested.push(request.url()));
  await gotoApp(page);

  const options = page.locator('#car-picker button[data-car]');
  await expect(options).toHaveCount(2);
  await expect(options.first()).toHaveAttribute('aria-pressed', 'true');
  await expect(options.first()).toHaveAttribute('aria-label', 'Mach');
  await expect(page.locator('#car-picker button[data-car="gt"]')).toHaveAttribute(
    'aria-label',
    'GT',
  );

  // Switch to GT; the loaded model must not block the start button.
  const gt = page.locator('#car-picker button[data-car="gt"]');
  await gt.click();
  await expect(gt).toHaveAttribute('aria-pressed', 'true');
  // The switch must load the GT asset, not just flip the button.
  await expect
    .poll(() => requested.some((url) => url.endsWith('/models/gt.glb')), {
      timeout: 30_000,
    })
    .toBe(true);
  await expect(
    page.locator('#car-picker button[data-car="mach"]'),
  ).toHaveAttribute('aria-pressed', 'false');
  await expect(page.getByRole('button', { name: 'Start race' })).toBeEnabled();

  // It survives a reload, including the pressed state.
  await page.reload();
  await expect(
    page.locator('#car-picker button[data-car="gt"]'),
  ).toHaveAttribute('aria-pressed', 'true');

  // A corrupt stored id falls back to the default car instead of breaking the menu.
  await page.evaluate(() =>
    window.localStorage.setItem('neon-racer.car', 'not-a-car'),
  );
  await page.reload();
  await expect(
    page.locator('#car-picker button[data-car="mach"]'),
  ).toHaveAttribute('aria-pressed', 'true');

  expectNoIssues(issues);
});
