# Handover — Rapier physics integration

| Item | Value |
| --- | --- |
| Worktree | `/root/.local/share/opencode/worktree/62f8c4/nimble-moon` |
| Branch | `feat/rapier-physics` |
| Base | `8964a69` — Rapier physics handover |
| Live branch | `main` (arcade model, deployed) |
| Runtime | Node 26 LTS (`.nvmrc`) |

The circuit-racer concept, specs, assets, and the playable arcade build are on
`main`. This branch replaces the track-constrained movement with a Rapier
rigid-body car. **Do not merge it to `main` until the branch has been reviewed
and the merge is explicitly requested.**

## What is done

- `src/game/physics.ts` is a lazy Rapier adapter:
  - static, tiled track-surface and rail colliders with a start apron
  - a dynamic chassis carried by four spherical wheel colliders, so the flat
    chassis cannot catch on a collider seam
  - collision groups keep the chassis off the driving surface while still
    colliding with the rails
  - CCD, friction, restitution, engine/brake force, quadratic drag, yaw torque
  - guide assist: surface stick, lateral centering toward a steering target,
    heading alignment, and roll/pitch alignment
  - contact-force events converted to damage impulses
  - `read()`, `reset(frame)`, `boost(impulse)`, `takeImpact()`, `dispose()`
- `src/game/Game.ts` integrates the adapter:
  - loads Rapier on the first Start during the countdown, with the arcade model
    as a fallback if the engine cannot start
  - fixed 1/120 s simulation with at most four substeps per rendered frame
  - wall-clock countdown, so a slow first Rapier load cannot restart the countdown
  - drives the car group, cameras, speed, lap progress, boost strips, damage,
    and rescue from the rigid body
  - progress is searched around the last known frame, so the closing frame
    cannot be mistaken for the start line
- The headless trace accelerates above 10 m/s, climbs above 8 m on the loop,
  stays within one track width of the centreline, and crosses the start line.
- The build has two transfer tiers:
  - app shell ≤ 250 kB gzip
  - lazy `physics-*.js` chunk ≤ 1.75 MB gzip (measured 1.57 MB)
  - `vite.config.ts` names the manual Rapier chunk and
    `build/check-bundle-size.ts` enforces both numbers
- Specs and project constraints record the two budgets.

## Verification

```bash
npm ci
npm run dev            # drive manually at 844×390
npm run typecheck
npm test               # track, budget and physics trace tests
npm run test:e2e       # landscape suite
npm run check          # typecheck + tests + build + both budget gates
```

The physics trace tests cover acceleration, steering response, loop contact,
and a complete lap without leaving the track. The browser suite covers the
menu, start, HUD, cameras, pause, orientation, persistence, and offline reload.

## Key decisions

- **Rapier over cannon-es**: real CCD and a better solver, at roughly 1.57 MB
  gzip measured in the shipped compat bundle. It is lazy-loaded, cached by the service worker as a same-origin
  hashed asset, and the app-shell budget stays at 250 kB.
- **Spherical wheel colliders, not a flat chassis**: a box sliding over tiled
  cuboid track colliders catches on every seam. Four wheel balls carry the body
  and roll over the seams; the chassis collider still hits the rails.
- **Guide assist is intentional**: a rigid toy car cannot hold a loop on tyre
  grip alone. The assist adds downforce, lateral centering, and heading/roll
  alignment and adds **no forward energy**. Steering and impacts remain
  physical. It switches off when the car is more than one track width from the
  frame, so a fall cannot be flung back by a distant spring.
- **Arcade fallback stays**: if Rapier fails to initialise, the first race can
  still start on the track-constrained model. The fallback is a safety net, not
  the primary path.

## Known issues

- The sandbox has repeatedly killed `tsc`/build/vitest runs when several
  sessions share a repository or memory is low. Keep one session per worktree
  and run one heavy command at a time.
- `main` intentionally still ships the arcade model. Merge only after reviewing
  the branch and after `npm run check` and `npm run test:e2e` pass on this
  worktree.
- The car model was iterated in a separate session; `src/game/Car.ts` is the
  game's model and `tools/preview/car-model.mjs` is the catalog model.
- Playwright covers Chromium only; iOS tilt and install paths still need the
  phone-sized manual pass.
- The Playwright suite is tuned for small runners: one worker, tests serial,
  trace and video off, and a 256 MB renderer heap cap. CI builds `dist/` first
  and runs with `E2E_SKIP_BUILD=1`, so the build process is not alive while
  Chromium runs.
- The full Playwright suite could not finish in this 1 GB worktree because the
  sandbox killed Chromium under memory pressure. A minimal Playwright check
  confirmed the menu, Start, wall-clock countdown, physics race start (9 km/h
  after 2.5 s), and a clean console. Run `npm run test:e2e` in CI before merge.

## Current state of the game

Three-lap generated circuit (two banked 180° turns, offset loop with a return
shift, crest, boost straights), continuous swept track mesh, chase and cockpit
cameras, landscape HUD, tilt plus button/keyboard fallbacks, damage and rescue.
Assets live in `assets/` as PNG previews plus GLB models for every track piece;
`npm run assets` and `npm run assets:glb` regenerate them.
