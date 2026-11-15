import { describe, expect, it } from 'vitest';
import { chooseLanes, trafficCountFor } from './spawn';

function sequence(values: number[]): () => number {
  let index = 0;
  return () => {
    const value = values[index % values.length] ?? 0;
    index += 1;
    return value;
  };
}

describe('chooseLanes', () => {
  it('always leaves at least one lane open', () => {
    for (let i = 0; i < 200; i += 1) {
      const lanes = chooseLanes(Math.random, 2, 3);
      expect(lanes).toHaveLength(2);
      const open = [0, 1, 2].filter((lane) => !lanes.includes(lane));
      expect(open).toHaveLength(1);
    }
  });

  it('returns distinct sorted lanes', () => {
    const lanes = chooseLanes(sequence([0.9, 0.9, 0.9]), 2, 3);
    expect(lanes).toEqual([...new Set(lanes)].sort((a, b) => a - b));
  });

  it('never returns more cars than open lanes allow', () => {
    expect(chooseLanes(Math.random, 5, 3)).toHaveLength(2);
    expect(chooseLanes(Math.random, 1, 1)).toHaveLength(0);
    expect(chooseLanes(Math.random, 0, 3)).toHaveLength(0);
  });

  it('handles out-of-range random values', () => {
    // Values are clamped, so 2 behaves like "almost 1" and still picks a lane.
    const lanes = chooseLanes(sequence([-1, 2]), 2, 3);
    expect(lanes).toHaveLength(2);
    expect(lanes).toEqual([...new Set(lanes)].sort((a, b) => a - b));
  });
});

describe('trafficCountFor', () => {
  it('spawns one or two cars early in a run', () => {
    const count = trafficCountFor(() => 0.99, 24, 24, 64);
    expect(count).toBe(1);
  });

  it('can spawn two cars as speed builds', () => {
    const count = trafficCountFor(() => 0.01, 64, 24, 64);
    expect(count).toBe(2);
    expect(count).toBeLessThanOrEqual(2);
  });
});
