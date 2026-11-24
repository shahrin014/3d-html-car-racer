---
name: Add a Track Segment
description: Add or change a procedural track piece in Neon Racer — author the path and constants, integrate it into seeded circuit assembly, keep frames, physics, boost and mesh behaviour in sync, render the catalog asset, and update tests and specs. Use when a new piece, ramp, feature, jump, boost surface, or transition is requested.
---

# Add a track segment

A track segment is a procedural piece of the circuit, not a loaded model. Its
geometry is a path function in `src/game/track.ts`, sampled into `TrackFrame`s
for physics, mesh generation, progress, opponents, and the camera. The catalog
GLB/PNG under `assets/track/` is a render of the same path for documentation and
interchange; it is not what the game loads.

Work in a dedicated branch from `origin/main` (see `AGENTS.md`). Commit and push
the branch, merge it into `main`, and push. CI runs E2E and deploys; run the
local checks with:

```bash
npm run check        # typecheck + unit tests + production build/size budgets
```

Do not run the E2E suite locally.

## 1. Decide which kind of segment you are adding

| Kind | Where it belongs | Example |
| --- | --- | --- |
| Standalone piece | A leg or a fixed point in `assembleCircuit` | straight, turn, hill, obstacle |
| Feature module | A reserved leg (loop, jump, hill) | kicker + gap + landing |
| Level transition | elevation planner / `makeTransition` / `Transition` | ramp-up, spiral-down, steep-jump |
| Feature surface | Any piece carrying a special flag | `boost: true` on a straight or ramp |

Write down:

- start and end frames: both should normally be flat (`tangent.y = 0`,
  `up.y = 1`) so the piece joins any deck with zero slope. An intentional jump
  lip is the exception: it ends on a launch slope and must be followed by a
  gap and a wide landing.
- **progress length** (`Piece.length`, usually the horizontal/plan run, not the
  3D arc length);
- **plan footprint** (`Transition.plan` for a transition, otherwise `length`);
- height/width changes, and whether the deck is solid or a jump gap;
- whether it is a boost surface.

## 2. Add tuning constants in `src/game/constants.ts`

Keep authored sizes, angles, and lengths here. Document the units and whether
the value is at runtime scale or catalogue scale. For a level transition, derive
the height from `BRIDGE_HEIGHT` so the planner can balance it with any allowed descents.

```ts
/** A short climb to a raised deck. */
export const MY_RAMP_HEIGHT = BRIDGE_HEIGHT;
export const MY_RAMP_RUN = 12;
export const MY_RAMP_EASE = 3;
```

Do not hardcode a height that only one hand-picked seed can descend; use one or
two bridge levels unless you also add a descent combination that balances it.

## 3. Author the path in `src/game/track.ts`

`TrackPath` maps `t` in `0..1` to a local sample. Every path starts at the local
origin heading `+Z`; the assembly matrix places it in the world.

```ts
export function myRampPath(
  length = MY_RAMP_RUN,
  height = MY_RAMP_HEIGHT,
): TrackPath {
  return (t) => {
    const y = height * t * t * (3 - 2 * t);
    const slope = (height * 6 * t * (1 - t)) / length;
    const tangent = new THREE.Vector3(0, slope, 1).normalize();
    const right = new THREE.Vector3(1, 0, 0);
    return {
      position: new THREE.Vector3(0, y, length * t),
      tangent,
      up: new THREE.Vector3().crossVectors(tangent, right).normalize(),
      bank: 0,
    };
  };
}
```

Rules:

- Return tangent and up **normalized**, and keep them orthonormal. The rest of
  the pipeline assumes `right = up × tangent`.
- Use `smoothStep`/`smootherstep` for height profiles so joins have zero slope.
- Use `bankForRadius(radius)` and fade bank with `sin(πt)` for banked turns.
- If `bank` is non-zero, the upright frame in the sampler rotates `up` by the
  bank; the path itself only supplies the unbanked `up`.
- `Piece.length` is progress length. For a steep piece, the true 3D arc is
  longer; do not silently change `length` to the arc length or the leg budget
  and boost zones will not close.

## 4. Add the kind and wire it into assembly

Add the kind to the `Piece['kind']` union. If it is a transition, add it to the
local `Transition` union too.

Then decide where it is selected:

- **Fixed feature**: reserve a leg in `assembleCircuit`, subtract its plan length
  from the leg budget, and add it in the leg loop.
