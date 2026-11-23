/**
 * Central tuning values for the circuit racer.
 * Behavior lives in openspec/specs/game/spec.md and
 * openspec/specs/track-randomization/spec.md.
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

/**
 * Player thrust. Engine force and drag are tuned as a pair: terminal speed is
 * `sqrt(force / drag)`, so both scale together to keep the flat top end at
 * about 72 m/s. The stronger engine shortens the launch, and the lower drag
 * than the old 56 m/s tune leaves room for gravity to add speed on descents.
 * Track, loop, and jump geometry are still checked against this ceiling.
 */
export const PHYSICS_ENGINE_FORCE = 80;
/**
 * Extra engine force as a fraction of thrust while pointing downhill. Gravity
 * alone gives the player a smaller relative surge than the rivals' grade-based
 * pacing, so matching the rivals takes this assist on the loop's descent.
 */
export const PHYSICS_DESCENT_BOOST = 0.5;
/**
 * Rounded edge on the single chassis collider. The track is built from short
 * cuboid segments, so a sharp bottom edge catches on every seam; this rounding
 * is what lets one collider replace the four wheel spheres that used to be the
 * only parts touching the road.
 */
export const PHYSICS_CHASSIS_ROUNDING = 0.09;
/** Height of the body centre above the track when the chassis rests on it. */
export const PHYSICS_RIDE_HEIGHT = CHASSIS_HALF_HEIGHT;
export const PHYSICS_BRAKE_FORCE = 56;
/**
 * Quadratic drag: force = coefficient * speed^2 opposing motion. Tuned with
 * the engine force for a terminal speed of about 72 m/s on the flat. Lowering
 * it from the old 56 m/s tune lets gravity add more speed downhill, which the
 * loop descent needs.
 */
export const PHYSICS_DRAG = 0.015432;
/**
 * Steering is a heading target, not a torque: full lock aims the nose this
 * many radians off the track tangent. Torque alone spins a 1.2 kg toy car
 * through 90 degrees in well under a second.
 */
export const PHYSICS_STEER_ANGLE = 0.12;
/** Assist that pulls the body onto the track surface and its tangent. */
export const PHYSICS_STICK_STRENGTH = 320;
export const PHYSICS_STICK_DAMPING = 28;
export const PHYSICS_HEADING_ASSIST = 80;
/** Damps the spring above so the nose settles without oscillating. */
export const PHYSICS_YAW_DAMPING = 12;
/**
 * Torque that rolls and pitches the body onto the track surface. Twice the
 * original value keeps every bank and the loop planted as the car covers twice
 * the ground per second; the remaining seam chatter is handled by the drawn
 * pose filter and measured by the physics trace.
 */
export const PHYSICS_UP_ALIGNMENT = 40;
/** Damps that spring so a contact bump does not ring the body. */
export const PHYSICS_UP_DAMPING = 12;
/**
 * Lateral grip budget, in multiples of the car's weight. The assist may never
 * push sideways harder than this, so steering cannot slide the car further
 * than a tyre could.
 */
export const PHYSICS_GRIP = 12;
/** Lateral speed the car is allowed to drift at, in m/s at full lock. */
export const PHYSICS_DRIFT_SPEED = 2.8;
/** How fast the assist cancels sideways velocity, per second. */
export const PHYSICS_LATERAL_GAIN = 16;
/** Gentle pull back to the centreline once the player releases steering. */
export const PHYSICS_CENTRE_GAIN = 5;

/**
 * Space-held drift. The nose is aimed much further off the tangent than normal
 * steering, the tyres follow it more slowly, and the centring spring is nearly
 * off: the body slides wide with the nose pointing into the turn. Roughly a
 * 36 degree heading target, still inside the 45 degree limit that a held lock
 * must not exceed.
 */
export const PHYSICS_DRIFT_STEER_MULT = 5.2;
/** Sideways speed target while drifting, as a multiple of the grip-limit speed. */
export const PHYSICS_DRIFT_SPEED_MULT = 2.8;
/** Lower lateral gain lets the travel direction lag the nose, adding slip. */
export const PHYSICS_DRIFT_LATERAL_GAIN = 9;
/** Weaker centring so a drift carries the car wide instead of snapping back. */
export const PHYSICS_DRIFT_CENTRE_GAIN = 0.5;
/** Contact force above this is treated as a crash. */
export const IMPACT_THRESHOLD = 40;

/**
 * Speed ceiling at zero damage. The car is three times as fast as the original
 * 24 m/s top speed; the drag and assist constants scale with the square of
 * that speed.
 */
export const MAX_SPEED = 72;
/** Limp ceiling at maximum damage. */
export const LIMP_SPEED = 24;

