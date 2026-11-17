/**
 * Central tuning values for the circuit racer.
 * Behavior lives in openspec/specs/game/spec.md.
 */

/** Scale factor applied to the authored track catalogue. */
export const TRACK_SCALE = 1.5;

/**
 * Track width in world units. The car is one unit wide, so this leaves seven
 * car widths of driving room: wide enough to pick a line through a banked turn
 * without clipping a rail.
 */
export const TRACK_WIDTH = 7;
export const TRACK_THICKNESS = 0.12 * TRACK_SCALE;
export const RAIL_WIDTH = 0.12 * TRACK_SCALE;
/** Tall enough to keep the car on the surface through banks and loops. */
export const RAIL_HEIGHT = 0.9;
export const RAIL_SCALE = TRACK_SCALE;
export const TRACK_CLEARANCE = 0.02 * TRACK_SCALE;

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

/**
 * Half the chassis collider height. The visual model's origin sits on the
 * track surface, so the render group is lowered by this much from the rigid
 * body's centre.
 */
export const CHASSIS_HALF_HEIGHT = 0.3;

/** Engine force along the direction of travel, newtons. */
export const ENGINE_FORCE = 34;
/** Braking force while the brake control is held. */
export const BRAKE_FORCE = 26;
/** Lateral acceleration available for steering. */
export const STEER_FORCE = 26;
/** How hard the body is rotated onto the track surface. */
export const ALIGNMENT_STRENGTH = 12;
export const ALIGNMENT_DAMPING = 2.6;

/** Rigid-body vehicle tuning. Forces are newtons, torques newton-metres. */
export const PHYSICS_ENGINE_FORCE = 32;
/**
 * Rounded edge on the single chassis collider. The track is built from short
 * cuboid segments, so a sharp bottom edge catches on every seam; this rounding
 * is what lets one collider replace the four wheel spheres that used to be the
 * only parts touching the road.
 */
export const PHYSICS_CHASSIS_ROUNDING = 0.09;
/** Height of the body centre above the track when the chassis rests on it. */
export const PHYSICS_RIDE_HEIGHT = CHASSIS_HALF_HEIGHT;
export const PHYSICS_BRAKE_FORCE = 24;
/** Quadratic drag: force = coefficient * speed^2 opposing motion. */
export const PHYSICS_DRAG = 0.05;
/**
 * Steering is a heading target, not a torque: full lock aims the nose this
 * many radians off the track tangent. Torque alone spins a 1.2 kg toy car
 * through 90 degrees in well under a second.
 */
export const PHYSICS_STEER_ANGLE = 0.12;
/** Assist that pulls the body onto the track surface and its tangent. */
export const PHYSICS_STICK_STRENGTH = 80;
export const PHYSICS_STICK_DAMPING = 14;
export const PHYSICS_HEADING_ASSIST = 20;
/** Damps the spring above so the nose settles without oscillating. */
export const PHYSICS_YAW_DAMPING = 6;
/** Torque that rolls and pitches the body onto the track surface. */
export const PHYSICS_UP_ALIGNMENT = 20;
/** Damps that spring so a contact bump does not ring the body. */
export const PHYSICS_UP_DAMPING = 6;
/**
 * Lateral grip budget, in multiples of the car's weight. The assist may never
 * push sideways harder than this, so steering cannot slide the car further
 * than a tyre could.
 */
export const PHYSICS_GRIP = 3;
/** Lateral speed the car is allowed to drift at, in m/s at full lock. */
export const PHYSICS_DRIFT_SPEED = 1.4;
/** How fast the assist cancels sideways velocity, per second. */
export const PHYSICS_LATERAL_GAIN = 8;
/** Gentle pull back to the centreline once the player releases steering. */
export const PHYSICS_CENTRE_GAIN = 2.5;
/** Contact force above this is treated as a crash. */
export const IMPACT_THRESHOLD = 40;

/** Speed ceiling at zero damage. */
export const MAX_SPEED = 24;
/** Limp ceiling at maximum damage. */
export const LIMP_SPEED = 10;

export const DESIGN_SPEED = 12;
export const LOOP_RADIUS = 7 * TRACK_SCALE;
/** Sideways drift of the loop; must clear the exit lane by more than a width. */
export const LOOP_OFFSET = TRACK_WIDTH + 2;
export const LOOP_RETURN_LENGTH = 14 * TRACK_SCALE;
/** Smallest turn radius the seeded assembly may use. */
export const MIN_TURN_RADIUS = 8 * TRACK_SCALE;

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
