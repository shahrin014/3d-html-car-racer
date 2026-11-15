import * as THREE from 'three';

/**
 * Driver's-eye camera rig, expressed in car space.
 *
 * The car model faces +Z with its origin on the track surface, so the eye sits
 * just above the canopy and a hand span ahead of the seat, looking far down the
 * road. The rig is transformed by the car's pose every frame: that is what
 * makes the view ride with the body when the car steers across the track or
 * yaws into a turn, while the body basis still rolls it through banks and loops.
 *
 * Kept out of `Game` so the pose maths can be tested without a WebGL context.
 */
export const COCKPIT_EYE = new THREE.Vector3(0, 0.76, 0.15);
export const COCKPIT_LOOK = new THREE.Vector3(0, 0.38, 30);

export interface CameraPose {
  position: THREE.Vector3;
  target: THREE.Vector3;
  up: THREE.Vector3;
}

/**
 * World-space eye, look target, and up vector for a car at `carPosition` with
 * `carOrientation`.
 */
export function cockpitPose(
  carPosition: THREE.Vector3,
  carOrientation: THREE.Quaternion,
  pose: CameraPose = {
    position: new THREE.Vector3(),
    target: new THREE.Vector3(),
    up: new THREE.Vector3(),
  },
): CameraPose {
  pose.position
    .copy(COCKPIT_EYE)
    .applyQuaternion(carOrientation)
    .add(carPosition);
  pose.target
    .copy(COCKPIT_LOOK)
    .applyQuaternion(carOrientation)
    .add(carPosition);
  pose.up.set(0, 1, 0).applyQuaternion(carOrientation);
  return pose;
}
