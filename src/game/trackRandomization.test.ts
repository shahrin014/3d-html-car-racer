import { describe, expect, it } from 'vitest';
import {
  buildFrames,
  generateCircuit,
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
        piece.kind === 'hill',
    )
    .map((piece) => `${piece.kind}:${piece.length.toFixed(6)}`)
    .join('|');
}

function firstBankedTurn(circuit: Circuit): Piece {
  const turn = circuit.pieces.filter((piece) => piece.kind === 'turn')[1];
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

  it('changes only the seeded straight lengths, not authored geometry', () => {
    const first = generateCircuit('alpha', 1);
    const second = generateCircuit('charlie', 1);

    expect(authoredPieces(second)).toBe(authoredPieces(first));
    expect(second.pieces.map((piece) => piece.kind)).toEqual(
      first.pieces.map((piece) => piece.kind),
    );

    const changed = first.pieces.filter(
      (piece, index) => piece.length !== second.pieces[index]?.length,
    );
    expect(changed.length).toBeGreaterThan(0);
    expect(
      changed.every(
        (piece) => piece.kind === 'straight' || piece.kind === 'boost',
      ),
    ).toBe(true);
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

    expect(previousTurnRadius).toBeLessThan(18);
    expect(previousLoopRadius).toBeLessThan(7);
  });

  it('gives each UTC day its own seeded circuit', () => {
    const today = generateCircuit('2026-11-15', 1);
    const tomorrow = generateCircuit('2026-11-16', 1);
    expect(combination(tomorrow)).not.toBe(combination(today));
  });
});
