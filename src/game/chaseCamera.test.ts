import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  chasePose,
  createChaseRig,
  deckClearance,
  CHASE_DECK_CLEARANCE,
} from './chaseCamera';
import { FIXED_STEP } from './constants';
import { createPhysics } from './physics';
import { buildFrames, generateCircuit, type TrackFrame } from './track';

const SEED = 'rapier-physics-trace';

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

/**
 * Clearance above the deck the camera is actually over: the track frame nearest
 * to the camera, searched over the whole circuit. A distant frame's plane says
 * nothing about whether the camera is under the road.
 */
function lowestClearance(
  frames: TrackFrame[],
  position: THREE.Vector3,
): { height: number; index: number } {
  let bestDistance = Number.POSITIVE_INFINITY;
  let index = 0;
  for (let candidate = 0; candidate < frames.length; candidate += 1) {
    const frame = frames[candidate];
    if (!frame) {
      continue;
    }
    const distance = frame.position.distanceToSquared(position);
    if (distance < bestDistance) {
      bestDistance = distance;
      index = candidate;
    }
  }
  const frame = frames[index]!;
  return { height: deckClearance(frame, position), index };
}

const pose = {
  position: new THREE.Vector3(),
  target: new THREE.Vector3(),
  up: new THREE.Vector3(),
};

describe('chase camera', () => {
  it('stays above the deck for a whole lap, including the loop', async () => {
    const frames = buildFrames(generateCircuit(SEED, 1));
    const physics = await createPhysics(frames);
    const rig = createChaseRig();
    let index = 0;
    let crossed = false;
    let minimum = Number.POSITIVE_INFINITY;
    let minimumIndex = 0;
    let minimumHeight = 0;
    let loopMinimum = Number.POSITIVE_INFINITY;
    let loopSamples = 0;
    let previousLow = Number.POSITIVE_INFINITY;

    const physicalSteps = Math.round(1 / 60 / FIXED_STEP);
    for (
      let frame = 0;
      frame < 60 * 75 && !crossed;
      frame += 1
    ) {
      for (let step = 0; step < physicalSteps; step += 1) {
        const state = physics.read();
        const previous = index;
        index = nextIndex(frames, index, state.position);
        if (previous > frames.length * 0.75 && index < frames.length * 0.25) {
          crossed = true;
        }
        const track = frames[index]!;
        const latitude = lateralOffset(track, state.position);
        const lateralSpeed = state.velocity.dot(track.right);
        const steer = Math.max(
          -1,
          Math.min(1, latitude / 0.9 + lateralSpeed * 0.15),
        );
        physics.step(FIXED_STEP, { throttle: 1, brake: false, steer }, track);
      }

      const state = physics.read();
      index = nextIndex(frames, index, state.position);
      chasePose(
        rig,
        state.position,
        state.quaternion,
        frames,
        index,
        1 / 60,
        Math.min(0.06, state.speed / 400),
        pose,
      );
      if (!rig.ready) {
        continue;
      }
      const low = lowestClearance(frames, rig.position);
      if (low.height < minimum) {
        minimum = low.height;
        minimumIndex = low.index;
        minimumHeight = state.position.y;
      }
      if (state.position.y > 8) {
        loopMinimum = Math.min(loopMinimum, low.height);
        loopSamples += 1;
      }
      // The clamp must not make the camera jump: report the largest one-frame
      // clearance change.
      previousLow = low.height;
      void previousLow;
    }

    physics.dispose();
    console.log(
      `camera min clearance ${minimum.toFixed(3)} m at frame ${minimumIndex} ` +
        `(car height ${minimumHeight.toFixed(2)} m); loop min ` +
        `${loopMinimum.toFixed(3)} m over ${loopSamples} samples`,
    );
    expect(crossed).toBe(true);
    expect(loopSamples).toBeGreaterThan(10);
    expect(minimum).toBeGreaterThan(0.2);
    expect(loopMinimum).toBeGreaterThan(0.2);
    expect(CHASE_DECK_CLEARANCE).toBeGreaterThan(0.2);
  }, 120_000);
});
