import { describe, expect, it } from 'vitest';
import {
  generateCircuit,
  validateCircuit,
  type Circuit,
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
    ).toThrow(/with rules: \+bridge \+steep-ramp/);
  });

  it('does not mix a multi-crossing layout with catalog segments', () => {
    expect(() =>
      generateCircuit('required-multi-mix', 1, {
        allowMultiCrossing: true,
        requiredKinds: ['multi-crossing', 'loop'],
      }),
    ).toThrow(/cannot be combined with catalog segments/);
  });

  it('removes excluded features from the circuit', () => {
    const cases: { excluded: Piece['kind'][]; absent: Piece['kind'][] }[] = [
      { excluded: ['loop'], absent: ['loop', 'shift'] },
      { excluded: ['obstacles'], absent: ['obstacles'] },
      {
        excluded: ['hill', 'kicker', 'gap', 'landing'],
        absent: ['hill', 'kicker', 'gap', 'landing'],
      },
      { excluded: ['bridge'], absent: ['bridge'] },
      {
        excluded: ['steep-ramp', 'steep-ramp-down'],
        absent: ['steep-ramp', 'steep-ramp-down'],
      },
    ];
    for (const testCase of cases) {
      const circuit = generateCircuit('excluded-segments', 1, {
        allowMultiCrossing: true,
        excludedKinds: testCase.excluded,
      });
      const kinds = new Set(circuit.pieces.map((piece) => piece.kind));
      for (const kind of testCase.absent) {
        expect(kinds.has(kind), `${kind} should be absent`).toBe(false);
      }
      expect(
        validateCircuit(circuit, {
          allowLoopless: testCase.excluded.includes('loop'),
        }).ok,
      ).toBe(true);
    }
  }, 30_000);

  it('produces a loopless circuit that needs the explicit validation flag', () => {
    const circuit = generateCircuit('loopless-validation', 1, {
      excludedKinds: ['loop'],
    });
    expect(circuit.pieces.some((piece) => piece.kind === 'loop')).toBe(false);
    expect(validateCircuit(circuit).ok).toBe(false);
    expect(validateCircuit(circuit, { allowLoopless: true }).ok).toBe(true);
  });

  it('rejects structural exclusions', () => {
    for (const kind of ['straight', 'turn', 'boost'] as const) {
      expect(() =>
        generateCircuit('structural-exclusion', 1, {
          excludedKinds: [kind],
        }),
      ).toThrow(/structural and cannot be excluded/);
    }
  });

  it('rejects contradictory required and excluded rules', () => {
    expect(() =>
      generateCircuit('contradictory-rules', 1, {
        requiredKinds: ['loop'],
        excludedKinds: ['loop'],
      }),
    ).toThrow(/both required and excluded/);
    expect(() =>
      generateCircuit('contradictory-rules', 1, {
        requiredKinds: ['bridge'],
        excludedKinds: ['loop'],
      }),
    ).toThrow(/bridge deck needs the loop/);
    expect(() =>
      generateCircuit('contradictory-rules', 1, {
        requiredKinds: ['gap'],
        excludedKinds: ['kicker'],
      }),
    ).toThrow(/jump launch, gap, and landing/);
    expect(() =>
      generateCircuit('contradictory-rules', 1, {
        requiredKinds: ['steep-ramp'],
        excludedKinds: [
          'steep-ramp-down',
          'spiral-down',
          'ramp-down',
          'kicker',
          'gap',
          'landing',
        ],
      }),
    ).toThrow(/with rules:/);
  });

  it('lets a steep climb return on a different descent', () => {
    const circuit = generateCircuit('steep-up-independent', 1, {
      requiredKinds: ['steep-ramp'],
      excludedKinds: ['steep-ramp-down'],
    });
    const kinds = circuit.pieces.map((piece) => piece.kind);
    expect(kinds).toContain('steep-ramp');
    expect(kinds).not.toContain('steep-ramp-down');
    expect(
      kinds.some((kind) =>
        ['spiral-down', 'ramp-down', 'kicker'].includes(kind),
      ),
    ).toBe(true);
  }, 30_000);

  it('lets a steep descent follow a different climb', () => {
    const circuit = generateCircuit('steep-down-independent', 1, {
      requiredKinds: ['steep-ramp-down'],
      excludedKinds: ['steep-ramp'],
    });
    const kinds = circuit.pieces.map((piece) => piece.kind);
    expect(kinds).toContain('steep-ramp-down');
    expect(kinds).not.toContain('steep-ramp');
    expect(
      kinds.some((kind) => ['spiral-up', 'ramp-up'].includes(kind)),
    ).toBe(true);
  }, 30_000);

  it('lets a steep climb return on a spiral descent', () => {
    const circuit = generateCircuit('steep-spiral-descent', 1, {
      requiredKinds: ['steep-ramp', 'spiral-down'],
      excludedKinds: ['steep-ramp-down', 'ramp-up', 'ramp-down'],
    });
    const kinds = circuit.pieces.map((piece) => piece.kind);
    expect(kinds).toContain('steep-ramp');
    expect(kinds).toContain('spiral-down');
    expect(kinds).not.toContain('steep-ramp-down');
  }, 30_000);

  it('uses only spiral transitions when the other elevation kinds are excluded', () => {
    const circuit = generateCircuit('spiral-only-elevation', 1, {
      requiredKinds: ['spiral-up', 'spiral-down'],
      excludedKinds: [
        'ramp-up',
        'ramp-down',
        'steep-ramp',
        'steep-ramp-down',
        'kicker',
        'gap',
        'landing',
      ],
    });
    const kinds = circuit.pieces.map((piece) => piece.kind);
    expect(kinds).toContain('spiral-up');
    expect(kinds).toContain('spiral-down');
    for (const kind of [
      'ramp-up',
      'ramp-down',
      'steep-ramp',
      'steep-ramp-down',
    ] as const) {
      expect(kinds).not.toContain(kind);
    }
  }, 30_000);

  it('honors minimum piece counts', () => {
    const count = (circuit: Circuit, kind: Piece['kind']): number =>
      circuit.pieces.filter((piece) => piece.kind === kind).length;

    const spirals = generateCircuit('count-spirals', 1, {
      minimumCounts: { 'spiral-down': 2 },
    });
    expect(count(spirals, 'spiral-down')).toBeGreaterThanOrEqual(2);

    const steeps = generateCircuit('count-steeps', 1, {
      minimumCounts: { 'steep-ramp': 2 },
    });
    expect(count(steeps, 'steep-ramp')).toBeGreaterThanOrEqual(2);

    const turns = generateCircuit('count-turns', 1, {
      minimumCounts: { turn: 3 },
    });
    expect(count(turns, 'turn')).toBeGreaterThanOrEqual(3);

    const loopless = generateCircuit('count-no-loop', 1, {
      minimumCounts: { loop: 0 },
    });
    expect(count(loopless, 'loop')).toBe(0);
    expect(count(loopless, 'shift')).toBe(0);

    const steepUpOnly = generateCircuit('count-steep-up', 1, {
      minimumCounts: { 'steep-ramp': 1, 'steep-ramp-down': 0 },
    });
    expect(count(steepUpOnly, 'steep-ramp')).toBeGreaterThanOrEqual(1);
    expect(count(steepUpOnly, 'steep-ramp-down')).toBe(0);
  }, 30_000);

  it('rejects a minimum the authored circuit cannot repeat', () => {
    expect(() =>
      generateCircuit('count-loop-twice', 1, {
        minimumCounts: { loop: 2 },
      }),
    ).toThrow(/loop is authored once/);
    expect(() =>
      generateCircuit('count-obstacles-twice', 1, {
        minimumCounts: { obstacles: 2 },
      }),
    ).toThrow(/obstacles is authored once/);
  });

  it('returns the same circuit for the same exclusion rules', () => {
    const options = {
      allowMultiCrossing: true,
      excludedKinds: ['loop', 'obstacles'] as const,
    };
    const first = generateCircuit('excluded-determinism', 1, options);
    const second = generateCircuit('excluded-determinism', 1, options);
    expect(second.seedOffset).toBe(first.seedOffset);
    expect(second.layout).toBe(first.layout);
    expect(second.pieces.map((piece) => `${piece.kind}:${piece.length}`)).toEqual(
      first.pieces.map((piece) => `${piece.kind}:${piece.length}`),
    );
  }, 30_000);

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
