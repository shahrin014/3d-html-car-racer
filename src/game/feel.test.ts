import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { FIXED_STEP, TRACK_WIDTH } from './constants';
import { createPhysics } from './physics';
import { buildFrames, generateCircuit, type TrackFrame } from './track';

/**
 * Handling profile for the assisted rigid body.
 *
 * These tests exist because the car can pass a "it completes a lap" check
 * while spending most of the lap sideways. Slip angle (the angle between the
 * nose and the direction of travel) is the measure of that: above roughly
 * 10 degrees the car reads as sliding, and a car that is sideways for half the
 * lap feels floaty even though it never leaves the track.
 */

function polygonFrames(): TrackFrame[] {
  for (let index = 0; index < 80; index += 1) {
    const circuit = generateCircuit(`feel-polygon-${index}`, 1);
    if (!circuit.pieces.some((piece) => piece.kind === 'bridge')) {
      return buildFrames(circuit);
    }
  }
  throw new Error('no polygon circuit found');
}

/** Advance the nearest-frame search without letting the closing frame win at
 * the start line; this mirrors `Game.nearestTrackIndex`. */
function nextIndex(
  frames: TrackFrame[],
  previous: number,
  position: { x: number; y: number; z: number },
): number {
  let best = previous;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (let offset = -2; offset <= 40; offset += 1) {
    const candidate = previous + offset;
    if (candidate < 0) {
      continue;
    }
    const index =
      candidate >= frames.length ? candidate - frames.length : candidate;
    const frame = frames[index];
    if (!frame) {
      continue;
    }
    const dx = frame.position.x - position.x;
    const dy = frame.position.y - position.y;
    const dz = frame.position.z - position.z;
    const distance = dx * dx + dy * dy + dz * dz;
    if (distance < bestDistance) {
      bestDistance = distance;
      best = index;
    }
  }
  return best;
}

function lateralOffset(
  frame: TrackFrame,
  position: { x: number; y: number; z: number },
): number {
  return (
    (position.x - frame.position.x) * frame.right.x +
    (position.y - frame.position.y) * frame.right.y +
    (position.z - frame.position.z) * frame.right.z
  );
}

interface Pose {
  velocity: { x: number; y: number; z: number };
  quaternion: { x: number; y: number; z: number; w: number };
}

/** Nose direction in world space. */
function forwardOf(pose: Pose): { x: number; y: number; z: number } {
  const { x, y, z, w } = pose.quaternion;
  return {
    x: 2 * (x * z + w * y),
    y: 2 * (y * z - w * x),
    z: 1 - 2 * (x * x + y * y),
  };
}

/** Component of the car's nose along a reference `right` vector. */
function noseSide(
  pose: Pose,
  right: { x: number; y: number; z: number },
): number {
  const forward = forwardOf(pose);
  return forward.x * right.x + forward.y * right.y + forward.z * right.z;
}

/** Signed slip: positive means sliding toward `frame.right`. */
function slipDegrees(pose: Pose, forward: { x: number; y: number; z: number }) {
  const speed =
    Math.hypot(pose.velocity.x, pose.velocity.y, pose.velocity.z) || 1e-6;
  const dot =
    (pose.velocity.x * forward.x +
      pose.velocity.y * forward.y +
      pose.velocity.z * forward.z) /
    speed;
  const side =
    pose.velocity.x * forward.z - pose.velocity.z * forward.x;
  const angle = (Math.acos(Math.max(-1, Math.min(1, dot))) * 180) / Math.PI;
  return Math.sign(side) * angle;
}

/** Accelerate to racing speed while staying on the racing line. */
function drive(
  physics: Awaited<ReturnType<typeof createPhysics>>,
  frames: TrackFrame[],
) {
  let index = 0;
  for (let step = 0; step < 120 * 1.2; step += 1) {
    const state = physics.read();
    index = nextIndex(frames, index, state.position);
    const frame = frames[index]!;
    const lateral = lateralOffset(frame, state.position);
    const lateralSpeed =
      state.velocity.x * frame.right.x +
      state.velocity.y * frame.right.y +
      state.velocity.z * frame.right.z;
    const steer = Math.max(
      -1,
      Math.min(1, lateral / 0.9 + lateralSpeed * 0.15),
    );
    physics.step(FIXED_STEP, { throttle: 1, brake: false, steer }, frame);
  }
  return index;
}

