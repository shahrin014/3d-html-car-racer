# Handover Plan — Neon Racer

| Item | Value |
| --- | --- |
| Repository | `shahrin014/3d-html-car-racer` (public) |
| Live site | https://shahrin014.github.io/3d-html-car-racer/ |
| Handover baseline | `main` @ `7b96235` (“Use Node 26 LTS”) |
| Prepared | 2026-11-15 |
| Runtime | Node.js 26 LTS (`.nvmrc`) |
| Hosting | GitHub Pages, artifact deploy via GitHub Actions |

This document is the operating manual for whoever takes over the project. It
records what exists, how to run and release it, what is unverified, and the
recommended next steps.

## 1. Status at handover

| Area | State |
| --- | --- |
| Game | Playable: 3 lanes, traffic, 3 hearts, speed ramp, score, pause, reduced motion |
| PWA | Installable; manifest, generated icons, offline service worker |
| Tests | 32 unit tests across 5 files plus 9 Playwright browser tests |
| Typecheck | Clean (`tsc --noEmit`) |
| Build | ~556 kB raw / ~139.71 kB gzip JS; the 250 kB budget is enforced at build time |
| CI/CD | `ci.yml` checks pull requests; `deploy-pages.yml` deploys every push to `main` after the same gate |
| Last deploy | Run [43691742530](https://github.com/shahrin014/3d-html-car-racer/actions/runs/43691742530), build ✅ deploy ✅ |
| Live check | Base URL `200`, `manifest.webmanifest` `200` |
| Specs | `openspec/specs/game/spec.md` and `openspec/specs/deployment/spec.md` validate cleanly |
| Open changes | None active; `openspec/changes/archive/` holds `2026-11-15-add-quality-gates` |
| Releases/tags | None; `main` is the release |
| Branch protection | **Unverified** — the API requires authentication and `gh` is not installed |
| Secrets | None required; the workflows use the automatic `GITHUB_TOKEN` |

## 2. Architecture map

```
index.html               HUD, menu, game-over screens
src/main.ts              screen state, HUD wiring, install prompt, SW registration
src/style.css            mobile layout, safe areas, overlays, reduced motion
src/game/
  Game.ts                scene, run lifecycle, collisions, camera, loop
  Car.ts                 low-poly car from shared primitives
  Road.ts                scrolling road, lane markings, roadside posts
  Input.ts               swipe, tap, and keyboard steering
  collision.ts           pure overlap and lane-clamp helpers
  difficulty.ts          pure speed, score, and spawn-interval helpers
  spawn.ts               pure wave composition helpers
  constants.ts           all tuning values
public/
  manifest.webmanifest   PWA metadata
  sw.js                  app-shell cache; cache name is stamped at build time
  icons/, favicon.svg    generated assets
scripts/generate-icons.mjs  deterministic icon generation
build/
  bundle-budget.ts       gzip budget rules
  check-bundle-size.ts   build-time budget gate
  sw-cache-plugin.ts     stamps the service worker cache name
e2e/                     Playwright browser smoke tests
openspec/                behavior and deployment specs
.github/workflows/       PR checks and Pages deployment
```

Design boundaries to preserve:

- Simulation logic never reads the DOM; DOM work stays in `src/main.ts`.
- Tuning values stay in `src/game/constants.ts`, and behavior-changing edits
  update `openspec/specs/game/spec.md`.
- No downloaded models, textures, fonts, audio, or runtime API calls.
- Build output is never committed; `dist/` and `node_modules/` are ignored.

## 3. Local setup

```bash
git clone git@github.com:shahrin014/3d-html-car-racer.git
cd 3d-html-car-racer
nvm use            # reads .nvmrc -> 26
npm ci
npm run dev        # http://localhost:5173
```

| Command | Purpose |
| --- | --- |
| `npm run dev` | Vite dev server with HMR |
| `npm test` | Vitest pure-logic tests |
| `npm run test:e2e` | Playwright smoke tests against the production build |
| `npm run test:e2e:install` | Install the Chromium build Playwright needs |
| `npm run typecheck` | Strict TypeScript check |
| `npm run build` | Typecheck, production build into `dist/`, then the gzip budget gate |
| `npm run preview` | Serve `dist/` on :4173 |
| `npm run check` | Typecheck + tests + build (the CI gate) |
| `npm run icons` | Regenerate PWA icons |

Useful extras:

```bash
npx @fission-ai/openspec validate --all   # validate both specs
```

## 4. Release process

Trunk-based: **every merge to `main` is a release.**

1. Branch from `main`: `feat/<slug>`, `fix/<slug>`, or `spec/<slug>`.
2. Make the change; update the matching OpenSpec spec if behavior changes.
3. Run `npm run check` and `npm run test:e2e`.
4. Open a pull request into `main`. The Checks workflow runs the same gate with
   read-only permissions and no deploy step.
5. Merge. The deployment workflow repeats the gate, runs the browser smoke tests,
   and uploads the artifact; `deploy` waits for both jobs.
6. Run the post-deploy checklist in §5.

The workflow also supports manual dispatch, but the `build` and `deploy` jobs
are guarded by `if: github.ref == 'refs/heads/main'`, so runs on other refs are
no-ops.

### Post-deploy checklist

- Base URL and every asset (JS, CSS, manifest, icons, favicon) return 200.
- Menu loads; a run starts; steering, pause, collision, and restart work.
- Best score survives a reload.
- The app installs or opens standalone.
- After one online load, an offline reload still starts the game.
- Console has no uncaught errors.
- The live build matches the `main` commit shown in the workflow run.
- Test on a phone-sized viewport (390×844 is a good default).

## 5. Common operations

### Roll back a bad release

Preferred: revert on `main` and let CI redeploy.

```bash
git revert <bad-commit>
git push origin main
```

Alternative: re-run the last known-good workflow run from the Actions UI.
Pages keeps serving the previous successful deployment if a new deploy fails.

### Change cached files

Nothing to do. `build/sw-cache-plugin.ts` stamps `CACHE_VERSION` with a hash of
the emitted build, so any change to the shell, the core asset list, or the
service worker itself produces a new cache name and the old cache is deleted on
activation. An unchanged rebuild keeps the same name, so clients do not
redownload. The build fails if the placeholder disappears from `public/sw.js`.

### Upgrade Node

1. Update `.nvmrc`.
2. Update `engines.node` in `package.json`.
3. Run `npm install --package-lock-only`.
4. Update the Node line in `README.md`.
5. Run `npm run check` on the new version, then merge.

CI reads `.nvmrc` through `actions/setup-node`, so it follows automatically.

### If deployment fails at the Pages preflight

The workflow checks that Pages exists and uses `build_type: workflow`. On
failure it prints the exact repository setting to change:

**Settings → Pages → Source: GitHub Actions**, then re-run the workflow.

Do not add the “Static HTML” starter workflow; it bypasses `npm run build`.

### Deployment record

Each run shows the commit, check results, artifact upload, and the
`github-pages` environment URL. Use the latest successful run to identify what
is live.

## 6. Access and ownership

| Asset | Owner / location | Notes |
| --- | --- | --- |
| GitHub repo | `shahrin014/3d-html-car-racer` | Public; `main` is default |
| GitHub Pages | `github-pages` environment | Published from Actions artifacts |
| npm dependencies | Locked in `package-lock.json` | No private registries or tokens |
| Secrets | None | `GITHUB_TOKEN` only |
| Domain | `shahrin014.github.io` | No custom domain or DNS |
| Analytics | None | No telemetry or third-party scripts |

Git remote is SSH: `ssh://git@github.com/shahrin014/3d-html-car-racer.git`.
A new maintainer needs an SSH key or a personal access token; there is no `gh`
CLI dependency for the build.

## 7. Known gaps and risks

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Branch protection not verified | Direct pushes or force pushes may be possible | Confirm Settings → Branches → protect `main`; require PR and the Checks workflow |
| No tags or release notes | Harder to name a known-good revision | Tag releases or rely on workflow runs; document the convention |
| Browser tests cover one viewport and Chromium | Safari/iOS input and install paths rely on manual checks | Keep the phone-sized manual pass in the post-deploy checklist |
| `openspec/changes/` unused | Specs may drift from ad-hoc edits | Require an OpenSpec change for behavior work, then archive it |
| Pages API returns 404 anonymously | Confusing during diagnostics | Site and `has_pages` are authoritative; don't chase the API |
| No audio | Product gap only | Out of scope for the first release |

## 8. Recommended next steps

Ordered by value-to-effort:

1. **Protect `main`** — block force pushes and deletion, require a PR, require
   the Checks workflow. This is the largest unmitigated risk.
2. **Add release tags** — annotate known-good deploys for easier rollback.
3. **Widen browser coverage** — add a landscape project and a WebKit run so iOS
   behavior is checked, not assumed.
4. **Product backlog** — audio, near-miss bonus, difficulty modes, leaderboard
   (only if a backend is explicitly accepted).
5. **Revisit the bundle decision** — if the game grows, code-split at a route or
   scene boundary rather than raising the budget.

## 9. Decision log

| Decision | Rationale |
| --- | --- |
| Three.js + Vite + strict TypeScript | Small static bundle, no backend, fast iteration |
| 3 lanes, 3 hearts, endless traffic | Short mobile sessions with a clear fail state |
| Score = 10 × metres, best in `localStorage` | Simple, offline-safe progression |
| Installable PWA, not a native wrapper | One codebase, no store review |
| No audio in v1 | Reduces assets and mobile autoplay issues |
| Trunk-based delivery from `main` | Static site; revert-and-redeploy is a sufficient rollback |
| Artifact deployment, no `gh-pages` branch | No generated commits; Pages owns the artifact |
| No preview or staging environment | Single public site; scope control |
| Relative asset paths | Works under `/3d-html-car-racer/` with no hardcoded repo name |
| Node 26 LTS pinned everywhere | One supported runtime for local and CI |
| Playwright against the production build | Tests the shipped bundles, stamped worker, and budget gate; WebGL works headless through SwiftShader |
| Fail the build on gzip bytes, not raw chunk size | The budget is about transfer; the raw warning fired on a compliant bundle |
| Derive the service worker cache name from the build | Removes the manual step that silently shipped stale clients |
| Pull requests check, `main` deploys | Same quality gate, and no pull request can publish |

## 10. Onboarding checklist

### Day one

- [ ] Accept repository access and add an SSH key or token.
- [ ] Clone, `nvm use`, `npm ci`, `npm run check`.
- [ ] Open the live URL and complete the post-deploy checklist.
- [ ] Read `README.md`, `openspec/project.md`, and both specs.
- [ ] Open the latest successful Pages run and identify the live commit.

### Week one

- [ ] Verify `main` protection and the `github-pages` environment settings.
- [ ] Ship one small change through branch → PR → checks → merge → deploy → verify.
- [ ] Perform one rollback drill on a throwaway commit.
- [ ] Confirm ownership of the GitHub account and Pages configuration.

### Sign-off

| Item | Owner | Date |
| --- | --- | --- |
| Access and ownership confirmed | | |
| Live site verified | | |
| Rollback drilled | | |
| Gaps accepted or scheduled | | |

## 11. Quick reference

- Live: https://shahrin014.github.io/3d-html-car-racer/
- Actions: https://github.com/shahrin014/3d-html-car-racer/actions
- Settings → Pages: https://github.com/shahrin014/3d-html-car-racer/settings/pages
- Settings → Branches: https://github.com/shahrin014/3d-html-car-racer/settings/branches
- Workflow: `.github/workflows/deploy-pages.yml`
- Game spec: `openspec/specs/game/spec.md`
- Deployment spec: `openspec/specs/deployment/spec.md`
