/**
 * Central tuning values for the circuit racer.
 * Behavior lives in openspec/changes/orange-loop-circuit-racer.
 */

/** Track width in world units; the car is 1 wide, so this is three car widths. */
export const TRACK_WIDTH = 3;
export const TRACK_THICKNESS = 0.12;
export const RAIL_WIDTH = 0.12;
export const RAIL_HEIGHT = 0.35;
export const TRACK_CLEARANCE = 0.02;

/** Metres per plastic seam in the surface texture. */
export const SEAM_LENGTH = 1.5;

export const GRAVITY = -9.82;

export const LAPS = 3;
export const COUNTDOWN_SECONDS = 3;

/** Fixed simulation step and the most steps a single frame may take. */
export const FIXED_STEP = 1 / 120;
export const MAX_SUBSTEPS = 4;
export const MAX_FRAME_DELTA = 0.1;

export const CAR_MASS = 1.2;
export const CAR_LENGTH = 2.45;
export const CAR_WIDTH = 1;
export const CAR_HEIGHT = 0.78;

/** Engine force along the direction of travel, newtons. */
export const ENGINE_FORCE = 34;
/** Braking force while the brake control is held. */
export const BRAKE_FORCE = 26;
/** Lateral acceleration available for steering. */
export const STEER_FORCE = 26;
/** How hard the body is rotated onto the track surface. */
export const ALIGNMENT_STRENGTH = 12;
export const ALIGNMENT_DAMPING = 2.6;

/** Speed ceiling at zero damage. */
export const MAX_SPEED = 24;
/** Limp ceiling at maximum damage. */
export const LIMP_SPEED = 10;

export const DESIGN_SPEED = 12;
export const LOOP_RADIUS = 7;
export const LOOP_OFFSET = 4;
export const LOOP_RETURN_LENGTH = 14;

export const BOOST_IMPULSE = 7;
export const BOOST_COOLDOWN = 1.6;

/** Damage per unit of impact impulse, before the level factor. */
export const DAMAGE_PER_IMPULSE = 18;
export const DAMAGE_IMPULSE_FLOOR = 1.6;
export const MAX_DAMAGE = 100;

export const RESCUE_SPEED_THRESHOLD = 1;
export const RESCUE_STALL_SECONDS = 2.5;
export const RESCUE_PENALTY_SECONDS = 3;

export const TILT_DEAD_ZONE_DEGREES = 3;
export const TILT_RANGE_DEGREES = 25;
export const TILT_SMOOTHING = 10;

export const BEST_TIME_KEY_PREFIX = 'neon-racer.best-time';
export const UNLOCKED_LEVEL_KEY = 'neon-racer.unlocked-level';

export const DEFAULT_LEVEL = 1;
export const MAX_LEVEL = 12;