describe('handling feel', () => {
  it('keeps the car pointing where it travels for a whole lap', async () => {
    const frames = polygonFrames();
    const physics = await createPhysics(frames);
    let index = 0;
    let crossed = false;
    let maxSpeed = 0;
    let minRacingSpeed = Number.POSITIVE_INFINITY;
    let maxSlip = 0;
    let sumAbsSlip = 0;
    let sliding = 0;
    let samples = 0;

    for (let step = 0; step < 120 * 30 && !crossed; step += 1) {
      const state = physics.read();
      const previous = index;
      index = nextIndex(frames, index, state.position);
      if (previous > frames.length * 0.75 && index < frames.length * 0.25) {
        crossed = true;
      }
      const frame = frames[index]!;
      const lateral = lateralOffset(frame, state.position);
      const lateralSpeed =
        state.velocity.x * frame.right.x +
        state.velocity.y * frame.right.y +
        state.velocity.z * frame.right.z;
      // The test driver steers toward the centreline, as a player would.
      const steer = Math.max(
        -1,
        Math.min(1, lateral / 0.9 + lateralSpeed * 0.15),
      );

      const slip = Math.abs(slipDegrees(state, forwardOf(state)));
      maxSpeed = Math.max(maxSpeed, state.speed);
      maxSlip = Math.max(maxSlip, slip);
      sumAbsSlip += slip;
      samples += 1;
      if (slip > 10) {
        sliding += 1;
      }
      if (step > 120 * 2) {
        minRacingSpeed = Math.min(minRacingSpeed, state.speed);
      }

      physics.step(FIXED_STEP, { throttle: 1, brake: false, steer }, frame);
    }

    const meanSlip = sumAbsSlip / samples;
    const slidingShare = sliding / samples;
    console.log(
      `lap: maxSpeed=${maxSpeed.toFixed(1)} m/s minRacingSpeed=${minRacingSpeed.toFixed(1)} m/s ` +
        `mean|slip|=${meanSlip.toFixed(1)} deg max|slip|=${maxSlip.toFixed(1)} deg ` +
        `sliding=${(100 * slidingShare).toFixed(0)}%`,
    );

    expect(crossed).toBe(true);
    expect(maxSpeed).toBeGreaterThan(10);
    expect(minRacingSpeed).toBeGreaterThan(5);
    // A tyre that is never more than ~10 degrees off its travel direction.
    expect(meanSlip).toBeLessThan(10);
    expect(maxSlip).toBeLessThan(45);
    expect(slidingShare).toBeLessThan(0.45);

    physics.dispose();
  }, 60_000);

  it('steers right when the player steers right', async () => {
    const frames = polygonFrames();
    const physics = await createPhysics(frames);
    // A second, identical car takes the same run with neutral steering. The
    // guide's yaw spring rings for a moment at speed, so comparing the steered
    // run with its own phase instead of with a single frame is the only stable
    // way to read the sign of the steering.
    const control = await createPhysics(frames);
    let index = drive(physics, frames);
    let controlIndex = drive(control, frames);
    const before = physics.read();
    const beforeFrame = frames[nextIndex(frames, index, before.position)]!;
    const beforeLateral = lateralOffset(beforeFrame, before.position);

    for (let step = 0; step < 30; step += 1) {
      const state = physics.read();
      index = nextIndex(frames, index, state.position);
      physics.step(FIXED_STEP, { throttle: 1, brake: false, steer: 1 }, frames[index]!);

      const controlState = control.read();
      controlIndex = nextIndex(frames, controlIndex, controlState.position);
      control.step(
        FIXED_STEP,
        { throttle: 1, brake: false, steer: 0 },
        frames[controlIndex]!,
      );
    }

    const after = physics.read();
    const afterFrame = frames[nextIndex(frames, index, after.position)]!;
    const movedRight = lateralOffset(afterFrame, after.position) - beforeLateral;
    // Compare each nose with its own track frame and use a shorter window so
    // the fixed-lock angle is not blurred by the extra ground the faster car
    // covers.
    const steeredSide = noseSide(after, afterFrame.right);
    const neutralAfter = control.read();
    const neutralFrame = frames[nextIndex(frames, controlIndex, neutralAfter.position)]!;
    const neutralSide = noseSide(neutralAfter, neutralFrame.right);

    console.log(
      `steer right: lateral moved ${movedRight.toFixed(2)} m, ` +
        `nose side neutral ${neutralSide.toFixed(2)} -> steered ${steeredSide.toFixed(2)}`,
    );

    expect(movedRight).toBeLessThan(0);
    // `frame.right` points to the driver's left, so a right turn moves the
    // nose further away from it than the neutral run does.
    expect(steeredSide).toBeLessThan(neutralSide - 0.005);

    physics.dispose();
    control.dispose();
  }, 60_000);

  it('drifts wider than normal steering with the nose further into the turn', async () => {
    // A straight deck isolates the handling: on a generated corner the car
    // already carries slip from following the racing line into the test.
    const frames: TrackFrame[] = [];
    for (let z = 0; z <= 160; z += 1) {
      frames.push({
        position: new THREE.Vector3(0, 0, z),
        tangent: new THREE.Vector3(0, 0, 1),
        up: new THREE.Vector3(0, 1, 0),
        right: new THREE.Vector3(1, 0, 0),
        s: z,
        solid: true,
        halfWidth: TRACK_WIDTH / 2,
        rails: true,
      });
    }
    const driftCar = await createPhysics(frames);
    const gripCar = await createPhysics(frames);
    // Build up to racing speed with both cars on the centreline.
    const warmup = { throttle: 1, brake: false, steer: 0 };
    let driftIndex = 0;
    let gripIndex = 0;
    for (let step = 0; step < 90; step += 1) {
      const driftState = driftCar.read();
      driftIndex = nextIndex(frames, driftIndex, driftState.position);
      driftCar.step(FIXED_STEP, warmup, frames[driftIndex]!);

      const gripState = gripCar.read();
      gripIndex = nextIndex(frames, gripIndex, gripState.position);
      gripCar.step(FIXED_STEP, warmup, frames[gripIndex]!);
    }

    const before = driftCar.read();
    const beforeFrame = frames[nextIndex(frames, driftIndex, before.position)]!;
    const beforeLateral = lateralOffset(beforeFrame, before.position);

    let driftSlip = 0;
    let gripSlip = 0;
    for (let step = 0; step < 42; step += 1) {
      const driftState = driftCar.read();
      driftIndex = nextIndex(frames, driftIndex, driftState.position);
      driftCar.step(
        FIXED_STEP,
        { throttle: 1, brake: false, steer: 1, drift: true },
        frames[driftIndex]!,
      );
      driftSlip = Math.max(
        driftSlip,
        Math.abs(slipDegrees(driftState, forwardOf(driftState))),
      );

      const gripState = gripCar.read();
      gripIndex = nextIndex(frames, gripIndex, gripState.position);
      gripCar.step(
        FIXED_STEP,
        { throttle: 1, brake: false, steer: 1 },
        frames[gripIndex]!,
      );
      gripSlip = Math.max(
        gripSlip,
        Math.abs(slipDegrees(gripState, forwardOf(gripState))),
      );
    }

    const afterDrift = driftCar.read();
    const afterGrip = gripCar.read();
    const driftFrame = frames[nextIndex(frames, driftIndex, afterDrift.position)]!;
    const gripFrame = frames[nextIndex(frames, gripIndex, afterGrip.position)]!;
    const driftMoved = lateralOffset(driftFrame, afterDrift.position) - beforeLateral;
    const gripMoved = lateralOffset(gripFrame, afterGrip.position) - beforeLateral;

    console.log(
      `drift: slip ${gripSlip.toFixed(1)} -> ${driftSlip.toFixed(1)} deg, ` +
        `lateral ${Math.abs(gripMoved).toFixed(2)} -> ${Math.abs(driftMoved).toFixed(2)} m`,
    );

    // A drift holds the nose well off its travel direction and carries the car
    // wider than the same lock without drift.
    expect(driftSlip).toBeGreaterThan(gripSlip + 5);
    expect(Math.abs(driftMoved)).toBeGreaterThan(Math.abs(gripMoved) + 0.2);

    driftCar.dispose();
    gripCar.dispose();
  }, 60_000);

  it('does not spin out on a held full lock', async () => {
    const frames = polygonFrames();
    const physics = await createPhysics(frames);
    let index = drive(physics, frames);
    const startSpeed = physics.read().speed;

    for (let step = 0; step < 120; step += 1) {
      const state = physics.read();
      index = nextIndex(frames, index, state.position);
      physics.step(
        FIXED_STEP,
        { throttle: 1, brake: false, steer: 1 },
        frames[index]!,
      );
      if (step % 20 === 0) {
        const s2 = physics.read();
        const f2 = frames[nextIndex(frames, index, s2.position)]!;
        const fwd = forwardOf(s2);
        const off = (Math.acos(Math.max(-1, Math.min(1, fwd.x*f2.tangent.x+fwd.y*f2.tangent.y+fwd.z*f2.tangent.z)))*180)/Math.PI;
        const side = fwd.x*f2.right.x+fwd.y*f2.right.y+fwd.z*f2.right.z;
        console.log(`  lock t=${(step/120).toFixed(2)} off=${off.toFixed(1)} side=${side.toFixed(2)} lat=${lateralOffset(f2, s2.position).toFixed(2)} slip=${slipDegrees(s2, fwd).toFixed(1)} speed=${s2.speed.toFixed(1)}`);
      }
    }

    const state = physics.read();
    const frame = frames[nextIndex(frames, index, state.position)]!;
    const forward = forwardOf(state);
    const noseOffTangent =
      (Math.acos(
        Math.max(
          -1,
          Math.min(
            1,
            forward.x * frame.tangent.x +
              forward.y * frame.tangent.y +
              forward.z * frame.tangent.z,
          ),
        ),
      ) *
        180) /
      Math.PI;
    const slip = Math.abs(slipDegrees(state, forward));
    console.log(
      `full lock 1 s: speed ${startSpeed.toFixed(1)} -> ${state.speed.toFixed(1)} m/s, ` +
        `nose ${noseOffTangent.toFixed(1)} deg off tangent, slip ${slip.toFixed(1)} deg`,
    );

    expect(noseOffTangent).toBeLessThan(45);
    expect(slip).toBeLessThan(25);
    expect(state.speed).toBeGreaterThan(8);

    physics.dispose();
  }, 60_000);
});
