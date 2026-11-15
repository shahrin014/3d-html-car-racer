# Handover — Rapier physics integration

| Item | Value |
| --- | --- |
| Worktree | `/root/.local/share/opencode/worktree/62f8c4/assets-glb` |
| Branch | `feat/rapier-physics` |
| Last commit | `60770a2` — WIP Rapier rigid-body vehicle module |
| Base | `9a22fcd` — bank/floor clearance fix |
| Live branch | `main` (arcade model, deployed) |
| Runtime | Node 26 LTS (`.nvmrc`) |

The circuit-racer concept, specs, assets, and the playable arcade build are
already on `main`. This handover covers the **one unfinished task**: replacing
the track-constrained movement with a real Rapier rigid-body car.

## What is already done

- `src/game/physics.ts` exists on the branch:
  - Lazy `@dimforge/rapier3d-compat@0.21.0` import (kept out of the shell chunk).
  - Static cuboid colliders for the track surface and both rails, generated from
    `TrackFrame`s.
  - Dynamic chassis: mass, inertia, damping, CCD, friction, restitution.
  - Engine/brake force, yaw-torque steering, track-stick and heading assist.
  - `read()`, `reset(frame)`, `dispose()`.
- `package.json` and the lockfile include Rapier.
- Everything else (track generation, mesh, assets, specs, HUD, cameras, tests)
  is on `main` and green.

## What remains — in order

1. **Integrate** `createPhysics` in `src/game/Game.ts`.
   - Create it lazily on first `startRace` (`await`), keep the arcade path until
     it resolves so the menu never blocks.
   - Feed `VehicleInput` from the existing steer/brake state.
   - Drive `car.group` from `read()`; derive speed, lap progress, and reset from
     the rigid body. Remove the lateral-offset integration.
2. **Budget**: the build gate currently allows 250 kB gzip total.
   - Change to two tiers: app shell ≤250 kB, physics chunk ≤1.3 MB gzip.
   - Files: `build/bundle-budget.ts`, `build/check-bundle-size.ts`.
   - Record the decision in `openspec/specs/game/spec.md`.
3. **Tune**: engine force, steer torque, downforce, linear/angular damping,
   1/240 s step for loop contact, rescue when stuck or off-track, boost impulses.
4. **Verify, then merge**:
   - Physics trace tests: acceleration, steering response, loop at design speed,
     no tunnelling at maximum speed.
   - `npm run check`, `npm run test:e2e`, then merge the branch to `main` and push.

## Key decisions

- **Rapier over cannon-es**: real CCD and a better solver, at ~1.15 MB gzip. It
  is lazy-loaded and cached by the service worker; the shell budget stays.
- **Guide assist is intentional**: a rigid toy car cannot hold a loop on tyre
  grip alone. The assist adds downforce and heading alignment along `-up` and
  the local tangent and adds **no forward energy**. Steering and impacts remain
  physical.
- **Arcade model is the fallback**: keep `Game.simulate` until physics is proven,
  then delete it in the same merge.

## Verification

```bash
npm ci
npm run dev            # drive manually at 844×390
npm run typecheck
npm test               # track tests + new physics traces
npm run test:e2e       # landscape suite
npm run check          # typecheck + tests + build + budget gate
```

## Known issues

- The sandbox has repeatedly killed `tsc`/build runs when several sessions share
  a repository. Keep one session per worktree and run one heavy command at a
  time.
- Do not merge `feat/rapier-physics` until steps 1–4 pass; `main` intentionally
  still ships the arcade model.
- The car model is being iterated in a separate session; `src/game/Car.ts` is
  the game's model, `tools/preview/car-model.mjs` is the catalog model.

## Current state of the game (on `main`)

Three-lap generated circuit (two banked 180° turns, offset loop with a return
shift, crest, boost straights), continuous swept track mesh, chase and cockpit
cameras, landscape HUD, tilt plus button/keyboard fallbacks, damage and rescue.
Assets live in `assets/` as PNG previews plus GLB models for every track piece;
`npm run assets` and `npm run assets:glb` regenerate them.
