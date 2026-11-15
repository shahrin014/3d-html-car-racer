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
npm run dev      # http://localhost:5173
npm test         # pure-logic unit tests
npm run check    # typecheck + tests + production build
npm run preview  # serve the production build on :4173
```

## Deployment

Publishing is continuous from `main`:

| Concern | Value |
| --- | --- |
| Production branch | `main` |
| Workflow | `.github/workflows/deploy-pages.yml` |
| Pages source | GitHub Actions (artifact) |
| Live URL | https://shahrin014.github.io/3d-html-car-racer/ |

Every push to `main` runs type checking, unit tests, and the production build.
If they pass, the `dist/` artifact is deployed to GitHub Pages. Nothing is
committed to a `gh-pages` branch.

### One-time setup

1. Open **Settings → Pages**.
2. Set **Source** to **GitHub Actions**.
3. Protect `main`: block force pushes and deletion and require a pull request.
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
live. If a release changes the service worker's core asset list, bump
`CACHE_VERSION` in `public/sw.js` so stale caches are removed.

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
openspec/            behavior and deployment specs
```

## Specs

Behavior and deployment are specified in OpenSpec format:

- `openspec/specs/game/spec.md`
- `openspec/specs/deployment/spec.md`
- `openspec/project.md`

Validate them with:

```bash
npx @fission-ai/openspec validate --all
```
