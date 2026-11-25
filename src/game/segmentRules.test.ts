import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  describeMinimums,
  evaluateMinimums,
  normalizeMinimums,
} from './segmentRules';
import type { Piece } from './track';

/**
 * Synthetic pieces: the rule check only reads `kind`, so these let the tests
 * exercise it without generating a circuit or a seed.
 */
function piece(kind: Piece['kind']): Piece {
  return {
    kind,
    path: (t) => ({
      position: new THREE.Vector3(0, 0, t),
      tangent: new THREE.Vector3(0, 0, 1),
      up: new THREE.Vector3(0, 1, 0),
      bank: 0,
    }),
    length: 1,
    matrix: new THREE.Matrix4(),
  };
}

function pieces(...kinds: Piece['kind'][]): Piece[] {
  return kinds.map(piece);
}

describe('normalizeMinimums', () => {
  it('floors values and drops zero, negative, and non-finite counts', () => {
    expect(
      normalizeMinimums({
        'spiral-up': 2.9,
        hill: 0,
        obstacles: -1,
        'ramp-up': Number.NaN,
      }),
    ).toEqual({ 'spiral-up': 2 });
  });

  it('returns an empty rule set for an empty or all-zero input', () => {
    expect(normalizeMinimums({})).toEqual({});
    expect(normalizeMinimums({ loop: 0, hill: 0 })).toEqual({});
  });

  it('couples the jump launch, gap, and landing to the largest count', () => {
    expect(normalizeMinimums({ gap: 3 })).toEqual({
      kicker: 3,
      gap: 3,
      landing: 3,
    });
    expect(normalizeMinimums({ kicker: 1, landing: 2 })).toEqual({
      kicker: 2,
      gap: 2,
      landing: 2,
    });
  });

  it('couples the loop and its return to the largest count', () => {
    expect(normalizeMinimums({ loop: 4 })).toEqual({ loop: 4, shift: 4 });
    expect(normalizeMinimums({ shift: 2 })).toEqual({ loop: 2, shift: 2 });
  });

  it('implies one loop and return for a bridge deck', () => {
    expect(normalizeMinimums({ bridge: 2 })).toEqual({
      bridge: 2,
      loop: 1,
      shift: 1,
    });
  });

  it('keeps a larger loop count when a bridge is also required', () => {
    expect(normalizeMinimums({ bridge: 1, loop: 3 })).toEqual({
      bridge: 1,
      loop: 3,
      shift: 3,
    });
  });

  it('is idempotent', () => {
    const once = normalizeMinimums({ kicker: 2, bridge: 1, hill: 3 });
    expect(normalizeMinimums(once)).toEqual(once);
  });
});

describe('evaluateMinimums', () => {
  const circuitPieces = pieces('loop', 'loop', 'shift', 'hill');

  it('reports the actual count and whether each minimum is met', () => {
    expect(
      evaluateMinimums(circuitPieces, {
        loop: 2,
        shift: 2,
        hill: 1,
        gap: 1,
      }),
    ).toEqual([
      { kind: 'loop', minimum: 2, actual: 2, met: true },
      { kind: 'shift', minimum: 2, actual: 1, met: false },
      { kind: 'hill', minimum: 1, actual: 1, met: true },
      { kind: 'gap', minimum: 1, actual: 0, met: false },
    ]);
  });

  it('skips minimums that are not positive rules', () => {
    expect(evaluateMinimums(pieces('loop'), { loop: 0, hill: -1 })).toEqual([]);
  });

  it('needs no circuit state to run', () => {
    expect(evaluateMinimums([], { obstacles: 1 })).toEqual([
      { kind: 'obstacles', minimum: 1, actual: 0, met: false },
    ]);
  });
});

describe('describeMinimums', () => {
  const circuitPieces = pieces('loop', 'loop', 'shift', 'hill');

  it('counts met rules and lists the failures', () => {
    const summary = describeMinimums(
      evaluateMinimums(circuitPieces, { loop: 5, shift: 1, hill: 0 }),
    );
    expect(summary.total).toBe(2);
    expect(summary.met).toBe(1);
    expect(summary.allMet).toBe(false);
    expect(summary.failures.map((result) => result.kind)).toEqual(['loop']);
  });

  it('treats an empty rule set as met', () => {
    const summary = describeMinimums(evaluateMinimums([], {}));
    expect(summary).toMatchObject({
      total: 0,
      met: 0,
      allMet: true,
      failures: [],
    });
  });
});
