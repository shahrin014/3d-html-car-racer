# Replace the lane dodger with an orange-track circuit racer

## Why

The current game is a three-lane endless dodger: traffic, hearts, and a distance
score. The product direction has changed to a toy-car circuit racer inspired by
orange plastic track sets: a narrow track about three car widths wide, loops,
banked turns, acceleration strips, a die-cast-style car, and physics the player
can feel. The dodger's lane model, traffic, hearts, and endless scoring no
longer describe the game.

## What Changes

- **Circuit, not an endless road.** A race is three laps against the clock on a
  closed circuit.
- **Modular track, randomized combination.** The track is assembled from a fixed
  catalog of known-good pieces (straights, banked turns, loops, hills, boost
  straights). A seed decides the combination, never the piece geometry, so every
  circuit is guaranteed to close and every piece has tested physics.
- **One narrow track.** The surface is three car widths wide, orange, and swept
  as one continuous mesh with guide rails. Seams are drawn in the texture, not
  cut into the surface. There are no lanes and no traffic.
- **Track features.** Every circuit contains at least one vertical loop, at least
  two banked turns, and at least one boost strip, scaled by level. The loop ring
  is lifted onto entry and exit ramps so its descending side clears the
  approach, instead of a ring that blocks its own entrance.
- **Die-cast hypercar.** A low, wide candy-red car with a black canopy, black
  aero, gold multi-spoke wheels, and a swan-neck rear wing. Our own design and
  name; no third-party branding or trade dress.
- **Rigid-body physics.** Gravity, tyre contact, motor torque, and impacts come
  from a rigid-body engine behind a small adapter, so the engine can change
  without touching gameplay code.
- **Damage instead of hearts.** Impacts raise a damage value that reduces
  acceleration and top speed. At maximum damage the car limps; the race never
  ends in failure. Being stuck or off the track triggers a timed rescue.
- **Rising difficulty.** Passing a level unlocks the next one: longer circuits,
  tighter turns, steeper banks, smaller loops, fewer boosts, and more punishing
  damage. There are no opponents; the clock and the circuit are the difficulty.
- **Landscape and tilt.** The game runs in landscape only. Tilt steers by default,
  with on-screen buttons and keyboard arrows as fallbacks.
- **Two cameras.** A chase camera and a driver's-eye camera with a generated
  dashboard texture; no modelled interior.
- **Timing instead of score.** The HUD shows level, lap, lap time, total time,
  speed, and damage. Best times and unlocked levels are stored locally.

## Impact

- Affected specs: `game` (nearly every requirement) and `deployment` (viewport,
  orientation, and a possible physics-asset budget).
- Affected code: most of `src/game/` is replaced; `src/main.ts`, `index.html`,
  `src/style.css`, the manifest, tests, and docs change with it.
- Runtime dependency: a rigid-body physics engine. The choice is spike-gated
  (see below) because the best engine costs 1.15 MB gzip.
- Public URL and hosting are unchanged.

## Out of Scope

- Multiplayer, ghost cars, leaderboards, or any backend.
- Track editors, user-generated circuits, or sharing seeds by URL.
- Multiple car models, upgrades, a garage, or opponents.
- Sound effects and music (still deferred).
- Native wrappers or store distribution.
- Photoreal rendering, imported models, textures, or fonts.
- Brand licensing: the game is *inspired by* orange-track toy cars. No
  third-party names, logos, or trade dress are used.

## Resolved Decisions

1. **Track generation: fixed catalog, randomized combination.** Pieces are
   authored and tested once; the seed only selects and orders them. Closure is
   guaranteed by construction, and physics tuning is stable across circuits.
2. **Cockpit view: driver's eye with a generated bitmap dashboard.** A canvas
   texture provides gauges and a wheel hint. No intricate interior modelling and
   no downloaded art.
3. **Steering: tilt drives a target lateral offset** with a dead zone and
   smoothing. This is the fun-for-phone version and ships first; raw torque
   steering stays available behind a tuning constant.
4. **Difficulty: level ladder, not opponents.** Finishing a race unlocks the next
   level. Difficulty rises through track complexity, loop radius, bank angle,
   boost availability, and damage sensitivity. The competition is the clock and
   the stored best time per level.
5. **Seed: one circuit per level per UTC day.** Restarting reuses the circuit;
   a new day or a new level produces a new combination.

## Open Decision: physics engine (spike-gated)

| Option | Payload (gzip) | Strength | Weakness |
| --- | --- | --- | --- |
| `cannon-es` | ~45 KB | Fits the current budget, instant boot, pure JS | No CCD; solver is weaker; loops need substeps and thick planks |
| Rapier (`@dimforge/rapier3d`) | ~1.15 MB WASM + 34 KB glue | Fast, stable, built-in CCD, best for loops | ~25× the shell budget; async boot and a visible first load on mobile |

Plan: implement the adapter and the loop/no-tunnelling acceptance test against
`cannon-es` first. If the car tunnels at maximum speed or cannot hold a loop with
1/240 s substeps, switch to Rapier and raise the program budget to 1.3 MB gzip,
loading the engine as a separate cached asset after the menu renders. The adapter
keeps that switch to one module.

## Success Criteria

- A generated circuit loads in under two seconds on a mid-range phone and holds
  60 fps with physics enabled.
- The car completes a loop without contact loss at the design speed and without
  tunnelling at maximum speed.
- Tilt, buttons, and keyboard all steer; the game is playable with tilt disabled.
- Three laps finish and record a time; a destroyed car still finishes.
- Levels unlock in order and each level is measurably harder than the last.
- Landscape lock and rotate prompt behave on a real phone.
- The production build passes whichever budget the physics spike lands on.
