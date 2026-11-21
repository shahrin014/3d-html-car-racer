import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import {
  createCar,
  createCockpitDashboard,
  createSteeringWheel,
} from './car-model.mjs';

/**
 * Renders one catalog asset from its real geometry. The game reuses the same
 * path definitions and car proportions, so these previews are a contract for
 * the catalog rather than concept art.
 *
 * The track surface and rails are continuous swept meshes, not instanced
 * boxes: seams are drawn in the texture so the plastic look survives without
 * breaking the surface into gaps.
 *
 * Query: ?piece=<id>. See PIECES below.
 */

const TRACK = {
  width: 3,
  thickness: 0.12,
  railWidth: 0.12,
  railHeight: 0.35,
  /** Metres per plastic seam in the surface texture. */
  seam: 1.5,
  /** Lateral distance between the loop entrance and exit, in metres. */
  loopOffset: 4,
};

const DESIGN_SPEED = 12;
const DEG = Math.PI / 180;

function bankForRadius(radius) {
  const ideal = Math.atan((DESIGN_SPEED * DESIGN_SPEED) / (radius * 9.81)) / DEG;
  return Math.min(45, Math.max(20, ideal));
}

function straightPath(length) {
  return (t) => ({
    position: new THREE.Vector3(0, 0, length * t),
    tangent: new THREE.Vector3(0, 0, 1),
    up: new THREE.Vector3(0, 1, 0),
    bank: 0,
  });
}

function turnPath({ radius, angleDeg, clockwise }) {
  const angle = angleDeg * DEG;
  const sign = clockwise ? 1 : -1;
  const maxBank = bankForRadius(radius) * DEG;
  return (t) => {
    const theta = angle * t;
    return {
      position: new THREE.Vector3(
        sign * radius * (1 - Math.cos(theta)),
        0,
        radius * Math.sin(theta),
      ),
      tangent: new THREE.Vector3(
        sign * Math.sin(theta),
        0,
        Math.cos(theta),
      ).normalize(),
      up: new THREE.Vector3(0, 1, 0),
      bank: sign * maxBank * Math.sin(Math.PI * t),
    };
  };
}

/**
 * Vertical loop with a sideways drift.
 *
 * The ring is a helix: it turns 360 degrees while drifting laterally, so the
 * exit track sits beside the entrance instead of on top of it. A planar ring
 * would drop its exit back onto the approach and make the loop impossible to
 * enter. Entry and exit still head straight along +Z, so the piece joins any
 * straight; the cost is a lateral shift equal to TRACK.loopOffset, which the
 * circuit assembly consumes after the loop.
 */
function loopPath(radius, offset = TRACK.loopOffset) {
  return (t) => {
    const theta = Math.PI * 2 * t;
    // The ring turns once while drifting sideways, so the exit lane runs
    // beside the entry lane instead of on top of it.
    const drift = t * t * (3 - 2 * t);
    const driftRate = 6 * t * (1 - t);
    const position = new THREE.Vector3(
      offset * drift,
      radius * (1 - Math.cos(theta)),
      radius * Math.sin(theta),
    );
    const tangent = new THREE.Vector3(
      offset * driftRate,
      radius * Math.PI * 2 * Math.sin(theta),
      radius * Math.PI * 2 * Math.cos(theta),
    ).normalize();
    return {
      position,
      tangent,
      up: new THREE.Vector3(0, Math.cos(theta), -Math.sin(theta)).normalize(),
      bank: 0,
    };
  };
}

const JUMP_HEIGHT = 1.6;
const JUMP_SLOPE = 0.2;
const JUMP_GAP = 6;
const JUMP_LANDING = 16;

function hermite(t) {
  const squared = t * t;
  const cubed = squared * t;
  return {
    h00: 2 * cubed - 3 * squared + 1,
    h10: cubed - 2 * squared + t,
    h01: -2 * cubed + 3 * squared,
    h11: cubed - squared,
  };
}

function hermiteSlope(t) {
  const squared = t * t;
  return {
    d00: 6 * squared - 6 * t,
    d10: 3 * squared - 4 * t + 1,
    d01: -6 * squared + 6 * t,
    d11: 3 * squared - 2 * t,
  };
}

