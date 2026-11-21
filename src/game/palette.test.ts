import { describe, expect, it } from 'vitest';
import { OPPONENT_COUNT_MAX } from './constants';
import {
  DEFAULT_PAINT,
  PAINTS,
  opponentPaints,
  paintById,
} from './palette';

describe('car paints', () => {
  it('offers ten paints with unique ids, names, and colours', () => {
    expect(PAINTS).toHaveLength(10);
    expect(new Set(PAINTS.map((paint) => paint.id)).size).toBe(10);
    expect(new Set(PAINTS.map((paint) => paint.name)).size).toBe(10);
    expect(new Set(PAINTS.map((paint) => paint.color)).size).toBe(10);
  });

  it('defaults to the first paint and ignores unknown stored ids', () => {
    expect(paintById(null)).toBe(DEFAULT_PAINT);
    expect(paintById('not-a-paint')).toBe(DEFAULT_PAINT);
    expect(paintById('violet').name).toBe('Violet');
  });

  it('gives every opponent a distinct paint that is not the player’s own', () => {
    for (const player of PAINTS) {
      const opponents = opponentPaints(player, PAINTS.length - 1);
      expect(opponents).toHaveLength(PAINTS.length - 1);
      expect(opponents).not.toContain(player);
      expect(new Set(opponents.map((paint) => paint.id)).size).toBe(
        PAINTS.length - 1,
      );
    }
  });

  it('cycles paints once the non-player palette is exhausted', () => {
    expect(opponentPaints(DEFAULT_PAINT, 0)).toHaveLength(0);
    expect(opponentPaints(DEFAULT_PAINT, -3)).toHaveLength(0);
    const full = opponentPaints(DEFAULT_PAINT, OPPONENT_COUNT_MAX);
    expect(full).toHaveLength(OPPONENT_COUNT_MAX);
    expect(full).not.toContain(DEFAULT_PAINT);
    const perCycle = PAINTS.length - 1;
    for (let index = 0; index < full.length; index += 1) {
      expect(full[index]).toBe(full[index % perCycle]);
    }
  });
});
