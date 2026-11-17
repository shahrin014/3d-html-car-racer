import { expect, test } from '@playwright/test';
import { expectNoIssues, gotoApp, watchPage } from './helpers.ts';

test('opponent count is configurable, bounded, and remembered', async ({
  page,
}) => {
  // Actionability checks are slow while the WebGL scene renders, so keep the
  // number of real pointer interactions small and give the test room.
  test.setTimeout(150_000);
  const issues = watchPage(page);
  await gotoApp(page);

  const value = page.locator('#opponents-value');
  const fewer = page.getByRole('button', { name: 'Fewer opponents' });
  const more = page.getByRole('button', { name: 'More opponents' });

  await expect(value).toHaveText('3');
  await expect(value).toHaveAttribute('aria-live', 'polite');
  await more.click();
  await expect(value).toHaveText('4');
  await fewer.click();
  await fewer.click();
  await expect(value).toHaveText('2');

  // The choice survives a reload.
  await page.reload();
  await expect(value).toHaveText('2');

  // It bottoms out at zero, and the button that would go lower is disabled.
  await fewer.click();
  await fewer.click();
  await expect(value).toHaveText('0');
  await expect(fewer).toBeDisabled();
  await expect(more).toBeEnabled();

  expectNoIssues(issues);
});
