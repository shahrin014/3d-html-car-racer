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
| Tests | 22 unit tests across 3 files, all passing |
| Typecheck | Clean (`tsc --noEmit`) |
| Build | ~556 kB raw / ~139.68 kB gzip JS; Vite warns over the 500 kB chunk threshold |
| CI/CD | `.github/workflows/deploy-pages.yml` deploys every push to `main` |
| Last deploy | Run [43691742530](https://github.com/shahrin014/3d-html-car-racer/actions/runs/43691742530), build ✅ deploy ✅ |
| Live check | Base URL `200`, `manifest.webmanifest` `200` |
| Specs | `openspec/specs/game/spec.md` and `openspec/specs/deployment/spec.md` validate cleanly |
| Open changes | None (`openspec/changes/` is empty) |
| Releases/tags | None; `main` is the release |
| Branch protection | **Unverified** — the API requires authentication and `gh` is not installed |
| Secrets | None required; the workflow uses the automatic `GITHUB_TOKEN` |

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
  sw.js                  app-shell cache; bump CACHE_VERSION on asset changes
  icons/, favicon.svg    generated assets
scripts/generate-icons.mjs  deterministic icon generation
openspec/                behavior and deployment specs
.github/workflows/       Pages deployment
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
| `npm run typecheck` | Strict TypeScript check |
| `npm run build` | Typecheck + production build into `dist/` |
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
3. Run `npm run check` and, for UI work, a browser smoke test.
4. Open a pull request into `main`.
5. Merge. The workflow runs typecheck, tests, and build; if they pass, the
   `dist/` artifact deploys to Pages.
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

If the set of files in `CORE_ASSETS` in `public/sw.js` changes, bump
`CACHE_VERSION` (currently `neon-racer-v1`) in the same commit. Otherwise old
caches are never purged.

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
| Branch protection not verified | Direct pushes or force pushes may be possible | Confirm Settings → Branches → protect `main`; require PR and the build check |
| No PR-triggered CI | Breakage is discovered only after merge to `main` | Add a `pull_request` workflow running `npm run check` |
| No tags or release notes | Harder to name a known-good revision | Tag releases or rely on workflow runs; document the convention |
| Single 556 kB JS chunk | Slower first load on weak mobile networks | Code-split Three.js or raise the warning threshold with a budget decision |
| Service worker cache version is manual | Stale assets if forgotten | Add a check or generate the version from the build |
| Tests cover only pure logic | Rendering, input, and PWA behavior rely on manual checks | Add Playwright smoke tests for menu → run → collision → reload |
| `openspec/changes/` unused | Specs may drift from ad-hoc edits | Require an OpenSpec change for behavior work, then archive it |
| Pages API returns 404 anonymously | Confusing during diagnostics | Site and `has_pages` are authoritative; don’t chase the API |
| No audio | Product gap only | Out of scope for the first release |

## 8. Recommended next steps

Ordered by value-to-effort:

1. **Protect `main`** — block force pushes and deletion, require a PR, require
   the check. This is the largest unmitigated risk.
2. **Add PR CI** — a `pull_request` workflow running `npm run check` so
   breakage never reaches `main`.
3. **Add a browser smoke test** — Playwright: menu loads, run starts, collision
   costs a heart, reload keeps the best score, no console errors.
4. **Fix the chunk warning deliberately** — either code-split or set an
   explicit size budget; record the decision.
5. **Automate the service worker cache version** — derive it from the build or
   assert it changed when `CORE_ASSETS` changes.
6. **Add release tags** — annotate known-good deploys for easier rollback.
7. **Product backlog** — audio, near-miss bonus, difficulty modes, leaderboard
   (only if a backend is explicitly accepted).

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

## 10. Onboarding checklist

### Day one

- [ ] Accept repository access and add an SSH key or token.
- [ ] Clone, `nvm use`, `npm ci`, `npm run check`.
- [ ] Open the live URL and complete the post-deploy checklist.
- [ ] Read `README.md`, `openspec/project.md`, and both specs.
- [ ] Open the latest successful Pages run and identify the live commit.

### Week one

- [ ] Verify `main` protection and the `github-pages` environment settings.
- [ ] Ship one small change through branch → PR → merge → deploy → verify.
- [ ] Perform one rollback drill on a throwaway commit.
- [ ] Add PR CI or schedule it explicitly.
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
