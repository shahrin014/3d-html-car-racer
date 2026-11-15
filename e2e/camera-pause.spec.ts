import { expect, test } from '@playwright/test';
import { expectNoIssues, gotoApp, startRace, watchPage } from './helpers.ts';

test('camera toggle and pause keep the race state', async ({ page }) => {
  test.setTimeout(90_000);
  const issues = watchPage(page);
  await gotoApp(page);
  await startRace(page);

  await expect(page.locator('#camera')).toHaveAttribute(
    'aria-label',
    'Switch camera',
  );
  await page.locator('#camera').click({ force: true });
  await expect(page.locator('#camera')).toHaveAttribute(
    'aria-label',
    'Switch to chase camera',
  );

  await page.locator('#pause').click({ force: true });
  await expect(page.locator('body')).toHaveAttribute('data-screen', 'paused');
  const frozen = (await page.locator('#time').textContent()) ?? '';
  await page.waitForTimeout(700);
  await expect(page.locator('#time')).toHaveText(frozen);
  await page.getByRole('button', { name: 'Resume' }).click();
  await expect(page.locator('body')).toHaveAttribute('data-screen', 'racing');
  await expect(page.locator('#time')).not.toHaveText(frozen, {
    timeout: 10_000,
  });

  expectNoIssues(issues);
});
