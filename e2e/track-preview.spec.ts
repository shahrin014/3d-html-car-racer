import { expect, test } from '@playwright/test';
import { expectNoIssues, watchPage } from './helpers.ts';

test('preview honors minimum counts and races the same rules', async ({
  page,
}) => {
  test.setTimeout(180_000);
  const issues = watchPage(page);

  // A minimum the authored circuit cannot repeat leaves the preview usable and
  // the start button disabled.
  await page.goto('/track.html?seed=preview-impossible&require=loop:2');
  await expect(page.locator('#preview-requirements-note')).toContainText(
    'cannot be fitted together',
    { timeout: 30_000 },
  );
  await expect(page.locator('#preview-start')).toBeDisabled();

  // Zero excludes the loop and its return; the rule is reported as met.
  await page.goto('/track.html?seed=preview-excluded&exclude=loop');
  await expect(page.locator('.preview__segment-row')).toHaveCount(18);
  await expect(page.locator('#preview-requirements-note')).toContainText(
    '2 rules · all met.',
    { timeout: 30_000 },
  );
  await expect(page.locator('#preview-start')).toBeEnabled();

  // Elevation transitions are independent: a steep climb can be paired with a
  // different descent instead of a matching steep descent.
  await page.goto(
    '/track.html?seed=preview-steep&require=steep-ramp&exclude=steep-ramp-down',
  );
  await expect(page.locator('#preview-requirements-note')).toContainText(
    '2 rules · all met.',
    { timeout: 30_000 },
  );
  await expect(
    page.locator('.preview__segment-row[data-kind="steep-ramp"] select'),
  ).toHaveValue('1');
  await expect(
    page.locator('.preview__segment-row[data-kind="steep-ramp-down"] select'),
  ).toHaveValue('0');
  await expect(page.locator('#preview-start')).toBeEnabled();

  // A count above one is a minimum, not an exact target.
  await page.goto('/track.html?seed=preview-count&require=spiral-down:2');
  await expect(page.locator('#preview-requirements-note')).toContainText(
    '1 rule · all met.',
    { timeout: 30_000 },
  );
  await expect(
    page.locator('.preview__segment-row[data-kind="spiral-down"] select'),
  ).toHaveValue('2');
  const spirals = Number(
    await page
      .locator('.preview__segment-row[data-kind="spiral-down"] .preview__segment-now')
      .textContent(),
  );
  expect(spirals).toBeGreaterThanOrEqual(2);

  // A feasible set builds, reports every rule, and hands the same seed and
  // counts to the race page.
  await page.goto('/track.html?seed=preview-required&require=obstacles,bridge');
  await expect(page.locator('.preview__segment-row')).toHaveCount(18);
  await expect(page.locator('#preview-requirements-note')).toContainText(
    'all met.',
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
