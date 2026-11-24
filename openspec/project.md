# Project Context

## Purpose

Neon Racer is a short-session circuit racing game that runs in a mobile browser
and installs like an app. The player drives a die-cast-style car around an
orange plastic track assembled from a fixed catalog of pieces. Each race is
three laps against the clock on a seeded circuit, with loops, banked turns,
hills, boost strips, damage, and a timed rescue instead of a fail state.

The game is a single-player, offline-capable web app with no account, backend,
or paid content. A race lasts one to three minutes. Levels unlock in order and
raise the difficulty through track shape, loop radius, bank angle, boost
availability, and damage sensitivity.

## Tech Stack

| Concern | Choice |
| --- | --- |
| Language | TypeScript (strict) |
| 3D renderer | Three.js |
| Build tool | Vite |
| Unit tests | Vitest (pure logic) |
| Mobile delivery | Installable PWA (manifest + service worker) |
| Hosting | GitHub Pages via GitHub Actions |
| CI/CD | GitHub Actions, deploy from `main` |

The game deliberately uses Three.js primitives and generated canvas textures
for the circuit, city, and cockpit. The one authored model is the player car:
a committed GLB loaded from the app's own origin and precached with the shell.
There are no third-party models, textures, fonts, audio files, or runtime API
calls.

## Project Conventions

### Code Style

- TypeScript strict mode, including `noUncheckedIndexedAccess` and
  `exactOptionalPropertyTypes`.
- Tuning values live in `src/game/constants.ts`; behavior-changing edits update
  the matching spec.
- Simulation code does not read the DOM. DOM and screens live in `src/main.ts`
  and `src/style.css`.
- Each car is built from shared geometry and cached materials; nothing is
  allocated inside the frame loop except small, bounded values.
- No `console.log` in production paths. Fatal WebGL failure is the only logged
  exception.

### Architecture Patterns

- **Separated simulation and rendering.** `Game` owns the Three.js scene and the
  race state. The HUD subscribes through callbacks; it never reaches into the
  scene.
- **Pure helpers for testable rules.** Track assembly, sampled frames, level
  scaling, damage, lap timing, and input mapping are framework-free modules with
  unit tests.
- **Opponents are kinematic.** Rivals follow the circuit exactly on their own
  lanes, in a mixed field of catalog car models and palette paints; the player's rigid body still collides with them, so they feel
  solid without a second vehicle simulation. Pace is modulated by the track
  tangent's grade, so rivals slow on climbs and speed up on descents. They never
  add damage, because a kinematic body can produce very large solver forces in a
  frame.
- **Seeded, catalog-based generation.** A seed selects and orders authored
  pieces; it never invents geometry. The layout is a regular-polygon family
  (three to six banked corners of 360°/n, with alternating leg lengths allowed
  when the count is even); rotational symmetry makes every layout close for any
  radius or leg length, so the seed can choose the shape and not just the piece
  order. Every piece starts at a known frame. A seed may also carry the route up
  a spiral or ramp, along an elevated stretch, and back down in a different
  section, crossing over lower track. A fresh random seed is drawn on every load
  and every race start, so the track is randomized every time; best times are
  kept per level so the record survives the reseed.
- **Game time, not wall-clock time.** Pausing stops the simulation, timers,
  damage, and camera motion. There is no catch-up simulation after the tab is
  hidden.
- **Frame clamping.** A single frame advances the simulation by at most the
  configured frame delta so returning from a stall cannot teleport the car
  through track geometry.

### Simulation and rendering decisions

- **Rapier is the only vehicle simulation.** It gives real CCD and a stable
  solver for the loop, at 1.57 MB gzip in the lazy compat chunk. If it cannot
  load, the game reports "Physics unavailable" instead of falling back to a
  scripted car.
- **One rounded chassis collider.** Four wheel spheres are four point contacts
  and chatter on tiled deck colliders; a sharp box catches on every seam. One
  `roundCuboid` with a 0.09 m edge rides on a broad contact patch, and the wheel
  meshes are visual only. A triangle-mesh deck was tried and rejected: it has
  the same facet slope changes every 0.4 m and contacts less stably than tiled
  cuboids.
