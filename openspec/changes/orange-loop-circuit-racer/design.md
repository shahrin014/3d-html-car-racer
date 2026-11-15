# Design: orange-loop circuit racer

## Architecture

```
src/game/
  Game.ts            race lifecycle, camera rig, HUD callbacks
  physics/
    adapter.ts       engine-neutral world, body, and joint API
    cannon.ts        cannon-es backend
    rapier.ts        Rapier backend (only if the spike requires it)
    vehicle.ts       chassis, wheels, motor, steering assist
  track/
    catalog.ts       fixed, tested segment definitions
    assemble.ts      pure: seed + level -> segment sequence
    frames.ts        pure: sequence -> sampled centreline frames
    validate.ts      pure: closure, clearance, and feature checks
    TrackMesh.ts     orange planks, rails, supports, boosts, gate
  Car.ts             die-cast car wrapper (shared lofted model in car-model.mjs)
  cockpit.ts         generated dashboard texture (canvas)
  Input.ts           tilt, touch, buttons, and keyboard
  damage.ts          pure: impact -> damage -> performance multiplier
  timing.ts          pure: lap, checkpoint, and level bookkeeping
  levels.ts          pure: level -> piece pool, counts, penalties
  constants.ts       tuning values
```

Simulation never reads the DOM. `catalog`, `assemble`, `frames`, `validate`,
`damage`, `timing`, and `levels` are framework-free and unit tested. The physics
adapter is the only module that knows which engine is active.

## Track model: fixed catalog, randomized combination

### Segment catalog

Pieces are authored once and validated once. Each piece is defined by its local
entry frame, exit frame, length, and metadata:

| Piece | Variants | Notes |
| --- | --- | --- |
| Straight | 8, 12, 16 m | Flat, unbanked |
| Turn | radius 10, 14, 18 m × ±45°, ±90°, ±180° | Bank fixed per radius |
| Loop | radius 6, 7, 8 m | Vertical 360°, entry frame equals exit frame |
| Hill | crest or dip, 1.5 or 2.5 m | Starts and ends at ground level, zero slope |
| Boost straight | 12 m | Straight with an armed strip |

Every piece starts and ends at zero bank and zero slope, so joins are always
continuous. Bank is applied inside the turn and blended back to zero at its ends.
Turn banks follow `atan(v² / (r · g))` at the 12 m/s design speed, clamped to
20–45°.

### Assembly

Assembly is a seeded depth-first search over a 2D grid:

1. Start at the origin heading north on a 2 m cell grid.
2. Pick a piece from the level's pool using the seeded PRNG. Reject the choice if
   any occupied cell would be reused (no self-intersection) or the clearance to a
   non-adjacent section would drop below one car width.
3. Append the piece, updating position and heading by its fixed exit frame.
4. Accept when the turtle returns to the origin and the starting heading after at
   least the level's minimum piece count, with one loop, two banked turns, and
   the level's boost count.
5. Otherwise backtrack. Search is bounded (piece count and node budget); on
   exhaustion the seed is advanced deterministically and assembly restarts.

Because turns are ±45°/±90°/±180°, closure is a discrete condition, and because
piece geometry never changes, a circuit that assembles is known to be playable.
Levels control the piece pool and the counts; the seed controls the order.

### Elevation and loops

Hills and loops are self-contained pieces that return to ground level, so
assembly stays two-dimensional and closure is unaffected. A hill rises and falls
within its own length with zero slope at both ends.

The loop is a 360° vertical ring lifted 0.8 m above the approach, fed by two
3.4 m ramps: one climbs from the entry straight to the ring's base, the other
descends to the exit straight 6.8 m ahead. A ring that touched the ground cannot
be entered, because its descending side would pass back through the approach at
the same height; lifting the ring and fading the guide rails where the ramps
merge keeps the entrance clear. Entry and exit meet the straight at zero slope,
so the piece joins any straight.

## Track construction

