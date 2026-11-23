# Multi-crossing layouts — work in progress handoff

Branch: `wip/multi-crossing-layout` (based on `main`; **not merged**).
Live site is unchanged until this branch is verified and merged.

## What is done and tested

These changes are complete and were checked with `npm run check`
(typecheck + 170+ unit tests + production build/size budgets):

- **Segment rotation fix.** The steep sky-jump route is pre-rolled (30% of
  polygon seeds) and every leg is extended by `SKY_JUMP_LEG_EXTRA` (24 m) so the
  four-level module fits short level-1 legs. The level-1 steep-ramp frequency
  went from ~1.8% to ~10%; `steep-ramp` and `steep-ramp-down` are paired.
- **Rotation guard.** `src/game/trackFrequency.test.ts` samples 300 fixed
  level-1 seeds and asserts every catalog segment clears a minimum, including
  the steep pair and bridge ramps.
- **Catalog/inventory completeness.** Added renders/GLBs for the loop return,
  bridge ramps, bridge deck, and the missing obstacle-corridor GLB. The
  inventory now documents the intentional no-mesh jump gap. `assets/README.md`
  lists every kind.
- **Preview seed override.** `track.html?seed=<seed>` opens a known circuit;
  the URL is kept in sync when the seed is regenerated.
- **Terminology.** The track-randomization spec now uses **single-crossing** for
  the existing one-crossing layout and **multi-crossing** for the 3/4-crossing
  family. A crossing is not the vertical loop. "Figure-eight" and "bowtie" are
  no longer layout names. The user's latest note ("No crossover is a normal
  loop") should be re-confirmed before final naming; the spec currently uses
  "crossing" as the neutral term.
- The user rejected the earlier “weave”/“crossover” names in chat; internal WIP
  identifiers still say `weave` and need renaming when the final name is chosen.

## Multi-crossing layout (WIP)

Draft: `src/game/weave.ts` (not wired).

- A trefoil curve, authored once:
  `(sin t + 2 sin 2t, cos t − 2 cos 2t, −sin 3t)`, with game Y as height and
  X/Z as plan. It has **3 plan crossings**; the curve's own height separates the
  passes (no gaps, jumps, or forks).
- Seed controls only scale (`WEAVE_SCALE` 10 + 0–4), Y rotation, and 2–3 boost
  segments. The curve is split into `WEAVE_SEGMENTS` (12) pieces with identity
  matrices; each piece length is its 3D arc length.
- `Circuit.layout` now has `'polygon' | 'single-crossing' | 'multi-crossing'`;
  `Piece.kind` has `'multi-crossing'`. The existing polygon/single-crossing
  return sets `layout`.
- The WIP constants are `WEAVE_*` in `src/game/constants.ts`.
- Trefoil probe results (`src/game/knot.probe.test.ts`):
  - scale 10: length 288 m, 3 crossings, min crossing height separation 5.0 m,
    max car gap 3.1 m (< 7 m track), max speed 70.7 m/s.
  - scale 14: length 404 m, separation 7.6 m, max gap 2.9 m.
  - scale 7 was too tight and failed (max gap 97 m). Use scale >= 10.
  - The lift is `-minY + TRACK_THICKNESS + 0.25`, so the whole knot floats;
    heights reach ~50–70 m at these scales. Review camera/fog/scenery framing.

## Remaining steps

1. **Wire the family.**
   - Add a `CircuitOptions`/`allowMultiCrossing` option to `generateCircuit` and
     `assembleCircuit`. Use a separate deterministic RNG for the family roll
     (`WEAVE_SHARE` 0.25) so seeds that do not allow multi-crossing keep the
     current polygon/single-crossing output exactly.
   - When the roll selects it, call `assembleWeaveCircuit(seed, level, offset,
     random)` from `src/game/weave.ts`.
   - Call `generateCircuit(seed, DEFAULT_LEVEL, { allowMultiCrossing: true })`
     from `src/game/Game.ts` (both call sites) and `src/trackPreview.ts`, so the
     preview and the race use the same layout for a previewed seed.
