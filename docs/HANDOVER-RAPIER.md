# Handover — Rapier physics integration

| Item | Value |
| --- | --- |
| Branch | `main` (merged from `feat/rapier-physics`) |
| Base | `8964a69` — Rapier physics handover |
| Runtime | Node 26 LTS (`.nvmrc`) |

The circuit-racer concept, specs, assets, and the playable build are on `main`.
This document records the Rapier rigid-body integration that replaced the
track-constrained movement.

## What is done

- `src/game/physics.ts` is a lazy Rapier adapter:
  - static, tiled track-surface and rail colliders with a start apron
  - a dynamic chassis carried by four spherical wheel colliders, so the flat
    chassis cannot catch on a collider seam
  - collision groups keep the chassis off the driving surface while still
    colliding with the rails
  - CCD, friction, restitution, engine/brake thrust, quadratic drag
  - steering is a heading target plus yaw damping, not a torque: the guide turns
    the nose toward the requested angle
  - guide assist: surface stick, a lateral grip budget that cancels sideways
    velocity, a capped drift at full lock, and roll/pitch alignment
  - contact-force events converted to damage impulses
  - `read()`, `reset(frame)`, `boost(impulse)`, `takeImpact()`, `dispose()`
- `src/game/Game.ts` integrates the adapter:
  - loads Rapier on the first Start; the countdown waits for the engine, and a
    failed load disables Start with a Physics unavailable message
  - fixed 1/120 s simulation with at most four substeps per rendered frame
  - wall-clock countdown, so a slow first Rapier load cannot restart the countdown
  - drives the car group, cameras, speed, lap progress, boost strips, damage,
    and rescue from the rigid body
  - progress is searched around the last known frame, so the closing frame
    cannot be mistaken for the start line
- The headless trace accelerates above 10 m/s, climbs above 8 m on the loop,
  stays within one track width of the centreline, and crosses the start line.
- The handling profile in `src/game/feel.test.ts` measures slip angle over a
  driven lap (`mean |slip|` under 10°, sliding under 35% of frames), proves that
  positive steer moves the car to the right of the screen, and checks that a
  held full lock at speed does not spin the car.
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
  grip alone. The assist adds downforce, a grip-capped lateral damper, and
  heading/roll alignment and adds **no forward energy**. It switches off when
  the car is more than one track width from the frame, so a fall cannot be flung
  back by a distant spring.
- **Steering is a heading target, not a torque**: a 2.6 N·m torque on a 1.2 kg
  body spun it through 90° in under a second. The guide now turns the nose
  toward `tangent + steer × 0.22 rad` with yaw damping, and the lateral damper
  holds the resulting drift to 1 m/s, so the car points into the corner instead
  of sliding across it.
- **Thrust follows the racing line while the guide is active.** Applying it
  along the yawed nose pushed the car sideways and was the main source of
  floaty handling.
- **Supports stop under the deck.** A vertical column whose top sits at the
  frame centre pokes through the low side of a banked surface and renders as a
  dark square on the road. `supportTop` cuts it below the underside across the
  column footprint; `src/game/trackMesh.test.ts` checks every supported frame.
- **`frame.right` is the driver's left.** The frame is `(up × tangent, up,
  tangent)`, which is right-handed, but a car facing `+Z` has its right hand
  toward `-X`. All player-facing steering is therefore negated once in
  `physics.ts` and once for the wheel visuals; the physics tests pin the sign so
  the arrow keys cannot silently invert again.
- **No arcade fallback**: the rigid body is the only vehicle simulation. If
  Rapier cannot initialise, the game reports the failure and disables Start
  rather than silently changing the handling.

## Known issues

- The sandbox has repeatedly killed `tsc`/build/vitest runs when several
  sessions share a repository or memory is low. Keep one session per worktree
  and run one heavy command at a time.
- The car model was iterated in a separate session; `src/game/Car.ts` is the
  game's model and `tools/preview/car-model.mjs` is the catalog model.
- Playwright covers Chromium only; iOS tilt and install paths still need the
  phone-sized manual pass.
- The Playwright suite is tuned for small runners: one worker, one spec per
  process through `tools/run-e2e.mjs`, Chromium `--single-process`, trace and
  video off, and a 256 MB renderer heap cap. The browser tree peaks around
  413 MB with Rapier loaded, and the full suite passes on a 1 GB worktree. CI
  builds `dist/` first and runs with `E2E_SKIP_BUILD=1`, so the build process is
  not alive while Chromium runs.

## Current state of the game

Three-lap generated circuit on a 6 m wide deck (six car widths, two banked 180°
turns, an offset loop with a return shift, a crest, boost straights), continuous
swept track mesh, chase and cockpit cameras, landscape HUD, tilt plus
button/keyboard fallbacks, damage and rescue.
Assets live in `assets/` as PNG previews plus GLB models for every track piece;
`npm run assets` and `npm run assets:glb` regenerate them.
