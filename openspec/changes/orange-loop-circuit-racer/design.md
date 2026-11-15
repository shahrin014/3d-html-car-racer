# Design: orange-loop circuit racer

## Architecture

```
src/game/
  Game.ts            race lifecycle, camera rig, HUD callbacks
  physics/           cannon-es world, vehicle assembly, fixed-step loop
  track/
    generate.ts      pure: seed -> circuit description
    layout.ts        pure: pieces -> sampled centreline frames
    validate.ts      pure: closure, clearance, radius and loop checks
    TrackMesh.ts     orange planks, rails, supports, boost strips
  Car.ts             die-cast car model from shared primitives
  Input.ts           tilt, touch, and keyboard steering
  damage.ts          pure: impact -> damage -> performance multiplier
  timing.ts          pure: lap and checkpoint bookkeeping
  constants.ts       tuning values
```

Simulation stays free of DOM access. `TrackMesh` and the renderer own Three.js
objects; `generate`, `layout`, `validate`, `damage`, and `timing` are
framework-free and unit tested.

## Circuit generation

1. **Plan view.** Place 8–12 control points on a ring whose radius varies within
   ±25%. Join them with a closed Catmull-Rom spline, then resample by arc length
   at 0.5 m. Reject layouts whose minimum turn radius is below 7 m, that
   self-intersect in plan view, or whose total length falls outside 320–480 m;
   retry with the next deterministic seed offset.
2. **Elevation.** Add a closed, smooth profile of two sine harmonics (0.8–2.5 m
   amplitude) so slope is continuous at the start line.
3. **Banking.** Bank angle follows `atan(v² / (r · g))` at the 14 m/s design
   speed, clamped to 15–45°, then smoothed along the track. Turns shorter than a
   car length stay flat.
4. **Features.**
   - Pick a low-curvature straight of at least 60 m and splice a vertical loop
     into it. A loop is a 360° arc in the tangent/up plane; its exit frame equals
     its entry frame, so closure is preserved.
   - Pick two banked turns (the two highest-curvature sections) and mark them.
   - Place two boost strips: one on the exit of a banked turn, one on a straight.
     Never inside a loop and never within 15 m of the start line.
5. **Validation.** Assert closed position and tangent at the seam, minimum
   lateral clearance between non-adjacent sections, at least one loop, two banks,
   two boosts, and constant width. The generator retries with a new offset when a
   validation rule fails.

The seed is a string; the generator hashes it to a 32-bit integer and uses a
deterministic PRNG. The same seed always produces the same circuit in every
browser and in tests.

## Track construction

The centreline is sampled into 1.5 m "planks". Each plank is a convex box
(3.0 m wide, 0.12 m thick) oriented by the local frame, with two rail boxes
0.35 m tall on the edges. Convex boxes keep physics cheap and stable, give the
plastic-seam look, and behave correctly inside a loop. Support pillars drop from
each plank to `y = 0` where the plank is above the ground and outside the loop.
Plank, rail, support, and boost geometry share materials; no geometry is created
during a race.

Visual language: saturated orange surface with darker seams and a slight
specular highlight, light-grey rails, dark supports, chevron boost strips, and a
start/finish gate with a timing line.

## Vehicle physics

- Engine: `cannon-es` world, gravity 9.81, fixed step 1/120 s, at most four
  substeps per rendered frame, with a 100 ms frame clamp.
- Chassis: one rigid body (2.2 × 0.7 × 1.0 m, mass 1.2). Four wheel bodies with
  hinge constraints; the rear pair carries motor torque, the front pair steers.
  Tyre friction is high enough to hold a banked turn at design speed and low
  enough to slide when the player overdrives it.
- Assist: a weak lateral spring toward the steering target models the guide
  rails and keeps the car steerable. It never adds energy along the tangent and
  is disabled while airborne.
- Loops: the loop radius (6.5–8 m) and the design speed guarantee
  `v² ≥ g · r` at the top, and the shallow plank thickness keeps contact within
  one substep at maximum speed. If tunnelling appears, substeps rise to 1/240 s
  before any geometry is thickened.
- Recovery: if the car is inverted, off the track, or below 1 m/s for 2.5 s, it
  is placed at the last checkpoint facing forward with a 5 s time penalty and
  its damage intact.

## Steering and controls

- Tilt: `deviceorientation.gamma` (left/right roll) is zeroed at race start,
  passed through a 3° dead zone, normalised over 25°, and smoothed at 10 Hz into
  a steering value in [-1, 1]. iOS permission is requested from the Start
  button; refusing falls back silently to buttons.
- Fallbacks: on-screen left/right buttons (56×56 CSS px), `←`/`→` and `A`/`D`.
  Every control has an accessible name and visible focus.
- Throttle is automatic. A brake button (hold) sits under the left thumb; the
  camera toggle and pause sit top-right, away from the tilt grip.
- Landscape only: the manifest declares `orientation: landscape`. A portrait
  viewport shows a rotate prompt and pauses the race; the sim does not advance
  behind the prompt.

## Cameras

- Chase: 6 m behind and 2.2 m above the car, looking 8 m ahead, using the car's
  up vector so the horizon rolls through loops and banks. Position is damped;
  roll is slerped.
- Cockpit: driver's eye 0.55 m above the chassis centre, 0.1 m forward, with a
  narrower FOV and no body between the camera and the track.
- Both cameras suppress shake and roll jitter under reduced motion. The choice
  persists for the session and is exposed as a labelled toggle.

## Damage model

Impacts above 4 N·s raise damage by `min(20, impulse² / 25)`. Damage scales
engine force and top speed down to 55% at 100%, adds spark particles above 60,
and rattles the camera. There is no failure state; a destroyed car can still
finish.

## Timing and persistence

The start/finish line is a checkpoint; checkpoints are placed every eighth of the
lap. Progress is tracked by the nearest centreline sample with hysteresis so a
wobble at a checkpoint cannot double-count. A race records lap times, the best
lap, and the total. The best total for the current seed is stored in
`localStorage` under `neon-racer.best-time.<seed>`; failures to read or write are
ignored.

## Performance

Budget: 250 KB gzip JavaScript, 60 fps on a mid-range phone. Physics runs at 120
Hz with four substeps at worst; static track bodies use a static-static-free
broadphase (SAP) and never move. Geometry is merged per material where possible,
pixel ratio is capped at 2, and no allocation happens in the frame loop.

## Risks and mitigations

| Risk | Mitigation |
| --- | --- |
| Rigid-body loops lose contact or tunnel | Radius and speed design margins, 1/240 substeps fallback, convex planks, Playwright screenshot review plus a physics trace test |
| Phone tilt varies wildly between devices | Dead zone, normalisation, smoothing, calibration on start, and full button/keyboard fallback |
| Physics engine breaks the transfer budget | `cannon-es` only; budget gate fails the build; no WASM |
| Generated circuits are unfair or self-intersect | Seed-independent validation plus retries; unit tests across many seeds |
| Cockpit camera clips geometry | Dedicated near plane and camera offset inside the chassis; screenshot check in both cameras |
| iOS sensor permission denied | Buttons remain primary; no blocking prompt after the start gesture |

## Migration

- `collision.ts`, `spawn.ts`, and `difficulty.ts` are deleted with their tests.
- `lane clamp`, speed-ramp, and traffic tests are replaced by track, damage, and
  timing tests.
- The e2e suite moves to an 844×390 landscape viewport; tilt is emulated by
  dispatching `deviceorientation` events, with button steering as the asserted
  fallback.
- The HUD in `index.html` is replaced; `frame`, `hearts`, `best score`, and the
  install prompt structure change with it.
