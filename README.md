# Neon Racer

A mobile-first circuit racer inspired by orange plastic track sets. Three laps
against the clock on a generated circuit with banked turns, a vertical loop,
crests, jumps, boost straights, figure-eight layouts with bridges over the
track, and spiral ramps that climb one level around a landmark tower in a
generated city skyline. The car is a candy-red die-cast hypercar driven by a
Rapier rigid-body simulation behind a small adapter.

**Play:** https://shahrin014.github.io/3d-html-car-racer/

## Controls

| Input | Action |
| --- | --- |
| Tilt the phone | Steer (permission requested from Start) |
| On-screen arrows | Steer |
| `←` / `→` or `A` / `D` | Steer |
| Hold brake button / `Space` / `↓` | Brake |
| Camera button / `C` | Toggle chase and cockpit views |
| `Esc` / `P` | Pause or resume |

Throttle is automatic. The HUD shows level, lap, lap time, total time, speed,
and damage. Damage reduces acceleration and top speed but never ends the race.
Being stuck or off the track triggers a timed rescue at the last checkpoint.

## Local development

Requires Node.js 26 LTS (see `.nvmrc`).

```bash
npm ci
npm run dev        # http://localhost:5173
npm test           # pure-logic and physics trace tests
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
enforces a 250 kB gzip app-shell budget and a separate 1.75 MB gzip budget for
the lazy physics chunk), and the Playwright smoke suite. Every push to `main`
runs the same gate; if it passes, the `dist/` artifact is deployed to GitHub
Pages. Nothing is committed to a `gh-pages` branch.

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
- Best times survive a reload.
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
index.html           HUD, menu, pause and finish overlays
src/main.ts          screen state, HUD wiring, tilt, install prompt, service worker
src/style.css        landscape layout, safe areas, overlays, reduced motion
src/game/
  Game.ts            race lifecycle, cameras, physics driving, HUD callbacks
  physics.ts         Rapier adapter: track colliders, wheeled rigid body, guide assist
  track.ts           circuit generation and sampled track frames
  trackMesh.ts       orange swept track mesh, rails, boosts and gate
  Car.ts             player car wrapper around the shared die-cast model
  car-model.mjs      parametric car geometry shared with the asset catalog
  cockpitCamera.ts   driver's-eye camera pose
  constants.ts       all tuning values
public/              manifest, service worker, generated icons, favicon
scripts/             deterministic PWA icon generator
assets/              rendered catalog: track pieces, car, cockpit, GLB models
build/               bundle budgets, service worker cache stamping
tools/               asset preview renderer (three.js in headless Chromium)
e2e/                 Playwright browser smoke tests
openspec/            behavior and deployment specs
```

## Specs and handover

Behaviour specs and engineering decisions live in
[OpenSpec](https://github.com/shahrin014/3d-html-car-racer/tree/main/openspec):

- [Game spec](https://github.com/shahrin014/3d-html-car-racer/blob/main/openspec/specs/game/spec.md)
- [Deployment spec](https://github.com/shahrin014/3d-html-car-racer/blob/main/openspec/specs/deployment/spec.md)
- [Project decisions and conventions](https://github.com/shahrin014/3d-html-car-racer/blob/main/openspec/project.md)

Task-specific modelling notes stay under `docs/`.

Validate them with:

```bash
npx @fission-ai/openspec validate --all
```
