import { describe, expect, it } from 'vitest';
import { OPPONENT_COUNT_MAX } from './constants';
import {
  DEFAULT_PAINT,
  PAINTS,
  opponentPaints,
  paintById,
} from './palette';

const COLORS = PAINTS.filter((paint) => paint.color !== null);

describe('car paints', () => {
  it('offers the stock livery plus nine paints with unique ids and names', () => {
    expect(PAINTS).toHaveLength(10);
    expect(COLORS).toHaveLength(9);
    expect(new Set(PAINTS.map((paint) => paint.id)).size).toBe(10);
    expect(new Set(PAINTS.map((paint) => paint.name)).size).toBe(10);
    expect(new Set(COLORS.map((paint) => paint.color)).size).toBe(9);
    expect(PAINTS[0]!.color).toBeNull();
  });

  it('defaults to the stock livery and ignores unknown stored ids', () => {
    expect(DEFAULT_PAINT.color).toBeNull();
    expect(paintById(null)).toBe(DEFAULT_PAINT);
    expect(paintById('not-a-paint')).toBe(DEFAULT_PAINT);
    expect(paintById('violet').name).toBe('Violet');
  });

  it('gives every opponent a distinct colour that is not the player’s own', () => {
    for (const player of COLORS) {
      const rivals = COLORS.filter((paint) => paint !== player);
      const opponents = opponentPaints(player, rivals.length);
      expect(opponents).toHaveLength(rivals.length);
      expect(opponents).not.toContain(player);
      expect(opponents.every((paint) => paint.color !== null)).toBe(true);
      expect(new Set(opponents.map((paint) => paint.id)).size).toBe(
        rivals.length,
      );
    }
  });

  it('gives a stock player every colour, and cycles once exhausted', () => {
    expect(opponentPaints(DEFAULT_PAINT, 0)).toHaveLength(0);
    expect(opponentPaints(DEFAULT_PAINT, -3)).toHaveLength(0);
    const first = opponentPaints(DEFAULT_PAINT, COLORS.length);
    expect(first).toEqual(COLORS);
    const full = opponentPaints(DEFAULT_PAINT, OPPONENT_COUNT_MAX);
    expect(full).toHaveLength(OPPONENT_COUNT_MAX);
    expect(full.every((paint) => paint.color !== null)).toBe(true);
    for (let index = 0; index < full.length; index += 1) {
      expect(full[index]).toBe(COLORS[index % COLORS.length]);
    }
  });
});
