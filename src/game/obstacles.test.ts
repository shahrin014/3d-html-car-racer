import { describe, expect, it } from 'vitest';
import {
  CAR_WIDTH,
  OBSTACLE_HEIGHT,
  OBSTACLE_LATERAL_OFFSET,
  OBSTACLE_ROWS,
  OPPONENT_LANES,
  TRACK_WIDTH,
} from './constants';
import { obstacleSpecs } from './obstacles';
import { generateCircuit, type Circuit } from './track';

function obstacleCircuit(): Circuit {
  for (let index = 0; index < 60; index += 1) {
    const circuit = generateCircuit(`obstacle-placement-${index}`, 1);
    if (circuit.pieces.some((piece) => piece.kind === 'obstacles')) {
      return circuit;
    }
  }
  throw new Error('no obstacle circuit found');
}

describe('obstacle segment', () => {
  it('places the same blocks for the same circuit', () => {
    const circuit = obstacleCircuit();
    const first = obstacleSpecs(circuit);
    const second = obstacleSpecs(circuit);
    expect(first).toHaveLength(second.length);
    expect(first.length).toBeGreaterThan(0);
    first.forEach((obstacle, index) => {
      const other = second[index]!;
      expect(obstacle.position.distanceTo(other.position)).toBeLessThan(1e-9);
      expect(obstacle.quaternion.angleTo(other.quaternion)).toBeLessThan(1e-9);
      expect(obstacle.halfExtents.equals(other.halfExtents)).toBe(true);
      expect(obstacle.pieceIndex).toBe(other.pieceIndex);
    });
  });

  it('leaves the centreline and every rival lane clear', () => {
    const circuit = obstacleCircuit();
    const specs = obstacleSpecs(circuit);
    const widestLane = Math.max(...OPPONENT_LANES.map((lane) => Math.abs(lane)));
    const required = widestLane + CAR_WIDTH / 2;

    for (const spec of specs) {
      const piece = circuit.pieces[spec.pieceIndex]!;
      expect(piece.kind).toBe('obstacles');
      const local = spec.position
        .clone()
        .applyMatrix4(piece.matrix.clone().invert());

      // Each block sits near a rail, above the deck, and inside the track.
      expect(Math.abs(local.x)).toBeCloseTo(OBSTACLE_LATERAL_OFFSET, 6);
      expect(local.y).toBeCloseTo(OBSTACLE_HEIGHT / 2, 6);
      expect(local.z).toBeGreaterThan(0);
      expect(local.z).toBeLessThan(piece.length);
      expect(Math.abs(local.x) - spec.halfExtents.x).toBeGreaterThan(required);
      expect(Math.abs(local.x) + spec.halfExtents.x).toBeLessThan(
        TRACK_WIDTH / 2,
      );
    }
  });

  it('lines each segment with rows of blocks on both edges', () => {
    const circuit = obstacleCircuit();
    const specs = obstacleSpecs(circuit);
    const byPiece = new Map<number, number>();
    for (const spec of specs) {
      byPiece.set(spec.pieceIndex, (byPiece.get(spec.pieceIndex) ?? 0) + 1);
    }
    expect(byPiece.size).toBeGreaterThan(0);
    for (const count of byPiece.values()) {
      expect(count).toBeGreaterThanOrEqual(OBSTACLE_ROWS);
      expect(count).toBeLessThanOrEqual(OBSTACLE_ROWS * 2);
    }

    const sides = new Set<number>();
    for (const spec of specs) {
      const piece = circuit.pieces[spec.pieceIndex]!;
      const local = spec.position
        .clone()
        .applyMatrix4(piece.matrix.clone().invert());
      sides.add(Math.sign(local.x));
    }
    expect(sides).toEqual(new Set([-1, 1]));
  });

  it('has no blocks on a circuit without an obstacle piece', () => {
    const empty: Circuit = {
      seed: 'empty',
      level: 1,
      seedOffset: 0,
      pieces: [],
      frameCount: 0,
    };
    expect(obstacleSpecs(empty)).toEqual([]);
  });
});
