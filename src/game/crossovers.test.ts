import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { BRIDGE_HEIGHT } from './constants';
import {
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
    expect(count(double, 'multi-crossing')).toBeGreaterThanOrEqual(12);
    expect(validateCircuit(double).ok).toBe(true);
  }, 30_000);

  it('lets a two-crossing layout satisfy a multi-crossing count', () => {
    const circuit = generateCircuit('cross-2-count', 1, {
      crossovers: 2,
      minimumCounts: { 'multi-crossing': 2 },
    });
    expect(circuit.layout).toBe('double-crossing');
    expect(count(circuit, 'multi-crossing')).toBeGreaterThanOrEqual(2);
    expect(validateCircuit(circuit).ok).toBe(true);
  }, 30_000);

  it('rejects catalog counts on a two-crossing layout', () => {
    expect(() =>
      generateCircuit('cross-2-loop', 1, {
        crossovers: 2,
        minimumCounts: { loop: 1 },
      }),
    ).toThrow(/cannot be combined with catalog segments/);
  });

  it('is deterministic for the same seed and crossover count', () => {
    const first = generateCircuit('cross-determinism', 1, { crossovers: 2 });
    const second = generateCircuit('cross-determinism', 1, { crossovers: 2 });
    expect(second.layout).toBe(first.layout);
    expect(second.pieces.map((piece) => piece.length)).toEqual(
      first.pieces.map((piece) => piece.length),
    );
  }, 30_000);
});
