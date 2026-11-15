import * as THREE from 'three';
import {
  CAR_WIDTH,
  DESIGN_SPEED,
  LOOP_OFFSET,
  LOOP_RADIUS,
  LOOP_RETURN_LENGTH,
  MIN_TURN_RADIUS,
  TRACK_THICKNESS,
  TRACK_WIDTH,
} from './constants';

/** A sampled point on the track with the frame needed to place mesh and car. */
export interface TrackFrame {
  position: THREE.Vector3;
  tangent: THREE.Vector3;
  up: THREE.Vector3;
  right: THREE.Vector3;
  /** Distance along the circuit in metres. */
  s: number;
}

export interface TrackSample {
  position: THREE.Vector3;
  tangent: THREE.Vector3;
  up: THREE.Vector3;
  bank: number;
}

export type TrackPath = (t: number) => TrackSample;

export function bankForRadius(radius: number): number {
  const ideal = Math.atan((DESIGN_SPEED * DESIGN_SPEED) / (radius * 9.81));
  return THREE.MathUtils.clamp(THREE.MathUtils.radToDeg(ideal), 20, 45);
}

export function straightPath(length: number): TrackPath {
  return (t) => ({
    position: new THREE.Vector3(0, 0, length * t),
    tangent: new THREE.Vector3(0, 0, 1),
    up: new THREE.Vector3(0, 1, 0),
    bank: 0,
  });
}

export function turnPath(
  radius: number,
  angleDegrees: number,
  clockwise: boolean,
): TrackPath {
  const angle = (angleDegrees * Math.PI) / 180;
  const sign = clockwise ? 1 : -1;
  const maxBank = (bankForRadius(radius) * Math.PI) / 180;
  return (t) => {
    const theta = angle * t;
    return {
      position: new THREE.Vector3(
        sign * radius * (1 - Math.cos(theta)),
        0,
        radius * Math.sin(theta),
      ),
      tangent: new THREE.Vector3(
        sign * Math.sin(theta),
        0,
        Math.cos(theta),
      ).normalize(),
      up: new THREE.Vector3(0, 1, 0),
      bank: sign * maxBank * Math.sin(Math.PI * t),
    };
  };
}

/**
 * Vertical loop with a sideways drift. The ring turns once while moving
 * laterally, so the exit lane sits beside the entrance instead of dropping back
 * onto the approach. A following shift piece returns to the centreline.
 */
export function loopPath(
  radius = LOOP_RADIUS,
  offset = LOOP_OFFSET,
): TrackPath {
  return (t) => {
    const theta = Math.PI * 2 * t;
    const drift = t * t * (3 - 2 * t);
    const driftRate = 6 * t * (1 - t);
    return {
      position: new THREE.Vector3(
        offset * drift,
        radius * (1 - Math.cos(theta)),
        radius * Math.sin(theta),
      ),
      tangent: new THREE.Vector3(
        offset * driftRate,
        radius * Math.PI * 2 * Math.sin(theta),
        radius * Math.PI * 2 * Math.cos(theta),
      ).normalize(),
      up: new THREE.Vector3(0, Math.cos(theta), -Math.sin(theta)).normalize(),
      bank: 0,
    };
  };
}

/** Curves the offset exit lane back to the circuit centreline. */
export function shiftPath(offset: number, length = 14): TrackPath {
  return (t) => {
    const drift = t * t * (3 - 2 * t);
    const driftRate = (6 * t * (1 - t)) / length;
    return {
      // Local path: the piece starts on the offset lane and returns to the
      // parent centreline, which is offset metres to its left.
      position: new THREE.Vector3(-offset * drift, 0, length * t),
      tangent: new THREE.Vector3(-offset * driftRate, 0, 1).normalize(),
      up: new THREE.Vector3(0, 1, 0),
      bank: 0,
    };
  };
}

