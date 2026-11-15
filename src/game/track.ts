import * as THREE from 'three';
import {
  DESIGN_SPEED,
  LOOP_OFFSET,
  LOOP_RADIUS,
  LOOP_RETURN_LENGTH,
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
}

/** Seeded, template-based circuit: a stadium with a loop module inline. */
export interface Circuit {
  seed: string;
  level: number;
  pieces: Piece[];
  frameCount: number;
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
const STRAIGHT_CATALOG = [8, 12, 16] as const;
const HILL_LENGTH = 20;
const HILL_HEIGHT = 1.6;
const MIN_CLOSING_STRAIGHT = 8;

/** One assembled side of the stadium, measured along its local +Z axis. */
interface SideModule {
  kind: 'straight' | 'loop' | 'hill';
  /** Forward distance contributed by the module. */
  length: number;
}

/**
 * Build the piece list. The circuit is a stadium: two sides joined by two 180°
 * banked turns. The seed picks the turn direction, which side carries the loop
 * and the hill, the straight lengths, and the order of those modules. Every
 * piece starts at its own origin heading +Z, so the placement matrix is the
 * accumulated frame.
 *
 * Closure is guaranteed by construction: both sides are assembled to the same
 * forward length, the loop's sideways exit is cancelled by a shift piece, and
 * the two equal turns return the heading and lateral offset to the start.
 */
export function generateCircuit(seed: string, level: number): Circuit {
  const random = seededRandom(`${seed}:${level}`);
  const radius = [18, 14, 10][Math.min(2, Math.floor((level - 1) / 2))] ?? 14;
  const loopRadius = Math.max(5.5, LOOP_RADIUS - (level - 1) * 0.25);
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

  const pick = <T,>(values: readonly T[]): T => {
    const value = values[Math.floor(random() * values.length)];
    if (value === undefined) {
      throw new Error('empty track catalog');
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
      { kind: 'straight', length: pick(STRAIGHT_CATALOG) },
    ];
    if (withLoop) {
      modules.push({ kind: 'loop', length: LOOP_RETURN_LENGTH });
    }
    if (withHill) {
      modules.push({ kind: 'hill', length: HILL_LENGTH });
    }
    for (let index = 0; index < extraStraights; index += 1) {
      modules.push({ kind: 'straight', length: pick(STRAIGHT_CATALOG) });
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
  const extraStraights = 1 + Math.floor(random() * 2);
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
    MIN_CLOSING_STRAIGHT +
    Math.round(random() * MIN_CLOSING_STRAIGHT);
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
  addPiece('turn', turnPath(radius, 180, clockwise), Math.PI * radius);
  addSide(sides[1], closingStraights[1]);
  addPiece('turn', turnPath(radius, 180, clockwise), Math.PI * radius);

  return {
    seed,
    level,
    pieces,
    frameCount: pieces.reduce(
      (total, piece) => total + Math.ceil(piece.length / 0.35),
      0,
    ),
  };
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
