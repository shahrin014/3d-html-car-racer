import * as THREE from 'three';
import type { TrackFrame } from './track';

/**
 * City skyline around the circuit.
 *
 * One instanced box mesh of low blocks and taller towers with a lit-window
 * façade, placed on a jittered grid and rejected wherever it would come near
 * the deck. The seed is the circuit seed, so the same circuit always keeps its
 * skyline and a new circuit brings a new city with it.
 */
export const SCENERY_CLEARANCE = 16;
export const SCENERY_MIN_HEIGHT = 5;
export const SCENERY_MAX_HEIGHT = 34;
export const SCENERY_MARGIN = 70;
export const SCENERY_GRID = 16;
export const SCENERY_DENSITY = 0.72;

export interface Building {
  x: number;
  z: number;
  width: number;
  depth: number;
  height: number;
  rotation: number;
}

export interface Scenery {
  group: THREE.Group;
  count: number;
  dispose: () => void;
}

function seededRandom(seed: string): () => number {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return () => {
    hash += 0x6d2b79f5;
    let t = hash;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Dark façade with a grid of lit windows, tiled over every box face. */
function createWindowTexture(seed: string): THREE.CanvasTexture {
  const random = seededRandom(`${seed}:windows`);
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('2D canvas is unavailable');
  }
  ctx.fillStyle = '#0a121d';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // A single irregular façade instead of a small tile repeated over every
  // face: some floors are dark, some panes are wide, and a few structural
  // piers break the grid so a tower no longer reads as wallpaper.
  const columns = 8;
  const rows = 20;
  const cellWidth = canvas.width / columns;
  const cellHeight = canvas.height / rows;
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

  // Structural piers and a couple of darker service columns.
  ctx.fillStyle = 'rgba(4, 9, 16, 0.75)';
  for (let pier = 0; pier < 3; pier += 1) {
    const x = random() * canvas.width;
    ctx.fillRect(x, 0, canvas.width * (0.02 + random() * 0.035), canvas.height);
  }
  ctx.fillStyle = 'rgba(120, 190, 255, 0.08)';
  for (let band = 0; band < 2; band += 1) {
    ctx.fillRect(0, random() * canvas.height, canvas.width, 3);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  // One façade per face: repetition is what made the towers look tiled.
  texture.repeat.set(1, 1);
  texture.anisotropy = 4;
  return texture;
}

/** True when nothing on the circuit comes within `clearance` metres. */
export function clearsTrack(
  frames: TrackFrame[],
  x: number,
  z: number,
  clearance = SCENERY_CLEARANCE,
): boolean {
  const limit = clearance * clearance;
  for (const frame of frames) {
    const dx = frame.position.x - x;
    const dz = frame.position.z - z;
    if (dx * dx + dz * dz < limit) {
      return false;
    }
  }
  return true;
}

/** Deterministic building plan for a circuit; no rendering involved. */
export function planSkyline(frames: TrackFrame[], seed: string): Building[] {
  const random = seededRandom(`${seed}:scenery`);
  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minZ = Number.POSITIVE_INFINITY;
  let maxZ = Number.NEGATIVE_INFINITY;
  for (const frame of frames) {
    minX = Math.min(minX, frame.position.x);
    maxX = Math.max(maxX, frame.position.x);
    minZ = Math.min(minZ, frame.position.z);
    maxZ = Math.max(maxZ, frame.position.z);
  }
  if (!Number.isFinite(minX)) {
    return [];
  }

  const buildings: Building[] = [];
  for (let x = minX - SCENERY_MARGIN; x <= maxX + SCENERY_MARGIN; x += SCENERY_GRID) {
    for (let z = minZ - SCENERY_MARGIN; z <= maxZ + SCENERY_MARGIN; z += SCENERY_GRID) {
      if (random() > SCENERY_DENSITY) {
        continue;
      }
      const offsetX = x + (random() - 0.5) * SCENERY_GRID * 0.7;
      const offsetZ = z + (random() - 0.5) * SCENERY_GRID * 0.7;
      if (!clearsTrack(frames, offsetX, offsetZ)) {
        continue;
      }
      const tower = random() < 0.2;
      const height = tower
        ? SCENERY_MAX_HEIGHT * (0.55 + random() * 0.45)
        : SCENERY_MIN_HEIGHT + random() * (SCENERY_MAX_HEIGHT * 0.4);
      buildings.push({
        x: offsetX,
        z: offsetZ,
        width: 4 + random() * 7,
        depth: 4 + random() * 7,
        height,
        rotation: Math.floor(random() * 4) * (Math.PI / 2),
      });
    }
  }
  return buildings;
}

/**
 * Build the skyline. Passing `texture` is for tests: the caller owns it and it
 * is not disposed with the scenery.
 */
export function buildScenery(
  frames: TrackFrame[],
  seed: string,
  texture?: THREE.Texture,
): Scenery {
  const buildings = planSkyline(frames, seed);
  const map = texture ?? createWindowTexture(seed);
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const material = new THREE.MeshStandardMaterial({
    map,
    emissive: 0xffffff,
    emissiveMap: map,
    emissiveIntensity: 0.85,
    roughness: 0.92,
    metalness: 0.06,
  });
  const skyline = new THREE.InstancedMesh(geometry, material, buildings.length);
  skyline.frustumCulled = false;
  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  const position = new THREE.Vector3();
  const scale = new THREE.Vector3();
  const axis = new THREE.Vector3(0, 1, 0);
  buildings.forEach((building, index) => {
    position.set(building.x, building.height / 2, building.z);
    quaternion.setFromAxisAngle(axis, building.rotation);
    scale.set(building.width, building.height, building.depth);
    matrix.compose(position, quaternion, scale);
    skyline.setMatrixAt(index, matrix);
  });
  skyline.instanceMatrix.needsUpdate = true;

  const group = new THREE.Group();
  group.add(skyline);
  return {
    group,
    count: buildings.length,
    dispose: () => {
      geometry.dispose();
      material.dispose();
      if (!texture) {
        map.dispose();
      }
    },
  };
}
