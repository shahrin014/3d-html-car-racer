import { expect, test } from '@playwright/test';
import { expectNoIssues, watchPage } from './helpers.ts';

test('preview forces segments, reports impossible sets, and races them', async ({
  page,
}) => {
  test.setTimeout(150_000);
  const issues = watchPage(page);

  // An impossible set leaves the preview usable and the start button disabled.
  await page.goto('/track.html?seed=preview-impossible&require=bridge,steep-ramp');
  await expect(page.locator('#preview-requirements-note')).toContainText(
    'cannot be fitted together',
    { timeout: 30_000 },
  );
  await expect(page.locator('#preview-start')).toBeDisabled();

  // A feasible set builds, reports every requirement, and hands the same
  // seed and requirements to the race page.
  await page.goto('/track.html?seed=preview-required&require=obstacles,bridge');
  await expect(page.locator('#preview-segments input')).toHaveCount(18);
  await expect(page.locator('#preview-requirements-note')).toContainText(
    'All 2 required segments present.',
    { timeout: 30_000 },
  );
  await expect(page.locator('#preview-start')).toBeEnabled();

  await page.locator('#preview-start').click();
  await page.waitForURL(/game\.html$/);
  await expect(page.locator('body')).toHaveAttribute('data-screen', 'racing', {
    timeout: 30_000,
  });

  expectNoIssues(issues);
});