- **Guide assist is intentional.** A toy car cannot hold a vertical loop on tyre
  grip, so the guide adds surface stick, a grip-capped lateral damper, and
  heading and roll/pitch alignment. It adds no forward energy and switches off
  more than one track width from the frame, so a fall cannot be flung back.
- **The player gets a downhill assist.** While the track tangent points
  downhill, engine force rises by half so the player surges through the loop's
  descent as much as the grade-paced rivals do; gravity alone gives only a
  modest gain at the top of the speed range. The assist is off while braking and
  over jump gaps.
- **Steering is a heading target, not a torque.** A direct torque spins the
  1.2 kg body far too fast; the guide turns the nose toward
  `tangent + steer × 0.22 rad` with yaw damping. Thrust follows the racing line
  while the guide is active, otherwise holding lock pushes the car sideways.
- **The roll/pitch spring is damped and the drawn pose is filtered.** Damping
  the alignment spring stops contact bumps ringing the body. The remaining
  millimetre buzz is removed by a 0.04 s low-pass on the rendered position and
  quaternion; physics, damage, and lap progress stay unfiltered, and the filter
  snaps on the first frame and after a rescue.
- **The chase camera works in the car's frame.** Lerping the world position
  toward the car's arc cuts through the loop, so the rig slerps its own
  orientation, filters the position, and clamps at least 0.6 m above the deck.
- **Front wheels steer outside their roll.** The wheel groups use `YXZ` order;
  with the default `XYZ` the spin is applied outside the steer, the axle
  precesses with every rotation, and the fronts wobble at speed.
- **Opponents are kinematic.** Each rival follows the same sampled frames as the
  renderer, in its own lane and at its own pace, through a kinematic body in the
  player's world so it feels solid. Pace follows the frame tangent's vertical
  component, slowing on climbs and speeding up on descents. Their contacts are
  excluded from damage: kinematic bodies can produce very large solver forces in
  one frame.
- **`frame.right` is the driver's left.** The frame is right-handed but a car
  facing `+Z` has its right toward `-X`; player steering is negated once in the
  physics and once for the wheel visuals, pinned by tests.
- **Single-crossing layouts cross on a bridge.** Four 135° corners have two
  diagonals that meet at their midpoints; closure needs diagonals of
  `√2·leg + 2·radius` because the corner arcs push the path forward. One
  diagonal climbs two bridge levels on a spiral, crosses flat, and descends; the
  other keeps the loop at the crossing, so the bridge threads the loop's opening.
  Validation allows a plan-view overlap only when the decks are at least 3.5 m
  apart vertically.
- **Multi-crossing layouts are one authored trefoil.** A seed can replace the
  polygon and single-crossing families with a closed 3D trefoil whose plan
  crosses itself three times. The seed only scales the curve (10–14 m) and
  rotates it; it never reorders catalog pieces. The curve's own height
  separates every crossing by at least 3.5 m, so the deck stays continuous and
  the car drives over and under its route without a jump, gap, or fork. Two or
  three sampled segments carry boost strips. The layout is opt-in, so the
  stock preview and existing seeds keep their old output.
- **The preview can set minimum segment counts.** The track preview lists every
  piece kind in a scrollable vertical table with a minimum-count control:
  **No** leaves it to the seed, **0** excludes it, and **1–5** require at least
  that many pieces, capped at the authored repeat limit (1 for loop, loop
  return, bridge, obstacles, and hill; 2 for boost, steep, and jump pieces).
  Generation counts pieces by kind and searches deterministic
  salted attempts for a playable circuit satisfying every minimum; the count
  list travels through session storage to the race. Excluding the loop produces
  a loopless polygon circuit; structural straights, turns, and boosts stay
  always present. Elevation up and down pieces are independent, so a steep climb
  can return on two 2-level spirals. A multi-crossing layout is one whole
  circuit, so it cannot be combined with catalog requirements; an impossible
  count is reported without replacing the current preview.
- **Elevated sections can carry the route.** Beyond the single-crossing layout, a
  seed may send the circuit up one or two stages, along an elevated stretch, and
  back down in one or two stages on a different section. Any stage can be a
  spiral or a ramp, and a circuit can mix one-level and two-level stages, so
  both transition shapes and both spiral heights appear together. The elevated
  deck may cross over lower track, provided the decks stay at least 3.5 m apart
  and no support touches either deck.
