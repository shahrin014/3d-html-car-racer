# Neon Racer

A mobile-first circuit racer inspired by orange plastic track sets. Three laps
against the clock on a generated circuit with banked turns, a vertical loop,
crests, jumps, obstacle corridors lined with solid hazard blocks, boost
straights, figure-eight layouts with bridges over the track, and spiral ramps
that climb two levels around a landmark tower in a generated city skyline. The
cars are the Mach, GT, Twin, and Blade, shipped as GLBs and kept in their stock liveries or
repainted from the menu's nine-colour picker, driven by a Rapier rigid-body simulation behind a small
adapter.

**Play:** https://shahrin014.github.io/3d-html-car-racer/

## Controls

| Input | Action |
| --- | --- |
| Tilt the phone | Steer (permission requested from Start) |
| `←` / `→` or `A` / `D` | Steer |
| Hold brake button / `Space` / `↓` | Brake |
| Camera button / `C` | Toggle chase and cockpit views |
| `Esc` / `P` | Pause or resume |

Touch steering uses the phone's tilt; there are no on-screen left/right
buttons. Starting or resuming a race switches the browser to fullscreen, and
pausing leaves fullscreen. Throttle is automatic. The HUD shows level, lap, lap time, total time, speed,
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

Car models are committed. `npm run model:car` validates every car listed in
`tools/model/cars.json` and publishes its GLB, livery, and paint mask to
`public/models/`; those are the files the game loads and precaches. Rebuilding a
mesh from its source needs Blender plus NumPy; see `tools/model/build-car.py`
and the "Adding a car" section of the asset catalog.

### Worktrees and concurrent test runs

Git worktrees isolate files but share machine resources. Each worktree needs
its own `node_modules` (`npm ci --prefer-offline`); a symlink to another
checkout is only safe while the lockfile is identical. Dev servers in different
worktrees need explicit ports, for example `npm run dev -- --port 5174`.

`npm test` and `npm run test:e2e` queue across every worktree of the repository:
the first run starts immediately and later runs wait behind a lock in the shared
Git directory. A crashed run's lock is reclaimed automatically. Use
`npm run test:raw` or `npm run test:e2e:raw` to bypass the queue; `npm run
test:watch` is never locked. A waiter gives up after 30 minutes by default; set
`NEON_LOCK_TIMEOUT_MS` to change that. See the
[project spec](https://github.com/shahrin014/3d-html-car-racer/blob/main/openspec/specs/project/spec.md)
for the full rules.

### Git hooks

`npm ci` / `npm install` points `core.hooksPath` at the checked-in
`.githooks/` directory, so every commit runs `npm test` first and is aborted if
the unit tests fail. Escape hatches for work-in-progress commits:

```bash
git commit --no-verify            # skip the hook once
SKIP_UNIT_TESTS=1 git commit -m … # same, via the environment
npm run hooks:uninstall           # stop running tests on commit
npm run hooks:install             # turn it back on
```

The hook only runs the unit suite; `npm run check` (typecheck, tests, build
with the gzip budget) still runs in CI. Because the hook goes through `npm
test`, it also waits for a test run already in progress in another worktree.

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
index.html           the menu page: live 3D car carousel, paints, opponents
game.html            the race page: HUD, pause and finish overlays, controls
src/menu.ts          menu logic: carousel, paint picker, opponents, install
src/game.ts          race entry: boot the game, HUD wiring, tilt, service worker
src/menuCarousel.ts  live in-browser 3D car preview for the menu carousel
src/style.css        landscape layout, safe areas, overlays, reduced motion
src/game/
  Game.ts            race lifecycle, cameras, physics driving, HUD callbacks
  physics.ts         Rapier adapter: track colliders, wheeled rigid body, guide assist
  track.ts           circuit generation and sampled track frames
  trackMesh.ts       orange swept track mesh, rails, boosts and gate
  Car.ts             loads the car GLB once, then clones and repaints it per car
  car-spec.mjs       car envelope, wheel positions, selectable cars, default colour
  cockpitCamera.ts   driver's-eye camera pose
  cockpit.ts         PNG cockpit frame and rotating steering wheel
  assets/            cockpit frame and wheel PNGs
  constants.ts       all tuning values
public/              manifest, service worker, generated icons, favicon
scripts/             deterministic PWA icon generator
assets/              rendered catalog: track pieces, car, cockpit, GLB models
build/               bundle budgets, service worker cache stamping
tools/               asset preview renderer; tools/model/ authors and publishes cars
e2e/                 Playwright browser smoke tests
openspec/            behavior, project, and deployment specs
```

## Specs and handover

Behaviour specs and engineering decisions live in
[OpenSpec](https://github.com/shahrin014/3d-html-car-racer/tree/main/openspec):

- [Game spec](https://github.com/shahrin014/3d-html-car-racer/blob/main/openspec/specs/game/spec.md)
- [Track randomization spec](https://github.com/shahrin014/3d-html-car-racer/blob/main/openspec/specs/track-randomization/spec.md)
- [Project spec](https://github.com/shahrin014/3d-html-car-racer/blob/main/openspec/specs/project/spec.md)
- [Deployment spec](https://github.com/shahrin014/3d-html-car-racer/blob/main/openspec/specs/deployment/spec.md)
- [Project decisions and conventions](https://github.com/shahrin014/3d-html-car-racer/blob/main/openspec/project.md)

Task-specific modelling notes stay under `docs/`.

Validate them with:

```bash
npx @fission-ai/openspec validate --all
```
