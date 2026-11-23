// TEMPORARY PROBE — safe to delete once the permanent multi-crossing tests
// land in src/game/weave.test.ts. It documents the trefoil scale/flight tuning
// used by the WIP layout; see docs/multi-crossing-wip.md.
import { describe, expect, it } from 'vitest';
import { writeFileSync } from 'node:fs';
import * as THREE from 'three';
import { FIXED_STEP, TRACK_WIDTH } from './constants';
import { createPhysics } from './physics';
import type { TrackFrame } from './track';

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

function knotPoint(t: number, scale: number): THREE.Vector3 {
  return new THREE.Vector3(
    scale * (Math.sin(t) + 2 * Math.sin(2 * t)),
    scale * (Math.cos(t) - 2 * Math.cos(2 * t)),
    scale * -Math.sin(3 * t),
  );
}

function knotTangent(t: number, scale: number): THREE.Vector3 {
  return new THREE.Vector3(
    scale * (Math.cos(t) + 4 * Math.cos(2 * t)),
    scale * (-Math.sin(t) + 4 * Math.sin(2 * t)),
    scale * -3 * Math.cos(3 * t),
  ).normalize();
}

function knotFrames(scale: number, count: number): TrackFrame[] {
  const frames: TrackFrame[] = [];
  let s = 0;
  let previous: THREE.Vector3 | null = null;
  for (let index = 0; index <= count; index += 1) {
    const t = (index / count) * Math.PI * 2;
    const position = knotPoint(t, scale);
    const tangent = knotTangent(t, scale);
    const right = new THREE.Vector3(tangent.z, 0, -tangent.x).normalize();
    const up = new THREE.Vector3().crossVectors(tangent, right).normalize();
    const trueRight = new THREE.Vector3().crossVectors(up, tangent).normalize();
    if (previous) {
      s += position.distanceTo(previous);
    }
    previous = position;
    frames.push({
      position,
      tangent,
      up,
      right: trueRight,
      s,
      solid: true,
      halfWidth: TRACK_WIDTH / 2,
      rails: true,
    });
  }
  return frames;
}

describe('knot probe', () => {
  it('tests a trefoil track', async () => {
    const scales = [10, 14, 20];
    const results = [];
    for (const scale of scales) {
    const frames = knotFrames(scale, 1400);
    const length = frames[frames.length - 1]!.s;
    let minPlanCrossHeight = Infinity;
    let crossings = 0;
    for (let a = 0; a < frames.length; a += 1) {
      const first = frames[a]!;
      for (let b = a + 30; b < frames.length - 30; b += 1) {
        const second = frames[b]!;
        const plan = Math.hypot(
          first.position.x - second.position.x,
          first.position.z - second.position.z,
        );
        if (plan < 2) {
          crossings += 1;
          minPlanCrossHeight = Math.min(
            minPlanCrossHeight,
            Math.abs(first.position.y - second.position.y),
          );
        }
      }
    }
    const physics = await createPhysics(frames);
    physics.reset(frames[0]!);
    let index = 0;
    let maxGap = 0;
    let maxSpeed = 0;
    let maxHeight = -Infinity;
    for (let step = 0; step < 120 * 20; step += 1) {
      const state = physics.read();
      index = nextIndex(frames, index, state.position);
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
      physics.step(FIXED_STEP, { throttle: 1, brake: false, steer }, frame);
      const after = physics.read();
      maxGap = Math.max(maxGap, after.position.distanceTo(frame.position));
      maxSpeed = Math.max(maxSpeed, after.speed);
      maxHeight = Math.max(maxHeight, after.position.y);
    }
    physics.dispose();
    results.push({ scale, length, crossings, minPlanCrossHeight, maxGap, maxSpeed, maxHeight });
    }
    writeFileSync('/tmp/opencode/knot-probe.json', JSON.stringify(results, null, 2));
    expect(results.some((result) => result.maxGap < 20)).toBe(true);
  }, 120_000);
});
