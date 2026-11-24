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
    | 'spiral-down';
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
  layout?: 'polygon' | 'single-crossing' | 'double-crossing';
  pieces: Piece[];
  frameCount: number;
  /** Arc length of a whole-layout circuit; other layouts use their pieces. */
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
/** Extra leg length added when repeated flat features need room. */
const FEATURE_LEG_EXTRA = 30;
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
interface AssemblyConstraints {
  /** Allow a polygon circuit with no vertical loop or loop return. */
  allowLoopless?: boolean;
  /** Allow the single-crossing bridge family. */
  allowSingleCrossing?: boolean;
  /** Force the single-crossing bridge family. */
  forceSingleCrossing?: boolean;
  /** Force the polygon family. */
  forcePolygon?: boolean;
  /** Force the generated two-crossing family. */
  forceDoubleCrossing?: boolean;
  /** Allow a hill crest on the feature leg. */
  allowHill?: boolean;
  /** Allow the jump group on the feature leg. */
  allowJump?: boolean;
  /** Allow an obstacle corridor. */
  allowObstacles?: boolean;
  /** Allow climbs, bridges, ramps, and spirals. */
  allowElevated?: boolean;
  /** Allow the steep sky-jump pair. */
  allowSteep?: boolean;
  /** Minimum piece counts for the elevation planner. */
  elevationMinimums?: Partial<Record<Piece['kind'], number>>;
  /** Minimum piece counts for flat loop/hill/jump/obstacle/bridge features. */
  featureMinimums?: Partial<Record<Piece['kind'], number>>;
  /** Elevation kinds the circuit must not contain. */
  excludedElevation?: readonly Piece['kind'][];
}

