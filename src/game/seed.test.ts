import { describe, expect, it } from 'vitest';
import { randomSeed } from './seed';
import { generateCircuit } from './track';

describe('circuit seed', () => {
  it('draws a different seed on every call', () => {
    const seeds = new Set<string>();
    for (let index = 0; index < 500; index += 1) {
      seeds.add(randomSeed());
    }
    expect(seeds.size).toBe(500);
  });

  it('carries 64 random bits, so two draws do not collide by accident', () => {
    for (const seed of [randomSeed(), randomSeed()]) {
      expect(seed).toMatch(/^circuit-[0-9a-f]{16}$/);
    }
  });

  it('builds a different circuit for two consecutive draws', () => {
    const first = generateCircuit(randomSeed(), 1);
    const second = generateCircuit(randomSeed(), 1);
    const combination = (circuit: typeof first): string =>
      circuit.pieces
        .map((piece) => `${piece.kind}:${piece.length.toFixed(6)}`)
        .join('|');
    expect(combination(first)).not.toBe(combination(second));
  });
});
