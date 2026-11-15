import { describe, expect, it } from 'vitest';
import {
  BASE_SPEED,
  MAX_SPEED,
  POINTS_PER_METRE,
  SPEED_RAMP,
} from './constants';
import { scoreFor, spawnIntervalFor, speedAt } from './difficulty';

describe('speedAt', () => {
  it('starts at the base speed', () => {
    expect(speedAt(0)).toBe(BASE_SPEED);
    expect(speedAt(-5)).toBe(BASE_SPEED);
    expect(speedAt(Number.NaN)).toBe(BASE_SPEED);
  });

  it('ramps linearly with elapsed time', () => {
    expect(speedAt(10)).toBeCloseTo(BASE_SPEED + 10 * SPEED_RAMP, 5);
  });

  it('never exceeds the maximum speed', () => {
    expect(speedAt(10_000)).toBe(MAX_SPEED);
  });
});

describe('scoreFor', () => {
  it('awards points per metre travelled', () => {
    expect(scoreFor(0)).toBe(0);
    expect(scoreFor(12.9)).toBe(Math.floor(12.9 * POINTS_PER_METRE));
  });

  it('never returns a negative or non-finite score', () => {
    expect(scoreFor(-100)).toBe(0);
    expect(scoreFor(Number.POSITIVE_INFINITY)).toBe(0);
    expect(scoreFor(Number.NaN)).toBe(0);
  });

  it('increases with distance', () => {
    expect(scoreFor(500)).toBeGreaterThan(scoreFor(499));
  });
});

describe('spawnIntervalFor', () => {
  it('tightens as speed increases', () => {
    expect(spawnIntervalFor(BASE_SPEED)).toBeGreaterThan(
      spawnIntervalFor(MAX_SPEED),
    );
  });

  it('stays within the designed window', () => {
    expect(spawnIntervalFor(BASE_SPEED)).toBeCloseTo(1.25, 5);
    expect(spawnIntervalFor(MAX_SPEED)).toBeCloseTo(0.55, 5);
    expect(spawnIntervalFor(MAX_SPEED * 2)).toBeCloseTo(0.55, 5);
    expect(spawnIntervalFor(0)).toBeGreaterThanOrEqual(0.55);
  });
});
