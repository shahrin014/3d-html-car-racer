import { describe, expect, it } from 'vitest';
import { FIXED_STEP } from './constants';
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

const SEED = 'rapier-physics-trace';

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
    const frames = buildFrames(generateCircuit(SEED, 1));
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
    const frames = buildFrames(generateCircuit(SEED, 1));
    const physics = await createPhysics(frames);
    let index = drive(physics, frames);
    const before = physics.read();
    const beforeFrame = frames[nextIndex(frames, index, before.position)]!;
    const beforeLateral = lateralOffset(beforeFrame, before.position);
    const beforeForward = forwardOf(before);

    for (let step = 0; step < 60; step += 1) {
      const state = physics.read();
      index = nextIndex(frames, index, state.position);
      physics.step(
        FIXED_STEP,
        { throttle: 1, brake: false, steer: 1 },
        frames[index]!,
      );
    }
    const after = physics.read();
    const afterFrame = frames[nextIndex(frames, index, after.position)]!;
    const afterLateral = lateralOffset(afterFrame, after.position);
    const afterForward = forwardOf(after);
    const movedRight = afterLateral - beforeLateral;
    // `frame.right` points to the driver's left, so a right turn has to move
    // in the negative direction and point the nose away from `frame.right`.
    const noseSide =
      afterForward.x * afterFrame.right.x +
      afterForward.y * afterFrame.right.y +
      afterForward.z * afterFrame.right.z;
    const initialSide =
      beforeForward.x * beforeFrame.right.x +
      beforeForward.y * beforeFrame.right.y +
      beforeForward.z * beforeFrame.right.z;

    console.log(
      `steer right: lateral moved ${movedRight.toFixed(2)} m, ` +
        `nose side ${initialSide.toFixed(2)} -> ${noseSide.toFixed(2)}`,
    );

    expect(movedRight).toBeLessThan(0);
    expect(noseSide).toBeLessThan(initialSide);

    physics.dispose();
  }, 60_000);

  it('does not spin out on a held full lock', async () => {
    const frames = buildFrames(generateCircuit(SEED, 1));
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
