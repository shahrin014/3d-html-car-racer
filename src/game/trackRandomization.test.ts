import { describe, expect, it } from 'vitest';
import { MIN_TURN_RADIUS } from './constants';
import {
  buildFrames,
  generateCircuit,
  loopRadiusForLevel,
  turnRadiusForLevel,
  validateCircuit,
  type Circuit,
  type Piece,
} from './track';

const SEEDS = ['alpha', 'bravo', 'charlie', 'delta', 'echo', 'foxtrot'];
const LEVELS = [1, 2, 3, 5, 8, 12];

/** The seeded part of a circuit: every piece and its chosen length. */
function combination(circuit: Circuit): string {
  return circuit.pieces
    .map((piece) => `${piece.kind}:${piece.length.toFixed(6)}`)
    .join('|');
}

/** The authored, level-scaled pieces; a seed must not change these. */
function authoredPieces(circuit: Circuit): string {
  return circuit.pieces
    .filter(
      (piece) =>
        piece.kind === 'loop' ||
        piece.kind === 'turn' ||
        piece.kind === 'hill' ||
        piece.kind === 'shift',
    )
    .map((piece) => `${piece.kind}:${piece.length.toFixed(6)}`)
    .sort()
    .join('|');
}

function firstBankedTurn(circuit: Circuit): Piece {
  const turn = circuit.pieces.find((piece) => piece.kind === 'turn');
  if (!turn) {
    throw new Error('circuit has no banked turn');
  }
  return turn;
}

function onlyLoop(circuit: Circuit): Piece {
  const loop = circuit.pieces.find((piece) => piece.kind === 'loop');
  if (!loop) {
    throw new Error('circuit has no loop');
  }
  return loop;
}

describe('track randomization', () => {
  it('replays the exact same combination for the same seed and level', () => {
    for (const level of LEVELS) {
      const first = generateCircuit('restart', level);
      const second = generateCircuit('restart', level);
      expect(combination(second)).toBe(combination(first));
      expect(second.frameCount).toBe(first.frameCount);
    }
  });

  it('spreads different combinations across seeds at one level', () => {
    const combinations = new Set(
      SEEDS.map((seed) => combination(generateCircuit(seed, 1))),
    );
    expect(combinations.size).toBeGreaterThan(1);
  });

  it('changes the combination when the level changes', () => {
    for (const seed of ['alpha', 'charlie']) {
      const easy = generateCircuit(seed, 1);
      const hard = generateCircuit(seed, 3);
      expect(combination(hard)).not.toBe(combination(easy));
    }
  });

  it('keeps authored geometry fixed while the seeded combination varies', () => {
    const first = generateCircuit('alpha', 1);
    const second = generateCircuit('charlie', 1);

    expect(authoredPieces(second)).toBe(authoredPieces(first));
    expect(combination(second)).not.toBe(combination(first));

    const allowed = new Set([
      'straight',
      'turn',
      'loop',
      'hill',
      'boost',
      'shift',
    ]);
    for (const piece of [...first.pieces, ...second.pieces]) {
      expect(allowed.has(piece.kind)).toBe(true);
      expect(piece.length).toBeGreaterThan(0);
      if (piece.kind === 'straight' || piece.kind === 'boost') {
        expect(piece.length).toBeGreaterThanOrEqual(12);
      }
    }
  });

  it('keeps every randomized circuit closed and feature-complete', () => {
    for (const seed of SEEDS) {
      for (const level of LEVELS) {
        const circuit = generateCircuit(seed, level);
        const frames = buildFrames(circuit);
        expect(frames.length).toBeGreaterThan(16);

        const first = frames[0];
        const last = frames[frames.length - 1];
        expect(first).toBeDefined();
        expect(last).toBeDefined();
        expect(
          first?.position.distanceTo(last?.position ?? first.position) ?? 1,
        ).toBeLessThan(0.02);
        expect(first?.tangent.dot(last?.tangent ?? first.tangent) ?? 0).toBeGreaterThan(
          0.999,
        );

        for (const frame of frames) {
          expect(Number.isFinite(frame.position.x)).toBe(true);
          expect(Number.isFinite(frame.position.y)).toBe(true);
          expect(Number.isFinite(frame.position.z)).toBe(true);
          expect(frame.tangent.length()).toBeCloseTo(1, 6);
          expect(frame.up.length()).toBeCloseTo(1, 6);
          expect(frame.right.length()).toBeCloseTo(1, 6);
        }

        expect(
          circuit.pieces.filter((piece) => piece.kind === 'loop').length,
        ).toBeGreaterThanOrEqual(1);
        expect(
          circuit.pieces.filter((piece) => piece.kind === 'turn').length,
        ).toBeGreaterThanOrEqual(2);
        expect(
          circuit.pieces.filter((piece) => piece.kind === 'boost').length,
        ).toBeGreaterThanOrEqual(2);
      }
    }
  });

  it('tightens turns and shrinks loops as the level rises', () => {
    let previousTurnRadius = Number.POSITIVE_INFINITY;
    let previousLoopRadius = Number.POSITIVE_INFINITY;

    for (const level of LEVELS) {
      const circuit = generateCircuit('level-ladder', level);
      const turnRadius = firstBankedTurn(circuit).length / Math.PI;
      const loopRadius = onlyLoop(circuit).length / (Math.PI * 2);

      expect(turnRadius).toBeLessThanOrEqual(previousTurnRadius);
      expect(loopRadius).toBeLessThanOrEqual(previousLoopRadius);

      previousTurnRadius = turnRadius;
      previousLoopRadius = loopRadius;
    }

    expect(previousTurnRadius).toBeCloseTo(turnRadiusForLevel(12), 6);
    expect(previousLoopRadius).toBeCloseTo(loopRadiusForLevel(12), 6);
    expect(previousTurnRadius).toBeLessThan(turnRadiusForLevel(1));
    expect(previousLoopRadius).toBeLessThan(loopRadiusForLevel(1));
  });

  it('validates every generated circuit independently of assembly', () => {
    for (const seed of SEEDS) {
      for (const level of LEVELS) {
        const validation = validateCircuit(generateCircuit(seed, level));
        expect(validation.reasons).toEqual([]);
        expect(validation.ok).toBe(true);
      }
    }
  });

  it('rejects a candidate whose turn radius or features break the rules', () => {
    const circuit = generateCircuit('validation', 1);
    const tight = {
      ...circuit,
      pieces: circuit.pieces.map((piece): Piece =>
        piece.kind === 'turn'
          ? {
              ...piece,
              radius: MIN_TURN_RADIUS - 1,
              length: (MIN_TURN_RADIUS - 1) * Math.PI,
            }
          : piece,
      ),
    };
    const tightResult = validateCircuit(tight);
    expect(tightResult.ok).toBe(false);
    expect(tightResult.reasons.join(' ')).toContain('turn radius');

    const incomplete = {
      ...circuit,
      pieces: circuit.pieces.filter((piece) => piece.kind !== 'loop'),
    };
    const incompleteResult = validateCircuit(incomplete);
    expect(incompleteResult.ok).toBe(false);
    expect(incompleteResult.reasons.join(' ')).toContain('vertical loop');
  });

  it('replays the same deterministic assembly offset', () => {
    for (const level of LEVELS) {
      expect(generateCircuit('restart', level).seedOffset).toBe(
        generateCircuit('restart', level).seedOffset,
      );
    }
  });

  it('gives each UTC day its own seeded circuit', () => {
    const today = generateCircuit('2026-11-15', 1);
    const tomorrow = generateCircuit('2026-11-16', 1);
    expect(combination(tomorrow)).not.toBe(combination(today));
  });
});
