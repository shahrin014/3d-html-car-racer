/**
 * Mach Speeder dimensions, material names, and livery maths.
 *
 * This module is the small, dependency-free half of the car: the physics
 * envelope, the material channel names, and the paint rules. The game imports
 * it alongside the GLB loader, and `tools/model/` uses the same numbers when it
 * authors the mesh, so the model and the collision box cannot drift apart.
 */

/**
 * `width` is the physics envelope and must stay `CAR_WIDTH` in constants:
 * the track is seven car widths wide and the chassis collider is built from
 * it. `bodyWidth` is the visual span across the fender pods, which overhang
 * the collider the way an LMP car's bodywork overhangs its tub.
 */
export const CAR = {
  length: 2.45,
  width: 1,
  bodyWidth: 1.22,
  height: 0.66,
  wheelbase: 1.52,
  wheelRadius: 0.26,
  frontWheelRadius: 0.26,
  rearWheelRadius: 0.26,
  frontTyreWidth: 0.2,
  rearTyreWidth: 0.22,
  frontAxle: 0.78,
  rearAxle: -0.74,
  /** Distance from the centreline to the centre of each tyre. */
  frontWheelX: 0.47,
  rearWheelX: 0.485,
};

/**
 * Material names carried through the GLB. The runtime repaints the two paint
 * channels and the stripe by name; everything else is fixed body furniture.
 */
export const CAR_MATERIALS = {
  paint: 'Paint',
  paintDeep: 'PaintDeep',
  stripe: 'Stripe',
  accent: 'Accent',
  trim: 'Trim',
  glass: 'Glass',
  tyre: 'Tyre',
  brake: 'Brake',
  headlight: 'Headlight',
  taillight: 'Taillight',
};

/** The casting's signature orange: wing, scoop, intake cores, wheel rings. */
export const ACCENT_COLOR = 0xef5f16;

/** Default body colour: the white/blue/orange Mach Speeder livery. */
export const DEFAULT_BODY_COLOR = 0xf1f3f6;

function mix(from, to, amount) {
  const t = Math.min(1, Math.max(0, amount));
  const channel = (shift) => {
    const a = (from >> shift) & 0xff;
    const b = (to >> shift) & 0xff;
    return Math.round(a + (b - a) * t) & 0xff;
  };
  return (channel(16) << 16) | (channel(8) << 8) | channel(0);
}

function luminance(color) {
  const r = (color >> 16) & 0xff;
  const g = (color >> 8) & 0xff;
  const b = color & 0xff;
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

/**
 * Three paint tones derived from one selected colour:
 *
 *   body   the selected paint on every outer panel
 *   deep   the same hue sunk toward black for sills, splitter, and diffuser
 *   stripe the twin nose/canopy stripe, light on dark paints and dark on lights
 *
 * Keeping the stripe and the underbody derived from the paint is what lets ten
 * very different colours share one livery layout without turning muddy.
 */
export function liveryFor(color) {
  const body = Number.isFinite(color) ? color >>> 0 : DEFAULT_BODY_COLOR;
  return {
    body,
    deep: mix(body, 0x070b12, 0.62),
    stripe: luminance(body) > 0.55 ? mix(body, 0x0a1630, 0.72) : 0xf4f7fb,
  };
}
