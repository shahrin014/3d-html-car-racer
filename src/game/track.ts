import * as THREE from 'three';
import {
  CAR_WIDTH,
  CIRCUIT_BOOST_LENGTH,
  CIRCUIT_CORNER_COUNTS,
  BRIDGE_CLEARANCE,
  BRIDGE_FLAT_LENGTH,
  BRIDGE_HEIGHT,
  BRIDGE_LENGTH,
  BRIDGE_RAMP_LENGTH,
  CIRCUIT_LEAD_STRAIGHT,
  CIRCUIT_LEG_BASE,
  DESIGN_SPEED,
  JUMP_GAP_LENGTH,
  JUMP_HEIGHT,
  JUMP_KICKER_LENGTH,
  JUMP_DOWN_LANDING_PER_LEVEL,
  JUMP_LANDING_HEIGHT,
  JUMP_LANDING_LENGTH,
  JUMP_LANDING_WIDTH,
  JUMP_LAUNCH_SLOPE,
  LOOP_OFFSET,
  LOOP_RADIUS,
  LOOP_RETURN_LENGTH,
  MIN_TURN_RADIUS,
  MULTI_CROSSING_SHARE,
  OBSTACLE_SEGMENT_LENGTH,
  SKY_JUMP_ENTRY_HEIGHT,
  SKY_JUMP_GAP_LENGTH,
  SKY_JUMP_KICKER_LENGTH,
  SKY_JUMP_LANDING_LENGTH,
  SKY_JUMP_LEG_EXTRA,
  SKY_JUMP_LIP_HEIGHT,
  SPIRAL_HEIGHT,
  SPIRAL_RADIUS,
  SPIRAL_TURNS,
  STEEP_RAMP_ANGLE,
  STEEP_RAMP_EASE_IN_RATIO,
  STEEP_RAMP_EASE_OUT_RATIO,
  STEEP_RAMP_HEIGHT,
  TRACK_THICKNESS,
  TRACK_WIDTH,
} from './constants';
import { assembleMultiCrossingCircuit } from './multiCrossing';