export const DESIGN_SPEED = 12;
export const LOOP_RADIUS = 7 * TRACK_SCALE;
/** Sideways drift of the loop; must clear the exit lane by more than a width. */
export const LOOP_OFFSET = TRACK_WIDTH + 2;
export const LOOP_RETURN_LENGTH = 14 * TRACK_SCALE;
/** Smallest turn radius the seeded assembly may use. */
export const MIN_TURN_RADIUS = 8 * TRACK_SCALE;

/**
 * Circuit shape family. A circuit is a closed regular polygon with three to six
 * banked corners, so the seed can choose a triangle, a square or rectangle, a
 * pentagon, or a hexagon instead of always drawing the same oval.
 */
export const CIRCUIT_CORNER_COUNTS = [3, 4, 5, 6] as const;
/**
 * Base leg length before the level's straight increment, in metres. A leg must
 * fit a 12 m lead straight plus the loop and a boost (12 + 21 + 12), leaving a
 * short shim of deck; the catalog straights themselves stay at 12 m or more.
 */
export const CIRCUIT_LEG_BASE = 36;
/** Flat straight at the start of every leg, so grids and gates sit on flat deck. */
export const CIRCUIT_LEAD_STRAIGHT = 12;
/** Length of a boost straight embedded in a leg. */
export const CIRCUIT_BOOST_LENGTH = 12;

/**
 * Jump module: a kicker up to a raised lip, a gap with no deck, and a landing
 * ramp back down. The flat module sits on one deck; the same three pieces also
 * form a downhill jump at the end of an elevated stretch, where the kicker
 * stays on the high deck and the landing sinks to a lower deck so the gap
 * vaults over whatever route lies beneath.
 */
export const JUMP_HEIGHT = 2.2;
export const JUMP_KICKER_LENGTH = 9;
export const JUMP_GAP_LENGTH = 9;
export const JUMP_LANDING_LENGTH = 26;
/**
 * World height of the landing ramp's top edge. It sits below the kicker lip,
 * so the car drops onto a lower ramp instead of landing level with the launch.
 */
export const JUMP_LANDING_HEIGHT = 1.1;
/**
 * Landing area width for a jump, in metres. It is twice as wide as the running
 * track so a fast, off-line landing has room to settle instead of dropping off
 * the side. The mesh, the physics deck and rails, and the jump-failure lateral
 * bound all widen at the landing.
 */
export const JUMP_LANDING_WIDTH = TRACK_WIDTH * 2;
/** Default landing width, equal to the normal track. */
export const TRACK_LANDING_WIDTH = TRACK_WIDTH;
/**
 * How far below the virtual jump line or landing deck the car may fall before
 * the attempt counts as failed. A successful jump clears the deck; this only
 * catches a car that has dropped into the gap or past the landing.
 */
export const JUMP_FAIL_DEPTH = 1;
/** A clearly failed jump gets this long to recover before the rescue. */
export const JUMP_FAIL_GRACE_SECONDS = 0.35;
/** How far before the gap a failed jump is retried from. A steep ramp plus its
 * compact kicker can be nearly 25 m long, so the run-up must reach below the
 * ramp rather than resetting on the face. */
export const JUMP_RETRY_DISTANCE = 30;
/**
 * Lip slope, dy/dz. The kicker is convex at the lip, so a fast car leaves it
 * early at a steeper effective angle; this nominal slope is what keeps the
 * flight short enough to reach the landing ramp at doubled speed.
 */
export const JUMP_LAUNCH_SLOPE = 0.04;
export const JUMP_LENGTH =
  JUMP_KICKER_LENGTH + JUMP_GAP_LENGTH + JUMP_LANDING_LENGTH;
/**
 * Downhill jump landing ramp length per bridge level dropped. Descending is
 * gravity-assisted so the landing can be steeper than the flat jump, but it
 * still eases to a flat deck on the lower level.
 */
export const JUMP_DOWN_LANDING_PER_LEVEL = 26;

/**
 * Obstacle segment: a straight deck lined with solid hazard blocks. The blocks
 * sit near the rails so the centreline and every rival lane stay clear; a car
 * that drifts wide hits one, slows, and takes damage. The 24 m length matches
 * the hill and jump slot, so a leg can carry any one of the three features.
 */
export const OBSTACLE_SEGMENT_LENGTH = 24;
export const OBSTACLE_ROWS = 5;
export const OBSTACLE_WIDTH = 0.9;
export const OBSTACLE_DEPTH = 0.9;
export const OBSTACLE_HEIGHT = 0.9;
/** Distance from the centreline to an obstacle's centre. */
export const OBSTACLE_LATERAL_OFFSET = 2.5;

/**
 * Bridge module: a ramp up to a raised deck, a flat crossing, and a ramp back
 * down. The deck sits at half the loop's height so a branch can pass through
 * the loop opening or over another leg of the circuit.
 */
