import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
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
  /** Ring lift above the approach and ramp run into it, in metres. */
  loopLift: 0.8,
  loopRamp: 3.4,
  get loopAdvance() {
    return this.loopRamp * 2;
  },
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
 * Vertical loop with an entrance ramp and an exit ramp.
 *
 * A circle that touches the ground cannot be entered: its descending side
 * passes back through the approach at the same height. Real loops lift the ring
 * and feed it with ramps, so the descending side clears the entry track. The
 * piece therefore runs: ground → ramp up → 360° ring (bottom 0.8 m up) → ramp
 * down → ground, with the exit 6.8 m ahead of the entrance.
 */
function loopPath(radius, lift = TRACK.loopLift, ramp = TRACK.loopRamp) {
  const ringLength = Math.PI * 2 * radius;
  const rampFraction = ramp / (ramp * 2 + ringLength);
  const rampUp = (u) => {
    const smooth = u * u * (3 - 2 * u);
    const slope = (lift * 6 * u * (1 - u)) / ramp;
    const tangent = new THREE.Vector3(0, slope, 1).normalize();
    const right = new THREE.Vector3(1, 0, 0);
    return {
      position: new THREE.Vector3(0, lift * smooth, ramp * u),
      tangent,
      up: new THREE.Vector3().crossVectors(tangent, right).normalize(),
      bank: 0,
    };
  };

  return (t) => {
    if (t < rampFraction) {
      return rampUp(t / rampFraction);
    }
    if (t < 1 - rampFraction) {
      const u = (t - rampFraction) / (1 - 2 * rampFraction);
      const theta = Math.PI * 2 * u;
      const position = new THREE.Vector3(
        0,
        lift + radius * (1 - Math.cos(theta)),
        ramp + radius * Math.sin(theta),
      );
      const center = new THREE.Vector3(0, lift + radius, ramp);
      return {
        position,
        tangent: new THREE.Vector3(
          0,
          Math.sin(theta),
          Math.cos(theta),
        ).normalize(),
        up: center.clone().sub(position).normalize(),
        bank: 0,
      };
    }
    const u = (t - (1 - rampFraction)) / rampFraction;
    const upRamp = rampUp(1 - u);
    const tangent = new THREE.Vector3(
      0,
      -upRamp.tangent.y,
      upRamp.tangent.z,
    ).normalize();
    return {
      position: new THREE.Vector3(
        upRamp.position.x,
        upRamp.position.y,
        ramp + ramp * u,
      ),
      tangent,
      up: new THREE.Vector3()
        .crossVectors(tangent, new THREE.Vector3(1, 0, 0))
        .normalize(),
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
    meta: `360° · entrance and exit ${TRACK.loopAdvance} m apart`,
    length: Math.PI * 2 * 7 + TRACK.loopAdvance,
    path: loopPath(7),
    view: new THREE.Vector3(1, 0.32, 0.16),
    showLeadIn: true,
    railFade: {
      positions: [TRACK.loopRamp, TRACK.loopRamp + Math.PI * 2 * 7],
      halfWidth: 2.4,
    },
  },
  'hill-crest-2.5': {
    title: 'Hill · crest 2.5 m',
    meta: '16 m long · zero slope at both ends',
    length: 16,
    path: hillPath({ length: 16, height: 2.5 }),
    view: new THREE.Vector3(0.9, 0.45, 1),
  },
  'boost-12': {
    title: 'Boost straight · 12 m',
    meta: 'Armed acceleration strip · chevrons face the driving direction',
    length: 12,
    path: straightPath(12),
    boost: true,
    view: new THREE.Vector3(0.9, 0.6, 1),
  },
  car: {
    kind: 'car',
    title: 'Hypercar · die-cast',
    meta: '2.45 × 1.0 × 0.72 m · candy red · gold aero wheels · swan-neck wing',
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

scene.add(new THREE.HemisphereLight(0x9fd6ff, 0x0a1018, 0.65));

const key = new THREE.DirectionalLight(0xffe3b3, 1.6);
key.position.set(14, 22, 12);
scene.add(key);

const rim = new THREE.DirectionalLight(0x22d3ee, 0.45);
rim.position.set(-12, 9, -14);
scene.add(rim);

scene.add(new THREE.AmbientLight(0x27445c, 0.35));

// A studio environment gives chrome, paint, and rims something to reflect.
const pmrem = new THREE.PMREMGenerator(renderer);
const environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environment = environment;
scene.environmentIntensity = 0.55;

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
const supportMaterial = new THREE.MeshStandardMaterial({
  color: 0x232a36,
  roughness: 0.9,
  metalness: 0.1,
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

  const supportSpacing = Math.max(1, Math.round(6 / 0.35));
  frames.forEach((frame, index) => {
    // Pillars only under near-horizontal elevated track; a loop's ring is
    // carried by its own base, not by columns inside the opening.
    if (
      index % supportSpacing !== 0 ||
      frame.position.y < 0.8 ||
      frame.up.y < 0.75
    ) {
      return;
    }
    const top = frame.position.y - TRACK.thickness;
    const height = top + 1;
    const column = new THREE.Mesh(
      new THREE.BoxGeometry(0.3, height, 0.3),
      supportMaterial,
    );
    column.position.set(frame.position.x, (top - 1) / 2, frame.position.z);
    group.add(column);
  });

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
  camera.fov = 28;
  camera.updateProjectionMatrix();
  camera.position.set(4.2, 2.5, 10.6);
  camera.lookAt(0, 0.45, 6.2);
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
} else {
  const track = buildTrack(piece.path, piece.length, {
    boost: piece.boost,
    railFade: piece.railFade,
  });
  assetGroup.add(track);
  if (piece.showLeadIn) {
    // Show the loop in context: track leading in and out proves the
    // entrance and exit rather than reading as a closed ring.
    const leadIn = buildTrack(straightPath(7), 7);
    leadIn.position.z = -7;
    const leadOut = buildTrack(straightPath(7), 7);
    leadOut.position.z = TRACK.loopAdvance;
    assetGroup.add(leadIn, leadOut);
  }
  fitCamera(assetGroup, piece.view ?? new THREE.Vector3(1, 0.72, 1), 1.12);
}

// Drop the ground below the lowest geometry so banks never sink through it.
const sceneBounds = new THREE.Box3().setFromObject(assetGroup);
const groundY = Math.min(-0.02, sceneBounds.min.y - 0.25);
ground.position.y = groundY;
grid.position.y = groundY + 0.002;

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
