import { describe, expect, it } from 'vitest';
import { ordinal, placingLabel, racePlacing } from './placing';

describe('race placing', () => {
  it('counts only the rivals that are ahead on distance', () => {
    expect(racePlacing(100, [])).toBe(1);
    expect(racePlacing(100, [40, 60, 80])).toBe(1);
    expect(racePlacing(100, [101, 90, 120, 100])).toBe(3);
    expect(racePlacing(0, [1, 2, 3, 4, 5])).toBe(6);
  });

  it('formats ordinals including the teens', () => {
    expect(['1', '2', '3', '4', '5', '9'].map((n) => ordinal(Number(n)))).toEqual(
      ['1st', '2nd', '3rd', '4th', '5th', '9th'],
    );
    expect([11, 12, 13, 21, 22, 23, 101].map(ordinal)).toEqual([
      '11th',
      '12th',
      '13th',
      '21st',
      '22nd',
      '23rd',
      '101st',
    ]);
  });

  it('labels the place out of the whole field', () => {
    expect(placingLabel(2, 4)).toBe('2nd of 4');
    expect(placingLabel(1, 1)).toBe('1st of 1');
  });
});
