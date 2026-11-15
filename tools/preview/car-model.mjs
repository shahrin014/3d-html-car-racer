import * as THREE from 'three';

/**
 * Low-poly-turned-smooth hypercar in a die-cast style.
 *
 * The body and canopy are lofted from longitudinal cross-sections, so the shell
 * is one sculpted surface rather than stacked boxes. Details that need to hug
 * the body (intakes, stripes, lights) are patches sampled from the same surface.
 *
 * Front faces +Z. Length 2.45 m, width 1.0 m, height 0.78 m.
 */

export const CAR = {
  length: 2.45,
  width: 1,
  height: 0.78,
  wheelbase: 1.4,
  rearWheelRadius: 0.32,
  frontWheelRadius: 0.29,
};

const PAINT = 0xa30f1d;

const materials = {
  paint: new THREE.MeshPhysicalMaterial({
    color: PAINT,
    metalness: 0.78,
    roughness: 0.2,
    clearcoat: 1,
    clearcoatRoughness: 0.1,
    side: THREE.DoubleSide,
  }),
  trim: new THREE.MeshPhysicalMaterial({
    color: 0x090b0f,
    metalness: 0.4,
    roughness: 0.42,
    clearcoat: 0.6,
    side: THREE.DoubleSide,
  }),
  glass: new THREE.MeshPhysicalMaterial({
    color: 0x05070b,
    metalness: 0.5,
    roughness: 0.05,
    clearcoat: 1,
    side: THREE.DoubleSide,
  }),
  gold: new THREE.MeshStandardMaterial({
    color: 0xd9a52b,
    metalness: 1,
    roughness: 0.22,
  }),
  tyre: new THREE.MeshStandardMaterial({
    color: 0x111317,
    roughness: 0.92,
    metalness: 0.05,
  }),
  brake: new THREE.MeshStandardMaterial({
    color: 0x2b2f36,
    metalness: 0.7,
    roughness: 0.45,
  }),
  chrome: new THREE.MeshStandardMaterial({
    color: 0xdfe7f2,
    metalness: 1,
    roughness: 0.16,
  }),
  headlight: new THREE.MeshStandardMaterial({
    color: 0xfff5da,
    emissive: 0xffe6a8,
    emissiveIntensity: 1.5,
    roughness: 0.25,
  }),
  taillight: new THREE.MeshStandardMaterial({
    color: 0xff2436,
    emissive: 0xff1a2c,
    emissiveIntensity: 1.7,
    roughness: 0.35,
  }),
};

// ---------------------------------------------------------------------------
// Longitudinal stations: z, half width, roof height, floor height.
// ---------------------------------------------------------------------------

const STATIONS = [
  { z: -1.26, halfWidth: 0.3, top: 0.44, floor: 0.18 },
  { z: -1.14, halfWidth: 0.44, top: 0.52, floor: 0.13 },
  { z: -0.92, halfWidth: 0.5, top: 0.58, floor: 0.1 },
  { z: -0.58, halfWidth: 0.49, top: 0.6, floor: 0.1 },
  { z: -0.2, halfWidth: 0.44, top: 0.59, floor: 0.1 },
  { z: 0.16, halfWidth: 0.43, top: 0.53, floor: 0.1 },
  { z: 0.56, halfWidth: 0.42, top: 0.45, floor: 0.1 },
  { z: 0.92, halfWidth: 0.35, top: 0.37, floor: 0.1 },
  { z: 1.14, halfWidth: 0.26, top: 0.31, floor: 0.11 },
  { z: 1.3, halfWidth: 0.12, top: 0.24, floor: 0.14 },
];

const zMin = STATIONS[0].z;
const zMax = STATIONS[STATIONS.length - 1].z;

function splineOf(key) {
  return new THREE.CatmullRomCurve3(
    STATIONS.map((station) => new THREE.Vector3(station.z, station[key], 0)),
    false,
    'centripetal',
  );
}

const widthCurve = splineOf('halfWidth');
const topCurve = splineOf('top');
const floorCurve = splineOf('floor');