/** A sampled point on the track with the frame needed to place mesh and car. */
export interface TrackFrame {
  position: THREE.Vector3;
  tangent: THREE.Vector3;
  up: THREE.Vector3;
  right: THREE.Vector3;
  /** Distance along the circuit in metres. */
  s: number;
  /**
   * False over a jump gap: the frame is only a progress and camera reference,
   * so it must get no collider and must not apply the guide assist.
   */
  solid: boolean;
  /**
   * Half the deck width at this frame. A jump landing is twice as wide as the
   * running track, so the mesh, physics deck and rails, and jump-failure bound
   * all widen where the car lands.
   */
  halfWidth: number;
  /**
   * Whether this frame carries a guide rail. A jump landing is left open so a
   * car coming down from the jump does not clip a barrier at the touchdown
   * mouth; rails resume on the normal-width track that follows.
   */
  rails: boolean;
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

/**
 * Flat deck for the obstacle segment. The hazard blocks are placed on it by
 * `obstacleSpecs`, so the path itself is a plain straight.
 */
export function obstaclesPath(
  length = OBSTACLE_SEGMENT_LENGTH,
): TrackPath {
  return straightPath(length);
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

/** Ease curve with zero slope at both ends. */
function smoothStep(t: number): number {
  return t * t * (3 - 2 * t);
}

/** Ramp up to a raised deck, flat at both ends. */
export function bridgeRampUpPath(
  length = BRIDGE_RAMP_LENGTH,
  height = BRIDGE_HEIGHT,
): TrackPath {
  return (t) => {
    const slope = (height * 6 * t * (1 - t)) / length;
    const tangent = new THREE.Vector3(0, slope, 1).normalize();
    const right = new THREE.Vector3(1, 0, 0);
    return {
      position: new THREE.Vector3(0, height * smoothStep(t), length * t),
      tangent,
      up: new THREE.Vector3().crossVectors(tangent, right).normalize(),
      bank: 0,
    };
  };
}

/** Raised deck between the two bridge ramps. */
export function bridgeDeckPath(length = BRIDGE_FLAT_LENGTH): TrackPath {
  return (t) => ({
    position: new THREE.Vector3(0, 0, length * t),
    tangent: new THREE.Vector3(0, 0, 1),
    up: new THREE.Vector3(0, 1, 0),
    bank: 0,
  });
}

/** Ramp down from a raised deck to the ground, flat at both ends. */
export function bridgeRampDownPath(
  length = BRIDGE_RAMP_LENGTH,
  height = BRIDGE_HEIGHT,
): TrackPath {
  return (t) => {
    const slope = (-height * 6 * t * (1 - t)) / length;
    const tangent = new THREE.Vector3(0, slope, 1).normalize();
    const right = new THREE.Vector3(1, 0, 0);
    return {
      position: new THREE.Vector3(0, -height * smoothStep(t), length * t),
      tangent,
      up: new THREE.Vector3().crossVectors(tangent, right).normalize(),
      bank: 0,
    };
  };
}

/** Integral of a smooth-step slope ramp, in units of the ramp run. */
function steepEaseIntegral(r: number): number {
  return r * r * r - 0.5 * r * r * r * r;
}

/** Horizontal run of the steep ramp, including both eased ends. */
export function steepRampRun(
  height = STEEP_RAMP_HEIGHT,
  angleDegrees = STEEP_RAMP_ANGLE,
): number {
  const easeIn = height * STEEP_RAMP_EASE_IN_RATIO;
  const easeOut = height * STEEP_RAMP_EASE_OUT_RATIO;
  const pitch = (angleDegrees * Math.PI) / 180;
  return height / Math.tan(pitch) + (easeIn + easeOut) / 2;
}

/**
 * Steep ramp profile shared by the climb and the matching descent.
 *
 * The slope rises from flat to 80 degrees over the entry ease, holds the
 * authored angle, then eases back to flat over the exit. The height is exact,
 * so the piece joins a level deck at both ends. The climb uses short bottom and
 * top eases, because an 80-degree face over four bridge levels leaves little
 * horizontal run for the car to rotate onto it; the descent reuses the same
 * curve so the pair always closes on the same height.
 */
function steepRampPath(
  height: number,
  angleDegrees: number,
  direction: 1 | -1,
): TrackPath {
  const run = steepRampRun(height, angleDegrees);
  // The climb gets the long entry; the descent gets the long exit. Both keep
  // the same total ease length, so the run and the 80 degree face are
  // identical whichever way the car travels.
  const easeIn =
    height *
    (direction === 1
      ? STEEP_RAMP_EASE_IN_RATIO
      : STEEP_RAMP_EASE_OUT_RATIO);
  const easeOut =
    height *
    (direction === 1
      ? STEEP_RAMP_EASE_OUT_RATIO
      : STEEP_RAMP_EASE_IN_RATIO);
  const entryShare = easeIn / run;
  const exitShare = easeOut / run;
  const slopeArea = 1 - (entryShare + exitShare) / 2;

  const slopeShare = (t: number): number => {
    if (t <= entryShare) {
      return smoothStep(t / entryShare);
    }
    if (t >= 1 - exitShare) {
      return smoothStep((1 - t) / exitShare);
    }
    return 1;
  };

  const riseShare = (t: number): number => {
    if (t <= entryShare) {
      return (entryShare * steepEaseIntegral(t / entryShare)) / slopeArea;
    }
    if (t < 1 - exitShare) {
      return (entryShare / 2 + (t - entryShare)) / slopeArea;
    }
    const remaining = (1 - t) / exitShare;
    return (
      (slopeArea - exitShare * steepEaseIntegral(remaining)) / slopeArea
    );
  };

  const slopeScale = height / (run * slopeArea);
  return (t) => {
    const slope = direction * slopeScale * slopeShare(t);
    const tangent = new THREE.Vector3(0, slope, 1).normalize();
    const right = new THREE.Vector3(1, 0, 0);
    return {
      position: new THREE.Vector3(0, direction * height * riseShare(t), run * t),
      tangent,
      up: new THREE.Vector3().crossVectors(tangent, right).normalize(),
      bank: 0,
    };
  };
}

/** Four-level 80 degree climb. The circuit draws it as a boost strip. */
export function steepRampUpPath(
  height = STEEP_RAMP_HEIGHT,
  angleDegrees = STEEP_RAMP_ANGLE,
): TrackPath {
  return steepRampPath(height, angleDegrees, 1);
}

/** Matching four-level 80 degree descent, placed on the raised deck. */
export function steepRampDownPath(
  height = STEEP_RAMP_HEIGHT,
  angleDegrees = STEEP_RAMP_ANGLE,
): TrackPath {
  return steepRampPath(height, angleDegrees, -1);
}

/**
 * Helical ramp: one full turn around a centre while climbing or dropping one
 * bridge level. The vertical profile eases in and out so the entry and exit
 * tangents match a flat straight, and the bank fades at both ends the way a
 * banked turn does. A clockwise spiral bulges to the right of the approach.
 */
function spiralPath(
  radius: number,
  height: number,
  turns: number,
  clockwise: boolean,
  descend: boolean,
): TrackPath {
  const angle = Math.PI * 2 * turns;
  const sign = clockwise ? 1 : -1;
  const rise = descend ? -height : height;
  const horizontal = radius * angle;
  const maxBank = (bankForRadius(radius) * Math.PI) / 180;
  return (t) => {
    const theta = angle * t;
    const dy = rise * 6 * t * (1 - t);
    const tangent = new THREE.Vector3(
      sign * Math.sin(theta) * horizontal,
      dy,
      Math.cos(theta) * horizontal,
    ).normalize();
    const right = new THREE.Vector3()
      .crossVectors(new THREE.Vector3(0, 1, 0), tangent)
      .normalize();
    const up = new THREE.Vector3().crossVectors(tangent, right).normalize();
    return {
      position: new THREE.Vector3(
        sign * radius * (1 - Math.cos(theta)),
        rise * smoothStep(t),
        radius * Math.sin(theta),
      ),
      tangent,
      up,
      bank: sign * maxBank * Math.sin(Math.PI * t),
    };
  };
}

/** Spiral that climbs one level and returns to the same plan position. */
export function spiralUpPath(
  radius = SPIRAL_RADIUS,
  height = SPIRAL_HEIGHT,
  turns = SPIRAL_TURNS,
  clockwise = true,
): TrackPath {
  return spiralPath(radius, height, turns, clockwise, false);
}

/** Spiral that drops one level and returns to the same plan position. */
export function spiralDownPath(
  radius = SPIRAL_RADIUS,
  height = SPIRAL_HEIGHT,
  turns = SPIRAL_TURNS,
  clockwise = true,
): TrackPath {
  return spiralPath(radius, height, turns, clockwise, true);
}

/**
 * Arc length of a spiral piece. The climb is eased, so integrate the vertical
 * component instead of using a straight-helix approximation.
 */
export function spiralArcLength(
  radius = SPIRAL_RADIUS,
  height = SPIRAL_HEIGHT,
  turns = SPIRAL_TURNS,
): number {
  const horizontal = radius * Math.PI * 2 * turns;
  const steps = 128;
  let length = 0;
  for (let index = 0; index < steps; index += 1) {
    const t = (index + 0.5) / steps;
    const dy = height * 6 * t * (1 - t);
    length += Math.hypot(horizontal, dy) / steps;
  }
  return length;
}

/** Radius of the clear opening inside the spiral's inner rail. */
export function spiralInnerRadius(radius = SPIRAL_RADIUS): number {
  return radius - TRACK_WIDTH / 2;
}

/** Hermite basis for a curve with chosen end values and end slopes. */
function hermite(t: number): { h00: number; h10: number; h01: number; h11: number } {
  const squared = t * t;
  const cubed = squared * t;
  return {
    h00: 2 * cubed - 3 * squared + 1,
    h10: cubed - 2 * squared + t,
    h01: -2 * cubed + 3 * squared,
    h11: cubed - squared,
  };
}

/** Derivative of the Hermite basis, with respect to t. */
function hermiteSlope(t: number): { d00: number; d10: number; d01: number; d11: number } {
  const squared = t * t;
  return {
    d00: 6 * squared - 6 * t,
    d10: 3 * squared - 4 * t + 1,
    d01: -6 * squared + 6 * t,
    d11: 3 * squared - 2 * t,
  };
}

/**
 * Planar forward distance of a whole jump module.
 */
export function jumpPlanarLength(): number {
  return jumpModulePlanarLength(0, JUMP_LANDING_LENGTH);
}

/**
 * Planar forward distance of a downhill jump that drops `drop` metres to a
 * lower landing deck. Same launch and gap as the flat module, but the landing
 * is longer (it must sink a whole level) and ends below the launch deck.
 */
export function downJumpLandingLength(stageLevels: number): number {
  return JUMP_DOWN_LANDING_PER_LEVEL * Math.max(1, Math.round(stageLevels));
}

/**
 * Planar forward distance a downhill jump needs so a leg budget can reserve it.
 * It drops `stageLevels` bridge levels to a lower deck.
 */
export function downJumpPlanarLength(stageLevels: number): number {
  const landing = downJumpLandingLength(stageLevels);
  return jumpModulePlanarLength(BRIDGE_HEIGHT * stageLevels, landing);
}

/**
 * Per-point landing half-width: full doubled width where the car touches down
 * at the landing entry, then a single smooth curve down to the normal track
 * width by the end of the landing. Both edges mirror this value, so the flare
 * is always centred and has no sharp corner.
 */
export function landingWidthTaper(): (t: number) => number {
  const full = JUMP_LANDING_WIDTH / 2;
  const normal = TRACK_WIDTH / 2;
  const eased = (p: number): number => p * p * (3 - 2 * p);
  return (t) => full + (normal - full) * eased(t);
}

/**
 * Shared planar composition for the jump module. The gap and the landing are
 * placed on the tilted launch frame, so their forward distance is not the sum
 * of the three authored lengths. Compose the placement frames exactly instead
 * of approximating the tilt, so a leg budget built from this closes on the
 * seam. A `drop` reuses the same geometry but sinks the landing by that many
 * world metres and walks it a longer landing ramp.
 */
function jumpModulePlanarLength(
  drop: number,
  landingLength: number,
  kickerLength = JUMP_KICKER_LENGTH,
  kickerHeight = JUMP_HEIGHT,
  gapLength = JUMP_GAP_LENGTH,
  entryHeight = JUMP_LANDING_HEIGHT,
  launchSlope = JUMP_LAUNCH_SLOPE,
): number {
  const endFrame = (matrix: THREE.Matrix4, path: TrackPath): THREE.Matrix4 => {
    const sample = path(1);
    const rotation = new THREE.Matrix4().makeBasis(
      new THREE.Vector3().crossVectors(sample.up, sample.tangent).normalize(),
      sample.up,
      sample.tangent,
    );
    return matrix.clone().multiply(rotation.setPosition(sample.position));
  };
  let matrix = endFrame(
    new THREE.Matrix4(),
    kickerPath(kickerLength, kickerHeight, launchSlope),
  );
  matrix = endFrame(matrix, gapPath(gapLength));
  matrix = endFrame(
    matrix,
    landingPath(landingLength, kickerHeight, launchSlope,
      gapLength, entryHeight, drop),
  );
  const end = new THREE.Vector3().setFromMatrixPosition(matrix);
  return Math.hypot(end.x, end.z);
}

/**
 * Plan length of the steep climb plus the compact sky jump at its lip. The
 * ramp ends flat, so the jump's plan adds directly to the ramp run.
 */
export function skyJumpPlanarLength(): number {
  return (
    steepRampRun(STEEP_RAMP_HEIGHT) +
    jumpModulePlanarLength(
      0,
      SKY_JUMP_LANDING_LENGTH,
      SKY_JUMP_KICKER_LENGTH,
      SKY_JUMP_LIP_HEIGHT,
      SKY_JUMP_GAP_LENGTH,
      SKY_JUMP_ENTRY_HEIGHT,
    )
  );
}

/** Ramp up to the lip, ending on the launch slope. */
export function kickerPath(
  length = JUMP_KICKER_LENGTH,
  height = JUMP_HEIGHT,
  slope = JUMP_LAUNCH_SLOPE,
): TrackPath {
  return (t) => {
    const basis = hermite(t);
    const derivative = hermiteSlope(t);
    const y = basis.h01 * height + basis.h11 * (length * slope);
    const dy = (derivative.d01 * height + derivative.d11 * (length * slope)) / length;
    const tangent = new THREE.Vector3(0, dy, 1).normalize();
    const right = new THREE.Vector3(1, 0, 0);
    return {
      position: new THREE.Vector3(0, y, length * t),
      tangent,
      up: new THREE.Vector3().crossVectors(tangent, right).normalize(),
      bank: 0,
    };
  };
}

/**
 * The empty space between a kicker and its landing ramp. There is no deck here:
 * the frames continue the launch line so progress, the camera, and the rivals
 * still know where the circuit goes. In local coordinates the launch line is
 * the placement frame's own +Z, so this piece is a plain straight.
 */
export function gapPath(length = JUMP_GAP_LENGTH): TrackPath {
  return (t) => ({
    position: new THREE.Vector3(0, 0, length * t),
    tangent: new THREE.Vector3(0, 0, 1),
    up: new THREE.Vector3(0, 1, 0),
    bank: 0,
  });
}

/**
 * Landing ramp: enters along the launch line and sinks back to a flat deck.
 *
 * The piece is placed on the launch frame, so its local +Z is already tilted
 * up by the launch angle and its local +Y is the lip's up. Its top edge sits at
 * `entryHeight`, below the kicker lip, so the car drops onto a lower ramp. The
 * deck starts with zero local slope (the launch line), ends with the opposite
 * slope so the world tangent is flat again, and drops far enough along the
 * tilted local Y to reach height 0.
 */
export function landingPath(
  length = JUMP_LANDING_LENGTH,
  height = JUMP_HEIGHT,
  slope = JUMP_LAUNCH_SLOPE,
  gapLength = JUMP_GAP_LENGTH,
  entryHeight = JUMP_LANDING_HEIGHT,
  drop = 0,
): TrackPath {
  const angle = Math.atan(slope);
  const cosine = Math.cos(angle);
  // The placement origin is the end of the gap on the launch line. Convert the
  // wanted world heights back into the tilted local frame: the deck starts at
  // the lower landing height and finishes `drop` below the module's base.
  const lipHeight = height + gapLength * Math.sin(angle);
  const start = (entryHeight - lipHeight) / cosine;
  const end =
    -(height / cosine + (gapLength + length) * slope) - drop / cosine;
  return (t) => {
    const basis = hermite(t);
    const derivative = hermiteSlope(t);
    const y =
      basis.h00 * start +
      basis.h01 * end +
      basis.h11 * (length * -slope);
    const dy =
      (derivative.d00 * start +
        derivative.d01 * end +
        derivative.d11 * (length * -slope)) /
      length;
    const tangent = new THREE.Vector3(0, dy, 1).normalize();
    const right = new THREE.Vector3(1, 0, 0);
    return {
      position: new THREE.Vector3(0, y, length * t),
      tangent,
      up: new THREE.Vector3().crossVectors(tangent, right).normalize(),
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
  kind:
    | 'straight'
    | 'turn'
    | 'loop'
    | 'hill'
    | 'obstacles'
    | 'boost'
    | 'shift'
    | 'kicker'
    | 'gap'
    | 'landing'
    | 'ramp-up'
    | 'bridge'
    | 'ramp-down'
    | 'steep-ramp'
    | 'steep-ramp-down'
    | 'spiral-up'
    | 'spiral-down'
    | 'multi-crossing';
  path: TrackPath;
  length: number;
  /** Matrix that places the piece's local frame in the circuit. */
  matrix: THREE.Matrix4;
  boost?: boolean;
  /**
   * Half the deck width this piece is drawn at. Only a jump landing is wider
   * than the running track (TWICE the normal width); every other piece keeps
   * the normal half-width.
   */
  halfWidth?: number;
  /**
   * Optional per-point half-width, as a function of the piece's parameter t
   * (0..1). A jump landing uses this to hold its doubled width where the car
   * lands and then funnel symmetrically back to the normal track width, so the
   * widened deck tapers instead of stepping down. When present, this overrides
   * `halfWidth` for the sampled frames.
   */
  widthTaper?: (t: number) => number;
  /** Authored turn radius and angle, used by layout validation. */
  radius?: number;
  angleDegrees?: number;
  /** World-space centre of a spiral's clear opening, for landmarks. */
  spiralCenter?: THREE.Vector3;
}

/** Seeded, catalogue-based circuit: a stadium with a loop and a hill. */
export interface Circuit {
  seed: string;
  level: number;
  /** Deterministic retry offset that produced the accepted combination. */
  seedOffset: number;
  /** Layout family; absent means the original polygon family. */
  layout?: 'polygon' | 'single-crossing' | 'multi-crossing';
  pieces: Piece[];
  frameCount: number;
  /** Arc length of a multi-crossing layout; other layouts use their pieces. */
  totalLength?: number;
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
const TURN_RADII = [18, 14, 10, 8] as const;
const MAX_ASSEMBLY_ATTEMPTS = 32;

/** Straight increment offered at a level, added to the base leg length. */
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

interface PlanPoint {
  x: number;
  y: number;
  z: number;
  s: number;
}

/**
 * Assemble the piece list for one seeded attempt.
 *
 * The circuit is a closed regular-polygon family: three to six banked corners
 * of 360°/n each, joined by legs that all carry the same forward length, or two
 * alternating lengths when the corner count is even (which gives rectangles and
 * stretched hexagons). Rotational symmetry closes the loop by construction
 * whatever the radius or leg length, so the seed picks the whole shape rather
 * than only reordering pieces on a fixed oval. Every piece starts at its own
 * origin heading +Z, so the placement matrix is the accumulated frame.
 *
 * The loop's sideways exit is cancelled by a shift piece, so the leg it sits on
 * still ends on the centreline with exactly its allocated forward length.
 */
function assembleCircuit(
  seed: string,
  level: number,
  seedOffset: number,
  salt = 0,
): Circuit {
  // A requirement search uses salted attempts; salt 0 keeps the original
  // stream so unconstrained seeds assemble exactly as they always did.
  const random = seededRandom(
    salt === 0
      ? `${seed}:${level}:${seedOffset}`
      : `${seed}:${level}:${salt}:${seedOffset}`,
  );
  const radius = turnRadiusForLevel(level);
  const loopRadius = loopRadiusForLevel(level);
  const straights = straightCatalogForLevel(level);
  const pieces: Piece[] = [];

  // Raise the whole circuit so the low edge of a banked turn never reaches
  // the floor. The deck floats like a plastic track piece, with no supports.
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

  const addSpiral = (
    kind: 'spiral-up' | 'spiral-down',
    path: TrackPath,
    length: number,
    radius: number,
    clockwise: boolean,
  ): void => {
    const last = pieces[pieces.length - 1];
    const matrix = last ? frameAt(last.matrix, last.path, 1) : identity.clone();
    const center = new THREE.Vector3(
      clockwise ? radius : -radius,
      0,
      0,
    ).applyMatrix4(matrix);
    pieces.push({ kind, path, length, matrix, spiralCenter: center });
  };

  /** A climb or descent between the lower deck and the elevated stretch. */
  type Transition = {
    kind:
      | 'spiral-up'
      | 'spiral-down'
      | 'ramp-up'
      | 'ramp-down'
      | 'steep-jump'
      | 'steep-ramp-down'
      | 'jump-down';
    path: TrackPath;
    length: number;
    /** Forward distance consumed in plan view; a spiral consumes none. */
    plan: number;
    /** The piece is drawn as a boost strip. */
    boost?: boolean;
    /** Bridge levels a jump-down drops; the landing sinks this far. */
    stageLevels?: number;
  };

  /** A downhill jump: kicker on the high deck, gap, then a wide landing lower. */
  const addDownJump = (stageLevels: number): void => {
    addJump(0, downJumpLandingLength(stageLevels));
    // Sink the landing by `drop` so it reaches the lower deck.
    const drop = BRIDGE_HEIGHT * Math.max(1, Math.round(stageLevels));
    const landing = pieces[pieces.length - 1];
    if (landing && landing.kind === 'landing') {
      const landingLength = landing.length;
      landing.path = landingPath(
        landingLength,
        JUMP_HEIGHT,
        JUMP_LAUNCH_SLOPE,
        JUMP_GAP_LENGTH,
        JUMP_LANDING_HEIGHT,
        drop,
      );
    }
  };

  /**
   * A flat jump: kicker up to a raised lip, the deckless gap, and the landing
   * ramp. The landing is always twice as wide as the running track, so a fast,
   * off-line landing has room to settle. An optional `drop` makes it a downhill
   * jump whose landing sinks below the launch deck.
   */
  const addJump = (
    drop = 0,
    landingLength: number = JUMP_LANDING_LENGTH,
    kickerLength = JUMP_KICKER_LENGTH,
    kickerHeight = JUMP_HEIGHT,
    gapLength = JUMP_GAP_LENGTH,
    entryHeight = JUMP_LANDING_HEIGHT,
  ): void => {
    addPiece('kicker', kickerPath(kickerLength, kickerHeight), kickerLength);
    addPiece('gap', gapPath(gapLength), gapLength);
    addPiece(
      'landing',
      landingPath(landingLength, kickerHeight, JUMP_LAUNCH_SLOPE,
        gapLength, entryHeight, drop),
      landingLength,
    );
    const landing = pieces[pieces.length - 1];
    if (landing && landing.kind === 'landing') {
      landing.halfWidth = JUMP_LANDING_WIDTH / 2;
      landing.widthTaper = landingWidthTaper();
    }
  };

  const addTransition = (transition: Transition): void => {
    if (transition.kind === 'steep-jump') {
      // The steep climb ends flat on the raised deck; the compact kicker then
      // launches the car over a gap onto the wide landing at the same height.
      addPiece(
        'steep-ramp',
        steepRampUpPath(STEEP_RAMP_HEIGHT),
        steepRampRun(STEEP_RAMP_HEIGHT),
      );
      const ramp = pieces[pieces.length - 1];
      if (ramp) {
        ramp.boost = true;
      }
      addJump(
        0,
        SKY_JUMP_LANDING_LENGTH,
        SKY_JUMP_KICKER_LENGTH,
        SKY_JUMP_LIP_HEIGHT,
        SKY_JUMP_GAP_LENGTH,
        SKY_JUMP_ENTRY_HEIGHT,
      );
      return;
    }
    if (transition.kind === 'jump-down') {
      addDownJump(transition.stageLevels ?? 1);
      return;
    }
    if (transition.kind === 'spiral-up' || transition.kind === 'spiral-down') {
      addSpiral(
        transition.kind,
        transition.path,
        transition.length,
        SPIRAL_RADIUS,
        true,
      );
    } else {
      addPiece(transition.kind, transition.path, transition.length);
      if (transition.boost) {
        const piece = pieces[pieces.length - 1];
        if (piece) {
          piece.boost = true;
        }
      }
    }
  };

  const pick = <T,>(values: readonly T[]): T => {
    const value = values[Math.floor(random() * values.length)];
    if (value === undefined) {
      throw new Error('empty track catalogue');
    }
    return value;
  };

  const corners = pick(CIRCUIT_CORNER_COUNTS);
  const cornerAngle = 360 / corners;
  const clockwise = random() < 0.5;

  const addTurn = (angleDegrees = cornerAngle, turnClockwise = clockwise): void => {
    const last = pieces[pieces.length - 1];
    const matrix = last ? frameAt(last.matrix, last.path, 1) : identity.clone();
    pieces.push({
      kind: 'turn',
      path: turnPath(radius, angleDegrees, turnClockwise),
      length: radius * (angleDegrees * Math.PI) / 180,
      matrix,
      radius,
      angleDegrees,
    });
  };

  const jump = random() < 0.5;
  const singleCrossover = random() < 0.5;

  if (singleCrossover) {
    // A single-crossing layout closes when the two vertical legs match and the diagonals are
    // long enough to absorb the four 135 degree bends. The diagonals cross at
    // their midpoints, where one carries the raised bridge and the other
    // carries the loop, so the bridge passes through the loop's opening.
    const legA = 48 + pick(straights);
    const diagonal = Math.SQRT2 * legA + 2 * radius;
    const turnAngle = 135;
    const bridgeLead = (diagonal - BRIDGE_LENGTH) / 2;

    addStraight(CIRCUIT_LEAD_STRAIGHT);
    const featureLength = jump ? jumpPlanarLength() : HILL_LENGTH;
    if (jump) {
      addJump();
    } else {
      addPiece('hill', hillPath(HILL_LENGTH, HILL_HEIGHT), HILL_LENGTH);
    }
    addStraight(legA - CIRCUIT_LEAD_STRAIGHT - featureLength);
    addTurn(turnAngle, true);

    // The crossing leg: a boost straight, then a spiral up to the deck, a
    // flat crossing, and a spiral back down. The spirals return to their own
    // plan position, so the deck covers the old ramp-plus-deck length and its
    // midpoint still sits over the loop.
    addStraight(Math.max(0, bridgeLead - CIRCUIT_BOOST_LENGTH));
    addStraight(CIRCUIT_BOOST_LENGTH, true);
    addSpiral('spiral-up', spiralUpPath(), spiralArcLength(), SPIRAL_RADIUS, true);
    addPiece('bridge', bridgeDeckPath(BRIDGE_LENGTH), BRIDGE_LENGTH);
    // Some seeds keep the bridge elevated past the crossing and descend after
    // the next corner, so the exit does not always sit directly over the climb.
    const continueElevated = random() < 0.5;
    if (continueElevated) {
      addStraight(bridgeLead);
      addTurn(turnAngle, false);
    }
    addSpiral(
      'spiral-down',
      spiralDownPath(),
      spiralArcLength(),
      SPIRAL_RADIUS,
      true,
    );
    if (!continueElevated) {
      addStraight(bridgeLead);
      addTurn(turnAngle, false);
    }

    // The closing vertical leg carries the boost. When this seed draws an
    // obstacle corridor, it sits just before the boost strip so a car clears
    // the blocks and is boosted out. The draw is made here, at the last
    // decision in the single-crossing assembly, so it never re-rolls the bridge
    // or elevation choices above.
    const singleCrossoverObstacle = random() < 0.4;
    addStraight(CIRCUIT_LEAD_STRAIGHT);
    if (singleCrossoverObstacle) {
      addPiece('obstacles', obstaclesPath(), OBSTACLE_SEGMENT_LENGTH);
    }
    addStraight(CIRCUIT_BOOST_LENGTH, true);
    addStraight(
      legA -
        CIRCUIT_LEAD_STRAIGHT -
        CIRCUIT_BOOST_LENGTH -
        (singleCrossoverObstacle ? OBSTACLE_SEGMENT_LENGTH : 0),
    );
    addTurn(turnAngle, false);

    // The loop sits exactly at the crossing, so the bridge threads its hole.
    addStraight(diagonal / 2);
    addPiece('loop', loopPath(loopRadius), Math.PI * 2 * loopRadius);
    addPiece(
      'shift',
      shiftPath(LOOP_OFFSET, LOOP_RETURN_LENGTH),
      LOOP_RETURN_LENGTH,
    );
    addStraight(diagonal / 2 - LOOP_RETURN_LENGTH);
    addTurn(turnAngle, true);
  } else {
  // Every leg must be long enough for a lead straight plus any single feature
  // and a boost; the smallest leg is far larger than that.
  //
  // A seed that plans the steep pair gets longer legs up front, so the
  // sky-jump module fits even when the level's straights are short. The extra
  // applies to every leg, preserving the regular/alternating polygon closure.
  const skyJump = corners >= 4 && random() < 0.3;
  const legBase =
    CIRCUIT_LEG_BASE +
    pick(straights) +
    (skyJump ? SKY_JUMP_LEG_EXTRA : 0);
  const alternating = corners % 2 === 0 && random() < 0.8;
  const legLong = legBase + 6 + Math.round(random() * 10);
  const legs = Array.from({ length: corners }, (_, index) =>
    alternating && index % 2 === 1 ? legLong : legBase,
  );

  // The loop and the hill always sit on different legs, and the two boost
  // straights avoid the hill leg so a 30 m crest and a boost never compete for
  // the same 48 m of deck.
  // Keep the grid leg free of features: the start straight stays long enough
  // to accelerate and take the first measurement without an immediate bend.
  const loopLeg = 1 + Math.floor(random() * (corners - 1));
  const featureCandidates = Array.from(
    { length: corners - 2 },
    (_, index) => 1 + ((loopLeg - 1 + 1 + index) % (corners - 1)),
  );
  const hillLeg =
    featureCandidates[Math.floor(random() * featureCandidates.length)]!;
  const boostCandidates: number[] = [];
  for (let step = 1; step < corners; step += 1) {
    boostCandidates.push((hillLeg + step) % corners);
  }
  const boostStart = Math.floor(random() * boostCandidates.length);
  const boostLegs = new Set([
    boostCandidates[boostStart]!,
    boostCandidates[(boostStart + 1) % boostCandidates.length]!,
  ]);

  // Some polygon seeds leave the lower deck: a climb on one free leg, an
  // elevated stretch through the rest of the circuit, and a descent on a
  // different free leg. The loop and hill legs stay reserved so their authored
  // features keep their usual slot. Leg 0 is always free, so a four-corner
  // circuit has exactly two free legs; three-corner circuits have only one and
  // stay at ground.
  const elevated = corners >= 4 && random() < 0.75;
  const reservedLegs = new Set([loopLeg, hillLeg]);
  const freeLegs = legs
    .map((_, index) => index)
    .filter((index) => !reservedLegs.has(index));
  const transitions = new Map<number, Transition>();

  const pickLegs = (count: number): number[] => {
    const pool = [...freeLegs];
    const chosen: number[] = [];
    while (chosen.length < count && pool.length > 0) {
      const index = Math.floor(random() * pool.length);
      chosen.push(pool[index]!);
      pool.splice(index, 1);
    }
    return chosen.sort((a, b) => a - b);
  };

  if (elevated && freeLegs.length >= 2) {
    const makeTransition = (
      direction: 'up' | 'down',
      legIndex: number,
      stageLevels: 1 | 2,
      allowRamp: boolean,
    ): Transition => {
      const boost = boostLegs.has(legIndex) ? CIRCUIT_BOOST_LENGTH : 0;
      const available =
        (legs[legIndex] ?? 0) - CIRCUIT_LEAD_STRAIGHT - boost;
      // A ramp uses the same authored slope at one or two levels, so its plan
      // length grows with the height. Use it whenever the leg has room, and
      // fall back to the spiral otherwise.
      const rampLength = BRIDGE_RAMP_LENGTH * stageLevels;
      const canRamp = allowRamp && available >= rampLength;
      if (canRamp && random() < 0.45) {
        const height = BRIDGE_HEIGHT * stageLevels;
        return {
          kind: direction === 'up' ? 'ramp-up' : 'ramp-down',
          path:
            direction === 'up'
              ? bridgeRampUpPath(rampLength, height)
              : bridgeRampDownPath(rampLength, height),
          length: rampLength,
          plan: rampLength,
        };
      }
      const height = BRIDGE_HEIGHT * stageLevels;
      // A downhill jump is a descent that vaults from the raised deck down to
      // a lower deck. It is long, so only offer it when the leg has room; then
      // a fraction of descents become a jump instead of a ramp or spiral.
      const jumpPlan = downJumpPlanarLength(stageLevels);
      if (
        direction === 'down' &&
        available >= jumpPlan &&
        random() < 0.3
      ) {
        return {
          kind: 'jump-down',
          path: gapPath(),
          length: JUMP_KICKER_LENGTH + JUMP_GAP_LENGTH + downJumpLandingLength(stageLevels),
          plan: jumpPlan,
          stageLevels,
        };
      }
      return {
        kind: direction === 'up' ? 'spiral-up' : 'spiral-down',
        path:
          direction === 'up'
            ? spiralUpPath(SPIRAL_RADIUS, height, stageLevels)
            : spiralDownPath(SPIRAL_RADIUS, height, stageLevels),
        length: spiralArcLength(SPIRAL_RADIUS, height, stageLevels),
        plan: 0,
      };
    };

    // Five- and six-corner circuits have a third free leg, so some seeds use a
    // two-stage elevation: climb one level, keep driving, then either climb or
    // descend another level. That puts both one-level and two-level spirals in
    // the same circuit instead of forcing one height for the whole layout.
    //
    // Some seeds instead use the steep pair: a four-level sky jump on one leg
    // and a matching steep descent on a later leg. Both legs must have room for
    // their module after the lead straight, or the seed falls back to the
    // staged route below.
    const transitionAvailable = (legIndex: number): number =>
      (legs[legIndex] ?? 0) -
      CIRCUIT_LEAD_STRAIGHT -
      (boostLegs.has(legIndex) ? CIRCUIT_BOOST_LENGTH : 0);
    const steepUpPlan = skyJumpPlanarLength();
    const steepDownPlan = steepRampRun(STEEP_RAMP_HEIGHT);
    const steepUpLegs = freeLegs.filter(
      (legIndex) => transitionAvailable(legIndex) >= steepUpPlan,
    );
    const steepDownLegs = freeLegs.filter(
      (legIndex) => transitionAvailable(legIndex) >= steepDownPlan,
    );
    const steepUpCandidates = steepUpLegs.filter((upLeg) =>
      steepDownLegs.some((downLeg) => downLeg > upLeg),
    );
    // A pre-rolled sky-jump seed uses the steep pair whenever both legs fit.
    // Other seeds use the staged route, so the steep ramp stays a deliberate
    // part of the rotation instead of depending on a rare long leg.
    const useSteepPair = skyJump && steepUpCandidates.length > 0;

    if (useSteepPair) {
      const upLeg =
        steepUpCandidates[Math.floor(random() * steepUpCandidates.length)]!;
      const downCandidates = steepDownLegs.filter(
        (legIndex) => legIndex > upLeg,
      );
      const downLeg =
        downCandidates[Math.floor(random() * downCandidates.length)]!;
      transitions.set(upLeg, {
        kind: 'steep-jump',
        path: gapPath(),
        length: steepUpPlan,
        plan: steepUpPlan,
      });
      transitions.set(downLeg, {
        kind: 'steep-ramp-down',
        path: steepRampDownPath(STEEP_RAMP_HEIGHT),
        length: steepDownPlan,
        plan: steepDownPlan,
      });
    } else {
      const combineLevels = freeLegs.length >= 3 && random() < 0.5;
      if (combineLevels) {
        const [first, second, third] = pickLegs(3);
        if (random() < 0.5) {
          transitions.set(first!, makeTransition('up', first!, 1, true));
          transitions.set(second!, makeTransition('up', second!, 1, true));
          transitions.set(third!, makeTransition('down', third!, 2, true));
        } else {
          transitions.set(first!, makeTransition('up', first!, 2, true));
          transitions.set(second!, makeTransition('down', second!, 1, true));
          transitions.set(third!, makeTransition('down', third!, 1, true));
        }
      } else {
        const [upLeg, downLeg] = pickLegs(2);
        const stageLevels = random() < 0.35 ? 2 : 1;
        transitions.set(
          upLeg!,
          makeTransition('up', upLeg!, stageLevels, true),
        );
        transitions.set(
          downLeg!,
          makeTransition('down', downLeg!, stageLevels, true),
        );
      }
    }
  }

  // Up to one obstacle corridor per circuit, chosen during the leg loop below.
  let obstacleHost: number | null = null;

  legs.forEach((leg, index) => {
    const feature =
      index === loopLeg
        ? LOOP_RETURN_LENGTH
        : index === hillLeg
          ? jump
            ? jumpPlanarLength()
            : HILL_LENGTH
          : 0;
    const boost = boostLegs.has(index) ? CIRCUIT_BOOST_LENGTH : 0;
    const transition = transitions.get(index);
    const transitionPlan = transition?.plan ?? 0;
    // At most one obstacle corridor per circuit. The decision is made on the
    // first leg that can carry one: it must not be the grid, the loop or hill
    // leg, or a climb/descent leg, and it must have room in its pad. A boost
    // strip is allowed on the same leg: the block corridor is placed just
    // before the strip, so a car clears the blocks and is boosted out.
    // Deciding here, inside the final assembly loop, means the obstacle never
    // shrinks the pool of free legs that elevation and boosts draw from, so a
    // seed with no obstacles assembles exactly as it always did.
    if (
      obstacleHost === null &&
      index !== 0 &&
      index !== loopLeg &&
      index !== hillLeg &&
      !transition &&
      leg - CIRCUIT_LEAD_STRAIGHT - feature - boost - transitionPlan >=
        OBSTACLE_SEGMENT_LENGTH &&
      random() < 0.45
    ) {
      obstacleHost = index;
    }
    const obstacle = obstacleHost === index ? OBSTACLE_SEGMENT_LENGTH : 0;
    const pad =
      leg - CIRCUIT_LEAD_STRAIGHT - feature - boost - transitionPlan - obstacle;

    addStraight(CIRCUIT_LEAD_STRAIGHT);
    if (transition) {
      addTransition(transition);
    }
    if (index === loopLeg) {
      addPiece('loop', loopPath(loopRadius), Math.PI * 2 * loopRadius);
      addPiece(
        'shift',
        shiftPath(LOOP_OFFSET, LOOP_RETURN_LENGTH),
        LOOP_RETURN_LENGTH,
      );
    } else if (index === hillLeg) {
      // A leg carries either a crest or a jump. Both fill the same planned
      // deck budget, so the leg closes whichever feature the seed chooses.
      if (jump) {
        addJump();
      } else {
        addPiece('hill', hillPath(HILL_LENGTH, HILL_HEIGHT), HILL_LENGTH);
      }
    }
    if (obstacle > 0) {
      addPiece('obstacles', obstaclesPath(), OBSTACLE_SEGMENT_LENGTH);
    }
    if (boost > 0) {
      addStraight(boost, true);
    }
    if (pad > 1e-9) {
      addStraight(pad);
    }
    addTurn();
  });
  }

  return {
    seed,
    level,
    seedOffset,
    layout: singleCrossover ? 'single-crossing' : 'polygon',
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
        y: position.y,
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

  const multiCrossing = circuit.layout === 'multi-crossing';
  const loops = circuit.pieces.filter((piece) => piece.kind === 'loop').length;
  const turns = circuit.pieces.filter((piece) => piece.kind === 'turn').length;
  // A steep ramp is a boost strip too, even though its piece kind is not
  // 'boost'. Count both so every layout is held to the same rule.
  const boosts = circuit.pieces.filter(
    (piece) => piece.kind === 'boost' || piece.boost === true,
  ).length;
  if (!multiCrossing) {
    if (loops < 1) {
      reasons.add('missing a vertical loop');
    }
    if (turns < 2) {
      reasons.add('needs at least two banked turns');
    }
  }
  if (boosts < 2) {
    reasons.add('needs at least two boost strips');
  }
  if (multiCrossing) {
    if (circuit.pieces.length < 2) {
      reasons.add('multi-crossing layout has no pieces');
    }
    for (const piece of circuit.pieces) {
      if (piece.kind !== 'multi-crossing') {
        reasons.add('multi-crossing layout mixes catalog pieces');
        break;
      }
    }
  }

  for (const piece of circuit.pieces) {
    if (
      piece.kind === 'obstacles' &&
      Math.abs(piece.length - OBSTACLE_SEGMENT_LENGTH) > 1e-6
    ) {
      reasons.add('obstacle segment has the wrong length');
    }
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
      if (distance >= clearance - 0.01) {
        continue;
      }
      // Sections may overlap in plan when one is on a bridge: the vertical
      // separation has to clear a car, a deck, and some air.
      if (Math.abs(a.y - b.y) >= BRIDGE_CLEARANCE) {
        continue;
      }
      if (distance < TRACK_WIDTH - 0.01) {
        reasons.add('plan view self-intersects');
      } else {
        reasons.add('plan view clearance is below one car width');
      }
    }
  }

  return { ok: reasons.size === 0, reasons: [...reasons] };
}

/**
 * Options for circuit generation. Multi-crossing layouts are opt-in so the
 * stock preview and existing seeds keep the polygon/single-crossing output.
 */
export interface CircuitOptions {
  allowMultiCrossing?: boolean;
  /**
   * Piece kinds the circuit must contain. The generator searches deterministic
   * seed offsets and salted attempts until it finds a playable circuit with
   * every kind, and throws if the combination cannot be assembled.
   */
  requiredKinds?: readonly Piece['kind'][];
}

/**
 * Build a validated circuit. Each rejected attempt advances a deterministic
 * seed offset, so the same seed and level always settle on the same circuit.
 *
 * The layout family is rolled once from its own seed stream. Seeds that do not
 * allow multi-crossing never consume that stream, so their output is unchanged.
 */
export function generateCircuit(
  seed: string,
  level: number,
  options: CircuitOptions = {},
): Circuit {
  const required = [...new Set(options.requiredKinds ?? [])];
  const wanted = new Set(required);
  const requiresCatalog = required.some((kind) => kind !== 'multi-crossing');
  if (wanted.has('multi-crossing') && requiresCatalog) {
    throw new Error(
      'A multi-crossing layout is one whole circuit and cannot be combined with catalog segments',
    );
  }

  const hasRequired = (circuit: Circuit): boolean => {
    if (wanted.size === 0) {
      return true;
    }
    const kinds = new Set(circuit.pieces.map((piece) => piece.kind));
    for (const kind of wanted) {
      if (!kinds.has(kind)) {
        return false;
      }
    }
    return true;
  };

  const failures: string[] = [];
  const tryCircuit = (circuit: Circuit, label: string): Circuit | null => {
    const validation = validateCircuit(circuit);
    if (validation.ok) {
      return circuit;
    }
    failures.push(`${label}: ${validation.reasons.join(', ')}`);
    return null;
  };

  const multiCrossing =
    wanted.has('multi-crossing') ||
    (options.allowMultiCrossing === true &&
      wanted.size === 0 &&
      seededRandom(`${seed}:${level}:layout`)() < MULTI_CROSSING_SHARE);
  if (multiCrossing) {
    for (let offset = 0; offset < MAX_ASSEMBLY_ATTEMPTS; offset += 1) {
      const circuit = assembleMultiCrossingCircuit(
        seed,
        level,
        offset,
        seededRandom(`${seed}:${level}:${offset}:multi-crossing`),
      );
      if (!hasRequired(circuit)) {
        continue;
      }
      const accepted = tryCircuit(circuit, `multi-crossing offset ${offset}`);
      if (accepted) {
        return accepted;
      }
    }
    if (wanted.has('multi-crossing')) {
      throw new Error(
        `Could not assemble a playable multi-crossing circuit for ${seed} at level ${level}: ${failures
          .slice(0, 3)
          .join(' | ')}`,
      );
    }
  }

  // Requirement searches need more independent attempts than one seed offset
  // ladder. Salt 0 is the normal ladder; later salts only run when the caller
  // asked for specific segments.
  const salts = wanted.size > 0 ? 6 : 1;
  for (let salt = 0; salt < salts; salt += 1) {
    for (let offset = 0; offset < MAX_ASSEMBLY_ATTEMPTS; offset += 1) {
      const circuit = assembleCircuit(seed, level, offset, salt);
      if (!hasRequired(circuit)) {
        continue;
      }
      const accepted = tryCircuit(
        circuit,
        salt === 0 ? `offset ${offset}` : `salt ${salt} offset ${offset}`,
      );
      if (accepted) {
        return accepted;
      }
    }
  }
  if (wanted.size > 0) {
    throw new Error(
      `Could not assemble a playable circuit for ${seed} at level ${level} with required segments: ${required.join(
        ', ',
      )}`,
    );
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
        solid: piece.kind !== 'gap',
        halfWidth: piece.widthTaper
          ? piece.widthTaper(t)
          : (piece.halfWidth ?? TRACK_WIDTH / 2),
        rails: piece.kind !== 'gap',
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
