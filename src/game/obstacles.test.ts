import { describe, expect, it } from 'vitest';
import {
  CAR_WIDTH,
  OBSTACLE_DEPTH,
  OBSTACLE_WIDTH,
  TRACK_WIDTH,
} from './constants';
import {
  obstacleLanes,
  obstacleSpecs,
  weaveLateral,
  type ObstacleLane,
} from './obstacles';
import { generateCircuit, type Circuit } from './track';

function obstacleCircuit(): Circuit {
  for (let index = 0; index < 80; index += 1) {
    const circuit = generateCircuit(`obstacle-placement-${index}`, 1);
    if (circuit.pieces.some((piece) => piece.kind === 'obstacles')) {
      return circuit;
    }
  }
  throw new Error('no obstacle circuit found');
}

function allLaneSpecs(): ObstacleLane[] {
  const lanes: ObstacleLane[] = [];
  for (let index = 0; index < 120; index += 1) {
    lanes.push(...obstacleLanes(generateCircuit(`obstacle-weave-${index}`, 1)));
  }
  if (lanes.length === 0) {
    throw new Error('no obstacle corridors found');
  }
  return lanes;
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
      // angleTo near identity loses precision in acos, so allow float noise.
      expect(obstacle.quaternion.angleTo(other.quaternion)).toBeLessThan(1e-6);
      expect(obstacle.halfExtents.equals(other.halfExtents)).toBe(true);
      expect(obstacle.pieceIndex).toBe(other.pieceIndex);
    });
  });

  it('puts some blocks in the middle of the road', () => {
    for (let index = 0; index < 120; index += 1) {
      const circuit = generateCircuit(`obstacle-centre-${index}`, 1);
      const piece = circuit.pieces.find(
        (candidate) => candidate.kind === 'obstacles',
      );
      if (!piece) {
        continue;
      }
      const inv = piece.matrix.clone().invert();
      const nearCentre = obstacleSpecs(circuit).some((spec) => {
        const local = spec.position.clone().applyMatrix4(inv);
        return Math.abs(local.x) < OBSTACLE_WIDTH;
      });
      if (nearCentre) {
        return;
      }
    }
    throw new Error('no obstacle corridor with a centre block found');
  });

  it('keeps every row passable and inside the rails', () => {
    const circuit = obstacleCircuit();
    const lanes = obstacleLanes(circuit);
    expect(lanes.length).toBeGreaterThan(0);
    const piece = circuit.pieces.find(
      (candidate) => candidate.kind === 'obstacles',
    )!;
    const inv = piece.matrix.clone().invert();
    const margin = 0.1;

    for (const lane of lanes) {
      expect(lane.sTo - lane.sFrom).toBeCloseTo(piece.length, 6);
      for (const row of lane.rows) {
        // A car must be able to clear all of the row's blocks at once.
        const passable: number[] = [];
        for (let x = -TRACK_WIDTH / 2; x <= TRACK_WIDTH / 2; x += 0.05) {
          const clear = row.blocked.every(
            (side) =>
              Math.abs(x - side) - OBSTACLE_WIDTH / 2 - CAR_WIDTH / 2 >=
              -margin,
          );
          if (clear) {
            passable.push(x);
          }
        }
        expect(passable.length).toBeGreaterThan(0);
        expect(row.blocked.length).toBeGreaterThan(0);
        for (const side of row.blocked) {
          expect(Math.abs(side) + OBSTACLE_WIDTH / 2).toBeLessThanOrEqual(
            TRACK_WIDTH / 2,
          );
        }
      }
    }

    // Every drawn block lands on the same row and lateral offset the weave
    // uses, expressed in the corridor's own frame.
    const world = obstacleSpecs(circuit).map((spec) => {
      const local = spec.position.clone().applyMatrix4(inv);
      return { x: local.x, z: local.z };
    });
    const expected = lanes[0]!.rows.flatMap((row) =>
      row.blocked.map((side) => ({ x: side, z: row.z })),
    );
    expect(world.length).toBe(expected.length);
    for (const block of world) {
      expect(
        expected.some(
          (other) =>
            Math.abs(other.x - block.x) < 1e-6 &&
            Math.abs(other.z - block.z) < 1e-6,
        ),
      ).toBe(true);
    }
  });

  it('weaves rivals around every block', () => {
    const speeds = [-1.4, 0.9, -0.4, 1.4, 0.4];
    for (const lane of allLaneSpecs()) {
      for (const home of speeds) {
        let previous = home;
        for (
          let s = lane.sFrom;
          s <= lane.sTo;
          s += Math.min(0.05, OBSTACLE_DEPTH / 4)
        ) {
          previous = weaveLateral([lane], s, previous, home);
          const z = s - lane.sFrom;
          for (const row of lane.rows) {
            if (Math.abs(z - row.z) >= OBSTACLE_DEPTH / 2 + CAR_WIDTH / 2) {
              continue;
            }
            for (const side of row.blocked) {
              expect(
                Math.abs(previous - side),
              ).toBeGreaterThanOrEqual(OBSTACLE_WIDTH / 2 + CAR_WIDTH / 2 - 0.15);
            }
          }
        }
      }
    }
  }, 20_000);

  it('returns rivals to their home lane outside the corridor', () => {
    const lane = allLaneSpecs()[0]!;
    expect(weaveLateral([lane], lane.sFrom - 4, 0.5, 0.5)).toBe(0.5);
    expect(weaveLateral([lane], lane.sFrom - 0.1, 0.5, 0.5)).toBe(0.5);
    expect(weaveLateral([lane], lane.sTo + 2, 0.9, 0.9)).toBe(0.9);
  }, 20_000);

  it('keeps the weave continuous at the corridor entry and exit', () => {
    const lane = allLaneSpecs()[0]!;
    let previous = 0.4;
    let last = 0.4;
    for (let s = lane.sFrom - 2; s <= lane.sTo + 2; s += 0.02) {
      const lateral = weaveLateral([lane], s, previous, 0.4);
      expect(Math.abs(lateral - last)).toBeLessThan(1.4);
      previous = lateral;
      last = lateral;
    }
  }, 20_000);

  it('has no blocks on a circuit without an obstacle piece', () => {
    const empty: Circuit = {
      seed: 'empty',
      level: 1,
      seedOffset: 0,
      pieces: [],
      frameCount: 0,
    };
    expect(obstacleSpecs(empty)).toEqual([]);
    expect(obstacleLanes(empty)).toEqual([]);
  });
});