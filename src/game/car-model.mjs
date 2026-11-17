import * as THREE from 'three';
import { toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js';

/**
 * Die-cast hypercar: candy red body, black canopy, black aero, gold wheels,
 * swan-neck rear wing. Front faces +Z.
 *
 * The shell is one lofted surface built from longitudinal stations. Each
 * station carries a full cross-section profile - not a single height - so the
 * body can bulge over the wheels (fenders), dip between them (hood), and open
 * up into wheel arches. That silhouette is what a die-cast casting has, and
 * neither stacked boxes nor a single-superellipse body can produce it.
 *
 * Shared by the game (src/game/Car.ts) and the asset preview
 * (tools/preview/car-model.mjs), so the catalog render is always the car the
 * game drives.
 */

export const CAR = {
  length: 2.45,
  width: 1,
  height: 0.78,
  wheelbase: 1.4,
  rearWheelRadius: 0.3,
  frontWheelRadius: 0.28,
  rearTyreWidth: 0.19,
  frontTyreWidth: 0.18,
  rearAxle: -0.7,
  frontAxle: 0.7,
};

const PAINT = 0xa30f1d;

/**
 * Gap between the tyre silhouette and the lip of its wheel arch. The arch line
 * is never allowed below the tyre, so this gap and the fender skin above it
 * are what decide how tall the fenders have to be.
 */
const ARCH_GAP = 0.03;
/**
 * Where the arch step blends back into the flat floor, as a fraction of the
 * half width. Inboard of this the underside stays low; the tyre's inner edge
 * sits outboard of it, so the step is hidden behind the tyre.
 */
const ARCH_INNER_FRACTION = 0.6;
const ARCH_OUTER_FRACTION = 0.68;

const smoothstep = (t) => {
  const k = Math.min(1, Math.max(0, t));
  return k * k * (3 - 2 * k);
};

const lerp = (a, b, t) => a + (b - a) * t;

// ---------------------------------------------------------------------------
// Longitudinal stations, rear (-z) to nose (+z).
//
//   halfWidth  outer skin at |x|
//   floor      underside in the middle of the car
//   shoulder   height of the top surface where it meets the side
//   fenderX    |x| of the local top maximum (the fender crown)
//   fender     height at that crown
//   centre     height on the centreline (hood, deck, or valley under canopy)
// ---------------------------------------------------------------------------

const STATIONS = [
  { z: -1.225, halfWidth: 0.4, floor: 0.3, shoulder: 0.4, fenderX: 0.26, fender: 0.46, centre: 0.44 },
  { z: -1.16, halfWidth: 0.44, floor: 0.26, shoulder: 0.44, fenderX: 0.3, fender: 0.51, centre: 0.48 },
  { z: -1.05, halfWidth: 0.47, floor: 0.2, shoulder: 0.49, fenderX: 0.34, fender: 0.57, centre: 0.52 },
  { z: -0.92, halfWidth: 0.49, floor: 0.14, shoulder: 0.53, fenderX: 0.37, fender: 0.6, centre: 0.53 },
  { z: -0.8, halfWidth: 0.5, floor: 0.11, shoulder: 0.56, fenderX: 0.39, fender: 0.63, centre: 0.535 },
  { z: -0.7, halfWidth: 0.5, floor: 0.1, shoulder: 0.58, fenderX: 0.41, fender: 0.64, centre: 0.55 },
  { z: -0.58, halfWidth: 0.5, floor: 0.1, shoulder: 0.57, fenderX: 0.41, fender: 0.62, centre: 0.525 },
  { z: -0.45, halfWidth: 0.5, floor: 0.1, shoulder: 0.55, fenderX: 0.42, fender: 0.59, centre: 0.53 },
  { z: -0.3, halfWidth: 0.5, floor: 0.1, shoulder: 0.53, fenderX: 0.44, fender: 0.56, centre: 0.51 },
  { z: -0.1, halfWidth: 0.5, floor: 0.1, shoulder: 0.51, fenderX: 0.46, fender: 0.53, centre: 0.5 },
  { z: 0.1, halfWidth: 0.5, floor: 0.1, shoulder: 0.5, fenderX: 0.47, fender: 0.52, centre: 0.49 },
  { z: 0.3, halfWidth: 0.5, floor: 0.1, shoulder: 0.51, fenderX: 0.47, fender: 0.54, centre: 0.48 },
  { z: 0.46, halfWidth: 0.5, floor: 0.1, shoulder: 0.53, fenderX: 0.4, fender: 0.57, centre: 0.45 },
  { z: 0.6, halfWidth: 0.5, floor: 0.1, shoulder: 0.55, fenderX: 0.36, fender: 0.61, centre: 0.41 },
  { z: 0.7, halfWidth: 0.5, floor: 0.1, shoulder: 0.54, fenderX: 0.35, fender: 0.6, centre: 0.39 },
  { z: 0.82, halfWidth: 0.49, floor: 0.1, shoulder: 0.51, fenderX: 0.34, fender: 0.57, centre: 0.36 },
  { z: 0.95, halfWidth: 0.47, floor: 0.11, shoulder: 0.47, fenderX: 0.31, fender: 0.52, centre: 0.33 },
  { z: 1.06, halfWidth: 0.43, floor: 0.1, shoulder: 0.38, fenderX: 0.28, fender: 0.45, centre: 0.29 },
  { z: 1.15, halfWidth: 0.38, floor: 0.11, shoulder: 0.32, fenderX: 0.25, fender: 0.37, centre: 0.24 },
  { z: 1.225, halfWidth: 0.3, floor: 0.13, shoulder: 0.27, fenderX: 0.2, fender: 0.3, centre: 0.22 },
];

const zMin = STATIONS[0].z;
const zMax = STATIONS[STATIONS.length - 1].z;

/**
 * Non-uniform Catmull-Rom over the real z of each knot.
 *
 * The stations are deliberately unevenly spaced (dense over the axles and the
 * canopy), so the spline interpolates against z, not against the station
 * index - an index-based lookup would slide every feature along the car.
 */
function splineOf(key) {
  const knots = STATIONS.map((station) => ({ z: station.z, v: station[key] }));
  const tangent = knots.map((knot, index) => {
    const prev = knots[index - 1];
    const next = knots[index + 1];
    if (!prev) {
      return (next.v - knot.v) / (next.z - knot.z);
    }
    if (!next) {
      return (knot.v - prev.v) / (knot.z - prev.z);
    }
    return (next.v - prev.v) / (next.z - prev.z);
  });

  return (z) => {
    const clamped = Math.min(zMax, Math.max(zMin, z));
    let index = 0;
    while (index < knots.length - 2 && clamped > knots[index + 1].z) {
      index += 1;
    }
    const a = knots[index];
    const b = knots[index + 1];
    const h = b.z - a.z;
    const t = h === 0 ? 0 : (clamped - a.z) / h;
    const t2 = t * t;
    const t3 = t2 * t;
    return (
      (2 * t3 - 3 * t2 + 1) * a.v +
      (t3 - 2 * t2 + t) * h * tangent[index] +
      (-2 * t3 + 3 * t2) * b.v +
      (t3 - t2) * h * tangent[index + 1]
    );
  };
}

const widthSpline = splineOf('halfWidth');
const floorSpline = splineOf('floor');
const shoulderSpline = splineOf('shoulder');
const fenderXSpline = splineOf('fenderX');
const fenderSpline = splineOf('fender');
const centreSpline = splineOf('centre');

const AXLES = [
  { z: CAR.rearAxle, radius: CAR.rearWheelRadius },
  { z: CAR.frontAxle, radius: CAR.frontWheelRadius },
];

/**
 * Underside height over a wheel: a circle concentric with the tyre, cleared by
 * ARCH_GAP. This must never clamp below the tyre or the bodywork passes
 * straight through the wheel.
 */
function archAt(z, floor) {
  let arch = floor;
  for (const axle of AXLES) {
    const reach = axle.radius + ARCH_GAP;
    const dz = z - axle.z;
    if (Math.abs(dz) < reach) {
      arch = Math.max(arch, axle.radius + Math.sqrt(reach * reach - dz * dz));
    }
  }
  return arch;
}

function sectionAt(z) {
  const halfWidth = widthSpline(z);
  const floor = floorSpline(z);
  const shoulder = shoulderSpline(z);
  const centre = centreSpline(z);
  const arch = archAt(z, floor);
  // The arch line has to clear the tyre; the fender crown has to clear the
  // arch line. Lifting both keeps a real lip of bodywork over every wheel.
  const fenderX = Math.min(Math.max(fenderXSpline(z), 0.02), halfWidth - 0.02);
  const fender = Math.max(fenderSpline(z), centre, shoulder, arch + 0.055);
  return {
    z,
    halfWidth,
    floor,
    shoulder: Math.max(shoulder, arch + 0.03),
    centre,
    fenderX,
    fender,
    arch,
  };
}

/** Height of the top surface at |x| = ax. */
function topAt(section, ax) {
  if (ax <= section.fenderX) {
    return lerp(section.centre, section.fender, smoothstep(ax / section.fenderX));
  }
  const span = section.halfWidth - section.fenderX;
  const t = span <= 0 ? 1 : (ax - section.fenderX) / span;
  return lerp(section.fender, section.shoulder, smoothstep(t));
}

/**
 * Height of the underside at |x| = ax: flat floor, a step up over the wheel,
 * then flat at the arch line out to the side wall.
 */
function bottomAt(section, ax) {
  const w = section.halfWidth;
  const outer = w * ARCH_OUTER_FRACTION;
  const inner = w * ARCH_INNER_FRACTION;
  if (ax <= inner || outer - inner < 1e-6) {
    return section.floor;
  }
  if (ax <= outer) {
    return lerp(section.floor, section.arch, smoothstep((ax - inner) / (outer - inner)));
  }
  return section.arch;
}

/**
 * Point on the section outline.
 *
 * The ring walks across the top from -x to +x, then back along the underside,
 * which makes the loft's quads face outward on their own. The half-cosine
 * spacing keeps samples dense where the shoulder folds over into the side.
 */
const RING_HALF = 32;
const RING = RING_HALF * 2 - 2;

function sectionPoint(section, index, target = new THREE.Vector2()) {
  const w = section.halfWidth;
  if (index < RING_HALF) {
    const t = index / (RING_HALF - 1);
    const x = -w * Math.cos(Math.PI * t);
    return target.set(x, topAt(section, Math.abs(x)));
  }
  const t = (index - RING_HALF + 1) / (RING_HALF - 1);
  const x = w * Math.cos(Math.PI * t);
  return target.set(x, bottomAt(section, Math.abs(x)));
}

/** Point on the top surface at (z, x), pushed outward along its normal. */
function surfacePoint(z, x, offset = 0.005) {
  const section = sectionAt(z);
  const ax = Math.abs(x);
  const step = 0.012;
  const y = topAt(section, ax);
  const slopeX = (topAt(section, ax + step) - topAt(section, Math.max(0, ax - step))) / (step + Math.min(ax, step));
  const slopeZ =
    (topAt(sectionAt(z + step), ax) - topAt(sectionAt(z - step), ax)) / (2 * step);
  const dx = x >= 0 ? slopeX : -slopeX;
  const normal = new THREE.Vector3(-dx, 1, -slopeZ).normalize();
  return new THREE.Vector3(x, y, z).addScaledVector(normal, offset);
}

function buildLoft(sections, rings, creaseAngle) {
  const positions = [];
  const uvs = [];
  const indices = [];
  const point = new THREE.Vector2();

  sections.forEach((section, ring) => {
    for (let index = 0; index < rings; index += 1) {
      sectionPoint(section, index, point);
      positions.push(point.x, point.y, section.z);
      uvs.push(index / rings, ring / (sections.length - 1));
    }
  });

  for (let ring = 0; ring < sections.length - 1; ring += 1) {
    for (let index = 0; index < rings; index += 1) {
      const next = (index + 1) % rings;
      const a = ring * rings + index;
      const b = ring * rings + next;
      const c = (ring + 1) * rings + index;
      const d = (ring + 1) * rings + next;
      indices.push(a, c, b, b, c, d);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  if (creaseAngle) {
    toCreasedNormals(geometry, creaseAngle);
  }
  return geometry;
}

/** Fan cap closing a section. The ring is clockwise seen from +z. */
function buildCap(section, z, rings, facing) {
  const positions = [0, (section.centre + section.floor) / 2, z];
  const indices = [];
  const point = new THREE.Vector2();
  for (let index = 0; index < rings; index += 1) {
    sectionPoint(section, index, point);
    positions.push(point.x, point.y, z);
  }
  for (let index = 0; index < rings; index += 1) {
    const a = 1 + index;
    const b = 1 + ((index + 1) % rings);
    if (facing > 0) {
      indices.push(0, b, a);
    } else {
      indices.push(0, a, b);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

// ---------------------------------------------------------------------------
// Surface details: patches sampled from the shell, so they hug the body.
// ---------------------------------------------------------------------------

function patchGeometry({ z0, z1, x0, x1, back = 0, front = 0, offset = 0.005, stepsZ = 14, stepsX = 6 }) {
  const positions = [];
  const indices = [];
  const uvs = [];
  for (let zi = 0; zi <= stepsZ; zi += 1) {
    const vz = zi / stepsZ;
    for (let xi = 0; xi <= stepsX; xi += 1) {
      const vx = xi / stepsX;
      const x = lerp(x0, x1, vx);
      const z = lerp(z0 + back * vx, z1 + front * vx, vz);
      const point = surfacePoint(z, x, offset);
      positions.push(point.x, point.y, point.z);
      uvs.push(vx, vz);
    }
  }
  const row = stepsX + 1;
  // Outward (+y) needs dx and dz of opposite sign with the (a,b,c) winding.
  const flip = (x1 - x0) * (z1 - z0) > 0;
  for (let zi = 0; zi < stepsZ; zi += 1) {
    for (let xi = 0; xi < stepsX; xi += 1) {
      const a = zi * row + xi;
      const b = a + 1;
      const c = a + row;
      const d = c + 1;
      if (flip) {
        indices.push(a, c, b, b, c, d);
      } else {
        indices.push(a, b, c, b, d, c);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

/** Panel hung on the side of the body, following its width and arch line. */
function sidePanelGeometry({ z0, z1, y0, y1, side, back = 0, front = 0, offset = 0.006, stepsZ = 14, stepsY = 4 }) {
  const positions = [];
  const indices = [];
  const uvs = [];
  for (let zi = 0; zi <= stepsZ; zi += 1) {
    const vz = zi / stepsZ;
    for (let yi = 0; yi <= stepsY; yi += 1) {
      const t = yi / stepsY;
      const z = lerp(z0 + back * t, z1 + front * t, vz);
      const section = sectionAt(z);
      const x = side * (section.halfWidth + offset);
      const low = Math.max(y0, bottomAt(section, section.halfWidth) + 0.014);
      const high = Math.max(low, Math.min(y1, section.shoulder - 0.014));
      positions.push(x, lerp(low, high, t), z);
      uvs.push(vz, t);
    }
  }
  const row = stepsY + 1;
  for (let zi = 0; zi < stepsZ; zi += 1) {
    for (let yi = 0; yi < stepsY; yi += 1) {
      const a = zi * row + yi;
      const b = a + 1;
      const c = a + row;
      const d = c + 1;
      if (side > 0) {
        indices.push(a, b, c, b, d, c);
      } else {
        indices.push(a, c, b, b, c, d);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

// ---------------------------------------------------------------------------
// Canopy: a lofted dome cradled in the deck between the fenders.
// ---------------------------------------------------------------------------

const CANOPY = [
  { z: 0.5, halfWidth: 0.05, base: 0.41, top: 0.44 },
  { z: 0.42, halfWidth: 0.18, base: 0.41, top: 0.53 },
  { z: 0.3, halfWidth: 0.27, base: 0.42, top: 0.62 },
  { z: 0.16, halfWidth: 0.32, base: 0.43, top: 0.68 },
  { z: 0.0, halfWidth: 0.34, base: 0.44, top: 0.71 },
  { z: -0.16, halfWidth: 0.34, base: 0.44, top: 0.71 },
  { z: -0.34, halfWidth: 0.31, base: 0.44, top: 0.69 },
  { z: -0.52, halfWidth: 0.26, base: 0.43, top: 0.64 },
  { z: -0.68, halfWidth: 0.18, base: 0.43, top: 0.58 },
  { z: -0.8, halfWidth: 0.1, base: 0.43, top: 0.53 },
  { z: -0.88, halfWidth: 0.04, base: 0.43, top: 0.49 },
];

function canopySections(steps) {
  const read = (z, key) => {
    let index = 0;
    while (index < CANOPY.length - 2 && z < CANOPY[index + 1].z) {
      index += 1;
    }
    const a = CANOPY[index];
    const b = CANOPY[index + 1];
    const t = Math.min(1, Math.max(0, (z - a.z) / (b.z - a.z)));
    return lerp(a[key], b[key], smoothstep(t));
  };
  const sections = [];
  for (let step = 0; step <= steps; step += 1) {
    const z = lerp(CANOPY[0].z, CANOPY[CANOPY.length - 1].z, step / steps);
    const halfWidth = read(z, 'halfWidth');
    const base = read(z, 'base');
    sections.push({
      z,
      halfWidth,
      floor: base,
      shoulder: base,
      centre: read(z, 'top'),
      fenderX: halfWidth,
      fender: base,
      arch: base,
    });
  }
  return sections;
}

// ---------------------------------------------------------------------------
// Materials
// ---------------------------------------------------------------------------

const materials = {
  paint: new THREE.MeshPhysicalMaterial({
    color: PAINT,
    metalness: 0.05,
    roughness: 0.55,
    clearcoat: 0.3,
    clearcoatRoughness: 0.3,
    envMapIntensity: 0.35,
  }),
  trim: new THREE.MeshStandardMaterial({
    color: 0x090b0f,
    metalness: 0.2,
    roughness: 0.62,
    envMapIntensity: 0.3,
  }),
  glass: new THREE.MeshPhysicalMaterial({
    color: 0x04060a,
    metalness: 0.05,
    roughness: 0.18,
    clearcoat: 0.8,
    clearcoatRoughness: 0.08,
    envMapIntensity: 0.22,
  }),
  gold: new THREE.MeshStandardMaterial({
    color: 0xd9a52b,
    metalness: 1,
    roughness: 0.22,
  }),
  chrome: new THREE.MeshStandardMaterial({
    color: 0xdfe7f2,
    metalness: 1,
    roughness: 0.16,
  }),
  tyre: new THREE.MeshStandardMaterial({ color: 0x111317, roughness: 0.92 }),
  brake: new THREE.MeshStandardMaterial({
    color: 0x2b2f36,
    metalness: 0.7,
    roughness: 0.45,
  }),
  headlight: new THREE.MeshStandardMaterial({
    color: 0xfff5da,
    emissive: 0xffe6a8,
    emissiveIntensity: 1.4,
    roughness: 0.25,
  }),
  taillight: new THREE.MeshStandardMaterial({
    color: 0xff2436,
    emissive: 0xff1a2c,
    emissiveIntensity: 1.6,
    roughness: 0.35,
  }),
};

// ---------------------------------------------------------------------------
// Shared geometry: built once, reused by every car instance.
// ---------------------------------------------------------------------------

/** Rounded tyre carcass, lathed so the shoulders catch a highlight. */
function tyreGeometry(radius, width) {
  const profile = [
    new THREE.Vector2(radius * 0.6, -width / 2),
    new THREE.Vector2(radius * 0.93, -width / 2 + 0.008),
    new THREE.Vector2(radius, -width / 2 + 0.026),
    new THREE.Vector2(radius, width / 2 - 0.026),
    new THREE.Vector2(radius * 0.93, width / 2 - 0.008),
    new THREE.Vector2(radius * 0.6, width / 2),
  ];
  const geometry = new THREE.LatheGeometry(profile, 34);
  geometry.rotateZ(Math.PI / 2);
  return geometry;
}

/** Rear wing: a deep extruded airfoil spanning the width of the car. */
function wingGeometry() {
  const shape = new THREE.Shape();
  shape.moveTo(-0.15, 0.005);
  shape.quadraticCurveTo(-0.1, 0.06, 0.075, 0.038);
  shape.quadraticCurveTo(0.13, 0.02, 0.15, 0);
  shape.quadraticCurveTo(0, -0.027, -0.15, 0.005);
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: 0.96,
    bevelEnabled: false,
    curveSegments: 10,
  });
  geometry.rotateY(Math.PI / 2);
  geometry.translate(-0.48, 0, -0.05);
  return geometry;
}

/** Plate spanning |x| <= halfWidth, from z0 to z1, `thickness` tall. */
function plateGeometry(halfWidth, z0, z1, thickness) {
  const shape = new THREE.Shape();
  shape.moveTo(-halfWidth, 0);
  shape.lineTo(halfWidth, 0);
  shape.lineTo(halfWidth, z1 - z0);
  shape.lineTo(-halfWidth, z1 - z0);
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: thickness,
    bevelEnabled: false,
  });
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(0, 0, z1);
  return geometry;
}

/** Shark fin: tall where it meets the canopy, tapering back toward the wing. */
function finGeometry() {
  const shape = new THREE.Shape();
  shape.moveTo(0, 0.14);
  shape.lineTo(0.24, 0.035);
  shape.lineTo(0.24, 0);
  shape.lineTo(0, 0);
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: 0.016,
    bevelEnabled: false,
  });
  geometry.rotateY(Math.PI / 2);
  geometry.translate(-0.008, 0, 0);
  return geometry;
}

function mirrorStalkGeometry(side) {
  return new THREE.TubeGeometry(
    new THREE.CatmullRomCurve3([
      new THREE.Vector3(side * 0.3, 0.5, 0.3),
      new THREE.Vector3(side * 0.37, 0.53, 0.33),
      new THREE.Vector3(side * 0.42, 0.55, 0.35),
    ]),
    6,
    0.011,
    6,
    false,
  );
}

let shared = null;

function sharedGeometry() {
  if (shared) {
    return shared;
  }

  const shellSections = [];
  const STEPS = 76;
  for (let step = 0; step <= STEPS; step += 1) {
    shellSections.push(sectionAt(lerp(zMin, zMax, step / STEPS)));
  }
  const first = shellSections[0];
  const last = shellSections[shellSections.length - 1];

  const radii = [CAR.rearWheelRadius, CAR.frontWheelRadius];
  const widths = [CAR.rearTyreWidth, CAR.frontTyreWidth];
  const keyed = (build) => {
    const table = {};
    radii.forEach((radius, index) => {
      table[radius] = build(radius, widths[index]);
    });
    return table;
  };

  shared = {
    shell: buildLoft(shellSections, RING, Math.PI / 5),
    rearCap: buildCap(first, first.z, RING, -1),
    noseCap: buildCap(last, last.z, RING, 1),
    canopy: buildLoft(canopySections(44), RING, Math.PI / 5),
    wing: wingGeometry(),
    splitter: plateGeometry(0.46, 0.96, 1.22, 0.012),
    diffuserFin: new THREE.BoxGeometry(0.014, 0.15, 0.17),
    upright: new THREE.BoxGeometry(0.028, 0.36, 0.075),
    endplate: new THREE.BoxGeometry(0.016, 0.18, 0.3),
    intake: new THREE.BoxGeometry(0.52, 0.1, 0.16),
    noseVent: new THREE.BoxGeometry(0.17, 0.085, 0.07),
    mouth: new THREE.BoxGeometry(0.44, 0.085, 0.1),
    lampBar: new THREE.PlaneGeometry(0.64, 0.075),
    mirrorPod: new THREE.SphereGeometry(0.045, 14, 10),
    mirrorStalk: { [-1]: mirrorStalkGeometry(-1), 1: mirrorStalkGeometry(1) },
    fin: finGeometry(),
    rimLip: new THREE.RingGeometry(0.185, 0.25, 30),
    tyre: keyed((radius, width) => tyreGeometry(radius, width)),
    castShadow: true,
    barrel: keyed(
      (radius, width) =>
        new THREE.CylinderGeometry(radius * 0.7, radius * 0.7, width * 0.9, 24),
    ),
    rimDisc: keyed(
      (radius) => new THREE.CylinderGeometry(radius * 0.68, radius * 0.68, 0.014, 24),
    ),
    brake: keyed(
      (radius) => new THREE.CylinderGeometry(radius * 0.42, radius * 0.42, 0.02, 20),
    ),
    aeroDisc: keyed(
      (radius) => new THREE.CylinderGeometry(radius * 0.64, radius * 0.64, 0.02, 32),
    ),
    aeroRing: keyed(
      (radius) => new THREE.TorusGeometry(radius * 0.46, 0.016, 8, 36),
    ),
    aeroHub: keyed(
      (radius) => new THREE.CylinderGeometry(radius * 0.2, radius * 0.2, 0.034, 22),
    ),
    patches: {
      hood: patchGeometry({
        z0: 0.52, z1: 1.14, x0: -0.1, x1: 0.1,
        back: -0.16, front: -0.13, stepsX: 6, stepsZ: 18,
      }),
      cover: patchGeometry({
        z0: -0.98, z1: -0.4, x0: -0.22, x1: 0.22, stepsX: 8, stepsZ: 14,
      }),
      sillRight: sidePanelGeometry({ z0: -0.36, z1: 0.36, y0: 0.13, y1: 0.21, side: 1 }),
      sillLeft: sidePanelGeometry({ z0: -0.36, z1: 0.36, y0: 0.13, y1: 0.21, side: -1 }),
      intakeRight: sidePanelGeometry({
        z0: -0.34, z1: 0.02, y0: 0.3, y1: 0.55, side: 1, back: -0.1, front: -0.2, stepsZ: 10,
      }),
      intakeLeft: sidePanelGeometry({
        z0: -0.34, z1: 0.02, y0: 0.3, y1: 0.55, side: -1, back: -0.1, front: -0.2, stepsZ: 10,
      }),
      lampRight: patchGeometry({
        z0: 0.94, z1: 1.04, x0: 0.28, x1: 0.38, back: -0.1, front: -0.08,
        offset: 0.009, stepsZ: 5, stepsX: 5,
      }),
      lampLeft: patchGeometry({
        z0: 0.94, z1: 1.04, x0: -0.28, x1: -0.38, back: -0.1, front: -0.08,
        offset: 0.009, stepsZ: 5, stepsX: 5,
      }),
    },
  };

  return shared;
}

// ---------------------------------------------------------------------------
// Wheels
// ---------------------------------------------------------------------------

function buildWheel(radius, width, face) {
  const geo = sharedGeometry();
  const wheel = new THREE.Group();

  // Steer about Y outside the spin about X. With the default XYZ order the
  // spin is applied outside the steer, so a steered wheel's axle precesses by
  // up to the steer angle on every turn of the wheel: the fronts wobble.
  wheel.rotation.order = 'YXZ';

  wheel.add(new THREE.Mesh(geo.tyre[radius], materials.tyre));

  const barrel = new THREE.Mesh(geo.barrel[radius], materials.trim);
  barrel.rotation.z = Math.PI / 2;
  wheel.add(barrel);

  const disc = new THREE.Mesh(geo.rimDisc[radius], materials.brake);
  disc.rotation.z = Math.PI / 2;
  disc.position.x = face * width * 0.3;
  wheel.add(disc);

  // Aero disc face: this casting runs solid discs, not spokes.
  const aero = new THREE.Mesh(geo.aeroDisc[radius], materials.gold);
  aero.rotation.z = Math.PI / 2;
  aero.position.x = face * width * 0.36;
  wheel.add(aero);

  const groove = new THREE.Mesh(geo.aeroRing[radius], materials.trim);
  groove.rotation.y = face > 0 ? Math.PI / 2 : -Math.PI / 2;
  groove.position.x = face * width * 0.41;
  wheel.add(groove);

  const centre = new THREE.Mesh(geo.aeroHub[radius], materials.trim);
  centre.rotation.z = Math.PI / 2;
  centre.position.x = face * width * 0.43;
  wheel.add(centre);

  const lip = new THREE.Mesh(geo.rimLip, materials.gold);
  lip.rotation.y = face > 0 ? Math.PI / 2 : -Math.PI / 2;
  lip.position.x = face * width * 0.4;
  wheel.add(lip);

  return wheel;
}

// ---------------------------------------------------------------------------
// Car
// ---------------------------------------------------------------------------

const paintCache = new Map();

function paintFor(color) {
  const cached = paintCache.get(color);
  if (cached) {
    return cached;
  }
  const paint = materials.paint.clone();
  paint.color.setHex(color);
  paintCache.set(color, paint);
  return paint;
}

/**
 * Build the car. Returns the body group plus the wheels: the game spins them
 * for rolling and steers the front pair independently.
 */
export function createCar(color = PAINT) {
  const geo = sharedGeometry();
  const paint = color === PAINT ? materials.paint : paintFor(color);

  const group = new THREE.Group();
  group.name = 'car';
  group.add(
    new THREE.Mesh(geo.shell, paint),
    new THREE.Mesh(geo.rearCap, paint),
    new THREE.Mesh(geo.noseCap, paint),
    new THREE.Mesh(geo.canopy, materials.glass),
  );

  // Black aero graphics laid onto the shell surface.
  const patches = geo.patches;
  group.add(
    new THREE.Mesh(patches.hood, materials.trim),
    new THREE.Mesh(patches.cover, materials.trim),
    new THREE.Mesh(patches.sillRight, materials.trim),
    new THREE.Mesh(patches.sillLeft, materials.trim),
    new THREE.Mesh(patches.intakeRight, materials.trim),
    new THREE.Mesh(patches.intakeLeft, materials.trim),
    new THREE.Mesh(patches.lampRight, materials.headlight),
    new THREE.Mesh(patches.lampLeft, materials.headlight),
  );

  // Nose mouth between splitter and body, and the splitter itself.
  const intake = new THREE.Mesh(geo.intake, materials.trim);
  intake.position.set(0, 0.115, 1.12);
  group.add(intake);

  // Wide-mouth front opening, visible head-on under the pointed nose.
  const mouth = new THREE.Mesh(geo.mouth, materials.trim);
  mouth.position.set(0, 0.21, 1.17);
  group.add(mouth);

  // Twin intake tunnels either side of the central nose tongue: the reference
  // reads as a wide-mouth predator because the face is two holes, not one.
  for (const side of [-1, 1]) {
    const vent = new THREE.Mesh(geo.noseVent, materials.trim);
    vent.position.set(side * 0.15, 0.2, 1.2);
    group.add(vent);
  }

  const splitter = new THREE.Mesh(geo.splitter, materials.trim);
  splitter.position.y = 0.11;
  group.add(splitter);

  // Rear diffuser fins under the tail.
  for (const x of [-0.27, -0.09, 0.09, 0.27]) {
    const fin = new THREE.Mesh(geo.diffuserFin, materials.trim);
    fin.position.set(x, 0.19, -1.13);
    group.add(fin);
  }

  // Tail light bar across the rear panel.
  const tail = new THREE.Mesh(geo.lampBar, materials.taillight);
  tail.position.set(0, 0.34, zMin - 0.004);
  tail.rotation.y = Math.PI;
  group.add(tail);

  // Swan-neck wing on two uprights with endplates, just above the roof line.
  const wing = new THREE.Mesh(geo.wing, materials.trim);
  wing.position.set(0, 0.83, -1.02);
  wing.rotation.x = -0.12;
  group.add(wing);

  for (const side of [-1, 1]) {
    const upright = new THREE.Mesh(geo.upright, materials.trim);
    upright.position.set(side * 0.21, 0.67, -1.06);
    upright.rotation.x = -0.2;
    group.add(upright);

    const plate = new THREE.Mesh(geo.endplate, materials.trim);
    plate.position.set(side * 0.48, 0.83, -1.07);
    group.add(plate);

    group.add(new THREE.Mesh(geo.mirrorStalk[side], materials.trim));

    const pod = new THREE.Mesh(geo.mirrorPod, materials.trim);
    pod.scale.set(0.75, 0.5, 1.15);
    pod.position.set(side * 0.44, 0.57, 0.36);
    group.add(pod);
  }

  // Shark fin behind the canopy.
  const fin = new THREE.Mesh(geo.fin, materials.trim);
  fin.position.set(0, 0.56, -0.76);
  group.add(fin);

  const wheels = [];
  const specs = [
    { radius: CAR.rearWheelRadius, width: CAR.rearTyreWidth, x: -0.41, z: CAR.rearAxle },
    { radius: CAR.rearWheelRadius, width: CAR.rearTyreWidth, x: 0.41, z: CAR.rearAxle },
    { radius: CAR.frontWheelRadius, width: CAR.frontTyreWidth, x: -0.415, z: CAR.frontAxle },
    { radius: CAR.frontWheelRadius, width: CAR.frontTyreWidth, x: 0.415, z: CAR.frontAxle },
  ];
  for (const spec of specs) {
    const wheel = buildWheel(spec.radius, spec.width, spec.x < 0 ? -1 : 1);
    wheel.position.set(spec.x, spec.radius, spec.z);
    group.add(wheel);
    wheels.push(wheel);
  }

  return {
    group,
    wheels,
    setSteer: (value) => {
      for (const wheel of wheels.slice(2)) {
        wheel.rotation.y = value * 0.35;
      }
    },
  };
}