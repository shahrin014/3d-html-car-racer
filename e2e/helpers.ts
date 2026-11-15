import { expect, type Page } from '@playwright/test';
import { E2E_BASE_URL } from './base-url.ts';

export const APP_PATH = '/';

export async function gotoApp(page: Page): Promise<void> {
  await page.goto(APP_PATH);
}

export interface PageIssues {
  consoleErrors: string[];
  pageErrors: string[];
  foreignRequests: string[];
}

export function watchPage(page: Page): PageIssues {
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

export function expectNoIssues(issues: PageIssues): void {
  expect(issues.pageErrors, 'uncaught page errors').toEqual([]);
  expect(issues.consoleErrors, 'console errors').toEqual([]);
  expect(issues.foreignRequests, 'third-party requests').toEqual([]);
}

export async function startRace(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Start race' }).click();
  // The first race may spend a few seconds fetching and compiling the lazy
  // Rapier chunk. The countdown is wall-clock based, so it catches up as soon
  // as that work returns to the main thread.
  await expect(page.locator('body')).toHaveAttribute('data-screen', 'racing', {
    timeout: 20_000,
  });
}
