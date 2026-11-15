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
 * Query: ?piece=<id>. See PIECES below.
 */

const TRACK = {
  width: 3,
  thickness: 0.12,
  railWidth: 0.12,
  railHeight: 0.35,
  plank: 1.5,
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

function loopPath(radius) {
  return (t) => {
    const theta = Math.PI * 2 * t;
    return {
      position: new THREE.Vector3(
        0,
        radius * (1 - Math.cos(theta)),
        radius * Math.sin(theta),
      ),
      tangent: new THREE.Vector3(0, Math.sin(theta), Math.cos(theta)).normalize(),
      up: new THREE.Vector3(0, Math.cos(theta), -Math.sin(theta)).normalize(),
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
    meta: '360° · entry frame equals exit frame',
    length: Math.PI * 2 * 7,
    path: loopPath(7),
    view: new THREE.Vector3(1.2, 0.35, 1),
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
    title: 'Hot-wheels car · die-cast',
    meta: '2.2 × 1.0 × 0.7 m · rear wheels oversized · generated flame livery',
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

const rim = new THREE.DirectionalLight(0x22d3ee, 1.2);
rim.position.set(-12, 9, -14);
scene.add(rim);

scene.add(new THREE.AmbientLight(0x27445c, 0.35));

// A studio environment gives chrome, paint, and rims something to reflect.
const pmrem = new THREE.PMREMGenerator(renderer);
const environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environment = environment;
scene.environmentIntensity = 0.55;

const groundMaterial = new THREE.MeshBasicMaterial({ color: 0x05080e });
const ground = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), groundMaterial);
ground.rotation.x = -Math.PI / 2;
scene.add(ground);

const grid = new THREE.GridHelper(200, 100, 0x22334a, 0x141d29);
grid.material.transparent = true;
grid.material.opacity = 0.3;
scene.add(grid);

const orangeDark = new THREE.Color(0xe8500a);
const orangeLight = new THREE.Color(0xff6a12);
const surfaceMaterial = new THREE.MeshStandardMaterial({
  color: 0xffffff,
  roughness: 0.52,
  metalness: 0.08,
});
const railMaterial = new THREE.MeshStandardMaterial({
  color: 0xc6cedb,
  roughness: 0.34,
  metalness: 0.3,
});
const supportMaterial = new THREE.MeshStandardMaterial({
  color: 0x232a36,
  roughness: 0.9,
  metalness: 0.1,
});
const boostMaterial = new THREE.MeshStandardMaterial({
  color: 0x19e3ff,
  emissive: 0x0aa4c4,
  emissiveIntensity: 1.4,
  roughness: 0.35,
});

const matrix = new THREE.Matrix4();
const quaternion = new THREE.Quaternion();
const basis = new THREE.Matrix4();
const offset = new THREE.Vector3();

function buildTrack(path, length, { boost = false } = {}) {
  const group = new THREE.Group();
  const planks = Math.max(18, Math.round(length / TRACK.plank));
  const plankLength = (length / planks) * 1.04;
  const frames = [];

  for (let index = 0; index < planks; index += 1) {
    const t = (index + 0.5) / planks;
    const sample = path(t);
    const uprightRight = new THREE.Vector3()
      .crossVectors(sample.up, sample.tangent)
      .normalize();
    const bankedUp = sample.up
      .clone()
      .multiplyScalar(Math.cos(sample.bank))
      .addScaledVector(uprightRight, Math.sin(sample.bank))
      .normalize();
    frames.push({
      position: sample.position,
      tangent: sample.tangent,
      up: bankedUp,
      right: new THREE.Vector3()
        .crossVectors(bankedUp, sample.tangent)
        .normalize(),
    });
  }

  const plankMesh = new THREE.InstancedMesh(
    new THREE.BoxGeometry(TRACK.width, TRACK.thickness, plankLength),
    surfaceMaterial,
    frames.length,
  );
  plankMesh.instanceColor = new THREE.InstancedBufferAttribute(
    new Float32Array(frames.length * 3),
    3,
  );
  const railMesh = new THREE.InstancedMesh(
    new THREE.BoxGeometry(TRACK.railWidth, TRACK.railHeight, plankLength),
    railMaterial,
    frames.length * 2,
  );

  frames.forEach((frame, index) => {
    basis.makeBasis(frame.right, frame.up, frame.tangent);
    quaternion.setFromRotationMatrix(basis);

    offset
      .copy(frame.position)
      .addScaledVector(frame.up, -TRACK.thickness / 2);
    matrix.compose(offset, quaternion, new THREE.Vector3(1, 1, 1));
    plankMesh.setMatrixAt(index, matrix);
    plankMesh.setColorAt(index, index % 2 === 0 ? orangeDark : orangeLight);

    [-1, 1].forEach((side, sideIndex) => {
      offset
        .copy(frame.position)
        .addScaledVector(
          frame.right,
          side * (TRACK.width / 2 - TRACK.railWidth / 2),
        )
        .addScaledVector(frame.up, TRACK.railHeight / 2 - 0.01);
      matrix.compose(offset, quaternion, new THREE.Vector3(1, 1, 1));
      railMesh.setMatrixAt(index * 2 + sideIndex, matrix);
    });
  });

  plankMesh.instanceMatrix.needsUpdate = true;
  plankMesh.instanceColor.needsUpdate = true;
  railMesh.instanceMatrix.needsUpdate = true;
  plankMesh.frustumCulled = false;
  railMesh.frustumCulled = false;
  group.add(plankMesh, railMesh);

  frames.forEach((frame, index) => {
    if (index % 4 !== 0 || frame.position.y < 0.8) {
      return;
    }
    const height = frame.position.y;
    const column = new THREE.Mesh(
      new THREE.BoxGeometry(0.3, height, 0.3),
      supportMaterial,
    );
    column.position.set(frame.position.x, height / 2, frame.position.z);
    group.add(column);
  });

  if (boost) {
    const barGeometry = new THREE.BoxGeometry(0.95, 0.04, 0.26);
    const baseQuaternion = new THREE.Quaternion();
    for (let distance = 2; distance < length - 1; distance += 1.6) {
      const frame = path(distance / length);
      const right = new THREE.Vector3()
        .crossVectors(frame.up, frame.tangent)
        .normalize();
      basis.makeBasis(right, frame.up, frame.tangent);
      baseQuaternion.setFromRotationMatrix(basis);
      [-1, 1].forEach((side) => {
        const bar = new THREE.Mesh(barGeometry, boostMaterial);
        bar.quaternion.copy(baseQuaternion);
        bar.rotateY(side * 0.55);
        bar.position
          .copy(frame.position)
          .addScaledVector(frame.up, 0.01)
          .addScaledVector(right, side * 0.5)
          .addScaledVector(frame.tangent, 0.32);
        group.add(bar);
      });
    }
  }

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
      color: 0xc0103f,
      metalness: 0.6,
      roughness: 0.28,
    }),
  );
  hood.position.set(0, 0.3, 1.1);
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
  const track = buildTrack(piece.path, piece.length, { boost: piece.boost });
  assetGroup.add(track);
  fitCamera(track, piece.view ?? new THREE.Vector3(1, 0.72, 1));
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
