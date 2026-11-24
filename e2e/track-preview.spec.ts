import { expect, test } from '@playwright/test';
import { expectNoIssues, watchPage } from './helpers.ts';

test('preview honors minimum counts and races the same rules', async ({
  page,
}) => {
  test.setTimeout(180_000);
  const issues = watchPage(page);

  // Counts above the control's maximum clamp to 5 rather than failing.
  await page.goto('/track.html?seed=preview-max&require=loop:9');
  await expect(page.locator('#preview-requirements-note')).toContainText(
    '2 rules · all met.',
    { timeout: 30_000 },
  );
  await expect(
    page.locator('.preview__segment-row[data-kind="loop"] select'),
  ).toHaveValue('5');
  await expect(page.locator('#preview-start')).toBeEnabled();

  // Repeating a segment works through the feature-slot planner.
  await page.goto('/track.html?seed=preview-loop4&require=loop:4');
  await expect(page.locator('#preview-requirements-note')).toContainText(
    '2 rules · all met.',
    { timeout: 30_000 },
  );
  await expect(
    page.locator('.preview__segment-row[data-kind="loop"] select'),
  ).toHaveValue('4');
  const loopNow = Number(
    await page
      .locator('.preview__segment-row[data-kind="loop"] .preview__segment-now')
      .textContent(),
  );
  expect(loopNow).toBeGreaterThanOrEqual(4);
  const loopSeed = await page.textContent('#preview-seed');
  await page.click('#preview-regenerate');
  await expect
    .poll(async () => page.textContent('#preview-seed'), { timeout: 30_000 })
    .not.toBe(loopSeed);
  await expect(page.locator('#preview-requirements-note')).toContainText(
    'all met.',
  );

  // Zero means "0 or more": it is not a rule and never excludes a kind.
  await page.goto('/track.html?seed=preview-zero&counts=loop:0');
  await expect(page.locator('#preview-requirements-note')).toContainText(
    '0 means 0 or more',
    { timeout: 30_000 },
  );
  await expect(
    page.locator('.preview__segment-row[data-kind="loop"] select'),
  ).toHaveValue('0');
  await expect(page.locator('#preview-start')).toBeEnabled();

  // Elevation transitions are independent: a steep climb minimum does not
  // force a matching steep descent, and a 0 descent may still be added.
  await page.goto(
    '/track.html?seed=preview-steep&counts=steep-ramp:1,steep-ramp-down:0',
  );
  await expect(page.locator('#preview-requirements-note')).toContainText(
    '1 rule · all met.',
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

  // The canonical URL carries the seed and every count, so the exact preview
  // can be reopened or shared.
  await page.goto('/track.html?seed=url-state&counts=loop:4,spiral-up:5');
  await expect(page.locator('#preview-requirements-note')).toContainText(
    '3 rules · all met.',
    { timeout: 30_000 },
  );
  await expect(
    page.locator('.preview__segment-row[data-kind="loop"] select'),
  ).toHaveValue('4');
  await expect(
    page.locator('.preview__segment-row[data-kind="spiral-up"] select'),
  ).toHaveValue('5');
  const shared = new URL(page.url());
  expect(shared.searchParams.get('seed')).toBe('url-state');
  expect(shared.searchParams.get('counts')).toContain('loop:4');
  expect(shared.searchParams.get('counts')).toContain('spiral-up:5');

  await page.selectOption(
    '.preview__segment-row[data-kind="obstacles"] select',
    '2',
  );
  await page.waitForFunction(
    () => !document.body.classList.contains('is-building'),
    undefined,
    { timeout: 30_000 },
  );
  const updated = new URL(page.url());
  expect(updated.searchParams.get('seed')).toBe('url-state');
  expect(updated.searchParams.get('counts')).toContain('obstacles:2');

  // Crossovers are an explicit layout parameter.
  await page.goto('/track.html?seed=cross-1&crossovers=1');
  await expect(page.locator('#preview-crossovers')).toHaveValue('1');
  await expect(page.locator('#preview-requirements-note')).toContainText(
    '1 crossover',
    { timeout: 30_000 },
  );
  await expect(page.locator('#preview-start')).toBeEnabled();

  await page.goto('/track.html?seed=cross-2&crossovers=2');
  await expect(page.locator('#preview-crossovers')).toHaveValue('2');
  await expect(page.locator('#preview-requirements-note')).toContainText(
    '2 crossovers',
    { timeout: 30_000 },
  );
  expect(new URL(page.url()).searchParams.get('crossovers')).toBe('2');
  await expect(page.locator('#preview-start')).toBeEnabled();

  // A two-crossing layout is generated from catalog pieces, so counts apply.
  await page.goto(
    '/track.html?seed=cross-2-counts&crossovers=2&counts=loop:2,obstacles:1',
  );
  await expect(page.locator('#preview-requirements-note')).toContainText(
    '2 crossovers',
    { timeout: 30_000 },
  );
  await expect(
    page.locator('.preview__segment-row[data-kind="loop"] select'),
  ).toBeEnabled();
  await expect(
    page.locator('.preview__segment-row[data-kind="loop"] select'),
  ).toHaveValue('2');
  await expect(
    page.locator('.preview__segment-row[data-kind="obstacles"] select'),
  ).toHaveValue('1');
  await expect(page.locator('#preview-requirements-note')).toContainText(
    'all met.',
  );
  await expect(page.locator('#preview-start')).toBeEnabled();

  // An impossible set still builds the seed's own track, keeps the chosen
  // counts, and never shows a rejection message.
  await page.goto(
    '/track.html?seed=preview-impossible&counts=spiral-up:5,spiral-down:5,steep-ramp:5',
  );
  await expect(
    page.locator('.preview__segment-row[data-kind="spiral-up"] select'),
  ).toHaveValue('5', { timeout: 30_000 });
  await expect(page.locator('#preview-requirements-note')).not.toContainText(
    'cannot be fitted',
  );
  await expect(page.locator('#preview-requirements-note')).not.toHaveClass(
    /is-error/,
  );
  await expect(page.locator('#preview-start')).toBeEnabled();

  // A feasible set builds, reports every rule, and hands the same seed and
  // counts to the race page.
  await page.goto('/track.html?seed=preview-required&require=obstacles,bridge');
  await expect(page.locator('.preview__segment-row')).toHaveCount(17);
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
