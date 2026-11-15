# Replace the lane dodger with an orange-track circuit racer

## Why

The current game is a three-lane endless dodger: traffic, hearts, and a distance
score. The product direction has changed to a toy-car circuit racer inspired by
orange plastic track sets: a narrow track about three car widths wide, loops,
banked turns, acceleration strips, a die-cast-style car, and physics the player
can feel. The dodger's lane model, traffic, hearts, and endless scoring no
longer describe the game.

## What Changes

- **Circuit, not an endless road.** Each circuit is generated from a seed and is
  a closed loop; a race is three laps against the clock.
- **One narrow track.** The surface is three car widths wide, orange, with guide
  rails. There are no lanes and no traffic.
- **Track features.** Every circuit contains at least one vertical loop, at least
  two banked turns, at least two boost strips, and rolling elevation.
- **Real rigid-body physics.** A physics engine simulates gravity, tyre contact,
  motor torque, and impacts. The car can leave the ground, roll through a loop,
  and hit rails.
- **Damage instead of hearts.** Impacts raise a damage value that reduces
  acceleration and top speed. At maximum damage the car limps; the race never
  ends in failure. Being stuck or off the track triggers a timed rescue.
- **Landscape and tilt.** The game runs in landscape only. Steering comes from
  device tilt, with on-screen buttons and keyboard arrows as fallbacks.
- **Two cameras.** A chase camera and a driver's-eye cockpit camera.
- **Timing instead of score.** The HUD shows lap, lap time, total time, speed,
  and damage. The best total time for the day's circuit is stored locally.
- **Car design.** A low, wide die-cast toy car: long hood, exposed chrome engine,
  hood scoop, oversized rear wheels, flame livery, no downloaded assets.

## Impact

- Affected specs: `game` (nearly every requirement) and `deployment` (viewport
  and orientation in the browser check).
- Affected code: most of `src/game/` is replaced; `src/main.ts`, `index.html`,
  `src/style.css`, the manifest, tests, and docs change with it.
- New runtime dependency: a rigid-body physics engine (see Open Decisions).
- Bundle budget: the 250 KB gzip ceiling stays; the physics engine must fit
  inside it.
- Public URL and hosting are unchanged.

## Out of Scope

- Multiplayer, ghost cars, leaderboards, or any backend.
- Track editors, user-generated circuits, or sharing seeds by URL.
- Multiple car models, upgrades, or a garage.
- Sound effects and music (still deferred).
- Native wrappers or store distribution.
- Photoreal rendering, imported models, textures, or fonts.
- Brand licensing: the game is *inspired by* orange-track toy cars. No
  third-party names, logos, or trade dress are used.

## Open Decisions

These need a decision before implementation starts.

1. **Physics engine.** Recommended: `cannon-es` (pure JavaScript, about 45 KB
   gzip, no WASM, sufficient for one vehicle and a few hundred static boxes).
   Alternative: Rapier (better solver, WASM payload of roughly 600 KB gzip that
   breaks the transfer budget and needs async boot).
2. **Circuit seed.** Recommended: one circuit per UTC day, so the best time means
   something and the daily track is a reason to return. Alternative: a new random
   circuit every run, with best time kept per circuit.
3. **Cockpit view.** Recommended: driver's-eye view over the hood with a hint of
   the wheel and mirrors, not a full modelled interior. Alternative: a full
   dashboard and interior, which costs geometry and framing work.
4. **Steering feel.** Recommended: tilt drives a target lateral offset inside the
   rails, with a small dead zone and smoothing, so the car is steerable without
   fighting the physics. Alternative: tilt applies raw steering torque, which is
   more physical but much harder to control on a phone.
5. **Track difficulty.** Recommended: generated circuits share one difficulty
   band (radius, bank, and loop radius ranges) so daily times are comparable.
   Alternative: seeded difficulty tiers.

## Success Criteria

- A generated circuit loads in under two seconds on a mid-range phone and holds
  60 fps with physics enabled.
- The car completes a loop without contact loss at the design speed and without
  tunnelling at maximum speed.
- Tilt, buttons, and keyboard all steer; the game is playable with tilt disabled.
- Three laps finish and record a time; a destroyed car still finishes.
- Landscape lock and rotate prompt behave on a real phone.
- The production build stays inside the 250 KB gzip budget.
