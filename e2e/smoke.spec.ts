import { expect, test, type Page } from '@playwright/test';
import { E2E_BASE_URL } from './base-url.ts';

/**
 * Browser smoke tests for the behaviors that unit tests cannot reach: WebGL
 * boot, the four screen states, lane steering through the DOM, persistence
 * across reloads, and offline startup via the service worker.
 */

const BEST_SCORE_KEY = 'neon-racer.best-score';

interface PageIssues {
  consoleErrors: string[];
  pageErrors: string[];
  foreignRequests: string[];
}

/** Collect failures that should make a smoke test fail. */
function watchPage(page: Page): PageIssues {
  const issues: PageIssues = {
    consoleErrors: [],
    pageErrors: [],
    foreignRequests: [],
  };
  page.on('console', (message) => {
    if (message.type() === 'error') {
      issues.consoleErrors.push(message.text());
    }
  });
  page.on('pageerror', (error) => {
    issues.pageErrors.push(error.message);
  });
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.origin !== new URL(E2E_BASE_URL).origin) {
      issues.foreignRequests.push(url.href);
    }
  });
  return issues;
}

function expectNoIssues(issues: PageIssues): void {
  expect(issues.pageErrors, 'uncaught page errors').toEqual([]);
  expect(issues.consoleErrors, 'console errors').toEqual([]);
  expect(issues.foreignRequests, 'third-party requests').toEqual([]);
}

async function startRun(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Start run' }).click();
  await expect(page.locator('body')).toHaveAttribute('data-screen', 'playing');
}

test('menu loads, starts a run, and keeps the HUD live', async ({ page }) => {
  const issues = watchPage(page);

  await page.goto('/');
  await expect(page.locator('[data-overlay="menu"]')).toBeVisible();
  await expect(page.locator('#score')).toHaveText('00000');
  await expect(page.locator('#best')).toHaveText('00000');
  await expect(page.locator('#hearts')).toHaveAttribute(
    'aria-label',
    '3 of 3 lives remaining',
  );
  await expect(page.locator('#app canvas')).toHaveAttribute(
    'aria-label',
    '3D race track',
  );

  await startRun(page);
  await expect(page.locator('#app')).toHaveAttribute('data-lane', '1');
  // Score is distance based, so it must climb as soon as the loop runs.
  await expect(page.locator('#score')).not.toHaveText('00000', {
    timeout: 5_000,
  });

  expectNoIssues(issues);
});

test('pause freezes the score and resume continues the same run', async ({
  page,
}) => {
  const issues = watchPage(page);

  await page.goto('/');
  await startRun(page);
  await expect(page.locator('#score')).not.toHaveText('00000');

  await page.locator('#pause').click();
  await expect(page.locator('body')).toHaveAttribute('data-screen', 'paused');
  const frozen = (await page.locator('#score').textContent()) ?? '';
  expect(frozen).not.toBe('00000');

  await page.waitForTimeout(600);
  await expect(page.locator('#score')).toHaveText(frozen);

  await page.getByRole('button', { name: 'Resume' }).click();
  await expect(page.locator('body')).toHaveAttribute('data-screen', 'playing');
  await expect(page.locator('#score')).not.toHaveText(frozen, {
    timeout: 5_000,
  });

  expectNoIssues(issues);
});

test('steering moves one lane at a time and the road edges clamp', async ({
  page,
}) => {
  test.setTimeout(60_000);
  const issues = watchPage(page);

  await page.goto('/');
  await startRun(page);
  const stage = page.locator('#app');
  await expect(stage).toHaveAttribute('data-lane', '1');

  await page.getByRole('button', { name: 'Steer left' }).click();
  await expect(stage).toHaveAttribute('data-lane', '0');

  // Already on the leftmost lane: the car must stay there.
  await page.getByRole('button', { name: 'Steer left' }).click();
  await expect(stage).toHaveAttribute('data-lane', '0');

  await page.keyboard.press('ArrowRight');
  await expect(stage).toHaveAttribute('data-lane', '1');
  await page.keyboard.press('ArrowRight');
  await expect(stage).toHaveAttribute('data-lane', '2');
  await page.keyboard.press('ArrowRight');
  await expect(stage).toHaveAttribute('data-lane', '2');

  expectNoIssues(issues);
});

