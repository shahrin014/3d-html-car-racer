import { describe, expect, it } from 'vitest';
import {
  generateCircuit,
  validateCircuit,
  type Circuit,
  type Piece,
} from './track';

/**
 * The preview's minimum-count dropdown values. `0` means 0 or more; `1`–`5`
 * require at least that many pieces.
 */
type DropdownValue = '0' | '1' | '2' | '3' | '4' | '5';
type SegmentSelection = Partial<Record<Piece['kind'], DropdownValue>>;

function minimumCountsFromSelection(
  selection: SegmentSelection,
): Partial<Record<Piece['kind'], number>> {
  const counts: Partial<Record<Piece['kind'], number>> = {};
  for (const [kind, value] of Object.entries(selection) as [
    Piece['kind'],
    DropdownValue,
  ][]) {
    if (value === '0') {
      continue;
    }
    const count = Number(value);
    if (!Number.isInteger(count) || count < 0 || count > 5) {
      throw new Error(`Invalid dropdown value for ${kind}: ${value}`);
    }
    counts[kind] = count;
  }
  return counts;
}

/**
 * Generate a circuit from the same dropdown values the preview table submits.
 * The input may be an object or the equivalent JSON string.
 */
function generateFromDropdowns(
  selection: SegmentSelection | string,
  seed = 'dropdown-selection',
  level = 1,
): Circuit {
  const parsed =
    typeof selection === 'string'
      ? (JSON.parse(selection) as SegmentSelection)
      : selection;
  return generateCircuit(seed, level, {
    minimumCounts: minimumCountsFromSelection(parsed),
  });
}

function count(circuit: Circuit, kind: Piece['kind']): number {
  return circuit.pieces.filter((piece) => piece.kind === kind).length;
}

describe('track generation from preview dropdowns', () => {
  it('accepts minimum counts', () => {
    const circuit = generateFromDropdowns({
      'spiral-down': '2',
      loop: '4',
    });

    expect(count(circuit, 'spiral-down')).toBeGreaterThanOrEqual(2);
    expect(count(circuit, 'loop')).toBeGreaterThanOrEqual(4);
    expect(validateCircuit(circuit).ok).toBe(true);
  }, 30_000);

  it('accepts the same options as a JSON object', () => {
    const circuit = generateFromDropdowns(
      JSON.stringify({ 'steep-ramp': '2' }),
      'dropdown-json',
    );

    expect(count(circuit, 'steep-ramp')).toBeGreaterThanOrEqual(2);
  }, 30_000);

  it('treats 0 as 0 or more', () => {
    expect(minimumCountsFromSelection({ loop: '0' })).toEqual({});
    expect(
      minimumCountsFromSelection({ 'spiral-down': '2', obstacles: '0' }),
    ).toEqual({ 'spiral-down': 2 });
  });

  it('lets a 0 minimum be filled when the route needs it', () => {
    const circuits = Array.from({ length: 10 }, (_, index) =>
      generateCircuit(`zero-fill-${index}`, 1, {
        minimumCounts: { 'ramp-up': 1, 'ramp-down': 0 },
      }),
    );
    expect(circuits.every((circuit) => count(circuit, 'ramp-up') >= 1)).toBe(
      true,
    );
    expect(
      circuits.some((circuit) => count(circuit, 'ramp-down') > 0),
    ).toBe(true);
  }, 30_000);

  it('rejects a value that is not in the dropdown', () => {
    expect(() =>
      minimumCountsFromSelection({ loop: '6' as DropdownValue }),
    ).toThrow(/Invalid dropdown value for loop/);
  });

  it('supports a repeatable feature above one', () => {
    const circuit = generateFromDropdowns({ loop: '4' });
    expect(count(circuit, 'loop')).toBeGreaterThanOrEqual(4);
  }, 30_000);

  it('rejects a minimum the authored circuit cannot repeat', () => {
    expect(() => generateFromDropdowns({ boost: '4' })).toThrow(
      /at most two boost strips/,
    );
  });
});
