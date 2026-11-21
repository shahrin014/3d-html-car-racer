/**
 * Keyboard mapping for steering and braking.
 *
 * Steering is screen-relative: a right input turns the car toward the right of
 * the screen. The `left`/`right` keys and `A`/`D` must agree, and both must
 * agree with the tilt control used on touch devices.
 */
export const STEER_LEFT_KEYS = ['arrowleft', 'a'] as const;
export const STEER_RIGHT_KEYS = ['arrowright', 'd'] as const;
export const BRAKE_KEYS = [' ', 'arrowdown'] as const;

/** Keys that should not scroll the page while racing. */
export const HELD_KEYS = [
  ...STEER_LEFT_KEYS,
  ...STEER_RIGHT_KEYS,
  ...BRAKE_KEYS,
  'arrowup',
] as const;

/** `1` steers right, `-1` steers left, `0` centres. */
export function steerFromKeys(keys: ReadonlySet<string>): number {
  const right = STEER_RIGHT_KEYS.some((key) => keys.has(key));
  const left = STEER_LEFT_KEYS.some((key) => keys.has(key));
  return (right ? 1 : 0) - (left ? 1 : 0);
}

export function brakeFromKeys(keys: ReadonlySet<string>): boolean {
  return BRAKE_KEYS.some((key) => keys.has(key));
}