- **Seeded transition**: extend `makeTransition`, return its plan distance, and
  keep the descent total equal to the climb total; the descent need not be the same kind.
- **New module with sub-pieces** (like a jump): add the pieces in order with
  `addPiece`; each sub-piece gets its own matrix.

```ts
const plan = myRampRun();
if (direction === 'up' && stageLevels === 2 && available >= plan) {
  return {
    kind: 'my-ramp',
    path: myRampPath(plan, BRIDGE_HEIGHT * 2),
    length: plan,
    plan,
    boost: true,
  };
}
```

A leg budget is:

```ts
leg
  - CIRCUIT_LEAD_STRAIGHT
  - featureLength
  - boostLength
  - transitionPlan
  - obstacleLength;
```

If the budget goes negative, the sampled frames will not close. Add the piece to
`buildFrames`'s normal path only; it already samples every `Piece`.

A piece with a long plan footprint can be silently starved: it only fits on a
rare long leg, so it never appears when the preview regenerates. Do not fix that
by lowering the plan length until the piece is wrong. Instead, pre-roll the
feature before the legs are sized and add enough to every leg for its module;
the regular/alternating polygon still closes. Then force the feature when the
pre-roll selected it. This is how the steep climb gets into the level-1
rotation.

## 5. Keep frames, physics, mesh, and boost in sync

`buildFrames` in `src/game/track.ts` produces `TrackFrame`s. `Game.splitPieces`
in `src/game/Game.ts` **duplicates that sampling** for the renderer. Any new
frame property, width, solidity rule, rail rule, or boost rule must be updated
in both places.

- `solid: piece.kind !== 'gap'` currently controls colliders and the guide
  assist. A new piece is solid by default.
- `rails: piece.kind !== 'gap'` currently controls guide rails. Leave it true
  unless the piece is an intentional open gap.
- `halfWidth` and `widthTaper` widen a landing or a special deck. The mesh,
  physics surface, rails, and jump-failure bounds all read them.
- `piece.boost = true` does two things automatically:
  1. `Game.buildCircuit` adds a boost zone covering the piece;
  2. `Game.splitPieces` draws the boost chevron texture.
  The zone re-triggers every `BOOST_COOLDOWN` while the car stays on it, so a
  slow car gets repeated pushes.
- A jump gap must be `kind: 'gap'` (no deck and no collider) and must be followed
  by a landing. Do not make a normal piece hollow by clearing `solid` alone.

If the piece needs a different boost cadence, expose a piece flag and update
both the zone builder and the test; do not special-case a seed.

## 6. Keep circuit validation and the seed budget honest

`validateCircuit` checks closure, required features, turn radius, and plan-view
clearance. A new transition must:

- start and end at the right height;
- return the route to the base deck before the lap closes;
- keep at least `BRIDGE_CLEARANCE` wherever it overlaps lower track in plan;
- fit inside the leg's plan budget.

All returned circuits have already passed validation; the generator retries a
deterministic seed offset up to `MAX_ASSEMBLY_ATTEMPTS`. If a new piece makes a
layout impossible, the generator can run out of retries. Test a spread of seeds
and levels, not one hand-picked layout.

## 7. Add the catalog render and GLB

The catalog uses the same path definitions in `tools/preview/preview.mjs`.

1. Add the path function and an entry in `PIECES` in
   `tools/preview/preview.mjs`:
   ```js
   'my-ramp-80': {
     title: 'Steep ramp · 80°',
     meta: '80° face · boosts on the climb',
     length: myRampRun(),
     path: myRampUpPath(),
     boost: true,
     view: new THREE.Vector3(0.9, 0.45, 1),
     showLeadIn: true,
     leadOut: { x: 0, y: MY_HEIGHT, z: myRampRun() },
   },
   ```
2. Add the id to `PIECES` in `tools/render-assets.mjs` and
   `tools/export-glb.mjs`:
   ```js
   { id: 'my-ramp-80', folder: 'track' },
   ```
3. Render only the new piece, then export its model:
   ```bash
   npm run assets -- my-ramp-80
   npm run assets:glb -- my-ramp-80
   ```
4. Inspect `assets/track/my-ramp-80.png`. Reject a piece that is floating,
   inverted, has a stepped join, or hides its boost chevrons.
5. Add a row to the **Track pieces** table in `assets/README.md`:
   ```md
   | My ramp | ![my ramp](track/my-ramp-80.png) | 80° face | Short description |
   ```
   Use the same relative `track/<id>.png` path as the other rows.

