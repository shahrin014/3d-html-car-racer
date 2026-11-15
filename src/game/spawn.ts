import { clampLaneIndex } from './collision';

/**
 * Choose `count` distinct lanes for one traffic wave.
 *
 * The returned indices are unique, sorted, and always leave at least one lane
 * open. A wave therefore never creates an impossible wall of cars.
 */
export function chooseLanes(
  random: () => number,
  count: number,
  laneCount: number,
): number[] {
  if (laneCount <= 0) {
    return [];
  }

  const maxCars = Math.max(0, laneCount - 1);
  const wanted = Math.min(Math.max(0, Math.floor(count)), maxCars);
  if (wanted === 0) {
    return [];
  }

  const pool = Array.from({ length: laneCount }, (_, index) => index);
  const picked: number[] = [];

  while (picked.length < wanted && pool.length > 0) {
    const roll = Math.min(0.999999, Math.max(0, random()));
    const index = Math.floor(roll * pool.length);
    const lane = pool.splice(index, 1)[0];
    if (lane !== undefined) {
      picked.push(clampLaneIndex(lane, laneCount));
    }
  }

  return picked.sort((a, b) => a - b);
}

/** Two cars per wave become more likely as the run speeds up. */
export function trafficCountFor(
  random: () => number,
  speed: number,
  baseSpeed: number,
  maxSpeed: number,
): number {
  const span = maxSpeed - baseSpeed;
  const progress = span <= 0 ? 0 : (speed - baseSpeed) / span;
  const doubleChance = Math.min(0.65, Math.max(0.2, progress));
  return random() < doubleChance ? 2 : 1;
}