/** Ramp up to the lip, ending on the launch slope (matches the game path). */
function kickerPath(length = 8, height = JUMP_HEIGHT, slope = JUMP_SLOPE) {
  return (t) => {
    const basis = hermite(t);
    const derivative = hermiteSlope(t);
    const y = basis.h01 * height + basis.h11 * (length * slope);
    const dy =
      (derivative.d01 * height + derivative.d11 * (length * slope)) / length;
    const tangent = new THREE.Vector3(0, dy, 1).normalize();
    const right = new THREE.Vector3(1, 0, 0);
    return {
      position: new THREE.Vector3(0, y, length * t),
      tangent,
      up: new THREE.Vector3().crossVectors(tangent, right).normalize(),
      bank: 0,
    };
  };
}

/** Landing ramp placed on the launch frame (matches the game path). */
function landingPath(
  length = JUMP_LANDING,
  height = JUMP_HEIGHT,
  slope = JUMP_SLOPE,
  gapLength = JUMP_GAP,
) {
  const angle = Math.atan(slope);
  const drop = -(height / Math.cos(angle) + (gapLength + length) * slope);
  return (t) => {
    const basis = hermite(t);
    const derivative = hermiteSlope(t);
    const y = basis.h01 * drop + basis.h11 * (length * -slope);
    const dy =
      (derivative.d01 * drop + derivative.d11 * (length * -slope)) / length;
    const tangent = new THREE.Vector3(0, dy, 1).normalize();
    const right = new THREE.Vector3(1, 0, 0);
    return {
      position: new THREE.Vector3(0, y, length * t),
      tangent,
      up: new THREE.Vector3().crossVectors(tangent, right).normalize(),
      bank: 0,
    };
  };
}

function hillPath({ length, height }) {
  return (t) => {
    const y = height * Math.sin(Math.PI * t) ** 2;
    const slope = (height * Math.PI * Math.sin(2 * Math.PI * t)) / length;
    const tangent = new THREE.Vector3(0, slope, 1).normalize();
    const right = new THREE.Vector3(1, 0, 0);
    return {
      position: new THREE.Vector3(0, y, length * t),
      tangent,
      up: new THREE.Vector3().crossVectors(tangent, right).normalize(),
      bank: 0,
    };
  };
}

const SPIRAL_ONE_LEVEL = {
  radius: 12,
  height: 8 / 1.5,
  turns: 1,
};

const SPIRAL_TWO_LEVELS = {
  radius: 12,
  height: (8 / 1.5) * 2,
  turns: 2,
};

function smoothStep(t) {
  return t * t * (3 - 2 * t);
}

/**
 * Helical ramp: one full turn climbing or dropping one bridge level. The
 * vertical profile eases at both ends so the entry and exit join a straight
 * flat; the plan circle returns to its own footprint, so the deck above can
 * span the opening.
 */
function spiralPath({
  radius,
  height,
  turns = 1,
  clockwise = true,
  descend = false,
}) {
  const angle = Math.PI * 2 * turns;
  const sign = clockwise ? 1 : -1;
  const rise = descend ? -height : height;
  const horizontal = radius * angle;
  const maxBank = bankForRadius(radius) * DEG;
  return (t) => {
    const theta = angle * t;
    const dy = rise * 6 * t * (1 - t);
    const tangent = new THREE.Vector3(
      sign * Math.sin(theta) * horizontal,
      dy,
      Math.cos(theta) * horizontal,
    ).normalize();
    const right = new THREE.Vector3()
      .crossVectors(new THREE.Vector3(0, 1, 0), tangent)
      .normalize();
    const up = new THREE.Vector3().crossVectors(tangent, right).normalize();
    return {
      position: new THREE.Vector3(
        sign * radius * (1 - Math.cos(theta)),
        rise * smoothStep(t),
        radius * Math.sin(theta),
      ),
      tangent,
      up,
      bank: sign * maxBank * Math.sin(Math.PI * t),
    };
  };
}

function spiralArcLength(radius, height, turns = 1) {
  const horizontal = radius * Math.PI * 2 * turns;
  const steps = 128;
  let length = 0;
  for (let index = 0; index < steps; index += 1) {
    const t = (index + 0.5) / steps;
    const dy = height * 6 * t * (1 - t);
    length += Math.hypot(horizontal, dy) / steps;
  }
  return length;
}