The inventory is part of the change, not an optional extra. Every
`Piece['kind']` the generator can emit needs a row in the **Track pieces**
table, including internal connectors such as the loop return, bridge ramps,
and bridge deck. A segment with no standalone mesh (the intentional jump gap)
still gets a row, with `—` in the image column and a note that it has no mesh.
Never leave a new kind off the inventory because it is "only" a connector, and
fix a missing row you notice while touching the catalog.

A layout family (such as the multi-crossing trefoil) is not a `Piece`: it is a
whole circuit assembled by its own module, so its sampled segments use one
`Piece['kind']`. Give it a preview entry with `kind: 'layout'`, `closed: true`,
and a runtime `track` config, add the same id to the render and GLB tools, and
add a **Circuit layouts** row instead of a **Track pieces** row. Keep the
preview curve identical to the game module, including its height axis and
crossing count.

Catalogue renders use catalogue scale. The game widens the deck to 7 m and
scales the catalogue by 1.5× at runtime, so keep `tools/preview` in sync with
`src/game/track.ts` rather than copying runtime widths.

## 8. Add tests

At minimum:

- **Path test** in `src/game/track.test.ts`:
  - start/end position, tangent, and up;
  - maximum grade or height;
  - monotonic height where expected;
  - join slope is zero.
- **Generation test** in `src/game/trackRandomization.test.ts`:
  - search seeds until the piece appears;
  - assert `validateCircuit(circuit).ok`;
  - assert the next piece starts at the expected height;
  - assert the circuit closes;
  - add the new kind to the `allowed` set;
  - assert authored length and any `boost` flag.
- **Rotation test** in `src/game/trackFrequency.test.ts`:
  - sample at least 300 fixed seeds at level 1;
  - assert the new kind and the existing rare kinds (steep ramp/descent, bridge
    ramps) clear a minimum count;
  - update the thresholds when the authored rotation intentionally changes.
  A piece that is absent from this sample is effectively not generated for a
  player who only looks at the stock preview.
- **Segment-rule test** in `src/game/requiredSegments.test.ts`:
  - add the new kind to the `SEGMENTS` list;
  - generate with `requiredKinds: [kind]` and assert the circuit contains it;
  - generate with `excludedKinds: [kind]` and assert it is absent;
  - if the kind is structural, assert excluding it throws;
  - keep the impossible-combination cases honest when the new kind introduces
    another family conflict.
- **Physics test** in `src/game/physics.test.ts` if the piece changes driving:
  - reset a car on the approach, drive it through with throttle and the same
    boost-zone logic as `Game`;
  - assert it reaches the top/deck and `maxGap < TRACK_WIDTH`;
  - test a slow entry as well as a fast one.
- If the piece is a new transition, extend the elevation tests so both the
  climb and the chosen descents still return to the lower deck.

## 9. Update behaviour docs

A behaviour-changing segment updates:

- `openspec/specs/track-randomization/spec.md`: default values, selection,
  independent elevation transitions, and a scenario;
- `openspec/specs/game/spec.md`: what the car experiences on the surface;
- `openspec/project.md`: the decision bullet, glossary if needed, and the
  balance table;
- `README.md`: the one-line feature list if it is player-visible.

Specs describe requirements, not the variable names. Keep it short and testable.

## 10. Check, commit, merge

```bash
npm run check
git status --short
```

Before committing, confirm the inventory contract:

- every `Piece['kind']` you added or touched has a row in the **Track pieces**
  table in `assets/README.md`;
- the new kind is in `SEGMENT_GROUPS` in `src/trackPreview.ts` and in
  `SEGMENTS` in `src/game/requiredSegments.test.ts`, so the preview can
  require or exclude it and the segment-rule test covers it;
- structural kinds (straight, turn, boost) stay non-excludable; a new optional
  kind gets `excludedKinds` assembly support and a rule test;
- a new layout family has a **Circuit layouts** row and a matching preview
  entry, not a fake piece row;
- every solid piece has a rendered PNG and a `.glb` under `assets/track/`, and
  both ids are in `tools/render-assets.mjs` and `tools/export-glb.mjs`;
- the intentional no-mesh jump gap is listed as such;
- the rotation test still covers the new kind and the existing rare kinds;
- the specs and the skill still describe the segment and its placement.

Then commit the piece, its tests, the render, the GLB, and the spec/docs changes
on the branch, push it, merge into `main`, and push. Do not commit `dist/` or a
generated `test-results/`/`playwright-report/`.

