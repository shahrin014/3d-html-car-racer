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

The game deliberately uses only Three.js primitives and generated canvas
textures. There are no downloaded models, textures, fonts, audio files, or
runtime API calls.

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
- **Seeded, catalog-based generation.** A seed selects and orders authored
  pieces; it never invents geometry. Every piece starts and ends on a known
  frame, and the two sides of the circuit are assembled to the same forward
  length, so closure holds by construction.
- **Game time, not wall-clock time.** Pausing stops the simulation, timers,
  damage, and camera motion. There is no catch-up simulation after the tab is
  hidden.
- **Frame clamping.** A single frame advances the simulation by at most the
  configured frame delta so returning from a stall cannot teleport the car
  through track geometry.

### Asset formats

- Catalog assets live under `assets/`: PNG previews plus binary glTF (`.glb`)
  models for every 3D asset. New 3D assets are GLB with embedded textures.
- The game itself still builds geometry procedurally and downloads no models;
  GLB files are the design and interchange format, not runtime dependencies.

### Testing Strategy

- Every scenario in `openspec/specs/game/spec.md` should map to at least one
  automated test, or to a documented manual browser check where WebGL is
  required.
- Pure rules (track randomization, frame continuity, level scaling, damage,
  lap timing, tilt mapping) have Vitest coverage.
- The Playwright suite in `e2e/` covers the shipped bundle: shell boot, race
  lifecycle, laps, input fallbacks, damage, cameras, persistence, reduced
  motion, landscape fit, and offline startup.
- Browser checks run at 844×390 and 667×375 landscape, with touch emulation,
  tilt unavailable, and reduced motion enabled.
- Deployment checks follow `openspec/specs/deployment/spec.md`.

### Git Workflow

- `main` is the default branch, the source of truth, and the only branch that
  deploys. Every merge to `main` is a release.
- Work happens on short-lived branches (`feat/…`, `fix/…`, `spec/…`) merged
  into `main` through a pull request.
- `main` rejects force pushes and direct feature commits.
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
| Seed | The input that selects the circuit combination; the default is the current UTC date. |
| Piece | An authored catalog module: straight, banked turn, loop, hill, shift, or boost straight. |
| Level | A difficulty rung controlling the piece pool, radii, bank angle, boost count, and damage sensitivity. |
| Damage | Accumulated impact value that reduces acceleration and top speed; it never ends the race. |
| Rescue | A timed return to the last checkpoint after the car is stuck, inverted, or off track. |
| Checkpoint | An ordered gate that must be crossed before the finish line counts a lap. |
| Best time | The fastest total time for a circuit seed and level, stored locally. |
| Chase camera | A following camera that rolls with the car through banks and loops. |
| Cockpit camera | A driver's-eye view with a generated dashboard texture. |
| Pause | A frozen race; simulation, timers, damage, and camera motion stop until resumed. |
| PWA | The installable, offline-capable browser build. |

### Default Balance Values (provisional)

| Setting | Default |
| --- | --- |
| Laps per race | 3 |
| Countdown | 3 s |
| Track scale | 1.5× the base catalogue |
| Track width | 5 world units (five car widths) |
| Guide rail height | 0.9 world units (at least one car height) |
| Design speed | 12 m/s |
| Maximum speed | 24 m/s |
| Limp speed | 10 m/s |
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
- Input: tilt target, button and keyboard steering, brake, camera mode.
- Presentation: camera position and roll, shake or rattle, reduced-motion
  preference.
- Persistence: unlocked level and best time per circuit seed and level.

Exact object shapes belong in code, not in behavior specs.

## Important Constraints

- **Landscape first.** Landscape phones are the primary target. A portrait
  viewport shows a rotate prompt and pauses the race.
- **Touch without page gestures.** Swipes, drags, taps, and button presses must
  not scroll, zoom, select text, or trigger the browser's back gesture.
- **Tilt is optional.** Tilt steers by default, but buttons and keyboard must
  always work; no platform permission prompt may block play.
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
