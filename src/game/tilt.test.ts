import { describe, expect, it } from 'vitest';
import { steerFromTilt, tiltDegrees } from './tilt';

/**
 * A phone rolled by `roll` degrees to the right has the same device-frame
 * pitch in every screen orientation; only the screen mapping changes.
 */
function reading(roll: number, screenAngle: number): number | null {
  const beta = 90 - (screenAngle - roll);
  return tiltDegrees(beta, -90, screenAngle);
}

describe('screen-relative tilt', () => {
  it('reads level in portrait', () => {
    expect(reading(0, 0)).toBeCloseTo(0, 5);
  });

  it('reads level in both landscape orientations', () => {
    expect(reading(0, 90)).toBeCloseTo(0, 5);
    expect(reading(0, 270)).toBeCloseTo(0, 5);
  });

  it('is positive when the right edge drops, in every orientation', () => {
    for (const screenAngle of [0, 90, 180, 270]) {
      expect(reading(20, screenAngle)).toBeCloseTo(20, 5);
    }
  });

  it('is negative when the left edge drops, in every orientation', () => {
    for (const screenAngle of [0, 90, 180, 270]) {
      expect(reading(-20, screenAngle)).toBeCloseTo(-20, 5);
    }
  });

  it('measures the same roll regardless of screen orientation', () => {
    const roll = 12;
    const angles = [0, 90, 180, 270].map((angle) => reading(roll, angle));
    for (const angle of angles) {
      expect(angle).toBeCloseTo(angles[0] ?? 0, 5);
    }
  });

  it('has no roll when the screen lies flat', () => {
    expect(tiltDegrees(0, 0, 0)).toBeNull();
    expect(tiltDegrees(0, 0, 90)).toBeNull();
  });

  it('ignores non-finite readings', () => {
    expect(tiltDegrees(Number.NaN, 0, 0)).toBeNull();
    expect(tiltDegrees(0, Number.POSITIVE_INFINITY, 0)).toBeNull();
  });
});

describe('tilt to steering', () => {
  it('centres inside the dead zone', () => {
    expect(steerFromTilt(2, 0)).toBe(0);
    expect(steerFromTilt(-2, 0)).toBe(0);
  });

  it('steers right for a positive roll and left for a negative one', () => {
    expect(steerFromTilt(20, 0)).toBeGreaterThan(0);
    expect(steerFromTilt(-20, 0)).toBeLessThan(0);
  });

  it('reaches full lock and clamps beyond it', () => {
    expect(steerFromTilt(80, 0)).toBe(1);
    expect(steerFromTilt(-80, 0)).toBe(-1);
  });

  it('wraps around the measured neutral angle', () => {
    // 179 to -179 is +2 degrees, inside the dead zone.
    expect(steerFromTilt(-179, 179)).toBe(0);
    // Crossing the +/-180 seam uses the shortest arc, not a full turn.
    expect(steerFromTilt(-160, 179)).toBeGreaterThan(0);
  });
});