/** Crest that returns to ground level with zero slope at both ends. */
export function hillPath(length = 18, height = 2): TrackPath {
  return (t) => {
    const y = height * Math.sin(Math.PI * t) ** 2;
    const slope = (height * Math.PI * Math.sin(2 * Math.PI * t)) / length;
    const tangent = new THREE.Vector3(0, slope, 1).normalize();
    const right = new THREE.Vector3(1, 0, 0);
    return {
      position: new THREE.Vector3(0, y, length * t),
      tangent,
      up: new THREE.Vector3().crossVectors(tangent, right).normalize(),
      bank: 0,
    };
  };
}

export interface Piece {
  kind: 'straight' | 'turn' | 'loop' | 'hill' | 'boost' | 'shift';
  path: TrackPath;
  length: number;
  /** Matrix that places the piece's local frame in the circuit. */
  matrix: THREE.Matrix4;
  boost?: boolean;
  /** Authored turn radius and angle, used by layout validation. */
  radius?: number;
  angleDegrees?: number;
}

/** Seeded, catalogue-based circuit: a stadium with a loop and a hill. */
export interface Circuit {
  seed: string;
  level: number;
  /** Deterministic retry offset that produced the accepted combination. */
  seedOffset: number;
  pieces: Piece[];
  frameCount: number;
}

export interface CircuitValidation {
  ok: boolean;
  reasons: string[];
}

