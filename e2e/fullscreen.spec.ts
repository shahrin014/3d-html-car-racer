import { expect, test } from '@playwright/test';
import { gotoApp, startRace } from './helpers.ts';

test('fullscreen follows play, pause, and resume', async ({ page }) => {
  test.setTimeout(90_000);
  await page.addInitScript(() => {
    const calls: string[] = [];
    (window as unknown as { fullscreenCalls: string[] }).fullscreenCalls = calls;
    let active: Element | null = null;
    Object.defineProperty(document, 'fullscreenElement', {
      configurable: true,
      get: () => active,
    });
    Element.prototype.requestFullscreen = function () {
      calls.push('enter');
      active = this;
      document.dispatchEvent(new Event('fullscreenchange'));
      return Promise.resolve();
    };
    Document.prototype.exitFullscreen = function () {
      calls.push('exit');
      active = null;
      document.dispatchEvent(new Event('fullscreenchange'));
      return Promise.resolve();
    };
  });

  const fullscreenCalls = () =>
    page.evaluate(
      () =>
        (window as unknown as { fullscreenCalls: string[] }).fullscreenCalls,
    );

  await gotoApp(page);
  await startRace(page);
  await expect.poll(fullscreenCalls).toEqual(['enter']);

  await page.locator('#pause').click({ force: true });
  await expect(page.locator('body')).toHaveAttribute('data-screen', 'paused');
  await expect.poll(fullscreenCalls).toEqual(['enter', 'exit']);

  await page.getByRole('button', { name: 'Resume' }).click();
  await expect(page.locator('body')).toHaveAttribute('data-screen', 'racing');
  await expect.poll(fullscreenCalls).toEqual(['enter', 'exit', 'enter']);
});
