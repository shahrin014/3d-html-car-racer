import * as THREE from 'three';
import { CARS } from './car-spec.mjs';
import {
  OPPONENT_BASE_SPEED,
  OPPONENT_COUNT_MAX,
  OPPONENT_GRID_OFFSET,
  OPPONENT_GRID_SPACING,
  OPPONENT_LANES,
  OPPONENT_TOP_SPEED,
  PHYSICS_RIDE_HEIGHT,
} from './constants';
import type { TrackFrame } from './track';

/** One rival on the grid, expressed on the circuit rather than in physics. */
export interface OpponentSpec {
  /** Distance along the circuit where the rival starts, in metres. */
  start: number;
  /** Lateral offset from the centreline, in metres; positive is frame.right. */
  lane: number;
  /** Cruise speed in metres per second. */
  speed: number;
  /** Phase of the gentle pace variation, so the field does not move in lockstep. */
  phase: number;
}

/** A pose on the racing line, with the tangent for velocity calculations. */
export interface RacingPose {
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
  tangent: THREE.Vector3;
  up: THREE.Vector3;
  right: THREE.Vector3;
}

/** How strongly a rival's pace breathes around its cruise speed. */
const PACE_VARIATION = 0.06;
/** How much a climb or descent changes pace per unit of track grade. */
const GRADE_EFFECT = 0.5;
/** Keep the terrain factor bounded so a loop cannot stop or rocket a rival. */
const GRADE_FACTOR_MIN = 0.4;
const GRADE_FACTOR_MAX = 1.5;

/**
 * Deterministic grid for `count` rivals: each gets a lane, a start slot ahead of
 * the player, and a cruise speed. Values are fixed rather than drawn from a
 * seed, so the field around the player is the same on every reload until the
 * count changes. Lanes repeat once the lane set is exhausted, but grid spacing
 * keeps cars in the same lane apart. Speeds are spread across the full pace
 * range so a larger field does not produce rivals faster than the documented
 * ceiling.
 */
export function opponentSpecs(count: number): OpponentSpec[] {
  const wanted = Math.min(
    OPPONENT_COUNT_MAX,
    Math.max(0, Math.floor(count)),
  );
  const span = OPPONENT_TOP_SPEED - OPPONENT_BASE_SPEED;
  const last = Math.max(1, wanted - 1);
  const specs: OpponentSpec[] = [];
  for (let index = 0; index < wanted; index += 1) {
    specs.push({
      start: OPPONENT_GRID_OFFSET + index * OPPONENT_GRID_SPACING,
      lane: OPPONENT_LANES[index % OPPONENT_LANES.length]!,
      speed: OPPONENT_BASE_SPEED + (span * index) / last,
      phase: index * 1.7,
    });
  }
  return specs;
}

/** Circuit length in metres, taken from the last sampled frame. */
export function circuitLength(frames: TrackFrame[]): number {
  const last = frames[frames.length - 1];
  return last ? last.s : 0;
}

/** Wrap a distance into `[0, length)`, tolerating negative input. */
export function wrapDistance(distance: number, length: number): number {
  if (length <= 0) {
    return 0;
  }
  return ((distance % length) + length) % length;
}

/**
 * Cruise pace at a point on the circuit, with the gentle breathing term. The
 * grade is the tangent's vertical component: positive uphill, negative
 * downhill. Climbing therefore slows a rival and descending speeds it up,
 * cheaply approximating the energy a real car would trade for height.
 */
export function paceAt(
  spec: OpponentSpec,
  distance: number,
  grade = 0,
): number {
  const terrain = THREE.MathUtils.clamp(
    1 - grade * GRADE_EFFECT,
    GRADE_FACTOR_MIN,
    GRADE_FACTOR_MAX,
  );
  return (
    spec.speed *
    (1 + PACE_VARIATION * Math.sin(distance * 0.05 + spec.phase)) *
    terrain
  );
}

/**
 * One step of a rival: its wrapped position for sampling and its unwrapped
 * distance since the grid. The latter is what placing compares, because rivals
 * start ahead of the player and never cross a finish line of their own.
 */
