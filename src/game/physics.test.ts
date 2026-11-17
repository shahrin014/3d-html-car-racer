import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
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

/** World-space angular velocity for a one-step quaternion change. */
function angularVelocity(
  current: THREE.Quaternion,
  previous: THREE.Quaternion,
  out: THREE.Vector3,
): THREE.Vector3 {
  const delta = current.clone().multiply(previous.clone().invert());
  const w = Math.abs(delta.w);
  const sinHalf = Math.sqrt(Math.max(0, 1 - w * w));
  const angle = 2 * Math.acos(Math.min(1, w));
  if (sinHalf < 1e-9) {
    return out.set(0, 0, 0);
  }
  const scale = angle / (sinHalf * FIXED_STEP);
  out.set(delta.x * scale, delta.y * scale, delta.z * scale);
  if (delta.w < 0) {
    out.negate();
  }
  return out;
}

/**
 * RMS of the part of a per-step signal above roughly 1.6 Hz. Slower motion is
 * driving; faster motion is chatter.
 */
function chatterRms(values: number[], tauSeconds = 0.1): number {
  const alpha = 1 - Math.exp(-FIXED_STEP / tauSeconds);
  let low = values[0] ?? 0;
  let sum = 0;
  for (const value of values) {
    low += (value - low) * alpha;
    const high = value - low;
    sum += high * high;
  }
  return Math.sqrt(sum / Math.max(1, values.length));
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

  it('holds a loop and a lap without leaving the track or chattering', async () => {
    const frames = buildFrames(generateCircuit(SEED, 1));
    const physics = await createPhysics(frames);
    let index = 0;
    let maxHeight = Number.NEGATIVE_INFINITY;
    let maxGap = 0;
    let maxSpeed = 0;
    let crossed = false;
    const rollRates: number[] = [];
    const omega = new THREE.Vector3();
    const forward = new THREE.Vector3();
    let previousQuaternion: THREE.Quaternion | null = null;

    for (let step = 0; step < 120 * 30 && !crossed; step += 1) {
      const state = physics.read();
      if (previousQuaternion) {
        angularVelocity(state.quaternion, previousQuaternion, omega);
        forward.set(0, 0, 1).applyQuaternion(state.quaternion);
        rollRates.push(omega.dot(forward));
      }
      previousQuaternion = state.quaternion;
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

    // Body shake, measured as the high-frequency part of the roll rate about
    // the car's own forward axis. Four separate wheel colliders measured
    // 2.76 rad/s here because each sphere was its own contact point; one
    // rounded chassis collider measures 1.99 rad/s.
    expect(chatterRms(rollRates)).toBeLessThan(2.4);

    physics.dispose();
  }, 60_000);
});
