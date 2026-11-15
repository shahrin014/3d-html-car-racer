# Add quality gates: PR checks, browser smoke tests, and automated build budgets

## Why

The handover lists three unmitigated quality risks: `main` has no pull-request
CI, browser behavior is verified only by hand, and the 250 KB transfer budget is
documented but unenforced. Two smaller risks ride along: the Vite chunk warning
measures the wrong thing, and the service worker cache version relies on a human
remembering to bump it.

## What Changes

- Add `.github/workflows/ci.yml`, running on `pull_request` with read-only
  permissions: typecheck + unit tests + build, and a Playwright smoke suite.
- Add a Playwright suite (`e2e/`) against the production build, covering the
  app shell, run lifecycle, persistence, reduced motion, and offline startup.
- Add a browser job to the deployment workflow and make `deploy` depend on it.
- Enforce the 250 KB gzip budget from the build output (`build/check-bundle-size.ts`).
- Stamp the service worker cache name with a hash of the emitted build
  (`build/sw-cache-plugin.ts`), removing the manual `CACHE_VERSION` bump.
- Replace the misleading Vite chunk warning with an explicit, documented limit.
- Expose the current lane as `data-lane` on the stage element for browser tests.

## Impact

- Affected specs: `deployment` (checks, cache versioning), `game` (budget).
- Affected code: build tooling, workflows, `public/sw.js`, `src/main.ts`,
  `src/game/Game.ts`, tests, docs.
- No runtime dependency added; Playwright and `@types/node` are dev-only.
- Deployments now wait for a browser job, adding roughly two minutes per release.

## Out of Scope

- Enforcing branch protection itself (repository settings, not code).
- Preview deployments per pull request.
- Visual regression snapshots.
- Audio or gameplay changes.
