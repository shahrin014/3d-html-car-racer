/**
 * Screen-relative tilt steering.
 *
 * `DeviceOrientationEvent` angles are reported in the device's own frame, which
 * rotates with the phone. Steering wants the roll around the screen's normal,
 * so project gravity onto the screen plane and measure its angle from screen
 * down. Screen and device axes point in opposite directions, so the mapping
 * below is a reflection rather than a plain rotation.
 */

const DEGREES = Math.PI / 180;

/** Screen-relative roll in degrees, or `null` when the device is face-up. */
export function tiltDegrees(
  beta: number,
  gamma: number,
  screenAngle: number,
): number | null {
  if (!Number.isFinite(beta) || !Number.isFinite(gamma)) {
    return null;
  }

  const b = beta * DEGREES;
  const g = gamma * DEGREES;

  // World gravity expressed in the device frame.
  const gx = Math.sin(g) * Math.cos(b);
  const gy = -Math.sin(b);

  // Express gravity in screen coordinates (x right, y down).
  const quarter = (((Math.round(screenAngle / 90) * 90) % 360) + 360) % 360;
  let sx: number;
  let sy: number;
  switch (quarter) {
    case 90:
      sx = -gy;
      sy = -gx;
      break;
    case 180:
      sx = -gx;
      sy = gy;
      break;
    case 270:
      sx = gy;
      sy = gx;
      break;
    default:
      sx = gx;
      sy = -gy;
      break;
  }

  // With the screen flat, gravity points through it and roll is undefined.
  if (Math.abs(sx) + Math.abs(sy) < 1e-6) {
    return null;
  }
  return Math.atan2(sx, sy) / DEGREES;
}

/**
 * Convert a measured roll into a steering target in `[-1, 1]`.
 *
 * `neutral` is captured when the race starts. The dead zone stops a steady
 * hand from drifting, and the tilt range maps comfortably short of a full
 * 90-degree roll so steering does not feel twitchy.
 */
export function steerFromTilt(
  angle: number,
  neutral: number,
  deadZone = 3,
  fullLock = 25,
): number {
  const delta = ((angle - neutral + 540) % 360) - 180;
  const magnitude = Math.abs(delta);
  if (magnitude <= deadZone) {
    return 0;
  }
  const span = Math.max(1, fullLock - deadZone);
  const steer = Math.min(1, (magnitude - deadZone) / span);
  return Math.sign(delta) * steer;
}
