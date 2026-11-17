import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  createSmoothedPose,
  resetSmoothedPose,
  smoothPose,
} from './poseSmoothing';

const STEP = 1 / 60;

function amplitudeAt(frequency: number): number {
  const pose = createSmoothedPose();
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  let peak = 0;
  let samples = 0;
  for (let frame = 0; frame < 240; frame += 1) {
    const t = frame * STEP;
    position.set(Math.sin(2 * Math.PI * frequency * t), 0, 0);
    smoothPose(pose, position, quaternion, STEP);
    if (frame > 120) {
      peak = Math.max(peak, Math.abs(pose.position.x));
      samples += 1;
    }
  }
  expect(samples).toBeGreaterThan(0);
  return peak;
}

describe('visual pose smoothing', () => {
  it('snaps on the first frame and then follows a steady pose', () => {
    const pose = createSmoothedPose();
    const position = new THREE.Vector3(3, 4, 5);
    const quaternion = new THREE.Quaternion().setFromAxisAngle(
      new THREE.Vector3(0, 1, 0),
      0.3,
    );
    smoothPose(pose, position, quaternion, STEP);
    expect(pose.position.distanceTo(position)).toBeLessThan(1e-6);
    expect(pose.quaternion.angleTo(quaternion)).toBeLessThan(1e-6);

    position.set(3.5, 4, 5);
    for (let frame = 0; frame < 60; frame += 1) {
      smoothPose(pose, position, quaternion, STEP);
    }
    expect(pose.position.distanceTo(position)).toBeLessThan(1e-3);
  });

  it('attenuates contact buzz but keeps slow motion', () => {
    // A contact bump at 12 Hz must be well damped...
    expect(amplitudeAt(12)).toBeLessThan(0.45);
    // ...while banking and crests (about 1 Hz) pass through nearly whole.
    expect(amplitudeAt(1)).toBeGreaterThan(0.9);
  });

  it('snaps again after a teleport', () => {
    const pose = createSmoothedPose();
    const position = new THREE.Vector3(0, 0, 0);
    const quaternion = new THREE.Quaternion();
    smoothPose(pose, position, quaternion, STEP);
    resetSmoothedPose(pose);
    position.set(10, 2, -4);
    smoothPose(pose, position, quaternion, STEP);
    expect(pose.position.distanceTo(position)).toBeLessThan(1e-6);
  });
});