## Worked example: the 80° steep ramp

Read these in order when you need a real reference:

- `src/game/constants.ts` — `STEEP_RAMP_*` and `SKY_JUMP_*` constants;
- `src/game/track.ts` — `steepEaseIntegral`, `steepRampRun`,
  `steepRampUpPath`, `steepRampDownPath`, `skyJumpPlanarLength`, and the
  `steep-jump` / `steep-ramp-down` choices in the elevation planner;
- `src/game/track.ts` — `Piece['kind']` has both `steep-ramp` and
  `steep-ramp-down`; `Transition` has `steep-jump` and `steep-ramp-down`;
- `src/game/track.ts` — `addTransition` handles `steep-jump` by adding the
  climb, setting `boost`, and calling the compact `addJump`;
- `src/game/Game.ts` — boost zones are created from `piece.boost` and
  `splitPieces` draws the boost texture;
- `src/game/track.test.ts` — 80° peak, exact height, flat lower joins, and the
  balancing descent;
- `src/game/trackRandomization.test.ts` — finds a generated circuit, validates
  it, checks the kicker/gap/landing, and checks a steep descent when the same
  candidate contains one;
- `src/game/physics.test.ts` — drives the ramp with boost zones, observes the
  gap, and asserts the car lands on the raised deck;
- `tools/preview/preview.mjs`, `tools/render-assets.mjs`,
  `tools/export-glb.mjs`, `assets/track/steep-ramp-80.*` and
  `assets/track/steep-ramp-80-down.*`, and the rows in `assets/README.md` — the
  catalog side.

## Pitfalls

| Symptom | Cause / fix |
| --- | --- |
| Car stops at the foot of a steep ramp | The entry ease is shorter than the car and its chassis jams on the face. Lengthen the entry ease and test from rest. Also verify `run`, height, and the 80° peak rather than only looking at the render. |
| Car launches too far and misses the landing | The lip is too high or steep, or the gap/landing is too short. Lower `SKY_JUMP_LIP_HEIGHT`, shorten the kicker, or lengthen the landing; test at the fastest boost-assisted speed, not only from rest. |
| Car never leaves the top | The lip ends flat and the guide spring holds it on the deck. End on a launch slope and add a gap with a wide landing, then verify the jump spans cover both. |
| Piece joins with a visible step | The end tangent or up does not match the next piece. End with `tangent.y = 0` and `up.y = 1` for a flat join. |
| Circuit will not close | The leg budget did not subtract the piece's plan length, or the transition height does not balance its descent. |
| Colliders are missing | `Game.splitPieces` and `buildFrames` disagree, or the piece was marked `gap`. Update both samplers. |
| Boost texture is missing | `piece.boost` was not copied onto the piece in assembly. `Game` builds zones from the same flag. |
| Cars slide back down | The piece is not a boost surface. Set `boost: true` and confirm the zone spans the whole piece. |
| Catalog image is stale | Run `npm run assets -- <id>` after changing the preview path; run `npm run assets:glb -- <id>` for the model. |
| Validation passes locally but a seed throws | Test a seed spread across the level ladder. Add a fallback transition or reduce the piece's authored plan length. |

## File map

| Path | Role |
| --- | --- |
| `src/game/constants.ts` | Authored sizes, angles, heights, and tuning values. |
| `src/game/track.ts` | Path functions, piece kinds, seeded assembly, frames, validation. |
| `src/game/trackMesh.ts` | Sweeps a piece's sampled frames into the deck and rails. |
| `src/game/physics.ts` | Turns solid frames into Rapier colliders; guide assist. |
| `src/game/Game.ts` | `splitPieces` (renderer sampling), boost zones, race loop. |
| `src/game/track.test.ts` | Pure path and piece geometry tests. |
| `src/game/trackRandomization.test.ts` | Seeded generation, closure, and feature tests. |
| `src/game/physics.test.ts` | Rapier drive-through tests. |
| `tools/preview/preview.mjs` | Catalog path definitions and camera framing. |
| `tools/render-assets.mjs` | Catalog PNG renderer. |
| `tools/export-glb.mjs` | Catalog GLB exporter. |
| `assets/track/` | Rendered PNG and GLB catalog files. |
| `assets/README.md` | Track piece catalog table. |
| `openspec/specs/game/spec.md` | Surface and driving behaviour. |
| `openspec/specs/track-randomization/spec.md` | Seeded selection and elevation rules. |
