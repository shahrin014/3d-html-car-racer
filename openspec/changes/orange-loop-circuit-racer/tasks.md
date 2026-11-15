# Tasks

Every task names its verification. Unit tests cover pure modules; browser checks
cover anything that needs WebGL or a device sensor.

## 1. Circuit generation

- [ ] 1.1 Add a deterministic seeded PRNG and hash in `track/generate.ts`. Verified by unit tests over repeated seeds.
- [ ] 1.2 Generate a closed plan-view spline with retry rules (min radius 7 m, no self-intersection, length 320–480 m). Verified by a 200-seed unit test that every accepted circuit passes validation.
- [ ] 1.3 Add closed elevation harmonics and curvature-driven banking clamped to 15–45°. Verified by unit tests for seam continuity and bank limits.
- [ ] 1.4 Splice a vertical loop into a low-curvature straight and assert its exit frame matches its entry frame. Verified by unit tests.
- [ ] 1.5 Place boost strips and checkpoints; refuse strips inside loops or near the start line. Verified by unit tests.
- [ ] 1.6 Validate lateral clearance, width, and required feature counts. Verified by unit tests plus a documented manual spot check of three seeds.

## 2. Track rendering

- [ ] 2.1 Build orange planks, guide rails, supports, boost chevrons, and a start/finish gate from the sampled frames, sharing materials. Verified by browser screenshots in both cameras.
- [ ] 2.2 Keep geometry static for the whole race and dispose it with the scene. Verified by a manual memory check over three races.
- [ ] 2.3 Verify support pillars reach the ground outside loops and that no plank floats. Verified by screenshots and a geometry unit test.

## 3. Rigid-body vehicle

- [ ] 3.1 Add `cannon-es` and a fixed-step world with a 100 ms frame clamp. Verified by unit tests of the step accumulator.
- [ ] 3.2 Assemble a chassis plus four hinged wheels with rear-wheel motor torque and front-wheel steering. Verified by a headless physics test that the car accelerates and reaches design speed.
- [ ] 3.3 Tune friction, downforce assist, and steering assist so a banked turn is held at 14 m/s and a loop is completed without losing contact. Verified by a physics trace test plus a browser run.
- [ ] 3.4 Prove no tunnelling at maximum speed: 1/120 s step, 1/240 s fallback. Verified by a physics test at maximum speed against the thinnest plank.
- [ ] 3.5 Implement rescue at the last checkpoint after being stuck, inverted, or off-track for 2.5 s, with a 5 s penalty. Verified by unit tests of the trigger and by a browser check after deliberately stalling.

## 4. Steering and input

- [ ] 4.1 Read `deviceorientation.gamma`, calibrate at start, apply a 3° dead zone, 25° normalisation, and 10 Hz smoothing. Verified by unit tests of the mapping.
- [ ] 4.2 Request iOS sensor permission from the Start gesture and fall back silently when refused. Verified by a browser check with the API stubbed to reject.
- [ ] 4.3 Keep on-screen buttons, `←`/`→`, and `A`/`D` working as equivalents. Verified by e2e tests.
- [ ] 4.4 Keep game gestures from scrolling, zooming, selecting, or navigating. Verified by e2e touch-gesture checks.

## 5. Race lifecycle and timing

- [ ] 5.1 Replace run state with menu, countdown, racing, paused, and finished. Verified by e2e screen transitions and unit tests of the state machine.
- [ ] 5.2 Track laps via checkpoints with hysteresis; finish after three laps. Verified by unit tests including a checkpoint wobble.
- [ ] 5.3 Record lap times, best lap, and total; show them on the finish screen. Verified by unit tests and e2e.
- [ ] 5.4 Pause freezes physics, timers, and damage; resume continues without catch-up. Verified by e2e and unit tests.
- [ ] 5.5 Restart regenerates the same circuit for the current seed and resets the race. Verified by e2e.

## 6. Damage and feedback

- [ ] 6.1 Convert impact impulses into damage and a performance multiplier. Verified by unit tests.
- [ ] 6.2 Apply the multiplier to engine force and top speed; limp at 100% without ending the race. Verified by unit tests and a browser check.
- [ ] 6.3 Add sparks, camera rattle, and a damage meter; suppress rattle under reduced motion. Verified by e2e with reduced motion.
- [ ] 6.4 Persist best total time per seed with corrupt-value handling. Verified by e2e reload and unit tests.

## 7. Cameras and presentation

- [ ] 7.1 Implement the chase camera with roll, damping, and look-ahead. Verified by screenshots through a loop.
- [ ] 7.2 Implement the cockpit camera with a safe near plane. Verified by screenshots through a loop and in a bank.
- [ ] 7.3 Add a labelled camera toggle that persists for the session. Verified by e2e.
- [ ] 7.4 Force landscape: manifest orientation, rotate prompt, and a paused sim in portrait. Verified by e2e at 390×844 and 844×390.
- [ ] 7.5 Replace the car model with the die-cast design: long hood, chrome engine, scoop, big rear wheels, flame livery. Verified by screenshots.

## 8. HUD and accessibility

- [ ] 8.1 Replace the HUD with lap, lap time, total time, speed, damage, brake, camera, and pause. Verified by e2e and screenshots at 844×390 and 667×375.
- [ ] 8.2 Verify focus visibility, accessible names, and that lives/score colour is not the only signal. Verified by a manual accessibility pass and e2e name assertions.
- [ ] 8.3 Respect reduced motion for shake, roll jitter, and entrance animation. Verified by e2e computed-style checks.

## 9. Build, tests, and specs

- [ ] 9.1 Keep the production JavaScript inside 250 KB gzip with the physics engine included. Verified by `npm run build`.
- [ ] 9.2 Delete traffic, lane, and difficulty modules and their tests; add track, damage, timing, and physics unit tests. Verified by `npm test`.
- [ ] 9.3 Rewrite the e2e suite for landscape, tilt emulation, button fallback, laps, damage, cameras, and offline reload. Verified by `npm run test:e2e`.
- [ ] 9.4 Update README, handover architecture and risks, and `openspec/project.md`. Verified by document review.
- [ ] 9.5 Archive this change and merge the deltas into the baseline game and deployment specs. Verified by `openspec validate --all`.
