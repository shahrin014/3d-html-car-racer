import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { COCKPIT_EYE, COCKPIT_LOOK, cockpitPose } from './cockpitCamera';

/**
 * The cockpit camera must ride the car, not the track centreline: when the
 * player steers the eye moves across the track with the body and swings into
 * the turn, while banks and loops still roll the horizon.
 */

const UP = new THREE.Vector3(0, 1, 0);
const FORWARD = new THREE.Vector3(0, 0, 1);

function lookDirection(pose: ReturnType<typeof cockpitPose>): THREE.Vector3 {
  return pose.target.clone().sub(pose.position).normalize();
}

/** The rig's own sight line, pitched down slightly at the road ahead. */
function expectedLook(orientation: THREE.Quaternion): THREE.Vector3 {
  return COCKPIT_LOOK.clone()
    .sub(COCKPIT_EYE)
    .applyQuaternion(orientation)
    .normalize();
}

describe('cockpit camera', () => {
  it("sits at the driver's eye above and ahead of the car origin", () => {
    const pose = cockpitPose(new THREE.Vector3(1, 2, 3), new THREE.Quaternion());
    expect(pose.position.x).toBeCloseTo(1, 6);
    expect(pose.position.y).toBeCloseTo(2.76, 6);
    expect(pose.position.z).toBeCloseTo(3.15, 6);
  });

  it('moves across the track with the car instead of staying centred', () => {
    const centred = cockpitPose(new THREE.Vector3(0, 0, 10), new THREE.Quaternion());
    const steered = cockpitPose(new THREE.Vector3(0.6, 0, 10), new THREE.Quaternion());
    expect(steered.position.x - centred.position.x).toBeCloseTo(0.6, 6);
    expect(steered.target.x - centred.target.x).toBeCloseTo(0.6, 6);
  });

  it('swings the view into the turn with the body yaw', () => {
    const yaw = new THREE.Quaternion().setFromAxisAngle(UP, 0.28);
    const pose = cockpitPose(new THREE.Vector3(), yaw);
    expect(lookDirection(pose).dot(expectedLook(yaw))).toBeCloseTo(1, 6);
    // Guard the regression: the old rig looked down the track tangent, so the
    // yawed sight line must differ from straight ahead.
    expect(lookDirection(pose).dot(FORWARD)).toBeLessThan(0.999);
  });

  it('rolls the horizon with a banked car', () => {
    const bank = new THREE.Quaternion().setFromAxisAngle(FORWARD, Math.PI / 4);
    const pose = cockpitPose(new THREE.Vector3(), bank);
    expect(pose.up.dot(UP)).toBeCloseTo(Math.cos(Math.PI / 4), 6);
    expect(Math.abs(pose.up.x)).toBeCloseTo(Math.sin(Math.PI / 4), 6);
  });

  it('inverts the horizon at the top of a loop', () => {
    const loop = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI);
    const pose = cockpitPose(new THREE.Vector3(), loop);
    expect(pose.up.y).toBeCloseTo(-1, 6);
    expect(lookDirection(pose).dot(expectedLook(loop))).toBeCloseTo(1, 6);
    expect(lookDirection(pose).z).toBeLessThan(-0.99);
  });
});