2. **Validate.**
   - Add a `validateCircuit` branch for `layout === 'multi-crossing'`: require
     closure, at least two boost pieces (`piece.boost`), and the existing plan
     clearance check (crossing separation > `BRIDGE_CLEARANCE`). Skip the
     loop/turn/turn-radius requirements that only apply to catalog layouts.
   - Count boosts as `piece.boost` OR `kind === 'boost'`; the multi-crossing and
     steep ramp both use the flag.
   - Update the `Circuit` literal in `src/game/obstacles.test.ts` if the new
     required fields are made non-optional.
3. **Permanent tests.**
   - New `src/game/weave.test.ts`: deterministic family selection; closure;
     >= 3 crossings; every crossing separated vertically; at least two boosts;
     closure after `buildFrames`; maybe a 4-crossing variant or adjust the spec
     to “3 crossings currently”.
   - Physics test in `src/game/physics.test.ts`: drive a multi-crossing circuit
     for a lap and assert `maxGap < TRACK_WIDTH` (probe passes at scale 10).
   - Family-frequency test: a fixed sample with `allowMultiCrossing` contains
     both multi-crossing and non-multi-crossing layouts.
   - Delete the temporary `src/game/knot.probe.test.ts` once these land.
4. **Rename internally.** Once the final term is confirmed, rename `weave.ts`,
   `WEAVE_*`, `assembleWeaveCircuit`, and the `multi-crossing` piece/inventory
   wording consistently. The spec currently uses single-crossing/multi-crossing.
5. **Catalog.** Add a `weave-trefoil` (or `multi-crossing-trefoil`) preview path
   and `PIECES` entry in `tools/preview/preview.mjs`, plus the ids in
   `tools/render-assets.mjs` and `tools/export-glb.mjs`. Render the PNG and GLB,
   then add a **Circuit layouts**/inventory row. The asset catalog contract
   currently says every `Piece.kind` needs a row; the multi-crossing segments
   use `'multi-crossing'`.
6. **Docs.** Finish `openspec/specs/game/spec.md` (knot/multi-crossing
   behavior), `openspec/project.md` decision/glossary/balance table, `README.md`
   intro, and the add-track-segment skill (new layout family + catalog row).
   The track-randomization spec is updated with the requirement/scenarios.
7. **Verify and merge.** `npm run check`, then follow `AGENTS.md` to commit,
   push, merge to `main`, and push. Do not merge this branch until the repeated
   layout and physics tests pass.

## Terminology question for the user

The user said:

- figure-eight/bowtie are wrong; “bowtie is basically 1 crossover”;
- “Just use cross over”;
- then “No crossover is a normal loop”.

The spec uses **crossing** for a self-over/under point and **single-crossing /
multi-crossing** for layouts. The normal vertical loop stays a **loop**. Confirm
whether the final canvas/UI wording should be “crossing”, “cross-over”, or
something else before shipping user-facing text.

## Temporary files and deletion rules

| Path | Status | Delete when |
| --- | --- | --- |
| `src/game/knot.probe.test.ts` | Temporary probe; tuning record | Permanent `weave.test.ts` covers the same closure/crossing/flight cases |
| `src/game/weave.ts` | WIP draft, typechecked but not wired | Keep and rename/finish; do not delete unless the feature is abandoned |
| `docs/multi-crossing-wip.md` | This handoff | Delete when the feature and its permanent tests/docs are merged |
| `src/game/trackFrequency.test.ts` | Permanent regression guard | Keep; update thresholds only when the authored rotation changes |

Temporary probe files start with a `TEMPORARY PROBE` header. Do not ship them
in a final feature branch.

## Environment note

This WSL checkout was installed with Node 26 and needs the local libatomic
workaround used here:

```bash
PATH=$HOME/.nvm/versions/node/v26.13.1/bin:$PATH \
LD_LIBRARY_PATH=/tmp/opencode/libatomic/usr/lib/x86_64-linux-gnu:$LD_LIBRARY_PATH \
npm run check
```

`npm ci` was run with those variables; it installed the Linux native bindings.
A later Windows `npm install` may replace them, so re-run `npm ci` under Node 26
before testing.