export function advanceTravel(
  spec: OpponentSpec,
  travelled: number,
  delta: number,
  length: number,
  grade = 0,
): { distance: number; travelled: number } {
  const distance = wrapDistance(travelled, length);
  const next = travelled + paceAt(spec, distance, grade) * delta;
  return { distance: wrapDistance(next, length), travelled: next };
}

/**
 * Distance after one step of a rival's pace. The sinusoidal term is a function
 * of distance, not time, so the same rival always drives the same lap the same
 * way.
 */
export function advanceDistance(
  spec: OpponentSpec,
  distance: number,
  delta: number,
  length: number,
  grade = 0,
): number {
  return advanceTravel(spec, distance, delta, length, grade).distance;
}

/** Index of the last frame at or before `distance`; `frames` must be sampled. */
function frameIndexAt(frames: TrackFrame[], distance: number): number {
  let low = 0;
  let high = frames.length - 1;
  while (low + 1 < high) {
    const middle = (low + high) >> 1;
    const frame = frames[middle];
    if (frame && frame.s <= distance) {
      low = middle;
    } else {
      high = middle;
    }
  }
  return low;
}

/**
 * Vertical component of the track tangent at `distance`: positive on a climb,
 * negative on a descent. Interpolated between sampled frames, and allocation
 * free because the simulation samples it for every rival each step.
 */
export function gradeAt(frames: TrackFrame[], distance: number): number {
  const first = frames[0];
  if (!first) {
    return 0;
  }
  const length = circuitLength(frames);
  const along = wrapDistance(distance, length);
  const index = frameIndexAt(frames, along);
  const a = frames[index] ?? first;
  const b = frames[index + 1] ?? a;
  const span = b.s - a.s;
  const t = span > 1e-9 ? THREE.MathUtils.clamp((along - a.s) / span, 0, 1) : 0;
  return a.tangent.y + (b.tangent.y - a.tangent.y) * t;
}

/**
 * Body-centre pose on the racing line at `distance`, `lane` metres to the
 * frame's right. Position is lifted by the ride height exactly like the
 * player's rigid body, so both car models are drawn with the same offset.
 */
export function racingPose(
  frames: TrackFrame[],
  distance: number,
  lane: number,
): RacingPose {
  const first = frames[0];
  if (!first) {
    throw new Error('Cannot sample a racing line without frames');
  }
  const length = circuitLength(frames);
  const along = wrapDistance(distance, length);
  const index = frameIndexAt(frames, along);
  const a = frames[index] ?? first;
  const b = frames[index + 1] ?? a;
  const span = b.s - a.s;
  const t = span > 1e-9 ? THREE.MathUtils.clamp((along - a.s) / span, 0, 1) : 0;

  const up = a.up.clone().lerp(b.up, t).normalize();
  const tangent = a.tangent.clone().lerp(b.tangent, t).normalize();
  const right = new THREE.Vector3().crossVectors(up, tangent).normalize();
  // Re-derive the tangent so the basis stays orthonormal after slerping.
  tangent.crossVectors(right, up).normalize();

  const quaternion = new THREE.Quaternion().setFromRotationMatrix(
    new THREE.Matrix4().makeBasis(right, up, tangent),
  );
  const position = a.position
    .clone()
    .lerp(b.position, t)
    .addScaledVector(right, lane)
    .addScaledVector(up, PHYSICS_RIDE_HEIGHT);

  return { position, quaternion, tangent, up, right };
}

/**
 * Deterministic random catalog cars for the field. Shuffling the catalog by a
 * hash of the circuit seed means a grid mixes models instead of repeating the
 * player's car, while the same seed always produces the same field.
 */
export function opponentCarIds(seed: string, count: number): string[] {
  const score = (id: string): number => {
    let hash = 2166136261;
    const text = `${seed}:rival:${id}`;
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  };
  const order = [...CARS]
    .sort((a, b) => score(a.id) - score(b.id))
    .map((car) => car.id);
  const wanted = Math.max(0, Math.floor(count));
  return Array.from({ length: wanted }, (_, index) => order[index % order.length]!);
}