export const BRIDGE_HEIGHT = 8;
export const BRIDGE_RAMP_LENGTH = 20;
export const BRIDGE_FLAT_LENGTH = 24;
export const BRIDGE_LENGTH =
  BRIDGE_RAMP_LENGTH * 2 + BRIDGE_FLAT_LENGTH;
/** Minimum vertical separation allowed where two sections overlap in plan. */
export const BRIDGE_CLEARANCE = 3.5;

/**
 * Steep ramp module: a 70 degree climb to a raised deck, used as a sky-jump
 * launch. The entry eases over a longer horizontal run than the exit so the
 * car rotates onto the face gradually; the top meets a compact kicker, gap, and
 * wide landing deck, so a car at racing speed flies off the top instead of
 * staying planted. The whole climb is a boost strip, so a slow car is pushed
 * up. Its rise is four bridge levels, and a matching steep descent closes the
 * route on another leg.
 */
export const STEEP_RAMP_ANGLE = 70;
export const STEEP_RAMP_LEVELS = 4;
export const STEEP_RAMP_HEIGHT = BRIDGE_HEIGHT * STEEP_RAMP_LEVELS;
/** Horizontal length of the eased entry and exit, as shares of the rise. */
export const STEEP_RAMP_EASE_IN_RATIO = 0.34375;
export const STEEP_RAMP_EASE_OUT_RATIO = 0.21875;

/**
 * Compact jump at the top of the steep ramp. The lip is lower and the landing
 * shorter than the standard jump so the sky-jump module fits a long circuit
 * leg while still giving the car a real flight over a gap.
 */
export const SKY_JUMP_KICKER_LENGTH = 4;
export const SKY_JUMP_LIP_HEIGHT = 1;
export const SKY_JUMP_ENTRY_HEIGHT = 0.5;
export const SKY_JUMP_GAP_LENGTH = 4;
export const SKY_JUMP_LANDING_LENGTH = 18;

/**
 * Weave layout: a closed 3D trefoil whose plan crosses itself three times.
 * The seed scales and rotates the authored curve; it is not assembled from the
 * catalog pieces. Crossings are separated by the curve's own height, so the
 * car drives over and under its route without a gap.
 */
export const WEAVE_SHARE = 0.25;
export const WEAVE_SCALE = 10;
export const WEAVE_SCALE_VARIANCE = 4;
export const WEAVE_SEGMENTS = 12;
/**
 * Extra leg length added to every leg when the seed plans a steep pair. The
 * sky-jump module plus the lead straight and a boost strip is about 71 m; this
 * keeps the climb eligible on short level-1 legs instead of starving the
 * segment from the random rotation.
 */
export const SKY_JUMP_LEG_EXTRA = 24;

/**
 * Spiral ramp module: one full turn per bridge level. The single-crossing bridge
 * climbs two levels, which still threads the loop's opening while keeping the
 * deck clear of the lower crossing. The 18 m centreline radius leaves an
 * opening about 29 m across inside the inner rail, wide enough for a landmark
 * building in the middle.
 */
export const SPIRAL_LEVELS = 2;
export const SPIRAL_RADIUS = 18;
export const SPIRAL_HEIGHT = BRIDGE_HEIGHT * SPIRAL_LEVELS;
export const SPIRAL_TURNS = SPIRAL_LEVELS;

/**
 * Opponents on the grid. Each drives a kinematic racing line at its own pace
 * and lane, so the field is deterministic and the player can bump into them.
 * Their cruise speed matches the doubled player pace.
 */
export const OPPONENT_COUNT_MAX = 30;
export const DEFAULT_OPPONENT_COUNT = 3;
/** Lateral offsets from the centreline, in metres; cycled for a larger field. */
export const OPPONENT_LANES = [-1.4, 0.9, -0.4, 1.4, 0.4] as const;
export const OPPONENT_BASE_SPEED = 24;
/** Fastest rival cruise, so a full field still spans one pace range. */
export const OPPONENT_TOP_SPEED = 31.2;
/** Metres ahead of the player on the grid for the first opponent. */
export const OPPONENT_GRID_OFFSET = 3;
export const OPPONENT_GRID_SPACING = 2.6;

export const BOOST_IMPULSE = 14;
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
/** Storage key for the chosen player paint. */
export const PAINT_KEY = 'neon-racer.paint';

/** Storage key for the chosen player car. */
export const CAR_KEY = 'neon-racer.car';
/** Storage key for the chosen number of opponents. */
export const OPPONENTS_KEY = 'neon-racer.opponents';
export const UNLOCKED_LEVEL_KEY = 'neon-racer.unlocked-level';

export const DEFAULT_LEVEL = 1;
export const MAX_LEVEL = 12;
