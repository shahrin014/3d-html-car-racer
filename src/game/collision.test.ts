import { describe, expect, it } from 'vitest';
import { clampLaneIndex, overlaps, type Box2D } from './collision';

const player: Box2D = {
  x: 0,
  z: 0,
  halfWidth: 0.8,
  halfLength: 1.8,
};

function box(overrides: Partial<Box2D>): Box2D {
  return { ...player, ...overrides };
}

describe('overlaps', () => {
  it('detects a car in the same lane and position', () => {
    expect(overlaps(player, box({}))).toBe(true);
  });

  it('ignores cars in an adjacent lane', () => {
    expect(overlaps(player, box({ x: 2.6 }))).toBe(false);
  });

  it('ignores cars that are still far ahead', () => {
    expect(overlaps(player, box({ z: -20 }))).toBe(false);
  });

  it('detects contact at the edge of the combined length', () => {
    const touching = player.halfLength + 1.8;
    expect(overlaps(player, box({ z: -touching + 0.01 }))).toBe(true);
    expect(overlaps(player, box({ z: -(touching + 0.01) }))).toBe(false);
  });

  it('is symmetric', () => {
    const other = box({ x: 0.4, z: -2 });
    expect(overlaps(player, other)).toBe(overlaps(other, player));
  });
});

describe('clampLaneIndex', () => {
  it('keeps indices inside the road', () => {
    expect(clampLaneIndex(-1, 3)).toBe(0);
    expect(clampLaneIndex(3, 3)).toBe(2);
    expect(clampLaneIndex(1.4, 3)).toBe(1);
  });

  it('rounds to the nearest lane', () => {
    expect(clampLaneIndex(1.6, 3)).toBe(2);
  });

  it('normalises non-finite input', () => {
    expect(clampLaneIndex(Number.NaN, 3)).toBe(0);
  });
});
