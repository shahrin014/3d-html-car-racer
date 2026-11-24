import { describe, expect, it } from 'vitest';
import {
  generateCircuit,
  validateCircuit,
  type Circuit,
  type Piece,
} from './track';

/**
 * The preview's minimum-count dropdown values. `No` leaves the choice to the
 * seed; `0` excludes the kind; `1`–`5` require at least that many pieces.
 */
type DropdownValue = 'No' | '0' | '1' | '2' | '3' | '4' | '5';
type SegmentSelection = Partial<Record<Piece['kind'], DropdownValue>>;

function minimumCountsFromSelection(
  selection: SegmentSelection,
): Partial<Record<Piece['kind'], number>> {
  const counts: Partial<Record<Piece['kind'], number>> = {};
  for (const [kind, value] of Object.entries(selection) as [
    Piece['kind'],
    DropdownValue,
  ][]) {
    if (value === 'No') {
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
    allowMultiCrossing: true,
    minimumCounts: minimumCountsFromSelection(parsed),
  });
}

function count(circuit: Circuit, kind: Piece['kind']): number {
  return circuit.pieces.filter((piece) => piece.kind === kind).length;
}

describe('track generation from preview dropdowns', () => {
  it('accepts a minimum count and an exclusion together', () => {
    const circuit = generateFromDropdowns({
      'spiral-down': '2',
      loop: '0',
      obstacles: '0',
    });

    expect(count(circuit, 'spiral-down')).toBeGreaterThanOrEqual(2);
    expect(count(circuit, 'loop')).toBe(0);
    expect(count(circuit, 'shift')).toBe(0);
    expect(count(circuit, 'obstacles')).toBe(0);
    expect(validateCircuit(circuit, { allowLoopless: true }).ok).toBe(true);
  }, 30_000);

  it('accepts the same options as a JSON object', () => {
    const circuit = generateFromDropdowns(
      JSON.stringify({ 'steep-ramp': '2' }),
      'dropdown-json',
    );

    expect(count(circuit, 'steep-ramp')).toBeGreaterThanOrEqual(2);
  }, 30_000);

  it('treats No as no rule and 0 as exclusion', () => {
    expect(minimumCountsFromSelection({ loop: 'No' })).toEqual({});
    expect(minimumCountsFromSelection({ loop: '0' })).toEqual({ loop: 0 });
    expect(
      minimumCountsFromSelection({ 'spiral-down': '2', obstacles: 'No' }),
    ).toEqual({ 'spiral-down': 2 });
  });

  it('rejects a value that is not in the dropdown', () => {
    expect(() =>
      minimumCountsFromSelection({ loop: '6' as DropdownValue }),
    ).toThrow(/Invalid dropdown value for loop/);
  });

  it('rejects an impossible authored minimum', () => {
    expect(() => generateFromDropdowns({ loop: '4' })).toThrow(
      /loop is authored once/,
    );
  });

  it('supports the multi-crossing layout as a selection', () => {
    const circuit = generateFromDropdowns({ 'multi-crossing': '1' });

    expect(circuit.layout).toBe('multi-crossing');
    expect(count(circuit, 'multi-crossing')).toBeGreaterThanOrEqual(1);
  }, 30_000);
});
