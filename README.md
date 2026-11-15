# Neon Racer

A mobile-first, endless three-lane car racer built with Three.js. Swipe or tap
to dodge traffic, chase a personal best, and install it as an offline-capable
web app.

**Play:** https://shahrin014.github.io/3d-html-car-racer/

## Controls

| Input | Action |
| --- | --- |
| Swipe left/right | Change lane |
| Tap left/right half of the track | Change lane |
| On-screen chevrons | Change lane |
| `←` / `→` or `A` / `D` | Change lane |
| `Esc` / `P` | Pause or resume |

Each run starts with three hearts. Hitting traffic costs one heart and grants a
short burst of invulnerability. The speed climbs until the run ends; score is
ten points per metre travelled.

## Local development

Requires Node.js 26 LTS (see `.nvmrc`).

```bash
npm ci
npm run dev        # http://localhost:5173
npm test           # pure-logic unit tests
npm run test:e2e   # browser smoke tests (builds, then serves dist/)
npm run check      # typecheck + tests + production build
npm run preview    # serve the production build on :4173
```

`npm run test:e2e` needs Chromium once per machine: `npm run test:e2e:install`.

## Deployment

Publishing is continuous from `main`:

| Concern | Value |
| --- | --- |
| Production branch | `main` |
| Workflow | `.github/workflows/deploy-pages.yml` |
| Pull-request checks | `.github/workflows/ci.yml` |
| Pages source | GitHub Actions (artifact) |
| Live URL | https://shahrin014.github.io/3d-html-car-racer/ |

Every pull request runs type checking, unit tests, the production build (which
enforces the 250 KB gzip JavaScript budget), and the Playwright smoke suite.
Every push to `main` runs the same gate; if it passes, the `dist/` artifact is
deployed to GitHub Pages. Nothing is committed to a `gh-pages` branch.

### One-time setup

1. Open **Settings → Pages**.
2. Set **Source** to **GitHub Actions**.
3. Protect `main`: block force pushes and deletion, require a pull request, and
   require the **Checks** workflow.
4. Run the deployment workflow and confirm the `github-pages` environment.
5. Complete the checklist below on the live URL.

### Post-deploy checklist

- The base URL and every asset (script, CSS, manifest, icons, favicon) return 200.
- The menu loads; a run starts; steering, pause, collision, and restart work.
- The best score survives a reload.
- The app installs or opens standalone.
- After one online load, an offline reload still starts the game.
- The console has no uncaught errors.
- The live build matches the `main` commit shown in the workflow run.

### Rollback

Revert the offending commit on `main` and let the workflow redeploy, or re-run
the last known-good workflow run. A failed deployment leaves the previous site
live. The service worker cache name is derived from the build, so a release
cannot leave players on stale assets.

## Project structure

```
src/
  main.ts            screen state, HUD wiring, install prompt, service worker
  style.css          mobile layout, safe areas, overlays, reduced motion
  game/
    Game.ts          scene, run lifecycle, collisions, camera, loop
    Car.ts           low-poly car built from shared primitives
    Road.ts          scrolling road, lane markings, roadside posts
    Input.ts         swipe, tap, and keyboard steering
    collision.ts     pure overlap and lane-clamp helpers
    difficulty.ts    pure speed, score, and spawn-interval helpers
    spawn.ts         pure wave composition helpers
    constants.ts     all tuning values
public/              manifest, service worker, generated icons, favicon
scripts/             deterministic PWA icon generator
assets/              rendered catalog: track pieces, car, cockpit
build/               bundle budget, service worker cache stamping
tools/               asset preview renderer (three.js in headless Chromium)
e2e/                 Playwright browser smoke tests
openspec/            behavior and deployment specs
```

## Handover

Operational ownership, release procedures, rollback, known gaps, and onboarding
steps are documented in [`docs/HANDOVER.md`](docs/HANDOVER.md).

## Specs

Behavior and deployment are specified in OpenSpec format:

- `openspec/specs/game/spec.md`
- `openspec/specs/deployment/spec.md`
- `openspec/project.md`

Validate them with:

```bash
npx @fission-ai/openspec validate --all
```