const PIECES = {
  'straight-12': {
    title: 'Straight · 12 m',
    meta: 'Flat · unbanked · joins both ends at zero slope',
    length: 12,
    path: straightPath(12),
    view: new THREE.Vector3(0.9, 0.5, 1),
  },
  'turn-45-r18': {
    title: 'Bend · 45° · R18',
    meta: `Bank ${bankForRadius(18).toFixed(0)}° at 12 m/s · outside edge raised`,
    length: 18 * 45 * DEG,
    path: turnPath({ radius: 18, angleDeg: 45, clockwise: true }),
    view: new THREE.Vector3(0.8, 1.0, 1),
  },
  'turn-90-r14': {
    title: 'Turn · 90° · R14',
    meta: `Bank ${bankForRadius(14).toFixed(0)}° at 12 m/s · inside edge low`,
    length: 14 * 90 * DEG,
    path: turnPath({ radius: 14, angleDeg: 90, clockwise: true }),
    view: new THREE.Vector3(0.8, 1.0, 1),
  },
  'turn-180-r10': {
    title: 'Hairpin · 180° · R10',
    meta: `Bank ${bankForRadius(10).toFixed(0)}° (clamped) · tight exit`,
    length: 10 * Math.PI,
    path: turnPath({ radius: 10, angleDeg: 180, clockwise: true }),
    view: new THREE.Vector3(0.5, 1.1, 0.9),
  },
  'loop-r7': {
    title: 'Vertical loop · R7',
    meta: `360° · exit offset ${TRACK.loopOffset} m to the side`,
    length: Math.PI * 2 * 7,
    path: loopPath(7),
    view: new THREE.Vector3(0.55, 0.5, 1.0),
    showLeadIn: true,
  },
  'loop-r7-plan': {
    title: 'Vertical loop · plan view',
    meta: `Entrance lane and exit lane offset by ${TRACK.loopOffset} m`,
    length: Math.PI * 2 * 7,
    path: loopPath(7),
    view: new THREE.Vector3(0.02, 1, 0.02),
    showLeadIn: true,
  },
  'spiral-r12-1': {
    title: 'Spiral ramp · R12 · one level',
    meta: `360° · rises ${SPIRAL_ONE_LEVEL.height.toFixed(1)} m · one bridge level`,
    length: spiralArcLength(
      SPIRAL_ONE_LEVEL.radius,
      SPIRAL_ONE_LEVEL.height,
      SPIRAL_ONE_LEVEL.turns,
    ),
    path: spiralPath(SPIRAL_ONE_LEVEL),
    view: new THREE.Vector3(0.9, 0.55, 1),
    showLeadIn: true,
    leadOut: { x: 0, y: SPIRAL_ONE_LEVEL.height, z: 0 },
  },
  'spiral-r12': {
    title: 'Spiral ramp · R12 · two levels',
    meta: `720° · rises ${SPIRAL_TWO_LEVELS.height.toFixed(1)} m · two bridge levels`,
    length: spiralArcLength(
      SPIRAL_TWO_LEVELS.radius,
      SPIRAL_TWO_LEVELS.height,
      SPIRAL_TWO_LEVELS.turns,
    ),
    path: spiralPath(SPIRAL_TWO_LEVELS),
    view: new THREE.Vector3(0.9, 0.55, 1),
    showLeadIn: true,
    leadOut: { x: 0, y: SPIRAL_TWO_LEVELS.height, z: 0 },
  },
  'spiral-r12-plan': {
    title: 'Spiral ramp · plan view',
    meta: 'Landmark building fits inside the inner rail',
    length: spiralArcLength(
      SPIRAL_TWO_LEVELS.radius,
      SPIRAL_TWO_LEVELS.height,
      SPIRAL_TWO_LEVELS.turns,
    ),
    path: spiralPath(SPIRAL_TWO_LEVELS),
    view: new THREE.Vector3(0.02, 1, 0.02),
    showLeadIn: true,
    leadOut: { x: 0, y: SPIRAL_TWO_LEVELS.height, z: 0 },
    landmark: {
      width: 8,
      height: 18,
      depth: 8,
      radius: SPIRAL_TWO_LEVELS.radius,
    },
  },
  'hill-crest-2.5': {
    title: 'Hill · crest 2.5 m',
    meta: '16 m long · zero slope at both ends',
    length: 16,
    path: hillPath({ length: 16, height: 2.5 }),
    view: new THREE.Vector3(0.9, 0.45, 1),
  },
  'ramp-up-1.6': {
    title: 'Launch ramp · 1.6 m lip',
    meta: '8 m · ends on an 11° launch · empty gap follows',
    length: 8,
    path: kickerPath(),
    view: new THREE.Vector3(0.9, 0.5, 1),
  },
  'ramp-down-1.6': {
    title: 'Landing ramp · 1.6 m lip',
    meta: '16 m · enters on the launch line and flattens to the deck',
    length: 16,
    path: landingPath(),
    view: new THREE.Vector3(0.9, 0.5, 1),
  },
  'boost-12': {
    title: 'Boost straight · 12 m',
    meta: 'Armed acceleration strip · chevrons face the driving direction',
    length: 12,
    path: straightPath(12),
    boost: true,
    view: new THREE.Vector3(0.9, 0.6, 1),
  },
  'building-block': {
    kind: 'building',
    title: 'City block · low',
    meta: '8 x 6 x 8 m · lit window facade',
    size: { width: 8, height: 6, depth: 8 },
    view: new THREE.Vector3(1, 0.55, 1),
  },
  'building-tower': {
    kind: 'building',
    title: 'City tower',
    meta: '6 x 30 x 6 m · lit window facade',
    size: { width: 6, height: 30, depth: 6 },
    view: new THREE.Vector3(1, 0.4, 1),
  },
  'building-wide': {
    kind: 'building',
    title: 'City block · wide',
    meta: '12 x 10 x 6 m · lit window facade',
    size: { width: 12, height: 10, depth: 6 },
    view: new THREE.Vector3(1, 0.55, 1),
  },
  car: {
    kind: 'car',
    title: 'Hypercar · die-cast',
    meta: '2.45 × 1.0 × 0.78 m · candy red · gold aero wheels · swan-neck wing',
  },
  'car-side': {
    kind: 'car',
    view: 'side',
    title: 'Hypercar · side elevation',
    meta: 'profile check · wheelbase 1.4 m · roof 0.78 m · wedge nose',
  },
  'car-ref': {
    kind: 'car',
    view: 'ref',
    title: 'Hypercar · reference angle',
    meta: 'framed to match docs/reference/mach-speeder-hero.jpg for comparison',
  },
  cockpit: {
    kind: 'cockpit',
    title: 'Cockpit view · driver eye',
    meta: 'generated dashboard texture · no modelled interior',
  },
};

