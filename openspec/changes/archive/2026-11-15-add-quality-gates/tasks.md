# Tasks

## 1. Pull-request checks

- [x] 1.1 Add `.github/workflows/ci.yml` triggered by `pull_request` to `main`, with `contents: read` and a cancelling concurrency group. Verified by workflow review.
- [x] 1.2 Run `npm run check` in a `check` job. Verified by workflow review and the local `npm run check`.
- [x] 1.3 Run the Playwright suite in a separate `browser` job and upload the report on failure. Verified by workflow review.
- [x] 1.4 Add a `browser` job to `deploy-pages.yml` and make `deploy` depend on it. Verified by workflow review.

## 2. Browser smoke suite

- [x] 2.1 Add `playwright.config.ts` that builds, then serves `dist/` on port 4173, with a 390×844 mobile viewport and service workers blocked by default. Verified by `npm run test:e2e`.
- [x] 2.2 Cover menu boot, HUD, start, pause/resume, steering and lane clamping, a deterministic collision, restart, best-score persistence, corrupt storage, reduced motion, and a 320×568 viewport. Verified by `npm run test:e2e`.
- [x] 2.3 Cover offline reload with a real service worker. Verified by `npm run test:e2e`.
- [x] 2.4 Mirror the lane to `data-lane` from `src/main.ts` only. Verified by the steering spec.

## 3. Build budgets

- [x] 3.1 Add `build/bundle-budget.ts` and `build/check-bundle-size.ts`; fail the build above 250 KB gzip. Verified by unit tests and `npm run build`.
- [x] 3.2 Wire the check into `npm run build`. Verified by `npm run build`.
- [x] 3.3 Replace the chunk warning with a documented 600 kB alarm limit. Verified by a warning-free build.

## 4. Service worker cache version

- [x] 4.1 Stamp `CACHE_VERSION` from a hash of the emitted files in `build/sw-cache-plugin.ts`; throw when the placeholder is missing. Verified by unit tests and two builds with an unchanged and a changed core asset list.
- [x] 4.2 Remove the manual bump instruction from the service worker, README, and handover. Verified by document review.

## 5. Specifications and docs

- [x] 5.1 Add the pull-request checks and browser gate to the deployment spec. Verified by spec review.
- [x] 5.2 Make the cache-version requirement describe the derived version. Verified by spec review.
- [x] 5.3 Make the JavaScript budget requirement enforceable. Verified by spec review.
- [x] 5.4 Update README and handover architecture, release process, and risks. Verified by document review.