- **The steep ramp is a four-level sky jump.** An 80° face with a 3.2 m entry
  ease and a 2.1 m exit ease rises 32 m in an 8.3 m plan footprint. The whole
  surface is a boost strip, so a car that arrives slowly is pushed up. Its top
  carries a compact kicker, a 4 m gap, and an 18 m wide landing deck at the
  raised height, so a fast car flies off the top instead of staying planted.
  The seed pre-rolls the steep climb independently of the level's straights and
  extends every leg by 24 m when it does, so the module fits on short level-1
  legs and the segment stays in the normal rotation instead of depending on a
  rare long leg. It does not force a matching descent: the route can return on
  a steep descent or any allowed combination, such as two 2-level spirals.
- **Jumps are deckless.** A jump is a kicker, a gap, and a landing ramp. The
  kicker ends on an upward launch slope and the landing ramp enters along the
  same launch line, but its top edge sits below the lip, so the car drops onto
  a lower ramp before flattening out. The ramps and the empty gap still close
  the module vertically. Gap frames exist for progress and the camera but carry
  no collider and disable the guide assist, so the body flies ballistically and
  lands on the ramp. The mesh skips the gap entirely: no deck and no rails.
- **Failed jumps are detected from height.** A jump attempt owns a short span
  from the kicker lip to the end of the landing. If the car drops more than a
  metre below that line or deck, drifts off the side, or sails past the landing
  while airborne, it is rescued after a short grace from the solid run-up before
  the kicker. The generic off-track timer cannot see this quickly because the
  gap has no floor to stop the fall.
- **Scenery is deterministic and one draw call.** The skyline is a single
  instanced box mesh with a canvas façade of lit windows, planned from the
  circuit seed on a jittered grid. Anything within 16 m of a track frame is
  rejected, so the city never touches the track or crowds the chase camera.
  Buildings are presentation only: no colliders, no physics, no timing.
- **The deck floats.** There are no support columns under the track: the layout
  reads as an assembled plastic track, and the underside is part of the swept
  surface rather than a separate structure.
- **Cars are authored GLBs with masked liveries.** The Mach and the GT are
  generated from the reference photos and cleaned up in Blender, then loaded from
  `public/models/car.glb` with its livery PNG and paint mask, all precached with
  the shell. Each car is a clone of that scene. The runtime binds the livery
  texture and mixes the selected paint into the masked white bodywork, scaled by
  the livery's luminance, so stripes, orange aero, glazing, and tyres stay as
  authored. Four named wheel pivots carry the axles, so the front pair can steer
  while all four spin.
- **The car model is separate from its physics envelope.** `car-spec.mjs` holds
  the dimensions and the default body colour. The model's visual width
  across the fender pods may overhang the chassis collider; `CAR.width` stays at
  1.0 because track width is seven car widths and the collider is built from it.

### Asset formats

- Catalog assets live under `assets/`: PNG previews plus binary glTF (`.glb`)
  models for every 3D asset, split by kind (`assets/track/`,
  `assets/buildings/`, `assets/car/`, `assets/cockpit/`). New 3D assets are GLB
  with embedded textures.
- The circuit, city, and cockpit are still built procedurally at runtime. The
  car's `assets/car/mach.glb` is the exception: `npm run model:car`
  validates it and publishes it to `public/models/car.glb`, and the game loads
  that file. Other GLBs remain design and interchange formats.

### Testing Strategy

- Every scenario in `openspec/specs/game/spec.md` and
  `openspec/specs/track-randomization/spec.md` should map to at least one
  automated test, or to a documented manual browser check where WebGL is
  required.
- Pure rules (track randomization, frame continuity, level scaling, damage,
  lap timing, tilt mapping) have Vitest coverage.
- The Playwright suite in `e2e/` covers the shipped bundle: shell boot, race
  lifecycle, laps, input fallbacks, damage, cameras, persistence, reduced
  motion, landscape fit, and offline startup.
- Browser checks run at 844×390 and 667×375 landscape, with touch emulation,
  tilt unavailable, and reduced motion enabled.
- Playwright covers Chromium only. The iOS tilt-permission and install paths
  still need a manual phone-sized pass before a release.
- The browser suite is tuned for small runners: one worker, one spec per process
  through `tools/run-e2e.mjs`, a 256 MB renderer heap cap, and no trace or
  video.