const params = new URLSearchParams(window.location.search);
const pieceId = params.get('piece') ?? 'loop-r7';
const piece = PIECES[pieceId];

if (!piece) {
  document.getElementById('title').textContent = `Unknown piece: ${pieceId}`;
  throw new Error(`Unknown piece: ${pieceId}`);
}

document.getElementById('title').textContent = piece.title;
document.getElementById('meta').textContent = piece.meta;

const canvas = document.getElementById('stage');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(window.innerWidth, window.innerHeight, false);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.98;
renderer.setClearColor(0x070a10, 1);

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x070a10, 45, 130);

const camera = new THREE.PerspectiveCamera(
  38,
  window.innerWidth / window.innerHeight,
  0.05,
  500,
);

scene.add(new THREE.HemisphereLight(0x9fd6ff, 0x0a1018, 0.3));

const key = new THREE.DirectionalLight(0xffe3b3, 0.5);
key.position.set(14, 22, 12);
scene.add(key);

const rim = new THREE.DirectionalLight(0x22d3ee, 0.3);
rim.position.set(-12, 9, -14);
scene.add(rim);

scene.add(new THREE.AmbientLight(0x27445c, 0.25));

// A studio environment gives chrome, paint, and rims something to reflect.
const pmrem = new THREE.PMREMGenerator(renderer);
const environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environment = environment;
scene.environmentIntensity = 0.3;

const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(200, 200),
  new THREE.MeshBasicMaterial({ color: 0x05080e }),
);
ground.rotation.x = -Math.PI / 2;
scene.add(ground);

const grid = new THREE.GridHelper(200, 100, 0x22334a, 0x141d29);
grid.material.transparent = true;
grid.material.opacity = 0.3;
scene.add(grid);

const railMaterial = new THREE.MeshStandardMaterial({
  color: 0xc6cedb,
  roughness: 0.34,
  metalness: 0.3,
  side: THREE.DoubleSide,
});

/** Orange plastic with seam lines, optionally carrying boost chevrons. */
function createTrackTexture({ boost = false } = {}) {
  const canvasTexture = document.createElement('canvas');
  canvasTexture.width = 128;
  canvasTexture.height = 256;
  const ctx = canvasTexture.getContext('2d');
  if (!ctx) {
    throw new Error('2D canvas unavailable');
  }

  const gradient = ctx.createLinearGradient(0, 0, 128, 0);
  gradient.addColorStop(0, '#d94c0b');
  gradient.addColorStop(0.5, '#ff7a18');
  gradient.addColorStop(1, '#d94c0b');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 128, 256);

  // Seam every tile (one tile equals TRACK.seam metres of track).
  ctx.fillStyle = 'rgba(74, 20, 0, 0.5)';
  ctx.fillRect(0, 0, 128, 4);
  ctx.fillStyle = 'rgba(255, 200, 150, 0.18)';
  ctx.fillRect(0, 4, 128, 3);

  // Faint darker centre strip for a molded-plastic look.
  ctx.fillStyle = 'rgba(120, 40, 0, 0.08)';
  ctx.fillRect(56, 0, 16, 256);

  if (boost) {
    ctx.strokeStyle = '#19e3ff';
    ctx.shadowColor = '#19e3ff';
    ctx.shadowBlur = 16;
    ctx.lineWidth = 9;
    for (const offsetY of [190, 120]) {
      ctx.beginPath();
      ctx.moveTo(30, offsetY);
      ctx.lineTo(64, offsetY - 44);
      ctx.lineTo(98, offsetY);
      ctx.stroke();
    }
  }

  const texture = new THREE.CanvasTexture(canvasTexture);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 8;
  return texture;
}

