import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { BRIDGE_HEIGHT, JUMP_LANDING_WIDTH, MIN_TURN_RADIUS, SPIRAL_RADIUS, TRACK_WIDTH } from './constants';
import {
  buildFrames,
  generateCircuit,
  loopRadiusForLevel,
  spiralArcLength,
  turnRadiusForLevel,
  validateCircuit,
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

/**
 * The authored, level-scaled pieces; a seed must not change an authored size.
 * Turns are compared by radius because the seed chooses the corner count, which
 * changes the turn angle and therefore the arc length.
 */
function authoredSizes(circuit: Circuit): Map<Piece['kind'], Set<string>> {
  const sizes = new Map<Piece['kind'], Set<string>>();
  for (const piece of circuit.pieces) {
    if (
      piece.kind !== 'loop' &&
      piece.kind !== 'turn' &&
      piece.kind !== 'hill' &&
      piece.kind !== 'shift'
    ) {
      continue;
    }
    const value =
      piece.kind === 'turn'
        ? `${piece.radius?.toFixed(6)}`
        : piece.length.toFixed(6);
    const set = sizes.get(piece.kind) ?? new Set<string>();
    set.add(value);
    sizes.set(piece.kind, set);
  }
  return sizes;
}

function firstBankedTurn(circuit: Circuit): Piece {
  const turn = circuit.pieces.find((piece) => piece.kind === 'turn');
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

  it('keeps authored geometry fixed while the seeded combination varies', () => {
    const first = generateCircuit('alpha', 1);
    const second = generateCircuit('charlie', 1);

    // Seeds may choose different features (hill versus jump, figure-eight
    // versus polygon), so compare the sizes of the authored kinds both share.
    const firstSizes = authoredSizes(first);
    const secondSizes = authoredSizes(second);
    let sharedKinds = 0;
    for (const [kind, sizes] of firstSizes) {
      const other = secondSizes.get(kind);
      if (!other) {
        continue;
      }
      expect([...other].sort()).toEqual([...sizes].sort());
      sharedKinds += 1;
    }
    expect(sharedKinds).toBeGreaterThanOrEqual(3);
    expect(combination(second)).not.toBe(combination(first));

    const allowed = new Set([
      'straight',
      'turn',
      'loop',
      'hill',
      'boost',
      'shift',
      'kicker',
      'gap',
      'landing',
      'bridge',
      'ramp-up',
      'ramp-down',
      'spiral-up',
      'spiral-down',
    ]);
    for (const piece of [...first.pieces, ...second.pieces]) {
      expect(allowed.has(piece.kind)).toBe(true);
      expect(piece.length).toBeGreaterThan(0);
      if (piece.kind === 'boost') {
        expect(piece.length).toBeGreaterThanOrEqual(12);
      }
    }
  });

  it('varies the circuit shape, not just the piece order', () => {
    const corners = new Set<number>();
    for (const seed of SEEDS) {
      for (const level of LEVELS) {
        const circuit = generateCircuit(seed, level);
        const turns = circuit.pieces.filter((piece) => piece.kind === 'turn');
        corners.add(turns.length);
        const figureEight = circuit.pieces.some(
          (piece) => piece.kind === 'bridge',
        );
        for (const turn of turns) {
          // A bowtie uses four 135 degree corners to cross itself; a polygon
          // uses n corners of 360/n.
          expect(turn.angleDegrees).toBeCloseTo(
            figureEight ? 135 : 360 / turns.length,
            6,
          );
          expect(turn.radius ?? 0).toBeGreaterThanOrEqual(MIN_TURN_RADIUS);
        }
      }
    }
    // The seed picks triangles, quadrilaterals, pentagons, and hexagons.
    expect(corners.size).toBeGreaterThan(1);
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
  }, 20_000);

  it('sends some polygon seeds up a climb and back down elsewhere', () => {
    let elevated = 0;
    const climbs = new Set<string>();
    const descents = new Set<string>();
    for (const seed of SEEDS) {
      for (const level of LEVELS) {
        const circuit = generateCircuit(seed, level);
        if (circuit.pieces.some((piece) => piece.kind === 'bridge')) {
          continue;
        }
        const climbIndex = circuit.pieces.findIndex(
          (piece) => piece.kind === 'spiral-up' || piece.kind === 'ramp-up',
        );
        const descentIndex = circuit.pieces.findIndex(
          (piece) => piece.kind === 'spiral-down' || piece.kind === 'ramp-down',
        );
        if (climbIndex < 0 || descentIndex <= climbIndex) {
          continue;
        }
        elevated += 1;
        climbs.add(circuit.pieces[climbIndex]!.kind);
        descents.add(circuit.pieces[descentIndex]!.kind);
        const climb = circuit.pieces[climbIndex]!;
        const descent = circuit.pieces[descentIndex]!;
        const climbStart = new THREE.Vector3().setFromMatrixPosition(
          climb.matrix,
        );
        const descentStart = new THREE.Vector3().setFromMatrixPosition(
          descent.matrix,
        );
        expect(
          Math.hypot(
            descentStart.x - climbStart.x,
            descentStart.z - climbStart.z,
          ),
        ).toBeGreaterThan(TRACK_WIDTH);
      }
    }
    expect(elevated).toBeGreaterThan(0);
    expect(climbs.has('ramp-up')).toBe(true);
    expect(climbs.has('spiral-up')).toBe(true);
    expect(descents.has('ramp-down')).toBe(true);
    expect(descents.has('spiral-down')).toBe(true);
  }, 20_000);

  it('uses both one-level and two-level spirals across seeds', () => {
    const oneLevel = spiralArcLength(SPIRAL_RADIUS, BRIDGE_HEIGHT, 1);
    const twoLevel = spiralArcLength(
      SPIRAL_RADIUS,
      BRIDGE_HEIGHT * 2,
      2,
    );
    const levels = new Set<number>();
    for (const seed of SEEDS) {
      for (const level of LEVELS) {
        for (const piece of generateCircuit(seed, level).pieces) {
          if (piece.kind !== 'spiral-up' && piece.kind !== 'spiral-down') {
            continue;
          }
          if (Math.abs(piece.length - oneLevel) < 0.01) {
            levels.add(1);
          } else if (Math.abs(piece.length - twoLevel) < 0.01) {
            levels.add(2);
          }
        }
      }
    }
    expect(levels.has(1)).toBe(true);
    expect(levels.has(2)).toBe(true);
  }, 20_000);

  it('combines one-level and two-level spirals in one circuit', () => {
    const oneLevel = spiralArcLength(SPIRAL_RADIUS, BRIDGE_HEIGHT, 1);
    const twoLevel = spiralArcLength(SPIRAL_RADIUS, BRIDGE_HEIGHT * 2, 2);
    let mixed: Circuit | null = null;
    for (const seed of SEEDS) {
      for (const level of LEVELS) {
        const circuit = generateCircuit(seed, level);
        const spirals = circuit.pieces.filter(
          (piece) =>
            piece.kind === 'spiral-up' || piece.kind === 'spiral-down',
        );
        const hasOne = spirals.some(
          (piece) => Math.abs(piece.length - oneLevel) < 0.01,
        );
        const hasTwo = spirals.some(
          (piece) => Math.abs(piece.length - twoLevel) < 0.01,
        );
        if (hasOne && hasTwo) {
          mixed = circuit;
          break;
        }
      }
      if (mixed) {
        break;
      }
    }
    expect(mixed).not.toBeNull();

    // Each transition changes the deck by one or two levels, and the circuit
    // returns to the lower deck after the last one.
    let elevation = 0;
    let base: number | null = null;
    for (const piece of mixed!.pieces) {
      if (
        piece.kind !== 'spiral-up' &&
        piece.kind !== 'spiral-down' &&
        piece.kind !== 'ramp-up' &&
        piece.kind !== 'ramp-down'
      ) {
        continue;
      }
      const start = new THREE.Vector3().setFromMatrixPosition(piece.matrix);
      base ??= start.y;
      expect(start.y - base).toBeCloseTo(elevation, 3);
      const end = piece.path(1).position.clone().applyMatrix4(piece.matrix);
      const change = end.y - start.y;
      elevation += change;
      const levels = Math.round(Math.abs(change) / BRIDGE_HEIGHT);
      expect(levels === 1 || levels === 2).toBe(true);
    }
    expect(elevation).toBeCloseTo(0, 3);
  }, 20_000);

  it('mixes ramp and spiral transitions in one circuit', () => {
    let mixed = false;
    for (const seed of SEEDS) {
      for (const level of LEVELS) {
        const kinds = generateCircuit(seed, level).pieces
          .map((piece) => piece.kind)
          .filter(
            (kind) =>
              kind === 'ramp-up' ||
              kind === 'ramp-down' ||
              kind === 'spiral-up' ||
              kind === 'spiral-down',
          );
        if (
          kinds.some((kind) => kind.startsWith('ramp')) &&
          kinds.some((kind) => kind.startsWith('spiral'))
        ) {
          mixed = true;
          break;
        }
      }
      if (mixed) {
        break;
      }
    }
    expect(mixed).toBe(true);
  }, 20_000);

  it('builds a downhill jump to a wide landing that closes the circuit', () => {
    // Some elevated descents become a jump that drops a bridge level onto a
    // landing twice as wide as the running track. A downhill landing is the
    // one whose deck sinks a full level below its kicker's base.
    let found: Circuit | null = null;
    for (let index = 0; index < 500; index += 1) {
      const circuit = generateCircuit(`downhill-jump-${index}`, 3);
      const downhill = circuit.pieces.find((wide) => {
        if (
          wide.kind !== 'landing' ||
          wide.halfWidth !== JUMP_LANDING_WIDTH / 2
        ) {
          return false;
        }
        const i = circuit.pieces.indexOf(wide);
        const kicker = circuit.pieces[i - 2];
        const kickStart = new THREE.Vector3().setFromMatrixPosition(
          kicker!.matrix,
        );
        const landEnd = wide.path(1).position.clone().applyMatrix4(wide.matrix);
        return kickStart.y - landEnd.y >= BRIDGE_HEIGHT - 1;
      });
      if (!downhill) {
        continue;
      }
      found = circuit;
      expect(validateCircuit(circuit).reasons).toEqual([]);
      break;
    }
    expect(found).not.toBeNull();
  }, 60_000);

  it('widens the flat jump landing to twice the running track', () => {
    let found: Circuit | null = null;
    for (let index = 0; index < 200; index += 1) {
      const circuit = generateCircuit(`flat-landing-${index}`, 1);
      const landings = circuit.pieces.filter(
        (piece) => piece.kind === 'landing' && piece.halfWidth === TRACK_WIDTH,
      );
      if (landings.length === 0) {
        continue;
      }
      // Found a flat (same-deck) jump whose landing is the full doubled width.
      const landing = landings.find((piece) => {
        const i = circuit.pieces.indexOf(piece);
        const kicker = circuit.pieces[i - 2];
        const kickStart = new THREE.Vector3().setFromMatrixPosition(
          kicker!.matrix,
        );
        const landEnd = piece.path(1).position.clone().applyMatrix4(piece.matrix);
        return kickStart.y - landEnd.y < BRIDGE_HEIGHT - 1;
      });
      expect(landing).toBeDefined();
      found = circuit;
      break;
    }
    expect(found).not.toBeNull();
  }, 20_000);

  it('tapers the wide landing symmetrically back to normal width', () => {
    let found: Circuit | null = null;
    for (let index = 0; index < 120; index += 1) {
      const circuit = generateCircuit(`taper-check-${index}`, 1);
      if (!circuit.pieces.some((piece) => piece.kind === 'landing')) {
        continue;
      }
      const frames = buildFrames(circuit);
      let start = 0;
      let landing: { from: number; to: number } | null = null;
      for (const piece of circuit.pieces) {
        if (piece.kind === 'landing' && piece.halfWidth != null) {
          landing = { from: start, to: start + piece.length };
          break;
        }
        start += piece.length;
      }
      if (!landing) {
        continue;
      }
      const inLanding = frames.filter(
        (f) => f.s >= landing!.from - 1e-6 && f.s < landing!.to - 1e-6,
      );
      if (inLanding.length < 3) {
        continue;
      }
      // First frame is full width; the landing tapers toward the normal
      // half-width by its far end (the exact normal width lands on the seam).
      const first = inLanding[0]!;
      const last = inLanding[inLanding.length - 1]!;
      expect(first.halfWidth).toBeCloseTo(JUMP_LANDING_WIDTH / 2, 6);
      expect(last.halfWidth - TRACK_WIDTH / 2).toBeLessThan(0.05);
      expect(last.halfWidth).toBeLessThan(JUMP_LANDING_WIDTH / 2);
      // The flare is symmetric: both rails sit the same distance off-centre.
      for (const frame of inLanding) {
        const right = new THREE.Vector3().crossVectors(frame.up, frame.tangent);
        const leftEdge = frame.position.clone().addScaledVector(right, -frame.halfWidth);
        const rightEdge = frame.position.clone().addScaledVector(right, frame.halfWidth);
        expect(leftEdge.distanceTo(frame.position)).toBeCloseTo(
          rightEdge.distanceTo(frame.position),
          6,
        );
        // The landing is open so a landing car does not hit a barrier.
        expect(frame.rails).toBe(false);
      }
      found = circuit;
      break;
    }
    expect(found).not.toBeNull();
  }, 20_000);

  it('keeps figure-eight jump and hill variants closed', () => {
    let jump: Circuit | null = null;
    let hill: Circuit | null = null;
    for (let index = 0; index < 120; index += 1) {
      const circuit = generateCircuit(`figure-eight-feature-${index}`, 1);
      if (!circuit.pieces.some((piece) => piece.kind === 'bridge')) {
        continue;
      }
      if (circuit.pieces.some((piece) => piece.kind === 'kicker')) {
        jump ??= circuit;
      } else {
        hill ??= circuit;
      }
    }
    expect(jump).not.toBeNull();
    expect(hill).not.toBeNull();

    for (const circuit of [jump!, hill!]) {
      const frames = buildFrames(circuit);
      const first = frames[0]!;
      const last = frames[frames.length - 1]!;
      expect(first.position.distanceTo(last.position)).toBeLessThan(0.05);
      expect(first.tangent.dot(last.tangent)).toBeGreaterThan(0.999);
      expect(validateCircuit(circuit).ok).toBe(true);
    }
  }, 20_000);

  it('tightens turns and shrinks loops as the level rises', () => {
    let previousTurnRadius = Number.POSITIVE_INFINITY;
    let previousLoopRadius = Number.POSITIVE_INFINITY;

    for (const level of LEVELS) {
      const circuit = generateCircuit('level-ladder', level);
      const turnRadius = firstBankedTurn(circuit).radius ?? 0;
      const loopRadius = onlyLoop(circuit).length / (Math.PI * 2);

      expect(turnRadius).toBeLessThanOrEqual(previousTurnRadius);
      expect(loopRadius).toBeLessThanOrEqual(previousLoopRadius);

      previousTurnRadius = turnRadius;
      previousLoopRadius = loopRadius;
    }

    expect(previousTurnRadius).toBeCloseTo(turnRadiusForLevel(12), 6);
    expect(previousLoopRadius).toBeCloseTo(loopRadiusForLevel(12), 6);
    expect(previousTurnRadius).toBeLessThan(turnRadiusForLevel(1));
    expect(previousLoopRadius).toBeLessThan(loopRadiusForLevel(1));
  });

  it('validates every generated circuit independently of assembly', () => {
    for (const seed of SEEDS) {
      for (const level of LEVELS) {
        const validation = validateCircuit(generateCircuit(seed, level));
        expect(validation.reasons).toEqual([]);
        expect(validation.ok).toBe(true);
      }
    }
  });

  it('rejects a candidate whose turn radius or features break the rules', () => {
    const circuit = generateCircuit('validation', 1);
    const tight = {
      ...circuit,
      pieces: circuit.pieces.map((piece): Piece =>
        piece.kind === 'turn'
          ? {
              ...piece,
              radius: MIN_TURN_RADIUS - 1,
              length: (MIN_TURN_RADIUS - 1) * Math.PI,
            }
          : piece,
      ),
    };
    const tightResult = validateCircuit(tight);
    expect(tightResult.ok).toBe(false);
    expect(tightResult.reasons.join(' ')).toContain('turn radius');

    const incomplete = {
      ...circuit,
      pieces: circuit.pieces.filter((piece) => piece.kind !== 'loop'),
    };
    const incompleteResult = validateCircuit(incomplete);
    expect(incompleteResult.ok).toBe(false);
    expect(incompleteResult.reasons.join(' ')).toContain('vertical loop');
  });

  it('replays the same deterministic assembly offset', () => {
    for (const level of LEVELS) {
      expect(generateCircuit('restart', level).seedOffset).toBe(
        generateCircuit('restart', level).seedOffset,
      );
    }
  });

  it('gives each UTC day its own seeded circuit', () => {
    const today = generateCircuit('2026-11-15', 1);
    const tomorrow = generateCircuit('2026-11-16', 1);
    expect(combination(tomorrow)).not.toBe(combination(today));
  });
});
