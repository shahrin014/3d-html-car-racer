import * as THREE from 'three';
import {
  OBSTACLE_DEPTH,
  OBSTACLE_HEIGHT,
  OBSTACLE_LATERAL_OFFSET,
  OBSTACLE_ROWS,
  OBSTACLE_WIDTH,
} from './constants';
import type { Circuit } from './track';

/** One solid hazard block, in world space. */
export interface ObstacleSpec {
  /** Centre of the block. */
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
  halfExtents: THREE.Vector3;
  /** Index of the circuit piece that carries the block, for tests and tools. */
  pieceIndex: number;
}

export interface ObstacleMesh {
  group: THREE.Group;
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

/**
 * Place the hazard blocks on every obstacle segment.
 *
 * A row sits between the rails and leaves a clear corridor down the centre, so
 * the car and the rivals can drive through without being forced into an
 * impossible lane change. Rows alternate sides and occasionally put a block on
 * both edges as a gate. The circuit seed chooses the pattern, so the same
 * circuit always carries the same obstacles.
 */
export function obstacleSpecs(circuit: Circuit): ObstacleSpec[] {
  const specs: ObstacleSpec[] = [];
  const halfExtents = new THREE.Vector3(
    OBSTACLE_WIDTH / 2,
    OBSTACLE_HEIGHT / 2,
    OBSTACLE_DEPTH / 2,
  );

  circuit.pieces.forEach((piece, pieceIndex) => {
    if (piece.kind !== 'obstacles') {
      return;
    }
    const random = seededRandom(
      `${circuit.seed}:${circuit.level}:${pieceIndex}:obstacles`,
    );
    const startSide = random() < 0.5 ? -1 : 1;
    const quaternion = new THREE.Quaternion().setFromRotationMatrix(
      piece.matrix,
    );

    for (let row = 0; row < OBSTACLE_ROWS; row += 1) {
      const gate = random() < 0.22;
      const sides = gate
        ? [-1, 1]
        : [row % 2 === 0 ? startSide : -startSide];
      const z = ((row + 1) / (OBSTACLE_ROWS + 1)) * piece.length;
      for (const side of sides) {
        const local = new THREE.Vector3(
          side * OBSTACLE_LATERAL_OFFSET,
          OBSTACLE_HEIGHT / 2,
          z,
        );
        specs.push({
          position: local.applyMatrix4(piece.matrix),
          quaternion: quaternion.clone(),
          halfExtents: halfExtents.clone(),
          pieceIndex,
        });
      }
    }
  });

  return specs;
}

/** Dark block with bright diagonal hazard stripes and a glowing top edge. */
function createHazardTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('2D canvas is unavailable');
  }
  ctx.fillStyle = '#1a1206';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = '#ffc928';
  ctx.lineWidth = 16;
  for (let offset = -128; offset < 256; offset += 40) {
    ctx.beginPath();
    ctx.moveTo(offset, 0);
    ctx.lineTo(offset + 128, 128);
    ctx.stroke();
  }
  ctx.fillStyle = '#ff5a1f';
  ctx.fillRect(0, 0, canvas.width, 10);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 4;
  return texture;
}

/** Instanced hazard blocks for the current circuit. */
export function buildObstacleMesh(
  specs: readonly ObstacleSpec[],
): ObstacleMesh {
  const group = new THREE.Group();
  if (specs.length === 0) {
    return { group, dispose: () => {} };
  }

  const texture = createHazardTexture();
  const material = new THREE.MeshStandardMaterial({
    map: texture,
    emissive: 0xffa000,
    emissiveMap: texture,
    emissiveIntensity: 0.7,
    roughness: 0.55,
    metalness: 0.1,
  });
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const mesh = new THREE.InstancedMesh(geometry, material, specs.length);
  // The blocks are spread around the circuit, so the single origin-centred
  // bounding volume would cull them as soon as the camera leaves the start.
  mesh.frustumCulled = false;
  const matrix = new THREE.Matrix4();
  const scale = new THREE.Vector3();
  specs.forEach((spec, index) => {
    scale.copy(spec.halfExtents).multiplyScalar(2);
    matrix.compose(spec.position, spec.quaternion, scale);
    mesh.setMatrixAt(index, matrix);
  });
  mesh.instanceMatrix.needsUpdate = true;
  group.add(mesh);

  return {
    group,
    dispose: () => {
      geometry.dispose();
      material.dispose();
      texture.dispose();
    },
  };
}