/** Dark facade with a grid of lit windows, matching the game's skyline. */
function createWindowTexture() {
  let hash = 2166136261;
  const seed = 'catalog-buildings';
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  const random = () => {
    hash += 0x6d2b79f5;
    let t = hash;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const canvasTexture = document.createElement('canvas');
  canvasTexture.width = 128;
  canvasTexture.height = 256;
  const ctx = canvasTexture.getContext('2d');
  if (!ctx) {
    throw new Error('2D canvas unavailable');
  }
  ctx.fillStyle = '#0a121d';
  ctx.fillRect(0, 0, canvasTexture.width, canvasTexture.height);

  // One irregular façade per face (see src/game/scenery.ts): dark floors,
  // varied pane sizes, and structural piers instead of a repeated tile.
  const columns = 8;
  const rows = 20;
  const cellWidth = canvasTexture.width / columns;
  const cellHeight = canvasTexture.height / rows;
  const palette = ['#ffd98a', '#8fe3ff', '#ffb46b', '#cfe8ff'];
  for (let row = 0; row < rows; row += 1) {
    const darkFloor = random() < 0.09;
    const brightFloor = random() < 0.1;
    for (let column = 0; column < columns; column += 1) {
      if (darkFloor || (random() < 0.34 && !brightFloor)) {
        continue;
      }
      const colour = palette[Math.floor(random() * palette.length)] ?? '#ffd98a';
      ctx.globalAlpha = 0.3 + random() * 0.65;
      ctx.fillStyle = colour;
      const inset = cellWidth * (0.16 + random() * 0.1);
      const top = row * cellHeight + cellHeight * (0.22 + random() * 0.14);
      ctx.fillRect(
        column * cellWidth + inset,
        top,
        cellWidth - inset * 2,
        cellHeight * (0.3 + random() * 0.18),
      );
    }
  }
  ctx.globalAlpha = 1;

  ctx.fillStyle = 'rgba(4, 9, 16, 0.75)';
  for (let pier = 0; pier < 3; pier += 1) {
    const x = random() * canvasTexture.width;
    ctx.fillRect(
      x,
      0,
      canvasTexture.width * (0.02 + random() * 0.035),
      canvasTexture.height,
    );
  }
  ctx.fillStyle = 'rgba(120, 190, 255, 0.08)';
  for (let band = 0; band < 2; band += 1) {
    ctx.fillRect(0, random() * canvasTexture.height, canvasTexture.width, 3);
  }

  const texture = new THREE.CanvasTexture(canvasTexture);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(1, 1);
  texture.anisotropy = 8;
  return texture;
}

/** Sample a piece path into orthonormal frames at roughly fixed spacing. */
function framesFor(path, length, step = 0.35) {
  const count = Math.max(24, Math.round(length / step));
  const frames = [];
  for (let index = 0; index <= count; index += 1) {
    const t = index / count;
    const sample = path(t);
    const uprightRight = new THREE.Vector3()
      .crossVectors(sample.up, sample.tangent)
      .normalize();
    const up = sample.up
      .clone()
      .multiplyScalar(Math.cos(sample.bank))
      .addScaledVector(uprightRight, Math.sin(sample.bank))
      .normalize();
    frames.push({
      position: sample.position,
      tangent: sample.tangent,
      up,
      right: new THREE.Vector3()
        .crossVectors(up, sample.tangent)
        .normalize(),
      s: t * length,
    });
  }
  return frames;
}

/**
 * Sweep a two-point cross-section along the frames into one continuous strip.
 * `pointA` and `pointB` return the strip edges; `normal` gives the flat normal
 * for the strip so edges stay crisp.
 */
function buildStrip(frames, pointA, pointB, normalOf) {
  const positions = [];
  const normals = [];
  const uvs = [];
  const indices = [];

  frames.forEach((frame, index) => {
    const a = pointA(frame);
    const b = pointB(frame);
    const normal = normalOf(frame);
    positions.push(a.x, a.y, a.z, b.x, b.y, b.z);
    normals.push(normal.x, normal.y, normal.z, normal.x, normal.y, normal.z);
    const v = frame.s / TRACK.seam;
    uvs.push(0, v, 1, v);
    if (index > 0) {
      const base = (index - 1) * 2;
      indices.push(base, base + 2, base + 1, base + 1, base + 2, base + 3);
    }
  });

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  return geometry;
}

function addStrip(group, frames, material, pointA, pointB, normalOf) {
  const mesh = new THREE.Mesh(
    buildStrip(frames, pointA, pointB, normalOf),
    material,
  );
  mesh.frustumCulled = false;
  group.add(mesh);
}

function addCap(group, frame, material) {
  const half = TRACK.width / 2;
  const topLeft = frame.position.clone().addScaledVector(frame.right, -half);
  const topRight = frame.position.clone().addScaledVector(frame.right, half);
  const bottomLeft = topLeft.clone().addScaledVector(frame.up, -TRACK.thickness);
  const bottomRight = topRight.clone().addScaledVector(frame.up, -TRACK.thickness);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(
      [
        ...topLeft.toArray(),
        ...topRight.toArray(),
        ...bottomRight.toArray(),
        ...bottomLeft.toArray(),
      ],
      3,
    ),
  );
  geometry.setAttribute(
    'uv',
    new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2),
  );
  geometry.setIndex([0, 1, 2, 0, 2, 3]);
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  group.add(mesh);
}