Each piece is one continuous swept mesh. The centreline is sampled every 0.35 m
and a rectangular cross-section (3.0 m wide, 0.12 m thick) is swept along the
frames, with explicit normals so the side edges stay crisp. Seam lines are drawn
into a repeating surface texture (one tile per 1.5 m) instead of splitting the
surface into boxes, so there are no gaps, cracks, or steps for the car to catch
on. Rails are swept rectangular tubes with the same treatment. Support pillars
remain separate columns; they are not part of the driving surface.

Collision geometry is generated from the same frames as convex segments, so the
visual mesh never doubles as a physics mesh. If Rapier is adopted, the swept
surface can be used directly as a trimesh collider.

Visual language: saturated orange surface with darker seams, light-grey rails,
dark supports, chevron boost strips, and a start/finish gate with a timing line.

## Asset catalog

Every gameplay asset has a rendered reference in `assets/`:

```
assets/track/    straight, 45/90/180 turns, loop, hill, boost straight
assets/car/      die-cast car hero render
assets/cockpit/  driver's-eye rig with the generated dashboard
```

`tools/preview/` builds each asset from the same parametric definitions the game
uses and renders it in headless Chromium with three.js; `npm run assets`
regenerates the catalog. The renders are documentation only: the game still
loads no models, textures, or fonts at runtime, and the catalog is excluded from
the production bundle.

## Physics

### Adapter

`physics/adapter.ts` exposes world creation, fixed-step stepping, dynamic bodies,
static colliders, revolute joints with motors, ray/contact queries, and transform
readback. Gameplay calls only this API, so the backend can change without
touching race code.

### Backend decision

`cannon-es` is the first backend: ~45 KB gzip, no WASM, instant boot. The
acceptance test is a scripted car at maximum speed through the thinnest plank and
a full loop at design speed. If either fails at 1/240 s substeps, the project
switches to Rapier (measured ~1.57 MB gzip with the compat WASM bundle, lazy-loaded,
with CCD) and raises the budget in the same change. The spike is a deliverable, not a research task.

### Vehicle

- Chassis: one dynamic body, 2.2 × 0.7 × 1.0 m, mass 1.2.
- Wheels: four bodies with revolute joints; the rear pair carries motor torque,
  the front pair steers. Tyre friction holds a 40° bank at design speed.
- Assist: tilt sets a target lateral offset; a weak lateral spring and a yaw
  damper model the guide rails, add no forward energy, and switch off while
  airborne.
- Fixed step: 1/120 s normally, up to four substeps per rendered frame, 1/240 s
  if the spike requires it. Frame delta clamps at 100 ms.
- Loop margin: loop radii and design speed satisfy `v² ≥ g·r` at the top with at
  least 20% headroom.

## Steering

Tilt reads `deviceorientation.gamma`, zeroed at race start, passed through a 3°
dead zone, normalised over 25°, and smoothed at 10 Hz into a target lateral
offset. iOS permission is requested from the Start button; refusal is silent and
leaves buttons and keyboard in charge. Buttons are 56×56 CSS px with accessible
names; arrows and `A`/`D` mirror them. Throttle is automatic; a hold-to-brake
control sits under the left thumb.

A `STEERING_MODE` tuning constant keeps the raw-torque variant available for
comparison without a code rewrite.

## Cameras

- Chase: 6 m behind, 2.2 m above, looking 8 m ahead, using the car's up vector so
  the horizon rolls through loops and banks. Position damped, roll slerped.
- Cockpit: driver's eye 0.55 m above the chassis centre, 0.1 m forward, narrower
  FOV. A generated canvas texture supplies the dashboard, gauges, and a wheel
  hint; geometry is a single curved plane plus a wheel arc. The rig is derived
  from the car's pose rather than the centreline, so steering across the track
  and yawing into a turn carry the view with the body, while the body basis
  still rolls it through banks and loops.
