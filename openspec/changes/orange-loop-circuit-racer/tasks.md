# Tasks

Every task names its verification. Unit tests cover pure modules; browser checks
cover anything that needs WebGL, physics, or a device sensor.

## 1. Segment catalog and assembly

- [ ] 1.1 Define the fixed piece catalog (straights, 45°/90°/180° banked turns, loops, hills, boost straights) with entry/exit frames. Verified by unit tests for frame continuity and bank blending to zero at both ends.
- [ ] 1.2 Implement seeded deterministic assembly as a bounded depth-first search over a 2 m cell grid, rejecting reused cells and clearance below one car width. Verified by a unit test over at least 200 seeds per level.
- [ ] 1.3 Enforce the level pool, minimum piece count, loop/turn/boost minimums, and deterministic seed advance on exhaustion. Verified by unit tests.
- [ ] 1.4 Validate closure, self-intersection, clearance, and required features independently of assembly. Verified by unit tests that deliberately corrupt a sequence.
- [ ] 1.5 Derive plan-view geometry and sampled frames from the accepted sequence. Verified by unit tests for seam continuity and frame orthonormality.

## 2. Track rendering

- [ ] 2.1 Build orange planks, guide rails, supports, boost chevrons, and a start/finish gate from the sampled frames, sharing materials. Verified by screenshots in both cameras.
- [ ] 2.2 Keep geometry static for the whole race and dispose it with the scene. Verified by a manual memory check over three races.
- [ ] 2.3 Verify supports reach the ground outside loops and that no plank floats. Verified by screenshots and a geometry unit test.
- [ ] 2.4 Render the catalog into `assets/track`, `assets/car`, and `assets/cockpit` with `npm run assets`, and keep `assets/README.md` indexed. Verified by reviewing the renders.

## 3. Physics backend and spike

- [ ] 3.1 Define the engine-neutral adapter API (world, fixed step, bodies, colliders, revolute joints with motors, transforms). Verified by unit tests against a fake backend.
- [ ] 3.2 Implement the `cannon-es` backend and assemble the chassis plus four hinged wheels with rear-wheel torque and front-wheel steering. Verified by a headless test that the car accelerates to design speed.
- [ ] 3.3 Run the acceptance spike: maximum speed through the thinnest plank (no tunnelling) and a full loop at design speed (contact held). Verified by a scripted physics test plus a browser run.
- [ ] 3.4 If the spike fails, switch to the Rapier backend with CCD, lazy-load it, and raise the declared physics-asset budget. Verified by the same tests and `npm run build`.
- [ ] 3.5 Tune friction, guide-rail assist, and yaw damping so a 40° bank is held at design speed and the car is steerable. Verified by physics traces and playtesting.
- [ ] 3.6 Implement rescue at the last checkpoint after being stuck, inverted, or off-track for 2.5 s, with the level penalty. Verified by unit tests and a browser stall check.

## 4. Steering and input

- [ ] 4.1 Map `deviceorientation.gamma` to a target lateral offset with 3° dead zone, 25° normalisation, 10 Hz smoothing, and calibration at race start. Verified by unit tests.
- [ ] 4.2 Request iOS sensor permission from the Start gesture and fall back silently on refusal. Verified by a browser check with the API stubbed to reject.
- [ ] 4.3 Keep buttons, arrows, `A`/`D`, brake, pause, and camera controls working as equivalents, with accessible names. Verified by e2e tests.
- [ ] 4.4 Keep gestures from scrolling, zooming, selecting, or navigating. Verified by e2e touch-gesture checks.

## 5. Race lifecycle, laps, and levels

- [ ] 5.1 Replace run state with menu, countdown, racing, paused, and finished. Verified by e2e transitions and unit tests of the state machine.
- [ ] 5.2 Track laps through checkpoints with hysteresis; finish after three laps. Verified by unit tests including a checkpoint wobble.
- [ ] 5.3 Implement the level ladder, unlock-on-finish, and per-level piece pools, boost counts, damage factor, and rescue penalty. Verified by unit tests and a playtest at levels 1, 3, and 5.
- [ ] 5.4 Record lap times, best lap, and total; show them on the finish screen with the next level. Verified by unit tests and e2e.
- [ ] 5.5 Pause freezes physics, timers, damage, and camera motion. Verified by e2e and unit tests.
- [ ] 5.6 Restart regenerates the same circuit for the current seed and level. Verified by e2e.

## 6. Damage and feedback

- [ ] 6.1 Convert impact impulses into damage and a performance multiplier with the level factor. Verified by unit tests.
- [ ] 6.2 Apply the multiplier to engine force and top speed; limp at 100% without ending the race. Verified by unit tests and a browser check.
- [ ] 6.3 Add sparks, camera rattle, and a damage meter; suppress rattle under reduced motion. Verified by e2e with reduced motion.
- [ ] 6.4 Persist unlocked level and best time per seed and level, with corrupt-value handling. Verified by e2e reload and unit tests.

## 7. Cameras and presentation

- [ ] 7.1 Implement the chase camera with roll, damping, and look-ahead. Verified by screenshots through a loop.
- [ ] 7.2 Implement the cockpit camera with a generated dashboard texture and a safe near plane. Verified by screenshots through a loop and in a bank.
- [ ] 7.3 Add a labelled camera toggle that persists for the session. Verified by e2e.
- [ ] 7.4 Force landscape: manifest orientation, rotate prompt, and a paused sim in portrait. Verified by e2e at 390×844 and 844×390.
- [ ] 7.5 Replace the car model with the die-cast design: long hood, chrome engine, scoop, big rear wheels, flame livery. Verified by screenshots.

## 8. HUD and accessibility

- [ ] 8.1 Replace the HUD with level, lap, lap time, total time, speed, damage, brake, camera, and pause. Verified by e2e and screenshots at 844×390 and 667×375.
- [ ] 8.2 Verify focus visibility, accessible names, and that damage and speed are not colour-only. Verified by a manual accessibility pass and e2e name assertions.
- [ ] 8.3 Respect reduced motion for shake, roll jitter, and entrance animation. Verified by e2e computed-style checks.

## 9. Build, tests, and specs

- [ ] 9.1 Keep the app shell inside the 250 KB gzip budget; if Rapier is adopted, declare and enforce a separate 1.3 MB physics-asset budget. Verified by `npm run build`.
- [ ] 9.2 Delete traffic, lane, and difficulty modules and their tests; add catalog, assembly, level, damage, timing, and physics-spike tests. Verified by `npm test`.
- [ ] 9.3 Rewrite the e2e suite for landscape, tilt emulation, button fallback, laps, levels, damage, cameras, and offline reload. Verified by `npm run test:e2e`.
- [ ] 9.4 Update README, handover architecture and risks, and `openspec/project.md`. Verified by document review.
- [ ] 9.5 Archive this change and merge the deltas into the baseline game and deployment specs. Verified by `openspec validate --all`.