function buildTrack(path, length, { boost = false, railFade } = {}) {
  const group = new THREE.Group();
  const railScale = (s) => {
    if (!railFade) {
      return 1;
    }
    const distance = Math.min(
      ...railFade.positions.map((position) => Math.abs(s - position)),
    );
    if (distance >= railFade.halfWidth) {
      return 1;
    }
    const t = distance / railFade.halfWidth;
    return t * t * (3 - 2 * t);
  };
  const frames = framesFor(path, length);
  const surfaceMaterial = new THREE.MeshStandardMaterial({
    map: createTrackTexture({ boost }),
    roughness: 0.48,
    metalness: 0.06,
    side: THREE.DoubleSide,
  });

  const half = TRACK.width / 2;
  const topLeft = (frame) =>
    frame.position.clone().addScaledVector(frame.right, -half);
  const topRight = (frame) =>
    frame.position.clone().addScaledVector(frame.right, half);
  const bottomLeft = (frame) =>
    topLeft(frame).addScaledVector(frame.up, -TRACK.thickness);
  const bottomRight = (frame) =>
    topRight(frame).addScaledVector(frame.up, -TRACK.thickness);

  addStrip(group, frames, surfaceMaterial, topLeft, topRight, (frame) => frame.up);
  addStrip(group, frames, surfaceMaterial, bottomLeft, bottomRight, (frame) =>
    frame.up.clone().negate(),
  );
  addStrip(group, frames, surfaceMaterial, topLeft, bottomLeft, (frame) =>
    frame.right.clone().negate(),
  );
  addStrip(group, frames, surfaceMaterial, topRight, bottomRight, (frame) =>
    frame.right.clone(),
  );

  const firstFrame = frames[0];
  const lastFrame = frames[frames.length - 1];
  if (firstFrame) {
    addCap(group, firstFrame, surfaceMaterial);
  }
  if (lastFrame) {
    addCap(group, lastFrame, surfaceMaterial);
  }

  // Continuous rails: four swept faces per rail.
  for (const side of [-1, 1]) {
    const lateral =
      side * (TRACK.width / 2 - TRACK.railWidth / 2);
    const railBase = (frame) =>
      frame.position.clone().addScaledVector(frame.right, lateral);
    const innerEdge = (frame) =>
      railBase(frame).addScaledVector(
        frame.right,
        -side * (TRACK.railWidth / 2),
      );
    const outerEdge = (frame) =>
      railBase(frame).addScaledVector(
        frame.right,
        side * (TRACK.railWidth / 2),
      );
    const lift = (point, frame) =>
      point
        .clone()
        .addScaledVector(frame.up, TRACK.railHeight * railScale(frame.s));

    addStrip(
      group,
      frames,
      railMaterial,
      (frame) => lift(innerEdge(frame), frame),
      (frame) => lift(outerEdge(frame), frame),
      (frame) => frame.up,
    );
    addStrip(
      group,
      frames,
      railMaterial,
      innerEdge,
      (frame) => lift(innerEdge(frame), frame),
      (frame) => frame.right.clone().multiplyScalar(-side),
    );
    addStrip(
      group,
      frames,
      railMaterial,
      (frame) => lift(outerEdge(frame), frame),
      outerEdge,
      (frame) => frame.right.clone().multiplyScalar(side),
    );
  }

  // The deck floats: no support columns, matching the game.
  return group;
}

