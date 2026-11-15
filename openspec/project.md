# Project Context

## Purpose

Neon Racer is a short-session, endless car racing game that runs in a mobile
browser and installs like an app. The player drives a car down a three-lane
neon highway, switches lanes to dodge traffic, and tries to beat a personal
best score.

The first release is a single-player, offline-capable web app with no account,
backend, or paid content. A run lasts seconds to a few minutes.

The repository was created empty; this scaffold defines the baseline behavior.

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

- **Separated simulation and rendering.** `Game` owns the Three.js scene and
  the run state. The HUD subscribes through callbacks; it never reaches into
  the scene.
- **Pure helpers for testable rules.** Speed ramp, spawn interval, scoring,
  lane clamping, overlap tests, and lane selection are framework-free modules
  with unit tests.
- **Recycling over churn.** Road markings scroll via texture offset; roadside
  posts and traffic cars are pooled and reused. No geometry is created during
  a run.
- **Game time, not wall-clock time.** Pausing stops all timers, invulnerability,
  and scoring. There is no catch-up simulation after the tab is hidden.
- **Frame clamping.** A single frame advances the simulation by at most 50 ms
  so returning from a stall cannot teleport the player through traffic.

### Asset formats

- Catalog assets live under `assets/`: PNG previews plus binary glTF (`.glb`)
  models for every 3D asset. New 3D assets are GLB with embedded textures.
- The game itself still builds geometry procedurally and downloads no models;
  GLB files are the design and interchange format, not runtime dependencies.

### Testing Strategy

- Every scenario in `openspec/specs/game/spec.md` should map to at least one
  automated test, or to a documented manual browser check where WebGL is
  required.
- Pure rules (speed, score, spawn interval, collision, lane clamp, lane
  selection) have Vitest coverage.
- The Playwright suite in `e2e/` covers the shipped bundle: shell boot, run
  lifecycle, persistence, reduced motion, viewport fit, and offline startup.
- Browser checks run at 390×844 portrait, 320×568 small phone, and 844×390
  landscape, with touch emulation and reduced motion enabled.
- Deployment checks follow `openspec/specs/deployment/spec.md`.

### Git Workflow

- `main` is the default branch, the source of truth, and the only branch that
  deploys. Every merge to `main` is a release.
- Work happens on short-lived branches (`feat/…`, `fix/…`, `spec/…`) merged
  into `main` through a pull request.
- `main` rejects force pushes and direct feature commits.
- Behavior changes start as an OpenSpec change under `openspec/changes/`.
  Implement, verify against the delta specs, then archive the change so the
  baseline specs are updated.
- `openspec/specs/` is the source of truth for current behavior.
- Build output is never committed; GitHub Pages receives a workflow artifact.
  No `gh-pages` branch is used.

## Domain Context

### Glossary

| Term | Meaning |
| --- | --- |
| Run | One attempt, from start until the third collision. |
| Lane | One of three fixed driving lines; the car occupies exactly one. |
| Traffic | Opposing cars that approach from the horizon and must be dodged. |
| Heart | One of three lives in a run. |
| Hit | A collision between the player car and a traffic car. |
| Invulnerability | A short grace period after a hit during which collisions are ignored. |
| Wave | One spawn event, containing one or two traffic cars in distinct lanes. |
| Score | Distance travelled × points per metre, rounded down. |
| Best score | The highest score stored on this device. |
| Pause | A frozen run; simulation and rendering stop until resumed. |
| Attract screen | The menu state showing the car and road with no simulation. |
| PWA | The installable, offline-capable browser build. |

### Default Balance Values (provisional)

| Setting | Default |
| --- | --- |
| Lanes | 3, each 2.6 world units wide |
| Starting speed | 24 m/s |
| Speed ramp | +0.5 m/s per second of play |
| Maximum speed | 64 m/s |
| Score rate | 10 points per metre |
| Lives per run | 3 |
| Invulnerability after a hit | 1.4 s |
| Traffic wave interval | 1.25 s at start, 0.55 s at maximum speed |
| Traffic approach speed | 55% of the player's current speed |
| Starting traffic | 3 cars placed ahead of the player |

### Conceptual Run State

- Mode: `menu`, `playing`, `paused`, or `over`.
- Progress: elapsed game seconds, distance in metres, score.
- Player: current lane, target lane, lateral position, remaining hearts,
  invulnerability expiry.
- Traffic: pooled cars with lane, position, and active flag.
- Presentation: camera position, hit-shake amount, reduced-motion preference.
- Persistence: best score only, stored locally on the device.

Exact object shapes belong in code or a change design document, not in
behavior specs.

## Important Constraints

- **Mobile first.** Portrait phones are the primary target. Every action must
  be reachable with one thumb, and there is no keyboard-only path.
- **Touch without page gestures.** Swipes, taps, and button presses must not
  scroll, zoom, select text, or trigger the browser's back gesture.
- **Local-only.** No account, backend, multiplayer, ads, analytics, or
  third-party runtime calls. Clearing browser storage resets the best score.
- **Installable and offline after first load.** Hosting must be HTTPS (GitHub
  Pages provides it). A cold first visit still needs the network.
- **No permanent failure.** A run ends, but restarting is always one tap away.
  Nothing is lost except the current run.
- **Honest feedback.** Score, lives, and pause state are always visible and
  must not rely on color alone.
- **Performance budget.** Initial JavaScript transfer should stay under
  250 KB gzip; the target is 60 fps on a mid-range phone at a device pixel
  ratio capped at 2.
- **Accessible defaults.** Respect reduced motion, keep visible focus, label
  every control, and keep the game playable in landscape even though portrait
  is preferred.
- **Balance is provisional.** Values in the specs are starting points; tuning
  changes the spec.

## Out of Scope for the First Release

- Native App Store or Play Store wrappers (Capacitor, Cordova, React Native).
- Multiplayer, leaderboards, or any server-side score storage.
- Accounts, cloud saves, or cross-device sync.
- Additional cars, tracks, weather, day/night cycles, or progression.
- Sound effects and music.
- Ads, purchases, and analytics.
- Custom domains, preview deployments, and multiple hosting environments.
- Localization; English only for now.

Any of these requires a proposal plus delta specs before implementation.

## External Dependencies

Only the public npm registry at build time, Three.js as the sole runtime
library, and GitHub Pages for hosting. No API keys or repository secrets are
required to build or deploy.
