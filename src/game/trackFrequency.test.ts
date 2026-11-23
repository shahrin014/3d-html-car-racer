import { describe, expect, it } from 'vitest';
import { DEFAULT_LEVEL } from './constants';
import { generateCircuit, type Piece } from './track';

/**
 * A level-1 sample is the stock preview/race level, and short legs are where a
 * piece's plan footprint can silently starve it from the rotation. These
 * thresholds are deliberately loose: they catch a segment disappearing, not
 * small tuning changes.
 */
const SAMPLE_SIZE = 300;
const MINIMUM: Partial<Record<Piece['kind'], number>> = {
  'spiral-up': 90,
  'spiral-down': 90,
  bridge: 90,
  hill: 90,
  kicker: 60,
  gap: 60,
  landing: 60,
  obstacles: 45,
  'ramp-up': 6,
  'ramp-down': 6,
  'steep-ramp': 15,
  'steep-ramp-down': 15,
};

const ALWAYS_PRESENT: Piece['kind'][] = [
  'straight',
  'turn',
  'loop',
  'boost',
  'shift',
];

describe('track segment rotation', () => {
  it('keeps every catalog segment in the level-1 rotation', () => {
    const counts = new Map<Piece['kind'], number>();
    for (let index = 0; index < SAMPLE_SIZE; index += 1) {
      const circuit = generateCircuit(`rotation-${index}`, DEFAULT_LEVEL);
      for (const piece of circuit.pieces) {
        counts.set(piece.kind, (counts.get(piece.kind) ?? 0) + 1);
      }
    }

    for (const kind of ALWAYS_PRESENT) {
      expect(counts.get(kind) ?? 0, kind).toBeGreaterThanOrEqual(SAMPLE_SIZE);
    }
    for (const [kind, minimum] of Object.entries(MINIMUM)) {
      expect(
        counts.get(kind as Piece['kind']) ?? 0,
        `${kind} is missing from the rotation`,
      ).toBeGreaterThanOrEqual(minimum);
    }

    // The steep climb and its descent are authored as one pair.
    expect(counts.get('steep-ramp') ?? 0).toBe(
      counts.get('steep-ramp-down') ?? 0,
    );
    // A jump always contributes a launch, a gap, and a landing.
    expect(counts.get('kicker') ?? 0).toBe(counts.get('gap') ?? 0);
    expect(counts.get('gap') ?? 0).toBe(counts.get('landing') ?? 0);
  }, 30_000);
});