- Unit and browser runs take a repository-wide lock (`build/run-locked.ts`), so
  runs in different worktrees queue instead of colliding on the preview port or
  exhausting memory. The lock lives in the shared Git directory and is released
  on exit, failure, or signal.
- Project and worktree conventions follow `openspec/specs/project/spec.md`.
  Deployment checks follow `openspec/specs/deployment/spec.md`.

### Git Workflow

- `main` is the default branch, the source of truth, and the only branch that
  deploys. Every merge to `main` is a release.
- Work happens on short-lived branches (`feat/…`, `fix/…`, `spec/…`). A branch
  is pushed when a remote exists, merged into `main` from a checkout, and `main`
  is pushed. A pull request is optional and runs the same checks.
- `main` history is append-only: force pushes and deletion are not used.
- Every worktree works on its own branch. A worktree never commits to `main`
  directly; its branch is merged into `main` when the task is done. The primary
  checkout stays on `main` and is fast-forwarded before a task starts.
- Each worktree installs its own dependencies (`npm ci --prefer-offline`); a
  `node_modules` symlink is only safe while the lockfile is identical. Dev
  servers use explicit ports when more than one runs at a time.
- Unit and browser tests queue behind a repository-wide lock in the shared Git
  directory, so concurrent worktrees never run them at the same time. See
  `openspec/specs/project/spec.md` for the branch, worktree, and lock rules.
- `openspec/specs/` is the source of truth for current behavior. Spec changes
  land directly in the baseline specs; no active change folder is kept.
- Build output is never committed; GitHub Pages receives a workflow artifact.
  No `gh-pages` branch is used.

## Domain Context

### Glossary

| Term | Meaning |
| --- | --- |
| Race | One attempt: menu start, countdown, three laps, finish. |
| Lap | One circuit traversal that crosses every checkpoint in order and then the start/finish line. |
| Circuit | A closed track assembled from catalog pieces from a seed and level. |
| Elevated section | A stretch where the deck is held one or more bridge levels above the lower route, entered on a spiral or ramp and left on a spiral or ramp in a different section. |
| Seed | The input that selects the circuit combination; a fresh random seed is drawn on every page load and race start. |
| Segment rule | A minimum count for a piece kind: No (seed choice), 0 (excluded), or 1–5 (minimum pieces). |
| Loopless layout | A polygon circuit assembled without the loop and loop return, used when the loop is excluded. |
| Piece | An authored catalog module: straight, banked turn, loop, hill, jump, shift, boost straight, steep ramp, spiral, or bridge. |
| Level | A difficulty rung controlling the piece pool, radii, bank angle, boost count, and damage sensitivity. |
| Damage | Accumulated impact value that reduces acceleration and top speed; it never ends the race. |
| Rescue | A timed return to the last checkpoint after the car is stuck, inverted, or off track. |
| Checkpoint | An ordered gate that must be crossed before the finish line counts a lap. |
| Best time | The fastest total time at a level, stored locally and kept across circuits. |
| Paint | The stock livery or one of nine named car colours; the player picks one in the menu and it is stored locally. |
| Car | One of the selectable models in the catalog (Mach, GT, Twin, Blade, Manga); the player picks one in the menu and it is stored locally. |
| Opponent | A computer rival on the same circuit, driven along a kinematic racing line in a catalog car and palette paint. |
| Scenery | Deterministic city blocks and towers around the circuit; presentation only. |
| Chase camera | A following camera that rolls with the car through banks and loops. |
| Cockpit camera | A driver's-eye view with a generated dashboard texture. |
| Pause | A frozen race; simulation, timers, damage, and camera motion stop until resumed. |
| PWA | The installable, offline-capable browser build. |

### Default Balance Values (provisional)

