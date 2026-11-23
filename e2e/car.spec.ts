import { expect, test } from '@playwright/test';
import { expectNoIssues, gotoApp, watchPage } from './helpers.ts';

test('car carousel shows the catalog cars and remembers the choice', async ({
  page,
}) => {
  test.setTimeout(90_000);
  const issues = watchPage(page);
  const requested: string[] = [];
  page.on('request', (request) => requested.push(request.url()));
  await gotoApp(page);

  // The first car is shown with its live preview and active dot.
  await expect(page.locator('#car-name')).toHaveText('Mach');
  await expect(page.locator('#car-preview canvas')).toHaveAttribute(
    'aria-label',
    'Car preview',
  );
  const dots = page.locator('#car-dots button[data-car]');
  await expect(dots).toHaveCount(5);
  await expect(dots.first()).toHaveAttribute('aria-pressed', 'true');

  // Step forward to GT; it must load the GT asset and swap the preview.
  await page.click('#car-next');
  await expect(page.locator('#car-name')).toHaveText('GT');
  await expect
    .poll(() => requested.some((url) => url.endsWith('/models/gt.glb')), {
      timeout: 30_000,
    })
    .toBe(true);
  await expect(page.getByRole('button', { name: 'Start race' })).toBeEnabled();

  // A dot selects Twin directly and loads its asset.
  await page.click('#car-dots button[data-car="twin"]');
  await expect(page.locator('#car-name')).toHaveText('Twin');
  await expect
    .poll(() => requested.some((url) => url.endsWith('/models/twin.glb')), {
      timeout: 30_000,
    })
    .toBe(true);

  // The last dot selects Blade and loads its asset.
  await page.click('#car-dots button[data-car="blade"]');
  await expect(page.locator('#car-name')).toHaveText('Blade');
  await expect
    .poll(() => requested.some((url) => url.endsWith('/models/blade.glb')), {
      timeout: 30_000,
    })
    .toBe(true);

  // The last dot selects Manga and loads its asset.
  await page.click('#car-dots button[data-car="manga"]');
  await expect(page.locator('#car-name')).toHaveText('Manga');
  await expect
    .poll(() => requested.some((url) => url.endsWith('/models/manga.glb')), {
      timeout: 30_000,
    })
    .toBe(true);

  // It survives a reload, including the active dot.
  await page.reload();
  await expect(page.locator('#car-name')).toHaveText('Manga');
  await expect(
    page.locator('#car-dots button[data-car="manga"]'),
  ).toHaveAttribute('aria-pressed', 'true');

  // A corrupt stored id falls back to the default car.
  await page.evaluate(() =>
    window.localStorage.setItem('neon-racer.car', 'not-a-car'),
  );
  await page.reload();
  await expect(page.locator('#car-name')).toHaveText('Mach');

  expectNoIssues(issues);
});