function createContactShadow(width, depth) {
  const shadowCanvas = document.createElement('canvas');
  shadowCanvas.width = 256;
  shadowCanvas.height = 256;
  const ctx = shadowCanvas.getContext('2d');
  const gradient = ctx.createRadialGradient(128, 128, 10, 128, 128, 120);
  gradient.addColorStop(0, 'rgba(0,0,0,0.55)');
  gradient.addColorStop(0.65, 'rgba(0,0,0,0.28)');
  gradient.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 256, 256);
  const texture = new THREE.CanvasTexture(shadowCanvas);
  const shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(width, depth),
    new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      depthWrite: false,
    }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.012;
  return shadow;
}

const assetGroup = new THREE.Group();
scene.add(assetGroup);

function fitCamera(target, view, pad = 1.04) {
  const bounds = new THREE.Box3().setFromObject(target);
  const center = bounds.getCenter(new THREE.Vector3());
  const direction = view.clone().normalize();
  // A straight-down view is degenerate with the default up vector.
  if (Math.abs(direction.y) > 0.92) {
    camera.up.set(0, 0, -1);
  } else {
    camera.up.set(0, 1, 0);
  }
  const corners = [];
  for (const x of [bounds.min.x, bounds.max.x]) {
    for (const y of [bounds.min.y, bounds.max.y]) {
      for (const z of [bounds.min.z, bounds.max.z]) {
        corners.push(new THREE.Vector3(x, y, z));
      }
    }
  }

  let distance = bounds.getSize(new THREE.Vector3()).length() * 1.6;
  const frustum = new THREE.Frustum();
  const viewProjection = new THREE.Matrix4();
  const fits = () => {
    camera.position.copy(center).addScaledVector(direction, distance);
    camera.lookAt(center);
    camera.updateMatrixWorld();
    viewProjection.multiplyMatrices(
      camera.projectionMatrix,
      camera.matrixWorldInverse,
    );
    frustum.setFromProjectionMatrix(viewProjection);
    return corners.every((corner) => frustum.containsPoint(corner));
  };

  for (let step = 0; step < 26; step += 1) {
    distance *= fits() ? 0.9 : 1.1;
  }
  camera.position.copy(center).addScaledVector(direction, distance * pad);
  camera.lookAt(center);
  camera.updateProjectionMatrix();
}