function sectionAt(z) {
  const t = THREE.MathUtils.clamp((z - zMin) / (zMax - zMin), 0, 1);
  return {
    halfWidth: widthCurve.getPoint(t).y,
    top: topCurve.getPoint(t).y,
    floor: floorCurve.getPoint(t).y,
  };
}

const SUPERELLIPSE = 2.7;

/** Point on the body cross-section at angle `angle` (0 = right flank). */
function sectionPoint(section, angle, outward = 0) {
  const centreY = (section.top + section.floor) / 2;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const exponent = 2 / SUPERELLIPSE;
  const radiusY = sin >= 0 ? section.top - centreY : centreY - section.floor;
  const x =
    section.halfWidth * Math.sign(cos) * Math.abs(cos) ** exponent;
  const y = centreY + radiusY * Math.sign(sin) * Math.abs(sin) ** exponent;

  if (outward === 0) {
    return new THREE.Vector2(x, y);
  }
  const radial = new THREE.Vector2(x, y - centreY).normalize();
  return new THREE.Vector2(
    x + radial.x * outward,
    y + radial.y * outward,
  );
}

// ---------------------------------------------------------------------------
// Loft helpers
// ---------------------------------------------------------------------------

function loft(sections, segments) {
  const ringCount = sections.length;
  const positions = [];
  const indices = [];
  const uvs = [];

  sections.forEach((section, ring) => {
    const { z, halfWidth, top, floor } = section;
    for (let index = 0; index < segments; index += 1) {
      const angle = (index / segments) * Math.PI * 2;
      const point = sectionPoint({ halfWidth, top, floor }, angle);
      positions.push(point.x, point.y, z);
      uvs.push(index / segments, ring / (ringCount - 1));
    }
  });

  for (let ring = 0; ring < ringCount - 1; ring += 1) {
    for (let index = 0; index < segments; index += 1) {
      const next = (index + 1) % segments;
      const a = ring * segments + index;
      const b = ring * segments + next;
      const c = (ring + 1) * segments + index;
      const d = (ring + 1) * segments + next;
      indices.push(a, c, b, b, c, d);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function capGeometry(section, z, segments, faceForward) {
  const positions = [];
  const indices = [];
  const centreY = (section.top + section.floor) / 2;
  positions.push(0, centreY, z);
  for (let index = 0; index < segments; index += 1) {
    const angle = (index / segments) * Math.PI * 2;
    const point = sectionPoint(section, angle);
    positions.push(point.x, point.y, z);
  }
  for (let index = 0; index < segments; index += 1) {
    const a = index + 1;
    const b = ((index + 1) % segments) + 1;
    if (faceForward) {
      indices.push(0, a, b);
    } else {
      indices.push(0, b, a);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function sampledSections(from, to, steps) {
  const sections = [];
  for (let index = 0; index <= steps; index += 1) {
    const z = THREE.MathUtils.lerp(from, to, index / steps);
    sections.push({ z, ...sectionAt(z) });
  }
  return sections;
}

/**
 * A curved decal that follows the body shell: used for intakes, the hood
 * stripe, and the light strips. Offset slightly outward to avoid z-fighting.
 */
function bodyPatch({
  z0,
  z1,
  angle0,
  angle1,
  offset = 0.004,
  material,
  stepsZ = 18,
  stepsAngle = 8,
}) {
  const positions = [];
  const indices = [];
  const uvs = [];
  for (let zi = 0; zi <= stepsZ; zi += 1) {
    const z = THREE.MathUtils.lerp(z0, z1, zi / stepsZ);
    const section = sectionAt(z);
    for (let ai = 0; ai <= stepsAngle; ai += 1) {
      const angle = THREE.MathUtils.lerp(angle0, angle1, ai / stepsAngle);
      const point = sectionPoint(section, angle, offset);
      positions.push(point.x, point.y, z);
      uvs.push(ai / stepsAngle, zi / stepsZ);
    }
  }
  const row = stepsAngle + 1;
  for (let zi = 0; zi < stepsZ; zi += 1) {
    for (let ai = 0; ai < stepsAngle; ai += 1) {
      const a = zi * row + ai;
      const b = a + 1;
      const c = a + row;
      const d = c + 1;
      indices.push(a, b, c, b, d, c);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  return mesh;
}

// ---------------------------------------------------------------------------
// Wheels
// ---------------------------------------------------------------------------

function createWheel(radius, width) {
  const wheel = new THREE.Group();

  // Rounded tyre from a lathe profile (axis along local Y, then rotated to X).
  const profile = [
    new THREE.Vector2(radius * 0.66, -width / 2),
    new THREE.Vector2(radius * 0.95, -width / 2 + 0.01),
    new THREE.Vector2(radius, -width / 2 + 0.035),
    new THREE.Vector2(radius, width / 2 - 0.035),
    new THREE.Vector2(radius * 0.95, width / 2 - 0.01),
    new THREE.Vector2(radius * 0.66, width / 2),
  ];
  const tyre = new THREE.Mesh(
    new THREE.LatheGeometry(profile, 40),
    materials.tyre,
  );
  tyre.rotation.z = Math.PI / 2;
  wheel.add(tyre);

  const brake = new THREE.Mesh(
    new THREE.CylinderGeometry(radius * 0.6, radius * 0.6, 0.02, 28),
    materials.brake,
  );
  brake.rotation.z = Math.PI / 2;
  wheel.add(brake);

  // Gold aero face: a shallow dish with tapered spokes.
  const dish = new THREE.Mesh(
    new THREE.CylinderGeometry(radius * 0.58, radius * 0.66, 0.03, 30),
    materials.gold,
  );
  dish.rotation.z = Math.PI / 2;
  dish.position.x = width * 0.3;
  wheel.add(dish);

  for (let index = 0; index < 10; index += 1) {
    const spoke = new THREE.Mesh(
      new THREE.BoxGeometry(0.02, radius * 1.05, radius * 0.12),
      materials.gold,
    );
    spoke.position.x = width * 0.36;
    spoke.rotation.x = (index / 10) * Math.PI;
    spoke.rotation.z = 0.06;
    wheel.add(spoke);
  }

  const cap = new THREE.Mesh(
    new THREE.CylinderGeometry(radius * 0.14, radius * 0.14, 0.04, 18),
    materials.chrome,
  );
  cap.rotation.z = Math.PI / 2;
  cap.position.x = width * 0.4;
  wheel.add(cap);

  return wheel;
}

function addWheel(car, { radius, width, x, z }) {
  const wheel = createWheel(radius, width);
  wheel.position.set(x, radius, z);
  if (x < 0) {
    wheel.rotation.y = Math.PI;
  }
  car.add(wheel);

  // Black arch trim hugging the top of the tyre.
  const arch = new THREE.Mesh(
    new THREE.TorusGeometry(radius + 0.015, 0.028, 8, 22, Math.PI),
    materials.trim,
  );
  arch.rotation.y = Math.PI / 2;
  arch.position.set(x, radius, z);
  car.add(arch);
}

// ---------------------------------------------------------------------------
// Car
// ---------------------------------------------------------------------------

function createBody() {
  const group = new THREE.Group();
  const segments = 36;
  const sections = sampledSections(zMin, zMax, 70);

  const shell = new THREE.Mesh(loft(sections, segments), materials.paint);
  group.add(shell);

  const first = sections[0];
  const last = sections[sections.length - 1];
  const rearCap = new THREE.Mesh(
    capGeometry(first, first.z, segments, false),
    materials.paint,
  );
  const noseCap = new THREE.Mesh(
    capGeometry(last, last.z, segments, true),
    materials.paint,
  );
  group.add(rearCap, noseCap);

  return group;
}

function createCanopy() {
  // A stretched dome lofted from small rings at both ends.
  const stations = [
    { z: -0.62, halfWidth: 0.06, base: 0.5, top: 0.52 },
    { z: -0.4, halfWidth: 0.26, base: 0.5, top: 0.7 },
    { z: -0.14, halfWidth: 0.31, base: 0.5, top: 0.75 },
    { z: 0.1, halfWidth: 0.29, base: 0.5, top: 0.7 },
    { z: 0.32, halfWidth: 0.2, base: 0.5, top: 0.58 },
    { z: 0.46, halfWidth: 0.05, base: 0.5, top: 0.5 },
  ];
  const sections = [];
  for (let index = 0; index <= 30; index += 1) {
    const t = index / 30;
    const scaled = t * (stations.length - 1);
    const i0 = Math.min(stations.length - 2, Math.floor(scaled));
    const local = scaled - i0;
    const a = stations[i0];
    const b = stations[i0 + 1];
    sections.push({
      z: THREE.MathUtils.lerp(a.z, b.z, local),
      halfWidth: THREE.MathUtils.lerp(a.halfWidth, b.halfWidth, local),
      top: THREE.MathUtils.lerp(a.top, b.top, local),
      floor: THREE.MathUtils.lerp(a.base, b.base, local),
    });
  }
  const geometry = loft(sections, 28);
  return new THREE.Mesh(geometry, materials.glass);
}

function createWing() {
  const group = new THREE.Group();

  // Airfoil profile in XY, extruded across X (span).
  const shape = new THREE.Shape();
  shape.moveTo(-0.16, 0.005);
  shape.quadraticCurveTo(-0.1, 0.06, 0.08, 0.035);
  shape.quadraticCurveTo(0.15, 0.02, 0.16, 0.0);
  shape.quadraticCurveTo(0.0, -0.025, -0.16, 0.005);
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: 0.98,
    bevelEnabled: false,
    curveSegments: 10,
  });
  geometry.rotateY(Math.PI / 2);
  geometry.translate(-0.49, 0, 0);
  const wing = new THREE.Mesh(geometry, materials.trim);
  wing.position.set(0, 0.76, -1.06);
  wing.rotation.x = -0.1;
  group.add(wing);

  for (const side of [-1, 1]) {
    const plateShape = new THREE.Shape();
    plateShape.moveTo(-0.18, -0.09);
    plateShape.lineTo(0.18, -0.06);
    plateShape.lineTo(0.18, 0.06);
    plateShape.lineTo(-0.18, 0.09);
    plateShape.closePath();
    const plate = new THREE.Mesh(
      new THREE.ExtrudeGeometry(plateShape, {
        depth: 0.02,
        bevelEnabled: false,
      }),
      materials.trim,
    );
    plate.rotation.y = Math.PI / 2;
    plate.position.set(side * 0.49, 0.76, -1.08);
    group.add(plate);

    const strutCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(side * 0.3, 0.58, -0.9),
      new THREE.Vector3(side * 0.3, 0.66, -0.98),
      new THREE.Vector3(side * 0.3, 0.74, -1.02),
    ]);
    const strut = new THREE.Mesh(
      new THREE.TubeGeometry(strutCurve, 12, 0.022, 8, false),
      materials.trim,
    );
    group.add(strut);
  }

  return group;
}

export function createCar() {
  const car = new THREE.Group();
  car.name = 'hypercar';

  car.add(createBody());
  car.add(createCanopy());

  // Side intakes and lower black rockers, sampled from the body surface.
  for (const side of [-1, 1]) {
    const base = side === 1 ? 0 : Math.PI;
    car.add(
      bodyPatch({
        z0: -0.22,
        z1: 0.36,
        angle0: base - 0.42,
        angle1: base + 0.14,
        material: materials.trim,
      }),
    );
    car.add(
      bodyPatch({
        z0: -1.1,
        z1: 0.9,
        angle0: base + (side === 1 ? -0.32 : 0.18),
        angle1: base + (side === 1 ? -0.18 : 0.32),
        offset: 0.003,
        material: materials.trim,
      }),
    );
  }

  // Hood stripe and nose blackout.
  car.add(
    bodyPatch({
      z0: 0.36,
      z1: 1.24,
      angle0: Math.PI * 0.36,
      angle1: Math.PI * 0.64,
      material: materials.trim,
    }),
  );

  // Headlight slivers sit in the nose blackout.
  for (const side of [-1, 1]) {
    car.add(
      bodyPatch({
        z0: 1.12,
        z1: 1.26,
        angle0: side === 1 ? 0.62 : Math.PI - 0.92,
        angle1: side === 1 ? 0.92 : Math.PI - 0.62,
        offset: 0.008,
        material: materials.headlight,
      }),
    );
  }

  // Tail light bar across the rear.
  car.add(
    bodyPatch({
      z0: -1.27,
      z1: -1.21,
      angle0: Math.PI * 1.16,
      angle1: Math.PI * 1.84,
      offset: 0.008,
      material: materials.taillight,
    }),
  );

  // Splitter and diffuser as tapered plates.
  const splitterShape = new THREE.Shape();
  splitterShape.moveTo(-0.52, -0.06);
  splitterShape.quadraticCurveTo(0, 0.16, 0.52, -0.06);
  splitterShape.lineTo(0.5, 0.02);
  splitterShape.quadraticCurveTo(0, 0.24, -0.5, 0.02);
  splitterShape.closePath();
  const splitter = new THREE.Mesh(
    new THREE.ExtrudeGeometry(splitterShape, {
      depth: 0.035,
      bevelEnabled: false,
    }),
    materials.trim,
  );
  splitter.rotation.x = -Math.PI / 2;
  splitter.position.set(0, 0.06, 1.02);
  car.add(splitter);

  const diffuser = splitter.clone();
  diffuser.position.set(0, 0.08, -1.24);
  diffuser.rotation.z = Math.PI;
  car.add(diffuser);

  for (const x of [-0.32, -0.11, 0.11, 0.32]) {
    const finShape = new THREE.Shape();
    finShape.moveTo(0, 0);
    finShape.lineTo(0.24, 0);
    finShape.lineTo(0.24, 0.09);
    finShape.closePath();
    const fin = new THREE.Mesh(
      new THREE.ExtrudeGeometry(finShape, {
        depth: 0.016,
        bevelEnabled: false,
      }),
      materials.trim,
    );
    fin.rotation.y = Math.PI / 2;
    fin.position.set(x, 0.06, -1.28);
    car.add(fin);
  }

  // Shark fin between canopy and wing.
  const finShape = new THREE.Shape();
  finShape.moveTo(-0.16, 0);
  finShape.lineTo(0.14, 0);
  finShape.lineTo(-0.06, 0.14);
  finShape.closePath();
  const sharkFin = new THREE.Mesh(
    new THREE.ExtrudeGeometry(finShape, {
      depth: 0.018,
      bevelEnabled: false,
    }),
    materials.trim,
  );
  sharkFin.rotation.y = Math.PI / 2;
  sharkFin.position.set(0, 0.6, -0.98);
  car.add(sharkFin);

  car.add(createWing());

  // Mirrors: small ellipsoids on tube stalks.
  for (const side of [-1, 1]) {
    const stalk = new THREE.Mesh(
      new THREE.TubeGeometry(
        new THREE.CatmullRomCurve3([
          new THREE.Vector3(side * 0.4, 0.55, 0.34),
          new THREE.Vector3(side * 0.47, 0.57, 0.36),
          new THREE.Vector3(side * 0.53, 0.58, 0.38),
        ]),
        8,
        0.014,
        6,
        false,
      ),
      materials.trim,
    );
    car.add(stalk);
    const mirror = new THREE.Mesh(
      new THREE.SphereGeometry(0.06, 14, 10),
      materials.trim,
    );
    mirror.scale.set(1.1, 0.55, 0.7);
    mirror.position.set(side * 0.56, 0.58, 0.38);
    car.add(mirror);
  }

  addWheel(car, {
    radius: CAR.rearWheelRadius,
    width: 0.3,
    x: -0.49,
    z: -0.7,
  });
  addWheel(car, {
    radius: CAR.rearWheelRadius,
    width: 0.3,
    x: 0.49,
    z: -0.7,
  });
  addWheel(car, {
    radius: CAR.frontWheelRadius,
    width: 0.24,
    x: -0.49,
    z: 0.7,
  });
  addWheel(car, {
    radius: CAR.frontWheelRadius,
    width: 0.24,
    x: 0.49,
    z: 0.7,
  });

  return car;
}

/**
 * Driver's-eye dashboard. A single plane with a generated texture keeps the
 * cockpit cheap; the game uses the same texture and camera offset.
 */
export function createCockpitDashboard() {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 360;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('2D canvas unavailable');
  }

  const backdrop = ctx.createLinearGradient(0, 0, 0, canvas.height);
  backdrop.addColorStop(0, '#0a121d');
  backdrop.addColorStop(1, '#05080d');
  ctx.fillStyle = backdrop;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = 'rgba(255,255,255,0.03)';
  for (let x = 0; x < canvas.width; x += 16) {
    for (let y = 0; y < canvas.height; y += 16) {
      ctx.fillRect(x + 2, y + 2, 6, 6);
    }
  }

  const gauge = (cx, cy, radius, label, value, accent) => {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.fillStyle = '#0d1824';
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.strokeStyle = '#243244';
    ctx.stroke();

    for (let tick = 0; tick <= 10; tick += 1) {
      const angle = Math.PI * 0.78 + (tick / 10) * Math.PI * 1.44;
      const inner = radius - (tick % 5 === 0 ? 16 : 9);
      ctx.beginPath();
      ctx.moveTo(Math.cos(angle) * inner, Math.sin(angle) * inner);
      ctx.lineTo(Math.cos(angle) * (radius - 4), Math.sin(angle) * (radius - 4));
      ctx.lineWidth = tick % 5 === 0 ? 3 : 1.5;
      ctx.strokeStyle = tick % 5 === 0 ? '#e6ecf5' : '#5a6c82';
      ctx.stroke();
    }

    ctx.beginPath();
    ctx.arc(
      0,
      0,
      radius - 30,
      Math.PI * 0.78,
      Math.PI * 0.78 + Math.PI * 1.44 * value,
      false,
    );
    ctx.lineWidth = 6;
    ctx.strokeStyle = accent;
    ctx.stroke();

    const needleAngle = Math.PI * 0.78 + Math.PI * 1.44 * value;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(
      Math.cos(needleAngle) * (radius - 22),
      Math.sin(needleAngle) * (radius - 22),
    );
    ctx.lineWidth = 4;
    ctx.strokeStyle = '#ff5a3c';
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(0, 0, 8, 0, Math.PI * 2);
    ctx.fillStyle = '#e6ecf5';
    ctx.fill();

    ctx.fillStyle = '#8fa3bb';
    ctx.font = '600 18px ui-sans-serif, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(label, 0, radius - 14);
    ctx.restore();
  };

  gauge(190, 196, 128, 'KM/H', 0.62, '#ffb066');
  gauge(834, 196, 128, 'DAMAGE', 0.18, '#ff4d6d');

  ctx.fillStyle = '#0d1824';
  ctx.fillRect(378, 92, 268, 126);
  ctx.strokeStyle = '#22344a';
  ctx.lineWidth = 3;
  ctx.strokeRect(378, 92, 268, 126);
  ctx.fillStyle = '#ffb066';
  ctx.font = '700 26px ui-sans-serif, system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('LAP 1 / 3', 512, 136);
  ctx.fillStyle = '#d8e5f5';
  ctx.font = '600 34px ui-monospace, SFMono-Regular, Menlo, monospace';
  ctx.fillText('02:14.6', 512, 186);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return new THREE.Mesh(
    new THREE.PlaneGeometry(1.16, 0.4),
    new THREE.MeshStandardMaterial({
      map: texture,
      roughness: 0.7,
      metalness: 0.1,
    }),
  );
}

export function createSteeringWheel() {
  const group = new THREE.Group();
  const rim = new THREE.Mesh(
    new THREE.TorusGeometry(0.16, 0.024, 12, 40),
    materials.tyre,
  );
  group.add(rim);
  for (const angle of [0, Math.PI * 0.66, Math.PI * 1.33]) {
    const spoke = new THREE.Mesh(
      new THREE.BoxGeometry(0.14, 0.02, 0.03),
      materials.chrome,
    );
    spoke.rotation.z = angle;
    spoke.position.set(Math.cos(angle) * 0.07, Math.sin(angle) * 0.07, 0);
    group.add(spoke);
  }
  const badge = new THREE.Mesh(
    new THREE.CylinderGeometry(0.04, 0.04, 0.018, 16),
    materials.gold,
  );
  badge.rotation.x = Math.PI / 2;
  group.add(badge);
  return group;
}
