import { describe, expect, it } from 'vitest';
import {
  brakeFromKeys,
  driftFromKeys,
  HELD_KEYS,
  steerFromKeys,
} from './controls';

/**
 * The keys are only half the contract: `steerFromKeys` returns the same sign
 * convention the physics uses (`+1` is the player's right), and
 * `src/game/feel.test.ts` proves that positive steer moves the car to the right
 * of the screen. These tests guard the key-to-sign half.
 */
describe('keyboard controls', () => {
  const held = (...keys: string[]) => new Set(keys);

  it('steers right with the right arrow and D', () => {
    expect(steerFromKeys(held('arrowright'))).toBe(1);
    expect(steerFromKeys(held('d'))).toBe(1);
  });

  it('steers left with the left arrow and A', () => {
    expect(steerFromKeys(held('arrowleft'))).toBe(-1);
    expect(steerFromKeys(held('a'))).toBe(-1);
  });

  it('centres when both directions are held or nothing is held', () => {
    expect(steerFromKeys(held())).toBe(0);
    expect(steerFromKeys(held('arrowleft', 'arrowright'))).toBe(0);
    expect(steerFromKeys(held('a', 'd'))).toBe(0);
  });

  it('does not treat the up arrow as steering', () => {
    expect(steerFromKeys(held('arrowup'))).toBe(0);
  });

  it('brakes with the down arrow', () => {
    expect(brakeFromKeys(held('arrowdown'))).toBe(true);
    expect(brakeFromKeys(held(' '))).toBe(false);
    expect(brakeFromKeys(held('arrowup'))).toBe(false);
  });

  it('drifts with space', () => {
    expect(driftFromKeys(held(' '))).toBe(true);
    expect(driftFromKeys(held('arrowdown'))).toBe(false);
    expect(driftFromKeys(held())).toBe(false);
  });

  it('prevents scrolling for every racing key', () => {
    for (const key of HELD_KEYS) {
      expect(key.toLowerCase()).toBe(key);
    }
    expect(HELD_KEYS).toContain(' ');
  });
});
