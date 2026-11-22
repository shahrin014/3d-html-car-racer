import { describe, expect, it } from 'vitest';
import {
  OPPONENT_BASE_SPEED,
  OPPONENT_COUNT_MAX,
  OPPONENT_LANES,
  OPPONENT_TOP_SPEED,
  PHYSICS_RIDE_HEIGHT,
  TRACK_WIDTH,
} from './constants';
import { CARS } from './car-spec.mjs';
import {
  advanceDistance,
  advanceTravel,
  circuitLength,
  gradeAt,
  opponentCarIds,
  opponentSpecs,
  paceAt,
  racingPose,
  wrapDistance,
} from './opponents';
import { buildFrames, generateCircuit } from './track';

const frames = buildFrames(generateCircuit('opponents', 1));

describe('opponent grid', () => {
  it('builds a full field with cycled lanes and distinct speeds', () => {
    const specs = opponentSpecs(OPPONENT_COUNT_MAX);
    expect(OPPONENT_COUNT_MAX).toBe(30);
    expect(specs).toHaveLength(OPPONENT_COUNT_MAX);
    expect(new Set(specs.map((spec) => spec.lane)).size).toBe(
      Math.min(OPPONENT_COUNT_MAX, OPPONENT_LANES.length),
    );
    expect(new Set(specs.map((spec) => spec.speed)).size).toBe(
      OPPONENT_COUNT_MAX,
    );
    for (const spec of specs) {
      expect(Math.abs(spec.lane)).toBeLessThan(TRACK_WIDTH / 2);
      expect(spec.speed).toBeGreaterThanOrEqual(OPPONENT_BASE_SPEED);
      expect(spec.speed).toBeLessThanOrEqual(OPPONENT_TOP_SPEED + 1e-9);
    }
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

describe('terrain pace', () => {
  it('slows on a climb and speeds up on a descent', () => {
    const spec = opponentSpecs(1)[0]!;
    const distance = 120;
    const flat = paceAt(spec, distance, 0);
    const climb = paceAt(spec, distance, 0.5);
    const descent = paceAt(spec, distance, -0.5);
    expect(climb).toBeLessThan(flat);
    expect(descent).toBeGreaterThan(flat);
  });

  it('samples grade from the track tangent', () => {
    const frame = frames[Math.floor(frames.length / 2)]!;
    expect(gradeAt(frames, frame.s)).toBeCloseTo(frame.tangent.y, 5);
    expect(gradeAt(frames, frame.s + circuitLength(frames))).toBeCloseTo(
      frame.tangent.y,
      5,
    );
    expect(gradeAt([], 10)).toBe(0);
  });

  it('advances further downhill than uphill in one step', () => {
    const spec = opponentSpecs(1)[0]!;
    const length = circuitLength(frames);
    const start = 40;
    const climb = advanceDistance(spec, start, 1, length, 0.4) - start;
    const descent = advanceDistance(spec, start, 1, length, -0.4) - start;
    expect(climb).toBeGreaterThan(0);
    expect(descent).toBeGreaterThan(climb);
  });
});

describe('opponent car models', () => {
  it('mixes the catalog models across the field, deterministically', () => {
    const ids = opponentCarIds('circuit-0123456789abcdef', 3);
    expect(ids).toHaveLength(3);
    for (const id of ids) {
      expect(CARS.some((car) => car.id === id)).toBe(true);
    }
    // Two models on the grid, not three copies of the player's car.
    expect(new Set(ids).size).toBeGreaterThan(1);
    expect(opponentCarIds('circuit-0123456789abcdef', 3)).toEqual(ids);
  });

  it('returns no models for an empty field', () => {
    expect(opponentCarIds('seed', 0)).toEqual([]);
  });
});