function assembleCircuit(
  seed: string,
  level: number,
  seedOffset: number,
  salt = 0,
  constraints: AssemblyConstraints = {},
): Circuit {
  // A requirement search uses salted attempts; salt 0 keeps the original
  // stream so unconstrained seeds assemble exactly as they always did.
  const random = seededRandom(
    salt === 0
      ? `${seed}:${level}:${seedOffset}`
      : `${seed}:${level}:${salt}:${seedOffset}`,
  );
  const allowLoopless = constraints.allowLoopless === true;
  const allowSingleCrossing = constraints.allowSingleCrossing !== false;
  const allowHill = constraints.allowHill !== false;
  const allowJump = constraints.allowJump !== false;
  const allowObstacles = constraints.allowObstacles !== false;
  const allowElevated = constraints.allowElevated !== false;
  const allowSteep = constraints.allowSteep !== false;
  const elevationMinimums = constraints.elevationMinimums ?? {};
  const featureMinimums = constraints.featureMinimums ?? {};
  const excludedElevation = new Set(constraints.excludedElevation ?? []);
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
      | 'jump-down'
      | 'straight';
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

  const doubleCrossing = constraints.forceDoubleCrossing === true;
  if (doubleCrossing) {
    // A two-crossing circuit is generated from the same catalog pieces as the
    // other families. The plan is a self-intersecting octagon: one long chord
    // climbs to a bridge deck and crosses two lower chords, so the route passes
    // over itself exactly twice. The seed picks the vertex order, the mirror,
    // and the scale; the segment planner then places flat features on the
    // remaining edges. Elevation counts are spent on the bridge approach and
    // exit, keeping every climb on the same plan line as the crossing chord.
    const orders: { order: number[]; bridge: number }[] = [
      { order: [0, 1, 2, 5, 6, 7, 4, 3], bridge: 2 },
      { order: [0, 1, 2, 7, 6, 3, 4, 5], bridge: 7 },
      { order: [0, 1, 4, 3, 2, 7, 6, 5], bridge: 4 },
      { order: [0, 1, 4, 5, 6, 3, 2, 7], bridge: 1 },
      { order: [0, 1, 6, 5, 2, 3, 4, 7], bridge: 6 },
      { order: [0, 3, 2, 1, 6, 5, 4, 7], bridge: 3 },
      { order: [0, 3, 4, 5, 2, 1, 6, 7], bridge: 0 },
      { order: [0, 5, 4, 1, 2, 3, 6, 7], bridge: 5 },
    ];
    const picked = orders[Math.floor(random() * orders.length)] ?? orders[0]!;
    const order = picked.order;
    const bridgeEdge = picked.bridge;
    const mirror = random() < 0.5;
    const layoutRadius = Math.max(MIN_TURN_RADIUS, radius * 0.5);
    const n = order.length;
    const unitPoints = Array.from({ length: n }, (_, label) => {
      const angle = (2 * Math.PI * label) / n;
      return new THREE.Vector2(Math.cos(angle), Math.sin(angle));
    });
    const unitLength: number[] = [];
    const turnAngle: number[] = [];
    for (let index = 0; index < n; index += 1) {
      const a = unitPoints[order[(index - 1 + n) % n]!]!;
      const b = unitPoints[order[index]!]!;
      const c = unitPoints[order[(index + 1) % n]!]!;
      unitLength.push(b.distanceTo(c));
      const u = b.clone().sub(a);
      const v = c.clone().sub(b);
      const cross = u.x * v.y - u.y * v.x;
      const dot = u.dot(v);
      const angle = (Math.atan2(cross, dot) * 180) / Math.PI;
      turnAngle.push(mirror ? -angle : angle);
    }
    const tangent = (angle: number): number =>
      layoutRadius * Math.tan((Math.abs(angle) * Math.PI) / 360);

    // Every requested climb is placed on the bridge approach; the descent is
    // chosen from the allowed descent kinds, so a steep climb does not force a
    // matching steep descent. The approach and exit ramps are always present so
    // the first and last spiral clear the lower track.
    const requestedRampUp = Math.max(0, elevationMinimums['ramp-up'] ?? 0);
    const requestedSteepUp = Math.max(
      0,
      elevationMinimums['steep-ramp'] ?? 0,
    );
    const requestedSpiralUp = Math.max(
      0,
      elevationMinimums['spiral-up'] ?? 0,
    );
    const requestedRampDown = Math.max(
      0,
      elevationMinimums['ramp-down'] ?? 0,
    );
    const requestedSteepDown = Math.max(
      0,
      elevationMinimums['steep-ramp-down'] ?? 0,
    );
    const requestedSpiralDown = Math.max(
      0,
      elevationMinimums['spiral-down'] ?? 0,
    );
    const steepRun = steepRampRun(STEEP_RAMP_HEIGHT);
    const rampHeight = BRIDGE_HEIGHT;
    const spiralHeight = BRIDGE_HEIGHT;
    const steepHeight = STEEP_RAMP_HEIGHT;
    let climbHeight =
      rampHeight * (1 + requestedRampUp) +
      steepHeight * requestedSteepUp +
      spiralHeight * requestedSpiralUp;
    let descentHeight =
      rampHeight * (1 + requestedRampDown) +
      steepHeight * requestedSteepDown +
      spiralHeight * requestedSpiralDown;
    let extraSpiralUps = 0;
    while (climbHeight < descentHeight) {
      extraSpiralUps += 1;
      climbHeight += spiralHeight;
    }
    type DescentKind = 'ramp-down' | 'spiral-down' | 'steep-ramp-down';
    const fillDescents: { kind: DescentKind; plan: number }[] = [];
    // Cycle through the allowed descent kinds instead of mirroring the climbs.
    // A steep climb can therefore return on ramps or spirals, and a spiral
    // climb can return on a ramp or a steep descent.
    const descentCycle: DescentKind[] = [
      'ramp-down',
      'spiral-down',
      'ramp-down',
      'steep-ramp-down',
      'spiral-down',
    ];
    let fillHeight = climbHeight - descentHeight;
    let cycleIndex = Math.floor(random() * descentCycle.length);
    while (fillHeight > 0) {
      const kind = descentCycle[cycleIndex % descentCycle.length]!;
      const height = kind === 'steep-ramp-down' ? steepHeight : rampHeight;
      if (height <= fillHeight) {
        fillDescents.push({
          kind,
          plan:
            kind === 'ramp-down'
              ? BRIDGE_RAMP_LENGTH
              : kind === 'steep-ramp-down'
                ? steepRun
                : 0,
        });
        fillHeight -= height;
      }
      cycleIndex += 1;
    }
    const upPlan =
      BRIDGE_RAMP_LENGTH * (1 + requestedRampUp) +
      steepRun * requestedSteepUp;
    const downPlan =
      BRIDGE_RAMP_LENGTH * (1 + requestedRampDown) +
      steepRun * requestedSteepDown +
      fillDescents.reduce((sum, descent) => sum + descent.plan, 0);
    const transitionPlan = upPlan + downPlan;

    const minStraight = 10;
    let size = 0;
    for (let index = 0; index < n; index += 1) {
      const room =
        tangent(turnAngle[index]!) + tangent(turnAngle[(index + 1) % n]!);
      size = Math.max(size, (room + minStraight) / unitLength[index]!);
    }
    size += 6 + random() * 10;
    const bridgeTangentRoom =
      tangent(turnAngle[bridgeEdge]!) +
      tangent(turnAngle[(bridgeEdge + 1) % n]!);
    const bridgeLead = CIRCUIT_LEAD_STRAIGHT;
    const minBridgeDeck = 2 * SPIRAL_RADIUS + TRACK_WIDTH;
    const requiredBridgeStraight =
      transitionPlan +
      bridgeLead * 2 +
      CIRCUIT_BOOST_LENGTH * 2 +
      minBridgeDeck;
    size = Math.max(
      size,
      (requiredBridgeStraight + bridgeTangentRoom) /
        unitLength[bridgeEdge]!,
    );
    const edgeLength = unitLength.map((length) => length * size);
    const straightLength = edgeLength.map(
      (length, index) =>
        length -
        tangent(turnAngle[index]!) -
        tangent(turnAngle[(index + 1) % n]!),
    );

    type PlanSegment = {
      kind: 'straight' | 'boost' | 'bridge' | 'loop' | 'hill' | 'jump' | 'obstacles';
      length: number;
    };
    const loopCount = Math.max(
      0,
      featureMinimums.loop ?? (allowLoopless ? 0 : 1),
    );
    const jumpCount = Math.max(
      featureMinimums.kicker ?? 0,
      featureMinimums.gap ?? 0,
      featureMinimums.landing ?? 0,
    );
    const defaultJump = allowJump && jumpCount === 0 && random() < 0.5;
    const hillCount = Math.max(
      0,
      featureMinimums.hill ??
        (allowHill && !defaultJump && jumpCount === 0 ? 1 : 0),
    );
    const obstacleCount = Math.max(0, featureMinimums.obstacles ?? 0);
    const queue: PlanSegment[] = [];
    for (let index = 0; index < loopCount; index += 1) {
      queue.push({ kind: 'loop', length: LOOP_RETURN_LENGTH });
    }
    for (
      let index = 0;
      index < Math.max(jumpCount, defaultJump ? 1 : 0);
      index += 1
    ) {
      queue.push({ kind: 'jump', length: jumpPlanarLength() });
    }
    for (let index = 0; index < hillCount; index += 1) {
      queue.push({ kind: 'hill', length: HILL_LENGTH });
    }
    for (let index = 0; index < obstacleCount; index += 1) {
      queue.push({ kind: 'obstacles', length: OBSTACLE_SEGMENT_LENGTH });
    }

    const planStraight = (length: number): PlanSegment[] => {
      if (queue.length === 0 || length < CIRCUIT_LEAD_STRAIGHT * 2) {
        return [{ kind: 'straight', length }];
      }
      const features: PlanSegment[] = [];
      let remaining = length - CIRCUIT_LEAD_STRAIGHT;
      let index = 0;
      while (index < queue.length) {
        const feature = queue[index]!;
        if (feature.length <= remaining - CIRCUIT_LEAD_STRAIGHT) {
          features.push(feature);
          queue.splice(index, 1);
          remaining -= feature.length;
        } else {
          index += 1;
        }
      }
      if (features.length === 0) {
        return [{ kind: 'straight', length }];
      }
      return [
        { kind: 'straight', length: CIRCUIT_LEAD_STRAIGHT },
        ...features,
        { kind: 'straight', length: remaining },
      ];
    };

    const edgePlan: PlanSegment[][] = Array.from({ length: n }, () => []);
    const lowerEdges = Array.from({ length: n }, (_, index) => index)
      .filter((index) => index !== bridgeEdge)
      .sort((left, right) => straightLength[right]! - straightLength[left]!);
    for (const edge of lowerEdges) {
      edgePlan[edge] = planStraight(straightLength[edge]!);
    }

    const bridgeLength = straightLength[bridgeEdge]!;
    const boost = CIRCUIT_BOOST_LENGTH;
    const deckLength =
      bridgeLength - bridgeLead * 2 - boost * 2 - transitionPlan;

    const addLayoutTurn = (angle: number, clockwise: boolean): void => {
      const last = pieces[pieces.length - 1];
      const matrix = last
        ? frameAt(last.matrix, last.path, 1)
        : identity.clone();
      pieces.push({
        kind: 'turn',
        path: turnPath(layoutRadius, angle, clockwise),
        length: (layoutRadius * angle * Math.PI) / 180,
        matrix,
        radius: layoutRadius,
        angleDegrees: angle,
      });
    };
    const addSegment = (segment: PlanSegment): void => {
      switch (segment.kind) {
        case 'straight':
          addStraight(segment.length);
          break;
        case 'boost':
          addStraight(segment.length, true);
          break;
        case 'bridge':
          addPiece(
            'bridge',
            bridgeDeckPath(segment.length),
            segment.length,
          );
          break;
        case 'loop':
          addPiece('loop', loopPath(loopRadius), Math.PI * 2 * loopRadius);
          addPiece(
            'shift',
            shiftPath(LOOP_OFFSET, LOOP_RETURN_LENGTH),
            LOOP_RETURN_LENGTH,
          );
          break;
        case 'hill':
          addPiece('hill', hillPath(HILL_LENGTH, HILL_HEIGHT), HILL_LENGTH);
          break;
        case 'jump':
          addJump();
          break;
        case 'obstacles':
          addPiece('obstacles', obstaclesPath(), OBSTACLE_SEGMENT_LENGTH);
          break;
      }
    };
    const addRampUp = (): void => {
      addPiece(
        'ramp-up',
        bridgeRampUpPath(BRIDGE_RAMP_LENGTH, BRIDGE_HEIGHT),
        BRIDGE_RAMP_LENGTH,
      );
    };
    const addRampDown = (): void => {
      addPiece(
        'ramp-down',
        bridgeRampDownPath(BRIDGE_RAMP_LENGTH, BRIDGE_HEIGHT),
        BRIDGE_RAMP_LENGTH,
      );
    };
    const addSteepUp = (): void => {
      addPiece(
        'steep-ramp',
        steepRampUpPath(STEEP_RAMP_HEIGHT),
        steepRun,
      );
      const ramp = pieces[pieces.length - 1];
      if (ramp) {
        ramp.boost = true;
      }
    };
    const addSteepDown = (): void => {
      addPiece(
        'steep-ramp-down',
        steepRampDownPath(STEEP_RAMP_HEIGHT),
        steepRun,
      );
    };
    const addSpiralUp = (): void => {
      addSpiral(
        'spiral-up',
        spiralUpPath(SPIRAL_RADIUS, BRIDGE_HEIGHT, 1),
        spiralArcLength(SPIRAL_RADIUS, BRIDGE_HEIGHT, 1),
        SPIRAL_RADIUS,
        true,
      );
    };
    const addSpiralDown = (): void => {
      addSpiral(
        'spiral-down',
        spiralDownPath(SPIRAL_RADIUS, BRIDGE_HEIGHT, 1),
        spiralArcLength(SPIRAL_RADIUS, BRIDGE_HEIGHT, 1),
        SPIRAL_RADIUS,
        true,
      );
    };

    const sequence = Array.from(
      { length: n },
      (_, index) => (bridgeEdge + index) % n,
    );
    for (let index = 0; index < sequence.length; index += 1) {
      const edge = sequence[index]!;
      if (index > 0) {
        const angle = turnAngle[edge]!;
        addLayoutTurn(Math.abs(angle), angle < 0);
      }
      if (edge === bridgeEdge) {
        addStraight(bridgeLead);
        addRampUp();
        for (let count = 0; count < requestedRampUp; count += 1) {
          addRampUp();
        }
        for (let count = 0; count < requestedSteepUp; count += 1) {
          addSteepUp();
        }
        for (let count = 0; count < requestedSpiralUp; count += 1) {
          addSpiralUp();
        }
        for (let count = 0; count < extraSpiralUps; count += 1) {
          addSpiralUp();
        }
        addStraight(boost, true);
        addPiece('bridge', bridgeDeckPath(deckLength), deckLength);
        addStraight(boost, true);
        for (const descent of fillDescents) {
          if (descent.kind === 'ramp-down') {
            addRampDown();
          } else if (descent.kind === 'steep-ramp-down') {
            addSteepDown();
          } else {
            addSpiralDown();
          }
        }
        for (let count = 0; count < requestedSpiralDown; count += 1) {
          addSpiralDown();
        }
        for (let count = 0; count < requestedSteepDown; count += 1) {
          addSteepDown();
        }
        for (let count = 0; count < requestedRampDown; count += 1) {
          addRampDown();
        }
        addRampDown();
        addStraight(bridgeLead);
      } else {
        for (const segment of edgePlan[edge]!) {
          addSegment(segment);
        }
      }
    }
    const closeAngle = turnAngle[bridgeEdge]!;
    addLayoutTurn(Math.abs(closeAngle), closeAngle < 0);

    return {
      seed,
      level,
      seedOffset,
      layout: 'double-crossing',
      pieces,
      frameCount: pieces.reduce(
        (count, piece) => count + Math.ceil(piece.length / 0.4),
        0,
      ),
    };
  }

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

  // Always consume the rolls so an unconstrained seed keeps its old stream.
  const jumpRoll = random();
  const jump = allowJump && (!allowHill || jumpRoll < 0.5);
  const noHillOrJump = !allowHill && !allowJump;
  const singleCrossoverRoll = random();
  const singleCrossover =
    constraints.forceSingleCrossing === true
      ? true
      : constraints.forcePolygon === true
        ? false
        : allowSingleCrossing &&
          !allowLoopless &&
          singleCrossoverRoll < 0.5;

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
    const featureLength = noHillOrJump
      ? 0
      : jump
        ? jumpPlanarLength()
        : HILL_LENGTH;
    if (!noHillOrJump) {
      if (jump) {
        addJump();
      } else {
        addPiece('hill', hillPath(HILL_LENGTH, HILL_HEIGHT), HILL_LENGTH);
      }
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
    const singleCrossoverObstacleRoll = random();
    const singleCrossoverObstacle =
      allowObstacles && singleCrossoverObstacleRoll < 0.4;
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
  const skyJumpRoll = random();
  const skyJump = allowSteep && corners >= 4 && skyJumpRoll < 0.3;
  const jumpFeatureKinds = ['kicker', 'gap', 'landing'] as const;
  const jumpMinimums = jumpFeatureKinds.map(
    (kind) => featureMinimums[kind],
  );
  const jumpSpecified = jumpMinimums.some(
    (minimum) => minimum !== undefined,
  );
  const jumpCount = jumpSpecified
    ? Math.max(...jumpMinimums.map((minimum) => minimum ?? 0))
    : allowJump && jump
      ? 1
      : 0;
  const hillCount =
    featureMinimums.hill ?? (allowHill && !jump ? 1 : 0);
  const loopCount = Math.max(
    featureMinimums.loop ?? (allowLoopless ? 0 : 1),
    featureMinimums.shift ?? 0,
  );
  const obstacleCount = featureMinimums.obstacles ?? 0;
  const bridgeCount = featureMinimums.bridge ?? 0;
  const defaultLoop = allowLoopless ? 0 : 1;
  const defaultHill = allowHill && !jump ? 1 : 0;
  const defaultJump = allowJump && jump ? 1 : 0;
  const loopExtras = Math.max(0, loopCount - defaultLoop);
  const hillExtras = Math.max(0, hillCount - defaultHill);
  const jumpExtras = Math.max(0, jumpCount - defaultJump);
  const obstacleExtras = obstacleCount;
  const bridgeExtras = bridgeCount;
  const flatExtraPlan =
    loopExtras * LOOP_RETURN_LENGTH +
    hillExtras * HILL_LENGTH +
    jumpExtras * jumpPlanarLength() +
    obstacleExtras * OBSTACLE_SEGMENT_LENGTH +
    bridgeExtras * BRIDGE_FLAT_LENGTH;
  const elevationExtra = Object.values(elevationMinimums).some(
    (minimum) => (minimum ?? 0) > 1,
  )
    ? Math.max(FEATURE_LEG_EXTRA, 60)
    : 0;
  const featureExtra =
    flatExtraPlan > 0
      ? Math.max(
          FEATURE_LEG_EXTRA,
          elevationExtra,
          Math.ceil(flatExtraPlan / corners),
        )
      : elevationExtra;
  const useExtraFeatures = flatExtraPlan > 0;
  const legBase =
    CIRCUIT_LEG_BASE +
    pick(straights) +
    (skyJump ? SKY_JUMP_LEG_EXTRA : 0) +
    featureExtra;
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
  const elevatedRoll = random();
  const elevated =
    allowElevated &&
    corners >= 4 &&
    (Object.keys(elevationMinimums).length > 0 || elevatedRoll < 0.75);
  const reservedLegs = new Set<number>();
  if (!allowLoopless) {
    reservedLegs.add(loopLeg);
  }
  if (!noHillOrJump) {
    reservedLegs.add(hillLeg);
  }
  const freeLegs = legs
    .map((_, index) => index)
    .filter((index) => !reservedLegs.has(index));
  const defaultFeaturePlan = (index: number): number =>
    index === loopLeg && !allowLoopless
      ? LOOP_RETURN_LENGTH
      : index === hillLeg && !noHillOrJump
        ? jump
          ? jumpPlanarLength()
          : HILL_LENGTH
        : 0;
  const transitions = new Map<number, Transition[]>();

  if (elevated && freeLegs.length >= 2) {
    const steepUpPlan = skyJumpPlanarLength();
    const steepDownPlan = steepRampRun(STEEP_RAMP_HEIGHT);
    const transitionAvailable = (legIndex: number): number =>
      (legs[legIndex] ?? 0) -
      CIRCUIT_LEAD_STRAIGHT -
      (boostLegs.has(legIndex) ? CIRCUIT_BOOST_LENGTH : 0);

    type ElevationKind =
      | 'ramp-up'
      | 'ramp-down'
      | 'spiral-up'
      | 'spiral-down'
      | 'jump-down'
      | 'steep-jump'
      | 'steep-ramp-down';
    interface ElevationChoice {
      kind: ElevationKind;
      levels: 1 | 2 | 4;
      plan: number;
    }
    interface ElevationPlan {
      ups: ElevationChoice[];
      downs: ElevationChoice[];
    }
    interface ElevationAssignment {
      ups: { choice: ElevationChoice; leg: number }[];
      downs: { choice: ElevationChoice; leg: number }[];
    }

    const upChoices: ElevationChoice[] = [];
    const downChoices: ElevationChoice[] = [];
    const pieceKindOf = (choice: ElevationChoice): Piece['kind'] | null =>
      choice.kind === 'steep-jump'
        ? 'steep-ramp'
        : choice.kind === 'jump-down'
          ? null
          : choice.kind;
    if (allowElevated) {
      if (!excludedElevation.has('ramp-up')) {
        upChoices.push({
          kind: 'ramp-up',
          levels: 1,
          plan: BRIDGE_RAMP_LENGTH,
        });
        upChoices.push({
          kind: 'ramp-up',
          levels: 2,
          plan: BRIDGE_RAMP_LENGTH * 2,
        });
      }
      if (!excludedElevation.has('spiral-up')) {
        upChoices.push({ kind: 'spiral-up', levels: 1, plan: 0 });
        upChoices.push({ kind: 'spiral-up', levels: 2, plan: 0 });
      }
      if (allowSteep && !excludedElevation.has('steep-ramp')) {
        upChoices.push({
          kind: 'steep-jump',
          levels: 4,
          plan: steepUpPlan,
        });
      }
      if (!excludedElevation.has('ramp-down')) {
        downChoices.push({
          kind: 'ramp-down',
          levels: 1,
          plan: BRIDGE_RAMP_LENGTH,
        });
        downChoices.push({
          kind: 'ramp-down',
          levels: 2,
          plan: BRIDGE_RAMP_LENGTH * 2,
        });
      }
      if (!excludedElevation.has('spiral-down')) {
        downChoices.push({ kind: 'spiral-down', levels: 1, plan: 0 });
        downChoices.push({ kind: 'spiral-down', levels: 2, plan: 0 });
      }
      if (allowJump) {
        downChoices.push({
          kind: 'jump-down',
          levels: 1,
          plan: downJumpPlanarLength(1),
        });
        downChoices.push({
          kind: 'jump-down',
          levels: 2,
          plan: downJumpPlanarLength(2),
        });
      }
      if (allowSteep && !excludedElevation.has('steep-ramp-down')) {
        downChoices.push({
          kind: 'steep-ramp-down',
          levels: 4,
          plan: steepDownPlan,
        });
      }
    }

    const partitionsFor = (total: number): (1 | 2 | 4)[][] => {
      const result: (1 | 2 | 4)[][] = [];
      const walk = (
        remaining: number,
        minimum: 1 | 2 | 4,
        prefix: (1 | 2 | 4)[],
      ): void => {
        if (remaining === 0) {
          result.push([...prefix]);
          return;
        }
        for (const level of [1, 2, 4] as const) {
          if (level < minimum || level > remaining) {
            continue;
          }
          walk(remaining - level, level, [...prefix, level]);
        }
      };
      walk(total, 1, []);
      return result;
    };
    const combinations = <T,>(
      options: T[][],
      index = 0,
      prefix: T[] = [],
    ): T[][] => {
      if (index >= options.length) {
        return [prefix];
      }
      const result: T[][] = [];
      for (const option of options[index] ?? []) {
        result.push(...combinations(options, index + 1, [...prefix, option]));
      }
      return result;
    };
    const choicesFor = (
      choices: ElevationChoice[],
      levels: (1 | 2 | 4)[],
    ): ElevationChoice[][] =>
      levels.map((level) =>
        choices.filter((choice) => choice.levels === level),
      );

    let maxLevels = 4;
    for (const [kind, minimum] of Object.entries(elevationMinimums)) {
      if (!minimum) {
        continue;
      }
      const levelsPerPiece =
        kind === 'steep-ramp' || kind === 'steep-ramp-down' ? 4 : 1;
      maxLevels = Math.max(maxLevels, minimum * levelsPerPiece);
    }
    maxLevels = Math.min(8, Math.max(4, maxLevels));

    const upMinimums = Object.entries(elevationMinimums).filter(
      ([kind]) =>
        upChoices.some((choice) => pieceKindOf(choice) === kind),
    );
    const downMinimums = Object.entries(elevationMinimums).filter(
      ([kind]) =>
        downChoices.some((choice) => pieceKindOf(choice) === kind),
    );
    const partitionCanSatisfy = (
      levels: (1 | 2 | 4)[],
      choices: ElevationChoice[],
      minimums: [string, number | undefined][],
    ): boolean =>
      minimums.every(([kind, minimum]) => {
        if (!minimum) {
          return true;
        }
        const slots = levels.filter((level) =>
          choices.some(
            (choice) =>
              pieceKindOf(choice) === kind && choice.levels === level,
          ),
        ).length;
        return slots >= minimum;
      });

    const plans: ElevationPlan[] = [];
    for (let total = 1; total <= maxLevels; total += 1) {
      for (const upLevels of partitionsFor(total)) {
        for (const downLevels of partitionsFor(total)) {
          if (
            !partitionCanSatisfy(upLevels, upChoices, upMinimums) ||
            !partitionCanSatisfy(downLevels, downChoices, downMinimums)
          ) {
            continue;
          }
          const upGroups = choicesFor(upChoices, upLevels);
          const downGroups = choicesFor(downChoices, downLevels);
          if (
            upGroups.some((group) => group.length === 0) ||
            downGroups.some((group) => group.length === 0)
          ) {
            continue;
          }
          for (const ups of combinations(upGroups)) {
            for (const downs of combinations(downGroups)) {
              if (ups.length + downs.length > freeLegs.length) {
                continue;
              }
              const used = new Map<Piece['kind'], number>();
              for (const choice of [...ups, ...downs]) {
                const kind = pieceKindOf(choice);
                if (kind) {
                  used.set(kind, (used.get(kind) ?? 0) + 1);
                }
              }
              if (
                Object.entries(elevationMinimums).some(
                  ([kind, minimum]) =>
                    minimum !== undefined &&
                    (used.get(kind as Piece['kind']) ?? 0) < minimum,
                )
              ) {
                continue;
              }
              plans.push({ ups, downs });
            }
          }
        }
      }
    }

    // A pre-rolled sky-jump seed prefers a steep climb; the descent can be any
    // combination of allowed drops, including two 2-level spirals.
    let preferred = plans;
    if (skyJump) {
      const steep = plans.filter((plan) =>
        plan.ups.some((choice) => choice.kind === 'steep-jump'),
      );
      if (steep.length > 0) {
        preferred = steep;
      }
    } else if (
      freeLegs.length >= 3 &&
      Object.keys(elevationMinimums).length === 0 &&
      random() < 0.5
    ) {
      // Keep the old mix of one- and two-level spirals in one circuit when
      // there is room and no rule forces a particular elevation.
      const mixed = plans.filter((plan) => {
        const spirals = [...plan.ups, ...plan.downs].filter(
          (choice) =>
            choice.kind === 'spiral-up' ||
            choice.kind === 'spiral-down',
        );
        return (
          spirals.some((choice) => choice.levels === 1) &&
          spirals.some((choice) => choice.levels === 2)
        );
      });
      if (mixed.length > 0) {
        preferred = mixed;
      }
    }

    const legSets = (count: number): number[][] => {
      const result: number[][] = [];
      const walk = (start: number, chosen: number[]): void => {
        if (chosen.length === count) {
          result.push([...chosen]);
          return;
        }
        for (let index = start; index < freeLegs.length; index += 1) {
          walk(index + 1, [...chosen, freeLegs[index]!]);
        }
      };
      walk(0, []);
      return result;
    };

    const assignments: ElevationAssignment[] = [];
    for (const plan of preferred) {
      const count = plan.ups.length + plan.downs.length;
      if (count === 0) {
        continue;
      }
      for (const legSet of legSets(count)) {
        const upLegs = [...legSet.slice(0, plan.ups.length)].sort(
          (a, b) => transitionAvailable(b) - transitionAvailable(a),
        );
        const downLegs = [...legSet.slice(plan.ups.length)].sort(
          (a, b) => transitionAvailable(b) - transitionAvailable(a),
        );
        const ups = [...plan.ups]
          .sort((a, b) => b.plan - a.plan)
          .map((choice, index) => ({ choice, leg: upLegs[index]! }));
        const downs = [...plan.downs]
          .sort((a, b) => b.plan - a.plan)
          .map((choice, index) => ({ choice, leg: downLegs[index]! }));
        if (
          ups.every(
            ({ choice, leg }) =>
              choice.plan <= transitionAvailable(leg),
          ) &&
          downs.every(
            ({ choice, leg }) =>
              choice.plan <= transitionAvailable(leg),
          )
        ) {
          assignments.push({ ups, downs });
        }
      }
    }

    const makeTransition = (choice: ElevationChoice): Transition => {
      const height = BRIDGE_HEIGHT * choice.levels;
      if (choice.kind === 'steep-jump') {
        return {
          kind: 'steep-jump',
          path: gapPath(),
          length: steepUpPlan,
          plan: steepUpPlan,
        };
      }
      if (choice.kind === 'steep-ramp-down') {
        return {
          kind: 'steep-ramp-down',
          path: steepRampDownPath(STEEP_RAMP_HEIGHT),
          length: steepDownPlan,
          plan: steepDownPlan,
        };
      }
      if (choice.kind === 'jump-down') {
        return {
          kind: 'jump-down',
          path: gapPath(),
          length:
            JUMP_KICKER_LENGTH +
            JUMP_GAP_LENGTH +
            downJumpLandingLength(choice.levels as 1 | 2),
          plan: downJumpPlanarLength(choice.levels as 1 | 2),
          stageLevels: choice.levels as 1 | 2,
        };
      }
      if (choice.kind === 'ramp-up' || choice.kind === 'ramp-down') {
        const length = BRIDGE_RAMP_LENGTH * choice.levels;
        return {
          kind: choice.kind,
          path:
            choice.kind === 'ramp-up'
              ? bridgeRampUpPath(length, height)
              : bridgeRampDownPath(length, height),
          length,
          plan: length,
        };
      }
      return {
        kind: choice.kind,
        path:
          choice.kind === 'spiral-up'
            ? spiralUpPath(
                SPIRAL_RADIUS,
                height,
                choice.levels as 1 | 2,
              )
            : spiralDownPath(
                SPIRAL_RADIUS,
                height,
                choice.levels as 1 | 2,
              ),
        length: spiralArcLength(
          SPIRAL_RADIUS,
          height,
          choice.levels as 1 | 2,
        ),
        plan: 0,
      };
    };

    if (assignments.length > 0) {
      const assignment =
        assignments[Math.floor(random() * assignments.length)]!;
      for (const { choice, leg } of assignment.ups) {
        transitions.set(leg, [makeTransition(choice)]);
      }
      for (const { choice, leg } of assignment.downs) {
        transitions.set(leg, [makeTransition(choice)]);
      }
    } else {
      // High counts need more transitions than there are free legs. Put a
      // balanced climb/descent group on a leg, return to the base height, and
      // repeat on later legs. This is the "per-leg pair" fallback.
      const remaining = new Map<Piece['kind'], number>();
      for (const [kind, minimum] of Object.entries(elevationMinimums)) {
        if (minimum !== undefined && minimum > 0) {
          remaining.set(kind as Piece['kind'], minimum);
        }
      }
      const consume = (choice: ElevationChoice): void => {
        const kind = pieceKindOf(choice);
        if (kind) {
          remaining.set(
            kind,
            Math.max(0, (remaining.get(kind) ?? 0) - 1),
          );
        }
      };
      const choose = <T,>(values: T[]): T | null =>
        values.length > 0
          ? values[Math.floor(random() * values.length)]!
          : null;
      const pickDowns = (
        levels: 1 | 2 | 4,
      ): ElevationChoice[] | null => {
        const single = downChoices.filter(
          (choice) => choice.levels === levels,
        );
        const preferred = single.filter((choice) => {
          const kind = pieceKindOf(choice);
          return kind !== null && (remaining.get(kind) ?? 0) > 0;
        });
        const one = choose(preferred.length > 0 ? preferred : single);
        if (one) {
          consume(one);
          return [one];
        }
        for (const partition of partitionsFor(levels)) {
          const groups = choicesFor(downChoices, partition);
          if (groups.some((group) => group.length === 0)) {
            continue;
          }
          const combo = choose(combinations(groups));
          if (combo) {
            combo.forEach(consume);
            return combo;
          }
        }
        return null;
      };
      const pickUps = (
        levels: 1 | 2 | 4,
      ): ElevationChoice[] | null => {
        const single = upChoices.filter(
          (choice) => choice.levels === levels,
        );
        const preferred = single.filter((choice) => {
          const kind = pieceKindOf(choice);
          return kind !== null && (remaining.get(kind) ?? 0) > 0;
        });
        const one = choose(preferred.length > 0 ? preferred : single);
        if (one) {
          consume(one);
          return [one];
        }
        for (const partition of partitionsFor(levels)) {
          const groups = choicesFor(upChoices, partition);
          if (groups.some((group) => group.length === 0)) {
            continue;
          }
          const combo = choose(combinations(groups));
          if (combo) {
            combo.forEach(consume);
            return combo;
          }
        }
        return null;
      };
      const spacer = (length: number): Transition => ({
        kind: 'straight',
        path: straightPath(length),
        length,
        plan: length,
      });
      const spiralSpacer = 2 * SPIRAL_RADIUS + 12;
      const groups: { transitions: Transition[]; plan: number }[] = [];
      for (const [kind, minimum] of [...remaining]) {
        const ups = upChoices
          .filter((choice) => pieceKindOf(choice) === kind)
          .sort((a, b) => b.levels - a.levels);
        if (ups.length === 0) {
          continue;
        }
        for (let index = 0; index < minimum; index += 1) {
          const up = choose(ups);
          if (!up) {
            break;
          }
          consume(up);
          const downs = pickDowns(up.levels);
          if (!downs) {
            break;
          }
          const groupTransitions = [
            makeTransition(up),
            ...(up.kind === 'spiral-up' ||
            downs.some((choice) => choice.kind === 'spiral-down')
              ? [spacer(spiralSpacer)]
              : []),
            ...downs.map(makeTransition),
          ];
          groups.push({
            transitions: groupTransitions,
            plan: groupTransitions.reduce(
              (total, transition) => total + transition.plan,
              0,
            ),
          });
        }
      }
      for (const [kind, minimum] of [...remaining]) {
        const downs = downChoices
          .filter((choice) => pieceKindOf(choice) === kind)
          .sort((a, b) => b.levels - a.levels);
        if (downs.length === 0 || minimum <= 0) {
          continue;
        }
        for (let index = 0; index < minimum; index += 1) {
          const down = choose(downs);
          if (!down) {
            break;
          }
          consume(down);
          const ups = pickUps(down.levels);
          if (!ups) {
            break;
          }
          const groupTransitions = [
            ...ups.map(makeTransition),
            ...(ups.some((choice) => choice.kind === 'spiral-up') ||
            down.kind === 'spiral-down'
              ? [spacer(spiralSpacer)]
              : []),
            makeTransition(down),
          ];
          groups.push({
            transitions: groupTransitions,
            plan: groupTransitions.reduce(
              (total, transition) => total + transition.plan,
              0,
            ),
          });
        }
      }
      if (groups.length > 0 && groups.length <= legs.length) {
        const available = legs.map(
          (leg, index) =>
            leg -
            CIRCUIT_LEAD_STRAIGHT -
            defaultFeaturePlan(index) -
            (boostLegs.has(index) ? CIRCUIT_BOOST_LENGTH : 0),
        );
        const used = new Set<number>();
        groups.sort((a, b) => b.plan - a.plan);
        let ok = true;
        for (const group of groups) {
          const candidates = legs
            .map((_, index) => index)
            .filter(
              (index) =>
                !used.has(index) &&
                (available[index] ?? 0) >= group.plan,
            );
          if (candidates.length === 0) {
            ok = false;
            break;
          }
          const leg =
            candidates[Math.floor(random() * candidates.length)]!;
          used.add(leg);
          available[leg] = (available[leg] ?? 0) - group.plan;
          transitions.set(leg, group.transitions);
        }
        if (!ok) {
          transitions.clear();
        }
      }
    }
  }

  interface FlatFeature {
    kind: 'loop' | 'hill' | 'jump' | 'obstacles' | 'bridge';
    plan: number;
    add: () => void;
  }
  const flatFeatures: FlatFeature[] = [];
  for (let index = 0; index < loopExtras; index += 1) {
    flatFeatures.push({
      kind: 'loop',
      plan: LOOP_RETURN_LENGTH,
      add: () => {
        addPiece('loop', loopPath(loopRadius), Math.PI * 2 * loopRadius);
        addPiece(
          'shift',
          shiftPath(LOOP_OFFSET, LOOP_RETURN_LENGTH),
          LOOP_RETURN_LENGTH,
        );
      },
    });
  }
  for (let index = 0; index < hillExtras; index += 1) {
    flatFeatures.push({
      kind: 'hill',
      plan: HILL_LENGTH,
      add: () => {
        addPiece('hill', hillPath(HILL_LENGTH, HILL_HEIGHT), HILL_LENGTH);
      },
    });
  }
  for (let index = 0; index < jumpExtras; index += 1) {
    flatFeatures.push({
      kind: 'jump',
      plan: jumpPlanarLength(),
      add: () => addJump(),
    });
  }
  for (let index = 0; index < obstacleExtras; index += 1) {
    flatFeatures.push({
      kind: 'obstacles',
      plan: OBSTACLE_SEGMENT_LENGTH,
      add: () => {
        addPiece('obstacles', obstaclesPath(), OBSTACLE_SEGMENT_LENGTH);
      },
    });
  }
  for (let index = 0; index < bridgeExtras; index += 1) {
    flatFeatures.push({
      kind: 'bridge',
      plan: BRIDGE_FLAT_LENGTH,
      add: () => {
        addPiece(
          'bridge',
          bridgeDeckPath(BRIDGE_FLAT_LENGTH),
          BRIDGE_FLAT_LENGTH,
        );
      },
    });
  }
  const featureBudgets = legs.map(
    (leg, index) =>
      leg -
      CIRCUIT_LEAD_STRAIGHT -
      defaultFeaturePlan(index) -
      (boostLegs.has(index) ? CIRCUIT_BOOST_LENGTH : 0) -
      (transitions.get(index) ?? []).reduce(
        (total, transition) => total + transition.plan,
        0,
      ),
  );
  const extraFeaturesByLeg: FlatFeature[][] = legs.map(() => []);
  flatFeatures.sort((a, b) => b.plan - a.plan);
  for (const feature of flatFeatures) {
    const candidates = featureBudgets
      .map((budget, index) => (budget >= feature.plan ? index : -1))
      .filter((index) => index >= 0);
    if (candidates.length === 0) {
      continue;
    }
    const leg =
      candidates[Math.floor(random() * candidates.length)]!;
    featureBudgets[leg] = featureBudgets[leg]! - feature.plan;
    extraFeaturesByLeg[leg]!.push(feature);
  }

  // Up to one obstacle corridor per circuit, chosen during the leg loop below.
  let obstacleHost: number | null = null;

  legs.forEach((leg, index) => {
    const featurePlan = defaultFeaturePlan(index);
    const extraFeatures = extraFeaturesByLeg[index] ?? [];
    const extraPlan = extraFeatures.reduce(
      (total, feature) => total + feature.plan,
      0,
    );
    const boost = boostLegs.has(index) ? CIRCUIT_BOOST_LENGTH : 0;
    const transitionList = transitions.get(index) ?? [];
    const transitionPlan = transitionList.reduce(
      (total, transition) => total + transition.plan,
      0,
    );
    // At most one obstacle corridor per circuit. The decision is made on the
    // first leg that can carry one: it must not be the grid, the loop or hill
    // leg, or a climb/descent leg, and it must have room in its pad. A boost
    // strip is allowed on the same leg: the block corridor is placed just
    // before the strip, so a car clears the blocks and is boosted out.
    // Deciding here, inside the final assembly loop, means the obstacle never
    // shrinks the pool of free legs that elevation and boosts draw from, so a
    // seed with no obstacles assembles exactly as it always did.
    if (
      allowObstacles &&
      !useExtraFeatures &&
      obstacleHost === null &&
      index !== 0 &&
      index !== loopLeg &&
      index !== hillLeg &&
      transitionPlan === 0 &&
      leg - CIRCUIT_LEAD_STRAIGHT - featurePlan - boost - transitionPlan >=
        OBSTACLE_SEGMENT_LENGTH &&
      random() < 0.45
    ) {
      obstacleHost = index;
    }
    const obstacle =
      !useExtraFeatures && obstacleHost === index
        ? OBSTACLE_SEGMENT_LENGTH
        : 0;
    const pad =
      leg -
      CIRCUIT_LEAD_STRAIGHT -
      featurePlan -
      boost -
      transitionPlan -
      obstacle -
      extraPlan;

    addStraight(CIRCUIT_LEAD_STRAIGHT);
    for (const transition of transitionList) {
      addTransition(transition);
    }
    if (index === loopLeg && !allowLoopless) {
      addPiece('loop', loopPath(loopRadius), Math.PI * 2 * loopRadius);
      addPiece(
        'shift',
        shiftPath(LOOP_OFFSET, LOOP_RETURN_LENGTH),
        LOOP_RETURN_LENGTH,
      );
    } else if (index === hillLeg && !noHillOrJump) {
      // A leg carries either a crest or a jump. Both fill the same planned
      // deck budget, so the leg closes whichever feature the seed chooses.
      if (jump) {
        addJump();
      } else {
        addPiece('hill', hillPath(HILL_LENGTH, HILL_HEIGHT), HILL_LENGTH);
      }
    }
    for (const feature of extraFeatures) {
      feature.add();
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
export interface CircuitValidationOptions {
  /** Allow a catalog circuit with no vertical loop (explicit loop exclusion). */
  allowLoopless?: boolean;
}

export function validateCircuit(
  circuit: Circuit,
  options: CircuitValidationOptions = {},
): CircuitValidation {
  const reasons = new Set<string>();

  const loops = circuit.pieces.filter((piece) => piece.kind === 'loop').length;
  const turns = circuit.pieces.filter((piece) => piece.kind === 'turn').length;
  // A steep ramp is a boost strip too, even though its piece kind is not
  // 'boost'. Count both so every layout is held to the same rule.
  const boosts = circuit.pieces.filter(
    (piece) => piece.kind === 'boost' || piece.boost === true,
  ).length;
  if (!options.allowLoopless && loops < 1) {
    reasons.add('missing a vertical loop');
  }
  if (turns < 2) {
    reasons.add('needs at least two banked turns');
  }
  if (boosts < 2) {
    reasons.add('needs at least two boost strips');
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
 * Options for circuit generation. The crossovers option forces a whole-layout
 * family; otherwise the seed picks polygon, single-crossing, or double-crossing.
 */
export interface CircuitOptions {
  /**
   * Piece kinds the circuit must contain. The generator searches deterministic
   * seed offsets and salted attempts until it finds a playable circuit with
   * every kind, and throws if the combination cannot be assembled.
   */
  requiredKinds?: readonly Piece['kind'][];
  /**
   * Piece kinds the circuit must not contain. Structural kinds (straight,
   * turn, boost) cannot be excluded. Excluding loop or shift produces a
   * loopless polygon circuit.
   */
  excludedKinds?: readonly Piece['kind'][];
  /**
   * Minimum piece counts. A positive value requires at least that many pieces
   * of the kind; zero means "0 or more" and adds no rule.
   */
  minimumCounts?: Partial<Record<Piece['kind'], number>>;
  /**
   * Force the plan-view crossing count: 0 for a polygon, 1 for the
   * single-crossing bridge, or 2 for the two-crossing layout. Omit to let the
   * seed choose.
   */
  crossovers?: 0 | 1 | 2;
}

/**
 * Build a validated circuit. Each rejected attempt advances a deterministic
 * seed offset, so the same seed and level always settle on the same circuit.
 *
 * The layout family is rolled once from its own seed stream. Seeds that do not
 */
export function generateCircuit(
  seed: string,
  level: number,
  options: CircuitOptions = {},
): Circuit {
  const fail = (reason: string): never => {
    throw new Error(`Cannot fit the selected segment rules: ${reason}`);
  };
  const forbidden = new Set(options.excludedKinds ?? []);
  const counts = new Map<Piece['kind'], number>();
  for (const kind of options.requiredKinds ?? []) {
    if (forbidden.has(kind)) {
      fail(`${kind} is both required and excluded`);
    }
    counts.set(kind, 1);
  }
  for (const [kind, value] of Object.entries(
    options.minimumCounts ?? {},
  ) as [Piece['kind'], number | undefined][]) {
    if (value === undefined) {
      continue;
    }
    const count = Math.floor(value);
    if (!Number.isFinite(count) || count < 0) {
      fail(`${kind} needs a whole, non-negative minimum`);
    }
    // A minimum of 0 means "0 or more": it adds no rule and never excludes a
    // kind. The planner may still add it when the route needs it.
    if (count > 0) {
      counts.set(kind, count);
    }
  }

  for (const kind of ['straight', 'turn', 'boost'] as const) {
    if (forbidden.has(kind)) {
      fail(`${kind} is structural and cannot be excluded`);
    }
  }
  const loopCount = counts.get('loop') ?? 0;
  const shiftCount = counts.get('shift') ?? 0;
  const excludeLoop = forbidden.has('loop') || forbidden.has('shift');
  if (excludeLoop && (loopCount > 0 || shiftCount > 0)) {
    fail('loop and loop return must be included or excluded together');
  }
  const bridgeCount = counts.get('bridge') ?? 0;
  if (bridgeCount > 0 && excludeLoop) {
    fail('a bridge deck needs the loop it threads');
  }
  const jumpKinds = ['kicker', 'gap', 'landing'] as const;
  if (
    jumpKinds.some((kind) => (counts.get(kind) ?? 0) > 0) &&
    jumpKinds.some((kind) => forbidden.has(kind))
  ) {
    fail('the jump launch, gap, and landing must be included or excluded together');
  }
  if ((counts.get('boost') ?? 0) > 2) {
    fail('a catalog circuit carries at most two boost strips');
  }
  const flatRepeatKinds: Piece['kind'][] = [
    'loop',
    'shift',
    'hill',
    'obstacles',
    'bridge',
    ...jumpKinds,
  ];
  const hasRepeatedFlatFeature = flatRepeatKinds.some(
    (kind) => (counts.get(kind) ?? 0) > 1,
  );
  const plannerElevationKinds: Piece['kind'][] = [
    'spiral-up',
    'spiral-down',
    'ramp-up',
    'ramp-down',
    'steep-ramp',
    'steep-ramp-down',
  ];

  const hasSatisfied = (circuit: Circuit): boolean => {
    if (counts.size === 0) {
      return true;
    }
    const actual = new Map<Piece['kind'], number>();
    for (const piece of circuit.pieces) {
      actual.set(piece.kind, (actual.get(piece.kind) ?? 0) + 1);
    }
    for (const [kind, minimum] of counts) {
      const count = actual.get(kind) ?? 0;
      if (count < minimum) {
        return false;
      }
    }
    return true;
  };

  const elevationKinds: Piece['kind'][] = [
    'spiral-up',
    'spiral-down',
    'bridge',
    'ramp-up',
    'ramp-down',
    'steep-ramp',
    'steep-ramp-down',
  ];
  const elevationMinimums: Partial<Record<Piece['kind'], number>> = {};
  for (const kind of plannerElevationKinds) {
    const minimum = counts.get(kind);
    if (minimum !== undefined && minimum > 0) {
      elevationMinimums[kind] = minimum;
    }
  }
  const flatFeatureKinds: Piece['kind'][] = [
    'loop',
    'shift',
    'hill',
    'kicker',
    'gap',
    'landing',
    'obstacles',
    'bridge',
  ];
  const featureMinimums: Partial<Record<Piece['kind'], number>> = {};
  for (const kind of flatFeatureKinds) {
    const minimum = counts.get(kind);
    if (minimum !== undefined && minimum > 0) {
      featureMinimums[kind] = minimum;
    }
  }
  const crossovers = options.crossovers;
  const constraints: AssemblyConstraints = {
    allowLoopless: excludeLoop,
    forceSingleCrossing: crossovers === 1,
    forcePolygon: crossovers === 0,
    forceDoubleCrossing: crossovers === 2,
    allowSingleCrossing:
      crossovers === 1
        ? true
        : crossovers === 0
          ? false
          : !forbidden.has('bridge') &&
            !excludeLoop &&
            !hasRepeatedFlatFeature,
    allowHill: !forbidden.has('hill'),
    allowJump: !jumpKinds.some((kind) => forbidden.has(kind)),
    allowObstacles: !forbidden.has('obstacles'),
    allowElevated: !elevationKinds.every((kind) => forbidden.has(kind)),
    allowSteep:
      !forbidden.has('steep-ramp') ||
      !forbidden.has('steep-ramp-down'),
    elevationMinimums,
    featureMinimums,
    excludedElevation: [...forbidden].filter((kind) =>
      plannerElevationKinds.includes(kind),
    ),
  };

  const failures: string[] = [];
  const tryCircuit = (circuit: Circuit, label: string): Circuit | null => {
    const validation = validateCircuit(circuit, {
      allowLoopless: constraints.allowLoopless === true,
    });
    if (validation.ok) {
      return circuit;
    }
    failures.push(`${label}: ${validation.reasons.join(', ')}`);
    return null;
  };

  // Rule searches need more independent attempts than one seed offset ladder.
  // Salt 0 is the normal ladder; later salts only run when the caller asked
  // for specific segments.
  const salts = counts.size > 0 ? 6 : 1;
  for (let salt = 0; salt < salts; salt += 1) {
    for (let offset = 0; offset < MAX_ASSEMBLY_ATTEMPTS; offset += 1) {
      const circuit = assembleCircuit(seed, level, offset, salt, constraints);
      if (!hasSatisfied(circuit)) {
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
  if (counts.size > 0) {
    const rules = [...counts]
      .map(([kind, minimum]) =>
        minimum === 0
          ? `-${kind}`
          : minimum === 1
            ? `+${kind}`
            : `+${kind}:${minimum}`,
      )
      .join(' ');
    throw new Error(
      `Could not assemble a playable circuit for ${seed} at level ${level} with rules: ${rules}${failures.length > 0 ? ` (${failures.slice(0, 3).join(' | ')})` : ''}`,
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