if (piece.kind === 'car') {
  const track = buildTrack(straightPath(14), 14);
  assetGroup.add(track);
  const car = createCar();
  car.position.set(0, 0, 6);
  assetGroup.add(car);
  const shadow = createContactShadow(3.4, 2.2);
  shadow.position.set(0, 0.012, 6);
  assetGroup.add(shadow);
  // Both comparison views read the body on its own: the track surface would
  // hide the lower body behind its own edge and clutter the silhouette.
  if (piece.view === 'side' || piece.view === 'ref') {
    track.visible = false;
  }
  if (piece.view === 'side') {
    // Pure elevation: catches rake, ride height, and arch clearance, which a
    // three-quarter view always hides. Car sits at z = 6 and is 0.78 tall.
    camera.fov = 24;
    camera.updateProjectionMatrix();
    camera.position.set(14, 1.15, 6.2);
    camera.lookAt(0, 0.42, 6);
  } else if (piece.view === 'ref') {
    // Framed to match docs/reference/mach-speeder-hero.jpg: front three-quarter,
    // about 22 degrees above the horizon, close enough to fill the frame.
    camera.fov = 28;
    camera.updateProjectionMatrix();
    camera.position.set(2.65, 1.95, 8.9);
    camera.lookAt(0, 0.4, 6.08);
  } else {
    camera.fov = 28;
    camera.updateProjectionMatrix();
    camera.position.set(4.2, 2.5, 10.6);
    camera.lookAt(0, 0.45, 6.2);
  }
} else if (piece.kind === 'cockpit') {
  const track = buildTrack(straightPath(90), 90);
  assetGroup.add(track);

  // The cockpit view is a camera rig, not the exterior model: the shell would
  // occlude the dashboard from the driver's eye.
  const hood = new THREE.Mesh(
    new THREE.BoxGeometry(1.02, 0.06, 1.2),
    new THREE.MeshStandardMaterial({
      color: 0xa30f1d,
      metalness: 0.78,
      roughness: 0.2,
    }),
  );
  hood.position.set(0, 0.34, 0.85);
  hood.scale.set(1, 1, 0.78);
  hood.rotation.x = 0.04;
  assetGroup.add(hood);

  const dashPivot = new THREE.Group();
  dashPivot.position.set(0, 0.54, 0.86);
  dashPivot.rotation.y = Math.PI;
  const dashboard = createCockpitDashboard();
  dashboard.scale.setScalar(0.92);
  dashboard.rotation.x = 0.45;
  dashPivot.add(dashboard);
  assetGroup.add(dashPivot);

  const wheel = createSteeringWheel();
  wheel.scale.setScalar(0.74);
  wheel.position.set(0, 0.5, 0.5);
  wheel.rotation.x = -0.2;
  assetGroup.add(wheel);

  camera.fov = 70;
  camera.near = 0.03;
  camera.updateProjectionMatrix();
  camera.position.set(0, 0.84, 0);
  camera.lookAt(0, 0.6, 60);
  scene.fog = new THREE.Fog(0x070a10, 25, 95);
} else if (piece.kind === 'building') {
  const map = createWindowTexture();
  const material = new THREE.MeshStandardMaterial({
    map,
    emissive: 0xffffff,
    emissiveMap: map,
    emissiveIntensity: 0.85,
    roughness: 0.92,
    metalness: 0.06,
  });
  const building = new THREE.Mesh(
    new THREE.BoxGeometry(
      piece.size.width,
      piece.size.height,
      piece.size.depth,
    ),
    material,
  );
  building.position.y = piece.size.height / 2;
  building.name = 'building';
  assetGroup.add(building);
  fitCamera(assetGroup, piece.view ?? new THREE.Vector3(1, 0.55, 1), 1.08);
} else {
  const track = buildTrack(piece.path, piece.length, { boost: piece.boost });
  assetGroup.add(track);
  if (piece.showLeadIn) {
    // Show the piece in context: track leading in and out proves the
    // entrance and exit rather than reading as a closed ring.
    const leadIn = buildTrack(straightPath(7), 7);
    leadIn.position.z = -7;
    const leadOut = buildTrack(straightPath(7), 7);
    const exit = piece.leadOut ?? { x: TRACK.loopOffset, y: 0, z: 0 };
    leadOut.position.set(exit.x, exit.y, exit.z);
    assetGroup.add(leadIn, leadOut);
  }
  if (piece.landmark) {
    const map = createWindowTexture();
    const material = new THREE.MeshStandardMaterial({
      map,
      emissive: 0xffffff,
      emissiveMap: map,
      emissiveIntensity: 0.85,
      roughness: 0.92,
      metalness: 0.06,
    });
    const building = new THREE.Mesh(
      new THREE.BoxGeometry(
        piece.landmark.width,
        piece.landmark.height,
        piece.landmark.depth,
      ),
      material,
    );
    building.position.set(
      piece.landmark.radius,
      piece.landmark.height / 2,
      0,
    );
    building.name = 'spiral-landmark';
    assetGroup.add(building);
  }
  fitCamera(assetGroup, piece.view ?? new THREE.Vector3(1, 0.72, 1), 1.12);
}

// Drop the ground below the lowest geometry so banks never sink through it.
const sceneBounds = new THREE.Box3().setFromObject(assetGroup);
const groundY = Math.min(-0.02, sceneBounds.min.y - 0.25);
ground.position.y = groundY;
grid.position.y = groundY + 0.002;

/**
 * Export the asset (not the studio floor) as a binary glTF and return base64.
 * Used by tools/export-glb.mjs.
 */
window.__exportGlb = () =>
  new Promise((resolve, reject) => {
    new GLTFExporter().parse(
      assetGroup,
      (result) => {
        const bytes = new Uint8Array(result);
        let binary = '';
        for (let offset = 0; offset < bytes.length; offset += 0x8000) {
          binary += String.fromCharCode(
            ...bytes.subarray(offset, offset + 0x8000),
          );
        }
        resolve(btoa(binary));
      },
      reject,
      { binary: true, onlyVisible: true },
    );
  });

window.addEventListener('resize', () => {
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.render(scene, camera);
});

let renderedFrames = 0;
function render() {
  renderer.render(scene, camera);
  renderedFrames += 1;
  if (renderedFrames > 2) {
    window.__previewReady = true;
    return;
  }
  window.requestAnimationFrame(render);
}
render();
