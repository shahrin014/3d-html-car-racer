import { describe, expect, it } from 'vitest';
import { FIXED_STEP, TRACK_WIDTH } from './constants';
import { createPhysics } from './physics';
import { buildFrames, generateCircuit, type TrackFrame } from './track';

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
    const index = candidate >= frames.length ? candidate - frames.length : candidate;
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

describe('Rapier vehicle', () => {
  it('accelerates from rest and responds to steering', async () => {
    const frames = buildFrames(generateCircuit(SEED, 1));
    const physics = await createPhysics(frames);
    let index = 0;

    for (let step = 0; step < 120; step += 1) {
      const state = physics.read();
      index = nextIndex(frames, index, state.position);
      physics.step(
        FIXED_STEP,
        { throttle: 1, brake: false, steer: 0 },
        frames[index]!,
      );
    }
    expect(physics.read().speed).toBeGreaterThan(2);

    for (let step = 0; step < 60; step += 1) {
      const state = physics.read();
      index = nextIndex(frames, index, state.position);
      physics.step(
        FIXED_STEP,
        { throttle: 1, brake: false, steer: 1 },
        frames[index]!,
      );
    }
    const state = physics.read();
    const offset = lateralOffset(frames[nextIndex(frames, index, state.position)]!, state.position);
    expect(Math.abs(offset)).toBeGreaterThan(0.1);

    physics.dispose();
  }, 30_000);

  it('holds a loop and completes a lap without leaving the track', async () => {
    const frames = buildFrames(generateCircuit(SEED, 1));
    const physics = await createPhysics(frames);
    let index = 0;
    let maxHeight = Number.NEGATIVE_INFINITY;
    let maxGap = 0;
    let maxSpeed = 0;
    let crossed = false;

    for (let step = 0; step < 120 * 30 && !crossed; step += 1) {
      const state = physics.read();
      const previous = index;
      index = nextIndex(frames, index, state.position);
      if (
        previous > frames.length * 0.75 &&
        index < frames.length * 0.25
      ) {
        crossed = true;
      }
      const frame = frames[index]!;
      const latitude = lateralOffset(frame, state.position);
      const lateralSpeed =
        state.velocity.x * frame.right.x +
        state.velocity.y * frame.right.y +
        state.velocity.z * frame.right.z;
      const steer = Math.max(
        -1,
        Math.min(1, latitude / 0.9 + lateralSpeed * 0.15),
      );

      maxHeight = Math.max(maxHeight, state.position.y);
      maxGap = Math.max(maxGap, state.position.distanceTo(frame.position));
      maxSpeed = Math.max(maxSpeed, state.speed);

      physics.step(
        FIXED_STEP,
        { throttle: 1, brake: false, steer },
        frame,
      );
    }

    expect(maxSpeed).toBeGreaterThan(10);
    expect(maxHeight).toBeGreaterThan(8);
    expect(maxGap).toBeLessThan(TRACK_WIDTH);
    expect(crossed).toBe(true);

    physics.dispose();
  }, 60_000);
});
