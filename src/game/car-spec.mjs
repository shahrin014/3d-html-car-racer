/**
 * Mach dimensions, material names, and livery maths.
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

/** Default body colour: the white/blue/orange Mach livery. */
export const DEFAULT_BODY_COLOR = 0xf1f3f6;

/**
 * Selectable cars. The first entry is the default. Ids match the published
 * asset names (public/models/<id>.glb and the two PNGs) and cars.json keys.
 */
export const CARS = [
  // paintBaseLuma is the luminance of the livery's body colour: light bodies
  // keep their painted shading, dark bodies take a flat paint colour (their
  // texture carries little shading to preserve).
  { id: 'mach', name: 'Mach', paintBaseLuma: 0.7 },
  { id: 'gt', name: 'GT', paintBaseLuma: 0.0 },
  { id: 'twin', name: 'Twin', paintBaseLuma: 0.75 },
  { id: 'blade', name: 'Blade', paintBaseLuma: 0.65 },
  { id: 'manga', name: 'Manga', paintBaseLuma: 0.72 },
];
