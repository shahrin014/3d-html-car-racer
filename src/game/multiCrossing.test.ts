import { describe, expect, it } from 'vitest';
import { BRIDGE_CLEARANCE, TRACK_WIDTH } from './constants';
import {
  buildFrames,
  generateCircuit,
  validateCircuit,
  type Circuit,
  type TrackFrame,
} from './track';

/** Find a seeded circuit that the family roll sends down the trefoil. */
function multiCrossingCircuit(prefix = 'multi-crossing'): Circuit {
  for (let index = 0; index < 80; index += 1) {
    const circuit = generateCircuit(`${prefix}-${index}`, 1, {
      allowMultiCrossing: true,
    });
    if (circuit.layout === 'multi-crossing') {
      return circuit;
    }
  }
  throw new Error('no multi-crossing circuit found');
}

interface Crossing {
  /** Distance along the circuit at the crossing's two passes. */
  s: number;
  separation: number;
}

/**
 * Find the plan crossings in a sampled circuit. Pairs closer than 0.75 m in
 * plan but at least 25 m apart along the route are grouped into one crossing
 * per 12 m of arc length. The trefoil's three crossings are symmetric, so the
 * grouping gap is well below the distance between them.
 */
function crossings(frames: TrackFrame[]): Crossing[] {
  const total = frames[frames.length - 1]?.s ?? 0;
  const found: { s: number; separation: number }[] = [];
  for (let first = 0; first < frames.length; first += 1) {
    const a = frames[first]!;
    for (let second = first + 1; second < frames.length; second += 1) {
      const b = frames[second]!;
      const direct = Math.abs(a.s - b.s);
      const arc = Math.min(direct, Math.max(0, total - direct));
      if (arc < 25) {
        continue;
      }
      const plan = Math.hypot(
        a.position.x - b.position.x,
        a.position.z - b.position.z,
      );
      if (plan < 0.75) {
        found.push({
          s: (a.s + b.s) / 2,
          separation: Math.abs(a.position.y - b.position.y),
        });
      }
    }
  }
  found.sort((a, b) => a.s - b.s);

  const groups: typeof found[] = [];
  for (const crossing of found) {
    const current = groups[groups.length - 1];
    if (
      current &&
      crossing.s - current[current.length - 1]!.s < 12
    ) {
      current.push(crossing);
    } else {
      groups.push([crossing]);
    }
  }
  return groups.map((group) => ({
    s: group[0]!.s,
    separation: Math.min(...group.map((crossing) => crossing.separation)),
  }));
}

describe('multi-crossing layout', () => {
  it('rolls the family deterministically and only when enabled', () => {
    const seed = 'multi-crossing-determinism';
    const first = generateCircuit(seed, 1, { allowMultiCrossing: true });
    const second = generateCircuit(seed, 1, { allowMultiCrossing: true });
    expect(second.layout).toBe(first.layout);
    expect(second.pieces.map((piece) => piece.length)).toEqual(
      first.pieces.map((piece) => piece.length),
    );
    expect(second.seedOffset).toBe(first.seedOffset);

    // The stock call never opts in, so existing seeds keep their output.
    for (let index = 0; index < 40; index += 1) {
      expect(generateCircuit(`stock-${index}`, 1).layout).not.toBe(
        'multi-crossing',
      );
    }
  });

  it('mixes all three families in a representative sample', () => {
    const layouts = new Map<string, number>();
    for (let index = 0; index < 160; index += 1) {
      const circuit = generateCircuit(`family-${index}`, 1, {
        allowMultiCrossing: true,
      });
      const layout = circuit.layout ?? 'polygon';
      layouts.set(layout, (layouts.get(layout) ?? 0) + 1);
    }
    expect(layouts.get('multi-crossing') ?? 0).toBeGreaterThan(8);
    expect(layouts.get('polygon') ?? 0).toBeGreaterThan(0);
    expect(layouts.get('single-crossing') ?? 0).toBeGreaterThan(0);
  }, 20_000);

  it('is a closed route with three vertically separated crossings', () => {
    const circuit = multiCrossingCircuit();
    expect(validateCircuit(circuit).ok).toBe(true);

    const frames = buildFrames(circuit, 0.25);
    const first = frames[0]!;
    const last = frames[frames.length - 1]!;
    expect(first.position.distanceTo(last.position)).toBeLessThan(0.05);
    expect(first.tangent.dot(last.tangent)).toBeGreaterThan(0.999);

    const report = crossings(frames);
    expect(report).toHaveLength(3);
    for (const crossing of report) {
      // A crossing is only a crossing because the two decks are far apart
      // vertically; the plan alone would read as a collision.
      expect(crossing.separation).toBeGreaterThanOrEqual(BRIDGE_CLEARANCE);
    }
    // The curve is authored, so every crossing has the same clearance.
    const separations = report.map((crossing) => crossing.separation);
    expect(Math.max(...separations) - Math.min(...separations)).toBeLessThan(
      0.5,
    );
  }, 20_000);

  it('carries at least two boost strips on sampled pieces', () => {
    const circuit = multiCrossingCircuit();
    const boosts = circuit.pieces.filter((piece) => piece.boost === true);
    expect(boosts.length).toBeGreaterThanOrEqual(2);
    expect(boosts.length).toBeLessThanOrEqual(3);
    for (const piece of circuit.pieces) {
      expect(piece.kind).toBe('multi-crossing');
      expect(piece.length).toBeGreaterThan(0);
    }
    // The layout is a whole circuit, not a catalog piece, so it is longer
    // than the widest single straight but still fits a normal race.
    expect(circuit.totalLength ?? 0).toBeGreaterThan(300);
    expect(circuit.totalLength ?? 0).toBeLessThan(450);
  });

  it('keeps every crossing at least a track width apart in plan', () => {
    // The validation clearance is a car plus a deck; the trefoil is wider than
    // the minimum so a drifting car still passes under the upper branch.
    const circuit = multiCrossingCircuit();
    const frames = buildFrames(circuit, 0.5);
    const total = frames[frames.length - 1]?.s ?? 0;
    for (let first = 0; first < frames.length; first += 1) {
      const a = frames[first]!;
      for (let second = first + 1; second < frames.length; second += 1) {
        const b = frames[second]!;
        const direct = Math.abs(a.s - b.s);
        const arc = Math.min(direct, Math.max(0, total - direct));
        if (arc < 25) {
          continue;
        }
        const plan = Math.hypot(
          a.position.x - b.position.x,
          a.position.z - b.position.z,
        );
        if (plan < TRACK_WIDTH && Math.abs(a.position.y - b.position.y) < BRIDGE_CLEARANCE) {
          throw new Error(
            `unclear crossing at ${a.s.toFixed(1)} and ${b.s.toFixed(1)}`,
          );
        }
      }
    }
  }, 20_000);
});
