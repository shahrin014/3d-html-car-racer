import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { BRIDGE_CLEARANCE, BRIDGE_HEIGHT, TRACK_WIDTH } from './constants';
import {
  buildFrames,
  generateCircuit,
  validateCircuit,
  type Piece,
} from './track';

function count(
  circuit: ReturnType<typeof generateCircuit>,
  kind: Piece['kind'],
): number {
  return circuit.pieces.filter((piece) => piece.kind === kind).length;
}

/**
 * Count separate places where the route passes over another part of itself.
 * The octagon has two plan crossings by construction; an elevated approach can
 * run alongside a lower chord, so callers require at least two rather than an
 * exact sample count.
 */
function countPlanCrossings(
  circuit: ReturnType<typeof generateCircuit>,
): number {
  const frames = buildFrames(circuit, 0.8);
  const total = frames[frames.length - 1]!.s;
  const starts: { at: number; kind: Piece['kind'] }[] = [];
  let distance = 0;
  for (const piece of circuit.pieces) {
    starts.push({ at: distance, kind: piece.kind });
    distance += piece.length;
  }
  const kindAt = (s: number): Piece['kind'] => {
    let kind: Piece['kind'] = starts[0]?.kind ?? 'straight';
    for (const start of starts) {
      if (start.at <= s + 1e-6) {
        kind = start.kind;
      } else {
        break;
      }
    }
    return kind;
  };
  const lower: number[] = [];
  for (let a = 0; a < frames.length; a += 1) {
    const upper = frames[a]!;
    const upperKind = kindAt(upper.s);
    if (
      upperKind === 'loop' ||
      upperKind === 'gap' ||
      upperKind === 'spiral-up' ||
      upperKind === 'spiral-down' ||
      upperKind === 'turn'
    ) {
      continue;
    }
    for (let b = a + 1; b < frames.length; b += 1) {
      const lowerFrame = frames[b]!;
      const lowerKind = kindAt(lowerFrame.s);
      if (
        lowerKind === 'loop' ||
        lowerKind === 'gap' ||
        lowerKind === 'spiral-up' ||
        lowerKind === 'spiral-down' ||
        lowerKind === 'turn'
      ) {
        continue;
      }
      const direct = Math.abs(upper.s - lowerFrame.s);
      const arc = Math.min(direct, Math.max(0, total - direct));
      if (arc < TRACK_WIDTH * 2) {
        continue;
      }
      const horizontal = Math.hypot(
        upper.position.x - lowerFrame.position.x,
        upper.position.z - lowerFrame.position.z,
      );
      if (horizontal >= TRACK_WIDTH * 0.5) {
        continue;
      }
      if (
        Math.abs(upper.position.y - lowerFrame.position.y) <
        BRIDGE_CLEARANCE
      ) {
        continue;
      }
      lower.push(lowerFrame.s);
    }
  }
  lower.sort((left, right) => left - right);
  let clusters = 0;
  let last = Number.NEGATIVE_INFINITY;
  for (const at of lower) {
    if (at - last > TRACK_WIDTH * 2) {
      clusters += 1;
      last = at;
    }
  }
  return clusters;
}

describe('crossover parameter', () => {
  it('forces a polygon, single-crossing, or two-crossing layout', () => {
    const polygon = generateCircuit('cross-0', 1, { crossovers: 0 });
    expect(polygon.layout).toBe('polygon');
    expect(validateCircuit(polygon).ok).toBe(true);

    const single = generateCircuit('cross-1', 1, { crossovers: 1 });
    expect(single.layout).toBe('single-crossing');
    expect(count(single, 'loop')).toBeGreaterThanOrEqual(1);
    expect(count(single, 'bridge')).toBeGreaterThanOrEqual(1);
    expect(validateCircuit(single).ok).toBe(true);

    // The loop ring sits under the bridge deck at the crossing.
    const loop = single.pieces.find((piece) => piece.kind === 'loop')!;
    const bridge = single.pieces.find((piece) => piece.kind === 'bridge')!;
    const ring = new THREE.Vector3().setFromMatrixPosition(loop.matrix);
    const deckStart = new THREE.Vector3().setFromMatrixPosition(
      bridge.matrix,
    );
    const ahead = new THREE.Vector3(0, 0, bridge.length / 2)
      .transformDirection(bridge.matrix)
      .multiplyScalar(bridge.length / 2);
    const deckMid = deckStart.clone().add(ahead);
    expect(Math.hypot(ring.x - deckMid.x, ring.z - deckMid.z)).toBeLessThan(3);
    expect(deckMid.y - ring.y).toBeGreaterThan(BRIDGE_HEIGHT - 1);

    const double = generateCircuit('cross-2', 1, { crossovers: 2 });
    expect(double.layout).toBe('double-crossing');
    expect(count(double, 'loop')).toBeGreaterThanOrEqual(1);
    expect(count(double, 'bridge')).toBeGreaterThanOrEqual(1);
    expect(validateCircuit(double).ok).toBe(true);
    expect(countPlanCrossings(double)).toBeGreaterThanOrEqual(2);
  }, 30_000);

  it('spends elevation counts on the bridge approach', () => {
    const circuit = generateCircuit('circuit-4ff6503b44eba4b9', 1, {
      crossovers: 2,
      minimumCounts: {
        kicker: 1,
        gap: 1,
        landing: 1,
        'spiral-up': 4,
        'ramp-up': 2,
        'ramp-down': 2,
        'steep-ramp': 2,
      },
    });
    expect(count(circuit, 'spiral-up')).toBeGreaterThanOrEqual(4);
    expect(count(circuit, 'ramp-up')).toBeGreaterThanOrEqual(2);
    expect(count(circuit, 'ramp-down')).toBeGreaterThanOrEqual(2);
    expect(count(circuit, 'steep-ramp')).toBeGreaterThanOrEqual(2);
    expect(count(circuit, 'kicker')).toBeGreaterThanOrEqual(1);
    expect(count(circuit, 'gap')).toBeGreaterThanOrEqual(1);
    expect(count(circuit, 'landing')).toBeGreaterThanOrEqual(1);
    expect(validateCircuit(circuit).ok).toBe(true);
    expect(countPlanCrossings(circuit)).toBeGreaterThanOrEqual(2);
  }, 60_000);

  it('generates a valid two-crossing layout for many seeds', () => {
    for (let index = 0; index < 8; index += 1) {
      const circuit = generateCircuit(`double-seed-${index}`, 1, {
        crossovers: 2,
      });
      expect(validateCircuit(circuit).ok).toBe(true);
      expect(countPlanCrossings(circuit)).toBeGreaterThanOrEqual(2);
    }
  }, 60_000);

  it('honors catalog counts on a two-crossing layout', () => {
    const circuit = generateCircuit('cross-2-count', 1, {
      crossovers: 2,
      minimumCounts: { loop: 2, obstacles: 1 },
    });
    expect(circuit.layout).toBe('double-crossing');
    expect(count(circuit, 'loop')).toBeGreaterThanOrEqual(2);
    expect(count(circuit, 'obstacles')).toBeGreaterThanOrEqual(1);
    expect(validateCircuit(circuit).ok).toBe(true);
  }, 30_000);

  it('is deterministic for the same seed and crossover count', () => {
    const first = generateCircuit('cross-determinism', 1, { crossovers: 2 });
    const second = generateCircuit('cross-determinism', 1, { crossovers: 2 });
    expect(second.layout).toBe(first.layout);
    expect(second.pieces.map((piece) => piece.length)).toEqual(
      first.pieces.map((piece) => piece.length),
    );
  }, 30_000);
});
