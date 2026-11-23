import { describe, expect, it } from 'vitest';
import {
  generateCircuit,
  validateCircuit,
  type Piece,
} from './track';

const SEGMENTS: Piece['kind'][] = [
  'straight',
  'turn',
  'boost',
  'loop',
  'shift',
  'hill',
  'kicker',
  'gap',
  'landing',
  'obstacles',
  'spiral-up',
  'spiral-down',
  'bridge',
  'ramp-up',
  'ramp-down',
  'steep-ramp',
  'steep-ramp-down',
  'multi-crossing',
];

describe('required segments', () => {
  it('places every selectable segment in a playable circuit', () => {
    for (const kind of SEGMENTS) {
      const circuit = generateCircuit('required-segments', 1, {
        allowMultiCrossing: true,
        requiredKinds: [kind],
      });
      expect(
        circuit.pieces.some((piece) => piece.kind === kind),
        kind,
      ).toBe(true);
      expect(validateCircuit(circuit).ok, kind).toBe(true);
    }
  }, 30_000);

  it('keeps a combined request together', () => {
    const circuit = generateCircuit('required-combo', 1, {
      allowMultiCrossing: true,
      requiredKinds: ['bridge', 'loop', 'gap', 'obstacles'],
    });
    const kinds = new Set(circuit.pieces.map((piece) => piece.kind));
    for (const kind of ['bridge', 'loop', 'gap', 'obstacles'] as const) {
      expect(kinds.has(kind), kind).toBe(true);
    }
    expect(circuit.layout).toBe('single-crossing');
    expect(validateCircuit(circuit).ok).toBe(true);
  }, 30_000);

  it('returns the same circuit for the same seed and requirements', () => {
    const options = {
      allowMultiCrossing: true,
      requiredKinds: ['steep-ramp', 'obstacles'] as const,
    };
    const first = generateCircuit('required-determinism', 1, options);
    const second = generateCircuit('required-determinism', 1, options);
    expect(second.seedOffset).toBe(first.seedOffset);
    expect(second.layout).toBe(first.layout);
    expect(second.pieces.map((piece) => `${piece.kind}:${piece.length}`)).toEqual(
      first.pieces.map((piece) => `${piece.kind}:${piece.length}`),
    );
  }, 30_000);

  it('reports an impossible catalog combination', () => {
    expect(() =>
      generateCircuit('required-impossible', 1, {
        allowMultiCrossing: true,
        requiredKinds: ['bridge', 'steep-ramp'],
      }),
    ).toThrow(/required segments: bridge, steep-ramp/);
  });

  it('does not mix a multi-crossing layout with catalog segments', () => {
    expect(() =>
      generateCircuit('required-multi-mix', 1, {
        allowMultiCrossing: true,
        requiredKinds: ['multi-crossing', 'loop'],
      }),
    ).toThrow(/cannot be combined with catalog segments/);
  });

  it('leaves an empty requirement list on the normal stream', () => {
    // Requirement support must not consume the layout roll for ordinary
    // generation; an empty list is the same as no options.
    const plain = generateCircuit('unchanged-seed', 1);
    const empty = generateCircuit('unchanged-seed', 1, { requiredKinds: [] });
    expect(empty.seedOffset).toBe(plain.seedOffset);
    expect(empty.layout).toBe(plain.layout);
    expect(empty.pieces.map((piece) => `${piece.kind}:${piece.length}`)).toEqual(
      plain.pieces.map((piece) => `${piece.kind}:${piece.length}`),
    );
  });
});