test('a collision costs exactly one heart', async ({ page }) => {
  test.setTimeout(60_000);
  const issues = watchPage(page);

  await page.goto('/');
  await startRun(page);

  // A run always seeds a traffic car in the left lane ahead of the player, so
  // moving left guarantees a collision within a few seconds.
  await page.getByRole('button', { name: 'Steer left' }).click();
  await expect(page.locator('#app')).toHaveAttribute('data-lane', '0');
  await expect(page.locator('#hearts')).toHaveAttribute(
    'aria-label',
    '2 of 3 lives remaining',
    { timeout: 25_000 },
  );
  await expect(page.locator('.heart.is-lost')).toHaveCount(1);

  expectNoIssues(issues);
});

test('restart from the pause screen resets the run', async ({ page }) => {
  test.setTimeout(60_000);
  const issues = watchPage(page);

  await page.goto('/');
  await startRun(page);
  await expect(page.locator('#score')).not.toHaveText('00000');

  await page.locator('#pause').click();
  await page.getByRole('button', { name: 'Restart' }).click();

  await expect(page.locator('body')).toHaveAttribute('data-screen', 'playing');
  await expect(page.locator('#hearts')).toHaveAttribute(
    'aria-label',
    '3 of 3 lives remaining',
  );

  // Pause immediately: distance restarted at zero, so the score must be small.
  await page.locator('#pause').click();
  await expect(page.locator('body')).toHaveAttribute('data-screen', 'paused');
  const score = Number.parseInt(
    (await page.locator('#score').textContent()) ?? '',
    10,
  );
  expect(score).toBeLessThan(500);

  expectNoIssues(issues);
});

test('best score survives a reload and corrupt values fall back to zero', async ({
  page,
}) => {
  await page.goto('/');
  await page.evaluate(
    ({ key, value }) => {
      window.localStorage.setItem(key, value);
    },
    { key: BEST_SCORE_KEY, value: '4321' },
  );
  await page.reload();
  await expect(page.locator('#best')).toHaveText('04321');
  await expect(page.locator('#menu-best')).toHaveText('04321');

  await page.evaluate(
    ({ key, value }) => {
      window.localStorage.setItem(key, value);
    },
    { key: BEST_SCORE_KEY, value: 'not-a-score' },
  );
  await page.reload();
  await expect(page.locator('#best')).toHaveText('00000');
  await expect(page.getByRole('button', { name: 'Start run' })).toBeEnabled();
});

test('reduced motion collapses interface animation', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');

  await startRun(page);
  await page.locator('#pause').click();
  await expect(page.locator('body')).toHaveAttribute('data-screen', 'paused');

  const duration = await page
    .locator('[data-overlay="paused"] .panel')
    .evaluate((panel) => window.getComputedStyle(panel).animationDuration);
  expect(Number.parseFloat(duration)).toBeLessThan(0.01);
});

test('small phone viewport has no horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto('/');
  await expect(page.locator('[data-overlay="menu"]')).toBeVisible();

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
  await expect(page.getByRole('button', { name: 'Start run' })).toBeInViewport();
});

test.describe('offline', () => {
  // The only spec that needs a real service worker; every other test blocks it.
  test.use({ serviceWorkers: 'allow' });

  test('reloads from cache after one online visit', async ({
    page,
    context,
  }) => {
    await page.goto('/');
    await page.evaluate(async () => {
      const registration = await navigator.serviceWorker.ready;
      if (!registration.active) {
        throw new Error('service worker did not activate');
      }
    });

    // The install step caches the whole core asset list before activation.
    await expect
      .poll(
        async () =>
          page.evaluate(async () => {
            const keys = await caches.keys();
            let entries = 0;
            for (const key of keys) {
              const cache = await caches.open(key);
              entries += (await cache.keys()).length;
            }
            return entries;
          }),
        { timeout: 20_000 },
      )
      .toBeGreaterThanOrEqual(7);

    await context.setOffline(true);
    await page.reload();

    await expect(page.locator('[data-overlay="menu"]')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Start run' })).toBeEnabled();
  });
});