- Both suppress shake and roll jitter under reduced motion. The choice persists
  for the session.

## Damage and rescue

Impacts above 4 N·s raise damage by `min(20, impulse² / 25)`, multiplied by the
level's damage factor. Damage scales engine force and top speed down to 55% at
100%, adds sparks above 60, and rattles the camera. There is no failure state.

If the car is off the track, inverted, or below 1 m/s for 2.5 s, it is placed at
the last checkpoint facing forward with a level-scaled time penalty (3 s + 1 s
per two levels) and its damage intact.

## Level ladder

| Level | Pieces | Turn radii | Loops | Hills | Boosts | Damage factor | Rescue penalty |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 8–10 | 18, 14 | 1 | 0 | 3 | 1.0 | 3 s |
| 2 | 10–12 | 18, 14 | 1 | 1 | 3 | 1.1 | 3 s |
| 3 | 12–14 | 18, 14, 10 | 1 | 1 | 2 | 1.2 | 4 s |
| 4 | 14–16 | 14, 10 | 2 | 2 | 2 | 1.3 | 4 s |
| 5 | 16–18 | 14, 10 | 2 | 2 | 1 | 1.4 | 5 s |
| 6+ | +2 per level | 10, 14 | 2 | 2–3 | 1 | +0.1 per level, cap 1.8 | +0.5 s per level, cap 8 s |

Circuits grow by two pieces per level after the fifth, capped at 24 pieces.
Levels unlock sequentially. The best total per level and seed is stored; the menu
shows the unlocked level, the next target, and the best time for the current
level.

There are no opponents. The clock, the circuit, and the damage model are the
difficulty; a rival ghost is explicitly out of scope for v1.

## Timing and persistence

Checkpoints sit at each eighth of the lap and at the start/finish line. Progress
uses the nearest centreline sample with hysteresis so a wobble cannot double-count
a checkpoint. A race records lap times, the best lap, and the total.

`localStorage` keys:

- `neon-racer.unlocked-level` — highest unlocked level (default 1).
- `neon-racer.best-time.<seed>.<level>` — best total for that circuit and level.

Reads and writes are best-effort; corrupt values are ignored.

## Performance

- Shell: stays inside the current 250 KB gzip budget with `cannon-es`.
- Physics asset: if Rapier is adopted, it loads as a separate cached module after
  the menu renders, under a declared 1.75 MB gzip budget, and the build enforces
  both numbers.
- Physics: static track bodies never move; SAP broadphase; four substeps maximum.
- Rendering: merged geometry per material, pixel ratio capped at 2, no per-frame
  allocation.

## Risks and mitigations

| Risk | Mitigation |
| --- | --- |
| `cannon-es` tunnels or loses loop contact | Spike test at max speed and through a loop; 1/240 s substeps; thick convex planks; Rapier fallback with CCD and a raised budget |
| Rapier payload hurts first load | Lazy-load after the menu, cache in the PWA, declare and enforce the asset budget, show a loading state on first Start |
| Assembly search fails to close | Bounded DFS with deterministic seed advance; unit tests over many seeds and levels; catalog designed with closure-friendly angles |
| Tilt varies between devices | Dead zone, normalisation, smoothing, per-race calibration, full fallback controls |
| Level ladder becomes unfair | Fixed catalog per level, automated assembly validation, and a playtest pass at levels 1, 3, and 5 |
| Cockpit clipping | Dedicated near plane, camera inside the chassis, screenshot checks through loops and banks |

## Migration

- Delete `collision.ts`, `spawn.ts`, and `difficulty.ts` plus their tests.
- Replace lane and traffic tests with catalog, assembly, level, damage, timing,
  and physics-spike tests.
- Move the e2e suite to 844×390 landscape; inject `deviceorientation` events for
  tilt and assert button/keyboard fallbacks.
- Replace the HUD and menu structure in `index.html`; the service worker asset
  list and manifest orientation change with it.
