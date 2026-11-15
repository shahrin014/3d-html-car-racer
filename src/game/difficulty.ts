import {
  BASE_SPEED,
  MAX_SPEED,
  POINTS_PER_METRE,
  SPEED_RAMP,
} from './constants';

/**
 * Speed at a given point in a run. Speed ramps linearly from BASE_SPEED and is
 * capped at MAX_SPEED so the game stays readable on small screens.
 */
export function speedAt(elapsedSeconds: number): number {
  if (!Number.isFinite(elapsedSeconds) || elapsedSeconds <= 0) {
    return BASE_SPEED;
  }
  return Math.min(MAX_SPEED, BASE_SPEED + elapsedSeconds * SPEED_RAMP);
}

/** Score is derived purely from distance so it is deterministic in tests. */
export function scoreFor(distanceMetres: number): number {
  if (!Number.isFinite(distanceMetres) || distanceMetres <= 0) {
    return 0;
  }
  return Math.floor(distanceMetres * POINTS_PER_METRE);
}

/**
 * Seconds between traffic waves. Waves tighten as the player speeds up, but
 * never faster than 0.55s so two waves cannot occupy the same stretch of road.
 */
export function spawnIntervalFor(speed: number): number {
  const span = MAX_SPEED - BASE_SPEED;
  const progress = span <= 0 ? 0 : (speed - BASE_SPEED) / span;
  const clamped = Math.min(1, Math.max(0, progress));
  return 1.25 - clamped * 0.7;
}

/** Distance (metres) covered by one rendered frame, capped for tab switches. */
export function scaledDistance(speed: number, dt: number): number {
  return speed * Math.max(0, dt);
}
