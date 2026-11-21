import { describe, expect, it } from 'vitest';
import { COCKPIT_WHEEL_MAX_ANGLE, steeringWheelAngle } from './cockpit';

/**
 * The cockpit wheel is drawn in front of the camera, so a positive rotation
 * about its local +Z reads as counter-clockwise on screen. Steering right must
 * therefore produce a negative angle, and the rim must never turn past lock.
 */
describe('cockpit steering wheel', () => {
  it('sits straight ahead with no steering input', () => {
    expect(steeringWheelAngle(0)).toBe(0);
  });

  it('turns clockwise when the driver steers right', () => {
    const angle = steeringWheelAngle(1);
    expect(angle).toBeLessThan(0);
    expect(angle).toBeCloseTo(-COCKPIT_WHEEL_MAX_ANGLE, 6);
  });

  it('turns counter-clockwise when the driver steers left', () => {
    const angle = steeringWheelAngle(-1);
    expect(angle).toBeGreaterThan(0);
    expect(angle).toBeCloseTo(COCKPIT_WHEEL_MAX_ANGLE, 6);
  });

  it('is proportional between centre and full lock', () => {
    expect(steeringWheelAngle(0.5)).toBeCloseTo(
      steeringWheelAngle(1) / 2,
      6,
    );
  });

  it('clamps input beyond full lock', () => {
    expect(steeringWheelAngle(4)).toBeCloseTo(steeringWheelAngle(1), 6);
    expect(steeringWheelAngle(-4)).toBeCloseTo(steeringWheelAngle(-1), 6);
  });
});
