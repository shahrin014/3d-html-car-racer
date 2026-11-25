import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { BRIDGE_CLEARANCE, TRACK_WIDTH } from './constants';
import {
  generateCircuit,
  validateCircuit,
  type Circuit,
  type Piece,
} from './track';

function count(circuit: Circuit, kind: Piece['kind']): number {
  return circuit.pieces.filter((piece) => piece.kind === kind).length;
}

/**
 * A loop ring rises up to two loop radii above its leg, so the plan check in
 * `validateCircuit` skips it. Sample each ring and look for another piece's
 * deck underneath it at a height inside the bridge clearance.
 */
function loopClearanceFailures(circuit: Circuit): string[] {
  const pieces = circuit.pieces;
  const bridge = pieces.find((piece) => piece.kind === 'bridge');
  const deckMid = bridge
    ? new THREE.Vector3()
        .setFromMatrixPosition(bridge.matrix)
        .add(
          new THREE.Vector3(0, 0, bridge.length / 2)
            .transformDirection(bridge.matrix)
            .multiplyScalar(bridge.length / 2),
        )
    : null;

  const clouds = pieces.map((piece) => {
    const points: THREE.Vector3[] = [];
    const samples = piece.kind === 'loop' ? 120 : 60;
    for (let index = 0; index <= samples; index += 1) {
      points.push(
        piece.path(index / samples).position
          .clone()
          .applyMatrix4(piece.matrix),
      );
    }
    return points;
  });

  const failures: string[] = [];
  pieces.forEach((piece, loopIndex) => {
    if (piece.kind !== 'loop') {
      return;
    }
    const base = new THREE.Vector3().setFromMatrixPosition(piece.matrix);
    // The loop at the crossing is meant to have the bridge through its hole.
    if (deckMid && Math.hypot(base.x - deckMid.x, base.z - deckMid.z) < 5) {
      return;
    }
    for (let other = 0; other < pieces.length; other += 1) {
      // The loop's own seam: the piece before it and its paired shift share
      // the ring's start and exit.
      const delta = (other - loopIndex + pieces.length) % pieces.length;
      if (delta === 0 || delta === 1 || delta === pieces.length - 1) {
        continue;
      }
      for (const a of clouds[loopIndex]!) {
        for (const b of clouds[other]!) {
          const plan = Math.hypot(a.x - b.x, a.z - b.z);
          if (plan >= TRACK_WIDTH - 1e-6) {
            continue;
          }
          if (Math.abs(a.y - b.y) >= BRIDGE_CLEARANCE) {
            continue;
          }
          failures.push(
            `loop ${loopIndex} vs ${pieces[other]!.kind} ${other} plan=${plan.toFixed(2)} dy=${Math.abs(a.y - b.y).toFixed(2)}`,
          );
        }
      }
    }
  });
  return failures;
}

describe('repeated loop clearance', () => {
  it('keeps the single-crossing leg loops clear of the spiral', () => {
    const circuit = generateCircuit('circuit-09819cac6074edcf', 1, {
      crossovers: 1,
      minimumCounts: { loop: 3, shift: 3 },
    });
    expect(circuit.layout).toBe('single-crossing');
    expect(count(circuit, 'loop')).toBeGreaterThanOrEqual(3);
    expect(count(circuit, 'shift')).toBeGreaterThanOrEqual(3);
    expect(validateCircuit(circuit).ok).toBe(true);
    expect(loopClearanceFailures(circuit)).toEqual([]);
  }, 60_000);

  it('keeps stacked single-crossing loops clear of each other', () => {
    for (const seed of ['loop-stack-a', 'loop-stack-b', 'loop-stack-c']) {
      const circuit = generateCircuit(seed, 1, {
        crossovers: 1,
        minimumCounts: { loop: 5, shift: 5 },
      });
      expect(count(circuit, 'loop'), seed).toBeGreaterThanOrEqual(5);
      expect(validateCircuit(circuit).ok, seed).toBe(true);
      expect(loopClearanceFailures(circuit), seed).toEqual([]);
    }
  }, 120_000);

  it('keeps repeated polygon loops off the elevation legs', () => {
    for (const seed of ['polygon-loop-a', 'polygon-loop-b']) {
      for (const loops of [3, 5] as const) {
        const circuit = generateCircuit(seed, 1, {
          crossovers: 0,
          minimumCounts: { loop: loops, shift: loops },
        });
        expect(count(circuit, 'loop'), `${seed} ${loops}`).toBeGreaterThanOrEqual(
          loops,
        );
        expect(validateCircuit(circuit).ok, `${seed} ${loops}`).toBe(true);
        expect(loopClearanceFailures(circuit), `${seed} ${loops}`).toEqual([]);
      }
    }
  }, 120_000);
});
