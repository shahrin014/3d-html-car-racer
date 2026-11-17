import { describe, expect, it } from 'vitest';
import {
  OPPONENT_COUNT_MAX,
  PHYSICS_RIDE_HEIGHT,
  TRACK_WIDTH,
} from './constants';
import {
  advanceDistance,
  advanceTravel,
  circuitLength,
  opponentSpecs,
  racingPose,
  wrapDistance,
} from './opponents';
import { buildFrames, generateCircuit } from './track';

const frames = buildFrames(generateCircuit('opponents', 1));

describe('opponent grid', () => {
  it('builds up to five rivals with distinct lanes and speeds', () => {
    const specs = opponentSpecs(OPPONENT_COUNT_MAX);
    expect(specs).toHaveLength(OPPONENT_COUNT_MAX);
    expect(new Set(specs.map((spec) => spec.lane)).size).toBe(
      OPPONENT_COUNT_MAX,
    );
    expect(new Set(specs.map((spec) => spec.speed)).size).toBe(
      OPPONENT_COUNT_MAX,
    );
    for (let index = 1; index < specs.length; index += 1) {
      expect(specs[index]!.start).toBeGreaterThan(specs[index - 1]!.start);
    }
  });

  it('clamps the count to the grid and supports an empty field', () => {
    expect(opponentSpecs(0)).toHaveLength(0);
    expect(opponentSpecs(-4)).toHaveLength(0);
    expect(opponentSpecs(99)).toHaveLength(OPPONENT_COUNT_MAX);
  });
});

describe('racing line', () => {
  it('puts the body centre one ride height above the deck', () => {
    const pose = racingPose(frames, 0, 0);
    const frame = frames[0]!;
    expect(pose.position.distanceTo(frame.position)).toBeCloseTo(
      PHYSICS_RIDE_HEIGHT,
      5,
    );
    expect(pose.up.dot(frame.up)).toBeGreaterThan(0.999);
  });

  it('offsets a rival by its lane, within the deck', () => {
    const centre = racingPose(frames, 10, 0);
    const wide = racingPose(frames, 10, 1.5);
    expect(wide.position.distanceTo(centre.position)).toBeCloseTo(1.5, 5);
    expect(1.5).toBeLessThan(TRACK_WIDTH / 2);
  });

  it('wraps around the circuit', () => {
    const length = circuitLength(frames);
    expect(length).toBeGreaterThan(0);
    const start = racingPose(frames, 0, 0);
    const wrapped = racingPose(frames, length, 0);
    expect(wrapped.position.distanceTo(start.position)).toBeLessThan(1e-6);
    expect(wrapDistance(-1, length)).toBeCloseTo(length - 1, 9);
  });

  it('advances along the circuit at its cruise speed', () => {
    const spec = opponentSpecs(1)[0]!;
    const length = circuitLength(frames);
    let distance = spec.start;
    for (let step = 0; step < 480; step += 1) {
      const previous = distance;
      distance = advanceDistance(spec, distance, 1 / 120, length);
      expect(distance).not.toBe(previous);
    }
    // Four seconds at a pace within 6% of cruise.
    expect(distance).toBeGreaterThan(spec.start);
    const travelled = (distance - spec.start + length) % length;
    expect(travelled).toBeGreaterThan(spec.speed * 4 * 0.9);
    expect(travelled).toBeLessThan(spec.speed * 4 * 1.1);

    // The unwrapped total keeps growing across the seam, so placing can compare
    // rivals that have driven different numbers of laps.
    let total = spec.start;
    for (let step = 0; step < 120 * 600; step += 1) {
      total = advanceTravel(spec, total, 1 / 120, length).travelled;
    }
    expect(total).toBeGreaterThan(length * 2);
  });
});
