import * as THREE from 'three';
import type { CameraPose } from './cockpitCamera';
import type { TrackFrame } from './track';

/**
 * Chase camera rig.
 *
 * The camera sits behind and above the car, but it must not be driven by a
 * world-space lerp toward a point on the car's arc: on the loop that cuts the
 * chord through the deck and puts the view under the road. Instead the rig
 * keeps its own smoothed orientation, so the offset sweeps along the car's arc,
 * and the position is clamped above whatever deck it is over.
 */
export const CHASE_OFFSET = new THREE.Vector3(0, 2.8, -8);
export const CHASE_LOOK = new THREE.Vector3(0, 1.2, 14);
/** Height the camera must keep above the deck beneath it. */
export const CHASE_DECK_CLEARANCE = 0.6;
/** Seconds for the rig to follow the car's rotation and position. */
export const CHASE_ORIENTATION_TAU = 0.12;
export const CHASE_POSITION_TAU = 0.08;
/** How far behind and ahead of the car to look for the deck under the camera. */
const SEARCH_BEHIND = 60;
const SEARCH_AHEAD = 10;

export interface ChaseRig {
  orientation: THREE.Quaternion;
  position: THREE.Vector3;
  ready: boolean;
}

export function createChaseRig(): ChaseRig {
  return {
    orientation: new THREE.Quaternion(),
    position: new THREE.Vector3(),
    ready: false,
  };
}

/** Snap on the next frame, after a start or a rescue teleport. */
export function resetChaseRig(rig: ChaseRig): void {
  rig.ready = false;
}

/**
 * Index of the track frame nearest `position`, searched in a window around
 * `from`. A window keeps the closing frame from winning at the start line and
 * keeps the camera over its own lane where the loop lanes run close together.
 */
export function nearestFrameIndex(
  frames: TrackFrame[],
  from: number,
  position: THREE.Vector3,
): number {
  const count = frames.length;
  if (count === 0) {
    return 0;
  }
  let best = ((from % count) + count) % count;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (let offset = -SEARCH_BEHIND; offset <= SEARCH_AHEAD; offset += 1) {
    const index = (((from + offset) % count) + count) % count;
    const frame = frames[index];
    if (!frame) {
      continue;
    }
    const distance = frame.position.distanceToSquared(position);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = index;
    }
  }
  return best;
}

/** Signed height of `position` above the deck plane of `frame`. */
export function deckClearance(
  frame: TrackFrame,
  position: THREE.Vector3,
): number {
  return position
    .clone()
    .sub(frame.position)
    .dot(frame.up);
}

const desired = new THREE.Vector3();
const offset = new THREE.Vector3();

/**
 * World-space chase pose for a car at `carPosition` with `carOrientation`.
 * `carIndex` is the nearest track frame to the car, and `delta` is the frame
 * time, so the smoothing does not depend on the display rate.
 */
export function chasePose(
  rig: ChaseRig,
  carPosition: THREE.Vector3,
  carOrientation: THREE.Quaternion,
  frames: TrackFrame[],
  carIndex: number,
  delta: number,
  shake: number,
  pose: CameraPose = {
    position: new THREE.Vector3(),
    target: new THREE.Vector3(),
    up: new THREE.Vector3(),
  },
): CameraPose {
  const blend = (tau: number): number =>
    1 - Math.exp(-Math.max(0, delta) / tau);

  rig.orientation.slerp(
    carOrientation,
    rig.ready ? blend(CHASE_ORIENTATION_TAU) : 1,
  );

  desired
    .set(CHASE_OFFSET.x, CHASE_OFFSET.y + shake, CHASE_OFFSET.z)
    .applyQuaternion(rig.orientation)
    .add(carPosition);
  rig.position.lerp(desired, rig.ready ? blend(CHASE_POSITION_TAU) : 1);
  rig.ready = true;

  const index = nearestFrameIndex(frames, carIndex, rig.position);
  const frame = frames[index];
  if (frame) {
    const height = offset.copy(rig.position).sub(frame.position).dot(frame.up);
    if (height < CHASE_DECK_CLEARANCE) {
      rig.position.addScaledVector(frame.up, CHASE_DECK_CLEARANCE - height);
    }
  }

  pose.position.copy(rig.position);
  pose.up.set(0, 1, 0).applyQuaternion(rig.orientation);
  pose.target
    .copy(CHASE_LOOK)
    .applyQuaternion(carOrientation)
    .add(carPosition);
  return pose;
}
