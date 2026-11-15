export interface Box2D {
  /** Centre on the x axis. */
  x: number;
  /** Centre on the z axis. */
  z: number;
  halfWidth: number;
  halfLength: number;
}

/**
 * Axis-aligned overlap test for two boxes on the road plane. Traffic and the
 * player never rotate, so an AABB is accurate and cheap.
 */
export function overlaps(a: Box2D, b: Box2D): boolean {
  return (
    Math.abs(a.x - b.x) < a.halfWidth + b.halfWidth &&
    Math.abs(a.z - b.z) < a.halfLength + b.halfLength
  );
}

/** Keep a lane index inside `0..laneCount - 1`. */
export function clampLaneIndex(index: number, laneCount: number): number {
  const last = Math.max(0, laneCount - 1);
  if (!Number.isFinite(index)) {
    return 0;
  }
  return Math.min(last, Math.max(0, Math.round(index)));
}
