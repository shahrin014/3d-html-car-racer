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
  - a dynamic body with one rounded chassis collider that touches the deck and
    the rails; the wheel meshes are visual only
  - collision groups keep the track and rail colliders separate
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
  - draws a filtered car pose (`src/game/poseSmoothing.ts`, 0.04 s time
    constant) so contact buzz does not read as the car shaking; handling,
    damage, and lap progress use the unfiltered body. The filter snaps on the
    first frame and after a rescue teleport.
  - progress is searched around the last known frame, so the closing frame
    cannot be mistaken for the start line
- The headless trace accelerates above 10 m/s, climbs above 8 m on the loop,
  stays within one track width of the centreline, crosses the start line, and
  holds body chatter under 1.2 rad/s RMS (measured 0.68).
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
a complete lap without leaving the track, body-chatter bounds, chase-camera
deck clearance over a lap, and attenuation of the rendered pose filter. The
browser suite covers the menu, start, HUD, cameras, pause, orientation,
persistence, and offline reload.

## Key decisions

- **Rapier over cannon-es**: real CCD and a better solver, at roughly 1.57 MB
  gzip measured in the shipped compat bundle. It is lazy-loaded, cached by the service worker as a same-origin
  hashed asset, and the app-shell budget stays at 250 kB.
- **One rounded chassis collider, wheel colliders removed**: a sharp box
  sliding over tiled cuboid track colliders catches on every seam, and four
  wheel spheres chatter because each is its own point contact. A single rounded
  box (`roundCuboid`, 0.09 m edge) slides over the seams on a broad patch. The
  same measured lap dropped body roll chatter from 2.76 to 1.99 rad/s RMS and
  lateral acceleration chatter from 8.0 to 3.4 m/s². A plain sharp cuboid fails
  the loop trace outright.
- **The surface alignment torque is damped**: it was a pure spring, so every
  contact bump rang the body at 3–5 Hz. Damping only the rate across the body's
  up axis (yaw already has its own damper) cut roll chatter from 1.99 to
  0.68 rad/s RMS and roll error chatter from 3.8° to 0.9°. The stick spring's
  damper also rose from 8 to 14 N·s/m, which halved the height bounce.
- **A triangle-mesh deck was tried and rejected**: it has the same facet slope
  changes at every 0.4 m frame, so it vibrated as much or more, and Rapier's
  trimesh contact against the flat chassis bottom was less stable than the
  tiled cuboids. The chatter came from the undamped alignment spring, not the
  collider topology.
- **The front wheels steer outside their spin**: a wheel group with the default
  Euler order applies the spin outside the steer, so a steered wheel's axle
  precesses by up to the steer angle on every turn: at 17 m/s that is a 10 Hz
  wobble that reads as the fronts shaking. The wheel groups use `YXZ` order so
  the steer is the outer rotation; `src/game/wheelSteer.test.ts` holds the axle
  fixed across a full range of spin angles.
- **The drawn car pose is filtered, the physics is not**: even after the
  alignment damper, the body buzzes a few millimetres at 8–14 Hz because it
  rests directly on the faceted deck. A 0.04 s low-pass on the rendered
  position and quaternion cut the rendered roll rate's high-frequency RMS from
  0.60 to 0.27 rad/s and the rendered roll error's from 0.018 to 0.014 rad.
  Handling, damage, and lap progress still read the unfiltered body, and the
  filter snaps on the first frame and after a rescue teleport.
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
- **The chase camera smooths in the car's frame, not world space.** Lerping the
  world position toward a point on the car's arc cuts the chord through the
  loop: the camera went 0.19 m under the deck on the measured lap. The rig keeps
  its own slerped orientation and a time-constant position filter, then clamps
  above the nearest deck frame (0.6 m). `src/game/chaseCamera.test.ts` drives a
  full physics lap at 60 fps and checks the clearance against the deck under the
  camera (measured minimum 1.12 m on the loop).
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

Three-lap generated circuit on a 7 m wide deck (seven car widths, two banked 180°
turns, an offset loop with a return shift, a crest, boost straights), continuous
swept track mesh, chase and cockpit cameras, landscape HUD, tilt plus
button/keyboard fallbacks, damage and rescue.
Assets live in `assets/` as PNG previews plus GLB models for every track piece;
`npm run assets` and `npm run assets:glb` regenerate them.