| Setting | Default |
| --- | --- |
| Laps per race | 3 |
| Opponents | 3 by default, 0–30 selectable in the menu |
| Countdown | 3 s |
| Track scale | 1.5× the base catalogue |
| Single-crossing share | about half of seeds |
| Multi-crossing share | about a quarter of layout-enabled seeds |
| Track width | 7 world units (seven car widths) |
| Guide rail height | 0.9 world units (at least one car height) |
| Design speed | 12 m/s |
| Opponent cruise speed | 24–31.2 m/s, modulated by track grade |
| Jump | 1.6 m lip at a 0.03 slope · 5 m gap · 17 m landing ramp, top at 0.9 m |
| Scenery clearance | 16 m from every track frame, in plan view |
| Bridge | 8 m per level · 20 m ramps · 24 m flat · 3.5 m overpass clearance |
| Spiral | 18 m radius · 8 m per turn · up to 2 levels |
| Steep ramp | 80° face · 32 m rise (four levels) · 8.3 m plan run · boost strip along the climb · compact sky jump at the lip |
| Maximum speed (flat) | 72 m/s |
| Player engine force | 80 N, with 0.015432 quadratic drag |
| Descent boost | 50% extra engine force while pointing downhill |
| Limp speed | 24 m/s |
| Fixed simulation step | 1/120 s |
| Maximum substeps per frame | 4 |
| Maximum frame delta | 0.1 s |
| Turn bank | 20–45° |
| Loop radius | 10.5 m at level 1, shrinking to about 7.1 m |
| Boost impulse | 7 m/s |
| Boost cooldown | 1.6 s |
| Damage per impulse | 18 |
| Maximum damage | 100% |
| Rescue stall time | 2.5 s |
| Rescue penalty | 3 s |
| Tilt dead zone | 3° |
| Tilt range | 25° |
| Tilt smoothing | 10 Hz |
| Levels | 12 |

### Conceptual Race State

- Mode: `menu`, `countdown`, `racing`, `paused`, or `finished`.
- Progress: lap, lap time, total time, speed, damage.
- Car: track position, velocity, lateral offset, heading, damage, last
  checkpoint.
- Circuit: seed, level, pieces, sampled frames, checkpoints, boost zones.
- Input: tilt target, keyboard steering, brake, drift, camera mode.
- Presentation: camera position and roll, shake or rattle, reduced-motion
  preference.
- Persistence: unlocked level, best time per level, chosen paint, and opponent
  count.

Exact object shapes belong in code, not in behavior specs.

## Important Constraints

- **Landscape first.** Landscape phones are the primary target. A portrait
  viewport shows a rotate prompt and pauses the race.
- **Touch without page gestures.** Swipes, drags, taps, and button presses must
  not scroll, zoom, select text, or trigger the browser's back gesture.
- **Tilt is the touch steering input.** Touch steering uses the phone's tilt and
  there are no on-screen steering buttons. Keyboard steering must always work;
  no platform permission prompt may block play.
- **Local-only.** No account, backend, multiplayer, ads, analytics, or
  third-party runtime calls. Clearing browser storage resets the best time and
  unlocked level.
- **Installable and offline after first load.** Hosting must be HTTPS (GitHub
  Pages provides it). A cold first visit still needs the network.
- **No permanent failure.** Impacts and stalls never end the race; rescue and
  repair keep the player moving. Restarting is always one action away.
- **Honest feedback.** Time, speed, lap, and damage are always visible as text
  and must not rely on colour alone.
- **Performance budget.** The initial app-shell JavaScript transfer stays under
  250 KB gzip. The rigid-body engine is a lazy-loaded chunk with its own 1.75 MB
  gzip budget. The target is 60 fps on a mid-range phone at a device pixel ratio
  capped at 2.
- **Accessible defaults.** Respect reduced motion, keep visible focus, label
  every control, and keep every action reachable in landscape.
- **Balance is provisional.** Values in the specs are starting points; tuning
  changes the spec.

## Out of Scope for the First Release

- Native App Store or Play Store wrappers (Capacitor, Cordova, React Native).
- Multiplayer, ghost cars, leaderboards, or any server-side time storage.
- Accounts, cloud saves, or cross-device sync.
- Track editors, user-generated circuits, or sharing seeds by URL.
- Multiple car models, upgrades, a garage, or opponents.
- Additional tracks, weather, day/night cycles, or progression beyond levels.
- Sound effects and music.
- Ads, purchases, and analytics.
- Photoreal rendering, imported models, textures, or fonts.
- Custom domains, preview deployments, and multiple hosting environments.
- Localization; English only for now.

## External Dependencies

Only the public npm registry at build time, Three.js as the sole runtime
library, and GitHub Pages for hosting. No API keys or repository secrets are
required to build or deploy.
