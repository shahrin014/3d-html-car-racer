import { expect, test } from '@playwright/test';
import { expectNoIssues, gotoApp, watchPage } from './helpers.ts';

// Split into its own file so the runner can give it a fresh browser process on
// memory-constrained environments.
test('a stored opponent count is clamped to the field limit', async ({
  page,
}) => {
  test.setTimeout(90_000);
  const issues = watchPage(page);
  await page.addInitScript(() =>
    window.localStorage.setItem('neon-racer.opponents', '9'),
  );
  await gotoApp(page);

  const value = page.locator('#opponents-value');
  await expect(value).toHaveText('5');
  await expect(page.getByRole('button', { name: 'More opponents' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Fewer opponents' })).toBeEnabled();

  expectNoIssues(issues);
});
