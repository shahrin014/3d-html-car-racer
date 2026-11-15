/**
 * Central tuning values. Everything that affects difficulty, layout, or feel
 * lives here so the behavior described in openspec/specs/game/spec.md can be
 * tuned without hunting through the renderer code.
 */

/** Width of one lane in world units (metres). */
export const LANE_WIDTH = 2.6;

/** Number of lanes the player can occupy. */
export const LANE_COUNT = 3;

/** Lane centre positions on the x axis, from left to right. */
export const LANE_X: readonly number[] = Array.from(
  { length: LANE_COUNT },
  (_, index) => (index - (LANE_COUNT - 1) / 2) * LANE_WIDTH,
);

export const ROAD_WIDTH = LANE_WIDTH * LANE_COUNT;
export const ROAD_LENGTH = 260;

/** Player car sits slightly ahead of the camera. */
export const PLAYER_Z = 4;
export const SPAWN_Z = -105;
export const DESPAWN_Z = 18;

/** Metres per second at the start of a run. */
export const BASE_SPEED = 24;
/** Speed ceiling reached by the ramp, in metres per second. */
export const MAX_SPEED = 64;
/** Added metres per second for every second of a run. */
export const SPEED_RAMP = 0.5;

/** Traffic approaches at this fraction of the player's speed. */
export const TRAFFIC_RELATIVE_SPEED = 0.55;

export const STARTING_HEARTS = 3;
export const INVULNERABLE_SECONDS = 1.4;

export const PLAYER_HALF_WIDTH = 0.8;
export const PLAYER_HALF_LENGTH = 1.8;
export const TRAFFIC_HALF_WIDTH = 0.84;
export const TRAFFIC_HALF_LENGTH = 1.85;

/** Maximum simulation step so an alt-tabbed tab cannot teleport the player. */
export const MAX_DT = 0.05;

/** Points awarded per metre travelled. */
export const POINTS_PER_METRE = 10;

export const BEST_SCORE_KEY = 'neon-racer.best-score';