function seededRandom(seed: string): () => number {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return () => {
    hash += 0x6d2b79f5;
    let t = hash;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Straight lengths the seeded assembly may choose from, in metres. */
const HILL_LENGTH = 30;
const HILL_HEIGHT = 2.4;
const MIN_CLOSING_STRAIGHT = 12;
const TURN_RADII = [18, 14, 10, 8] as const;
const MAX_ASSEMBLY_ATTEMPTS = 32;

/** Straight lengths offered at a level, scaled with the rest of the track. */
export function straightCatalogForLevel(level: number): readonly number[] {
  if (level >= 7) {
    return [18, 24, 30];
  }
  if (level >= 3) {
    return [12, 18, 24];
  }
  return [12, 18];
}

/** Turn radius offered at a level; tighter tiers unlock as the level rises. */
export function turnRadiusForLevel(level: number): number {
  const tier = Math.min(
    TURN_RADII.length - 1,
    Math.max(0, Math.floor((level - 1) / 3)),
  );
  return (TURN_RADII[tier] ?? TURN_RADII[0]) * 1.5;
}

/** Loop radius offered at a level; it shrinks toward two thirds at level 12. */
export function loopRadiusForLevel(level: number): number {
  return Math.max(LOOP_RADIUS * 0.68, LOOP_RADIUS - (level - 1) * 0.3);
}

/** One assembled side of the stadium, measured along its local +Z axis. */
interface SideModule {
  kind: 'straight' | 'loop' | 'hill';
  /** Forward distance contributed by the module. */
  length: number;
}

interface PlanPoint {
  x: number;
  z: number;
  s: number;
}

/**
 * Assemble the piece list for one seeded attempt. The circuit is a stadium:
 * two sides joined by two 180° banked turns. The seed picks the turn direction,
 * which side carries the loop and the hill, the straight lengths, and the order
 * of those modules. Every piece starts at its own origin heading +Z, so the
 * placement matrix is the accumulated frame.
 *
 * Closure is guaranteed by construction: both sides are assembled to the same
 * forward length, the loop's sideways exit is cancelled by a shift piece, and
 * the two equal turns return the heading and lateral offset to the start.
 */
function assembleCircuit(
  seed: string,
  level: number,
  seedOffset: number,
): Circuit {
  const random = seededRandom(`${seed}:${level}:${seedOffset}`);
  const radius = turnRadiusForLevel(level);
  const loopRadius = loopRadiusForLevel(level);
  const straights = straightCatalogForLevel(level);
  const pieces: Piece[] = [];

  // Raise the whole circuit so the low edge of a banked turn never reaches
  // the floor, then run supports from the track down to ground level.
  const maxBank = (bankForRadius(radius) * Math.PI) / 180;
  const lift =
    (TRACK_WIDTH / 2) * Math.sin(maxBank) + TRACK_THICKNESS + 0.25;

  const identity = new THREE.Matrix4().makeTranslation(0, lift, 0);
  const frameAt = (
    matrix: THREE.Matrix4,
    path: TrackPath,
    t: number,
  ): THREE.Matrix4 => {
    const sample = path(t);
    const rotation = new THREE.Matrix4().makeBasis(
      new THREE.Vector3().crossVectors(sample.up, sample.tangent).normalize(),
      sample.up,
      sample.tangent,
    );
    return matrix.clone().multiply(rotation.setPosition(sample.position));
  };

  const addStraight = (length: number, boost = false): void => {
    const last = pieces[pieces.length - 1];
    const matrix = last ? frameAt(last.matrix, last.path, 1) : identity.clone();
    pieces.push({
      kind: boost ? 'boost' : 'straight',
      path: straightPath(length),
      length,
      matrix,
      ...(boost ? { boost: true } : {}),
    });
  };

  const addPiece = (kind: Piece['kind'], path: TrackPath, length: number): void => {
    const last = pieces[pieces.length - 1];
    const matrix = last ? frameAt(last.matrix, last.path, 1) : identity.clone();
    pieces.push({ kind, path, length, matrix });
  };

  const addTurn = (): void => {
    const last = pieces[pieces.length - 1];
    const matrix = last ? frameAt(last.matrix, last.path, 1) : identity.clone();
    pieces.push({
      kind: 'turn',
      path: turnPath(radius, 180, clockwise),
      length: Math.PI * radius,
      matrix,
      radius,
      angleDegrees: 180,
    });
  };

  const pick = <T,>(values: readonly T[]): T => {
    const value = values[Math.floor(random() * values.length)];
    if (value === undefined) {
      throw new Error('empty track catalogue');
    }
    return value;
  };

  const buildSide = (
    withLoop: boolean,
    withHill: boolean,
    extraStraights: number,
  ): SideModule[] => {
    // Start on a straight so the grid and finish gate always sit on flat track.
    const modules: SideModule[] = [
      { kind: 'straight', length: pick(straights) },
    ];
    if (withLoop) {
      modules.push({ kind: 'loop', length: LOOP_RETURN_LENGTH });
    }
    if (withHill) {
      modules.push({ kind: 'hill', length: HILL_LENGTH });
    }
    for (let index = 0; index < extraStraights; index += 1) {
      modules.push({ kind: 'straight', length: pick(straights) });
    }

    // Keep the leading straight fixed, shuffle the rest of the combination.
    for (let index = modules.length - 1; index > 1; index -= 1) {
      const swap = 1 + Math.floor(random() * index);
      const current = modules[index];
      const other = modules[swap];
      if (current && other) {
        modules[index] = other;
        modules[swap] = current;
      }
    }
    return modules;
  };

  const clockwise = random() < 0.5;
  const loopSide = random() < 0.5 ? 0 : 1;
  // Put the hill on the other side so the two halves stay comparable in length.
  const hillSide = loopSide === 0 ? 1 : 0;
  const extraStraights = 1 + Math.min(2, Math.floor((level - 1) / 4));
  const sides: [SideModule[], SideModule[]] = [
    buildSide(loopSide === 0, hillSide === 0, extraStraights),
    buildSide(loopSide === 1, hillSide === 1, extraStraights),
  ];

  const sideLength = (modules: SideModule[]): number =>
    modules.reduce((total, module) => total + module.length, 0);
  const fixedLengths: [number, number] = [
    sideLength(sides[0]),
    sideLength(sides[1]),
  ];
  // Give both sides the same forward length; the closing straights absorb the
  // difference, so the circuit still meets itself at the seam.
  const targetLength =
    Math.max(...fixedLengths) +
    MIN_CLOSING_STRAIGHT * 1.5 +
    Math.round(random() * MIN_CLOSING_STRAIGHT * 1.5);
  const closingStraights: [number, number] = [
    targetLength - fixedLengths[0],
    targetLength - fixedLengths[1],
  ];

  const addSide = (modules: SideModule[], closingStraight: number): void => {
    for (const module of modules) {
      if (module.kind === 'straight') {
        addStraight(module.length);
      } else if (module.kind === 'hill') {
        addPiece(
          'hill',
          hillPath(module.length, HILL_HEIGHT),
          module.length,
        );
      } else {
        addPiece('loop', loopPath(loopRadius), Math.PI * 2 * loopRadius);
        addPiece(
          'shift',
          shiftPath(LOOP_OFFSET, module.length),
          module.length,
        );
      }
    }
    // The closing straight on each side carries a boost strip.
    addStraight(closingStraight, true);
  };

  addSide(sides[0], closingStraights[0]);
  addTurn();
  addSide(sides[1], closingStraights[1]);
  addTurn();

  return {
    seed,
    level,
    seedOffset,
    pieces,
    frameCount: pieces.reduce(
      (total, piece) => total + Math.ceil(piece.length / 0.35),
      0,
    ),
  };
}

/** Sample a circuit's horizontal footprint without the vertical loop ring. */
function planPoints(circuit: Circuit): PlanPoint[] {
  const points: PlanPoint[] = [];
  let distance = 0;
  for (const piece of circuit.pieces) {
    if (piece.kind === 'loop') {
      continue;
    }
    const count = Math.max(2, Math.ceil(piece.length));
    for (let index = 0; index <= count; index += 1) {
      if (
        index === count &&
        piece !== circuit.pieces[circuit.pieces.length - 1]
      ) {
        continue;
      }
      const sample = piece.path(index / count);
      const position = sample.position.clone().applyMatrix4(piece.matrix);
      points.push({
        x: position.x,
        z: position.z,
        s: distance + (index / count) * piece.length,
      });
    }
    distance += piece.length;
  }
  return points;
}

/**
 * Validate the behaviour rules independently of assembly: closure, required
 * features, minimum turn radius, and plan-view clearance between sections that
 * are not adjacent along the circuit.
 */
export function validateCircuit(circuit: Circuit): CircuitValidation {
  const reasons = new Set<string>();

  const loops = circuit.pieces.filter((piece) => piece.kind === 'loop').length;
  const turns = circuit.pieces.filter((piece) => piece.kind === 'turn').length;
  const boosts = circuit.pieces.filter((piece) => piece.kind === 'boost').length;
  if (loops < 1) {
    reasons.add('missing a vertical loop');
  }
  if (turns < 2) {
    reasons.add('needs at least two banked turns');
  }
  if (boosts < 2) {
    reasons.add('needs at least two boost strips');
  }

  for (const piece of circuit.pieces) {
    if (piece.kind !== 'turn') {
      continue;
    }
    const radius =
      piece.radius ??
      (piece.angleDegrees
        ? piece.length / ((piece.angleDegrees * Math.PI) / 180)
        : Number.POSITIVE_INFINITY);
    if (radius < MIN_TURN_RADIUS - 1e-6) {
      reasons.add(
        `turn radius ${radius.toFixed(2)} m is below ${MIN_TURN_RADIUS} m`,
      );
    }
  }

  const frames = buildFrames(circuit);
  const first = frames[0];
  const last = frames[frames.length - 1];
  if (!first || !last) {
    reasons.add('circuit has no sampled frames');
  } else {
    if (first.position.distanceTo(last.position) > 0.05) {
      reasons.add('seam position does not close');
    }
    if (first.tangent.dot(last.tangent) < 0.999) {
      reasons.add('seam heading does not close');
    }
  }

  const points = planPoints(circuit);
  const lastPoint = points[points.length - 1];
  const total = lastPoint ? lastPoint.s : 0;
  const adjacentArc = TRACK_WIDTH * 2;
  const clearance = TRACK_WIDTH + CAR_WIDTH;
  for (let index = 0; index < points.length; index += 1) {
    const a = points[index];
    if (!a) {
      continue;
    }
    for (let other = index + 1; other < points.length; other += 1) {
      const b = points[other];
      if (!b) {
        continue;
      }
      const direct = Math.abs(a.s - b.s);
      const arc = Math.min(direct, Math.max(0, total - direct));
      if (arc < adjacentArc) {
        continue;
      }
      const distance = Math.hypot(a.x - b.x, a.z - b.z);
      if (distance < TRACK_WIDTH - 0.01) {
        reasons.add('plan view self-intersects');
      } else if (distance < clearance - 0.01) {
        reasons.add('plan view clearance is below one car width');
      }
    }
  }

  return { ok: reasons.size === 0, reasons: [...reasons] };
}

/**
 * Build a validated circuit. Each rejected attempt advances a deterministic
 * seed offset, so the same seed and level always settle on the same circuit.
 */
export function generateCircuit(seed: string, level: number): Circuit {
  const failures: string[] = [];
  for (let offset = 0; offset < MAX_ASSEMBLY_ATTEMPTS; offset += 1) {
    const circuit = assembleCircuit(seed, level, offset);
    const validation = validateCircuit(circuit);
    if (validation.ok) {
      return circuit;
    }
    failures.push(`offset ${offset}: ${validation.reasons.join(', ')}`);
  }
  throw new Error(
    `Could not assemble a playable circuit for ${seed} at level ${level}: ${failures
      .slice(0, 3)
      .join(' | ')}`,
  );
}

/** Sample a circuit into world-space frames at roughly fixed spacing. */
export function buildFrames(circuit: Circuit, step = 0.4): TrackFrame[] {
  const frames: TrackFrame[] = [];
  let distance = 0;
  for (const piece of circuit.pieces) {
    const count = Math.max(8, Math.ceil(piece.length / step));
    for (let index = 0; index <= count; index += 1) {
      if (index === count && piece !== circuit.pieces[circuit.pieces.length - 1]) {
        continue;
      }
      const t = index / count;
      const sample = piece.path(t);
      const uprightRight = new THREE.Vector3()
        .crossVectors(sample.up, sample.tangent)
        .normalize();
      const up = sample.up
        .clone()
        .multiplyScalar(Math.cos(sample.bank))
        .addScaledVector(uprightRight, Math.sin(sample.bank))
        .normalize();
      const position = sample.position
        .clone()
        .applyMatrix4(piece.matrix);
      const tangent = sample.tangent
        .clone()
        .transformDirection(piece.matrix)
        .normalize();
      const upWorld = up.clone().transformDirection(piece.matrix).normalize();
      frames.push({
        position,
        tangent,
        up: upWorld,
        right: new THREE.Vector3().crossVectors(upWorld, tangent).normalize(),
        s: distance + t * piece.length,
      });
    }
    distance += piece.length;
  }
  return frames;
}

export function trackLength(frames: TrackFrame[]): number {
  const last = frames[frames.length - 1];
  return last ? last.s : 0;
}

/** Nearest frame index for a world position, used for progress and alignment. */
export function nearestFrame(
  frames: TrackFrame[],
  position: THREE.Vector3,
): number {
  let best = 0;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (let index = 0; index < frames.length; index += 1) {
    const frame = frames[index];
    if (!frame) {
      continue;
    }
    const dx = frame.position.x - position.x;
    const dy = frame.position.y - position.y;
    const dz = frame.position.z - position.z;
    const distance = dx * dx + dy * dy + dz * dz;
    if (distance < bestDistance) {
      bestDistance = distance;
      best = index;
    }
  }
  return best;
}

export const TRACK_SECTION = {
  width: TRACK_WIDTH,
  thickness: TRACK_THICKNESS,
};
