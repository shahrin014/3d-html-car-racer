import * as THREE from 'three';

/**
 * Low-pass used for the rendered car pose.
 *
 * The rigid body sits directly on a faceted deck, so contact bumps the body a
 * few millimetres at 8–14 Hz even though the handling is steady. That buzz is
 * not gameplay, so the pose that is drawn is filtered; the physics pose and all
 * game logic keep the unfiltered state.
 */
export const VISUAL_POSE_TAU = 0.04;

export interface SmoothedPose {
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
  ready: boolean;
}

export function createSmoothedPose(): SmoothedPose {
  return {
    position: new THREE.Vector3(),
    quaternion: new THREE.Quaternion(),
    ready: false,
  };
}

/** Snap to the target on the next frame, after a teleport. */
export function resetSmoothedPose(pose: SmoothedPose): void {
  pose.ready = false;
}

export function smoothPose(
  pose: SmoothedPose,
  targetPosition: THREE.Vector3,
  targetQuaternion: THREE.Quaternion,
  delta: number,
): SmoothedPose {
  if (!pose.ready) {
    pose.position.copy(targetPosition);
    pose.quaternion.copy(targetQuaternion);
    pose.ready = true;
    return pose;
  }
  const alpha = 1 - Math.exp(-Math.max(0, delta) / VISUAL_POSE_TAU);
  pose.position.lerp(targetPosition, alpha);
  pose.quaternion.slerp(targetQuaternion, alpha);
  return pose;
}
