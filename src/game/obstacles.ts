import * as THREE from 'three';
import {
  CAR_WIDTH,
  OBSTACLE_DEPTH,
  OBSTACLE_HEIGHT,
  OBSTACLE_LATERAL_OFFSET,
  OBSTACLE_ROWS,
  OBSTACLE_WIDTH,
  TRACK_WIDTH,
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

/** One row of an obstacle corridor, in the piece's local frame. */
export interface ObstacleRow {
  /** Distance along the piece, metres. */
  z: number;
  /** Lateral offsets of the row's blocks, metres from the centreline. */
  blocked: number[];
}

/** The stretch of circuit one obstacle corridor occupies, for rival weaving. */
export interface ObstacleLane {
  sFrom: number;
  sTo: number;
  rows: ObstacleRow[];
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
 * The seeded rows of one obstacle corridor: each row carries a gate (both
 * edges), a centre block, or a single edge block. A gate keeps the middle
 * open, a centre block sends the car to either edge, and a single edge block
 * leaves both the middle and the far edge open, so every row always has a
 * passable gap wider than a car. The circuit seed chooses the pattern and
 * `obstacleSpecs` and `obstacleLanes` both call this, so the drawn blocks and
 * the weaving line rivals follow can never drift apart.
 */
function obstacleRows(
  seed: string,
  level: number,
  pieceIndex: number,
  length: number,
): ObstacleRow[] {
  const random = seededRandom(`${seed}:${level}:${pieceIndex}:obstacles`);
  const startSide = random() < 0.5 ? -1 : 1;
  const rows: ObstacleRow[] = [];
  for (let row = 0; row < OBSTACLE_ROWS; row += 1) {
    const roll = random();
    const side = (row % 2 === 0 ? startSide : -startSide) * OBSTACLE_LATERAL_OFFSET;
    let blocked: number[];
    if (roll < 0.2) {
      blocked = [-OBSTACLE_LATERAL_OFFSET, OBSTACLE_LATERAL_OFFSET];
    } else if (roll < 0.5) {
      blocked = [0];
    } else {
      blocked = [side];
    }
    rows.push({
      z: ((row + 1) / (OBSTACLE_ROWS + 1)) * length,
      blocked,
    });
  }
  return rows;
}

/** Lane geometry for every obstacle corridor in the circuit, in circuit order. */
export function obstacleLanes(circuit: Circuit): ObstacleLane[] {
  const lanes: ObstacleLane[] = [];
  let distance = 0;
  circuit.pieces.forEach((piece, pieceIndex) => {
    if (piece.kind === 'obstacles') {
      lanes.push({
        sFrom: distance,
        sTo: distance + piece.length,
        rows: obstacleRows(circuit.seed, circuit.level, pieceIndex, piece.length),
      });
    }
    distance += piece.length;
  });
  return lanes;
}

/**
 * Place the hazard blocks on every obstacle segment.
 *
 * Rows alternate between single edge blocks, centre blocks, and occasional
 * double-edge gates, so the player has to weave through the corridor rather
 * than driving straight down the middle. Rivals follow `obstacleLanes` to
 * steer around every block, so the corridor is impassable for nothing.
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
    const rows = obstacleRows(circuit.seed, circuit.level, pieceIndex, piece.length);
    const quaternion = new THREE.Quaternion().setFromRotationMatrix(
      piece.matrix,
    );

    for (const row of rows) {
      for (const side of row.blocked) {
        const local = new THREE.Vector3(
          side,
          OBSTACLE_HEIGHT / 2,
          row.z,
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

/**
 * A lateral offset (metres) inside one corridor row that clears every block by
 * at least a car width worth of margin, preferring the position closest to
 * `want` so rivals and transitions move as little as possible.
 */
function nearestFreeLateral(
  blocked: readonly number[],
  want: number,
  carHalf = CAR_WIDTH / 2,
  blockHalf = OBSTACLE_WIDTH / 2,
  margin = 0.15,
): number {
  const keep = blockHalf + carHalf + margin;
  const limit = TRACK_WIDTH / 2 - carHalf - margin;
  // Merge the forbidden intervals (a block plus the clearance around a car).
  const forbidden = blocked
    .map((centre): [number, number] => [centre - keep, centre + keep])
    .sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [];
  for (const interval of forbidden) {
    const last = merged[merged.length - 1];
    if (last && interval[0] <= last[1]) {
      last[1] = Math.max(last[1], interval[1]);
    } else {
      merged.push([interval[0], interval[1]]);
    }
  }
  // The free intervals are the gaps between merged blocks, inside the rails.
  const free: [number, number][] = [];
  let edge = -limit;
  for (const [lo, hi] of merged) {
    if (lo > edge + 1e-6) {
      free.push([edge, lo]);
    }
    edge = Math.max(edge, hi);
  }
  if (edge < limit - 1e-6) {
    free.push([edge, limit]);
  }
  if (free.length === 0) {
    return THREE.MathUtils.clamp(want, -limit, limit);
  }
  let best: [number, number] = free[0]!;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const interval of free) {
    const distance =
      want < interval[0]
        ? interval[0] - want
        : want > interval[1]
          ? want - interval[1]
          : 0;
    if (distance < bestDistance) {
      bestDistance = distance;
      best = interval;
    }
  }
  // Stay inside the free interval so the rival keeps `keep` between its body
  // and every block; only the last step to the nearest gap edge is allowed.
  if (want < best[0]) {
    return best[0];
  }
  if (want > best[1]) {
    return best[1];
  }
  return want;
}

function smoothStep(t: number): number {
  return t * t * (3 - 2 * t);
}

/**
 * The lateral offset (metres) a rival should hold at distance `s` on the
 * circuit. Outside an obstacle corridor it is the rival's home lane; inside,
 * it follows the corridor's rows end to end, easing back onto the home lane
 * after the last row. The chosen line always clears every block by a car width
 * (verified by the weave test), and because `previous` seeds the very first
 * row the weave cannot jump when a rival enters or crosses a corridor.
 */
export function weaveLateral(
  lanes: readonly ObstacleLane[],
  s: number,
  previous: number,
  homeLane: number,
): number {
  const lane = lanes.find((candidate) => s >= candidate.sFrom && s <= candidate.sTo);
  if (!lane) {
    return homeLane;
  }
  // Greedy continuity: the first row eases from where the rival already was,
  // and every later row eases from the row before it, so the line is smooth.
  const columns: number[] = [];
  let want = previous;
  for (const row of lane.rows) {
    want = nearestFreeLateral(row.blocked, want);
    columns.push(want);
  }
  const z = s - lane.sFrom;
  const firstZ = lane.rows[0]?.z ?? 0;
  const lastZ = lane.rows[lane.rows.length - 1]?.z ?? lane.sTo - lane.sFrom;
  const lastColumn = columns[columns.length - 1] ?? homeLane;

  if (z <= firstZ) {
    const blend = firstZ > 1e-6 ? smoothStep(THREE.MathUtils.clamp(z / firstZ, 0, 1)) : 1;
    return homeLane + (columns[0]! - homeLane) * blend;
  }
  const segments = lane.rows.length - 1;
  for (let index = 0; index < segments; index += 1) {
    const row = lane.rows[index]!;
    const next = lane.rows[index + 1]!;
    if (z <= next.z) {
      const t = smoothStep(
        THREE.MathUtils.clamp((z - row.z) / Math.max(1e-6, next.z - row.z), 0, 1),
      );
      return columns[index]! + (columns[index + 1]! - columns[index]!) * t;
    }
  }
  const exit = lane.sTo - lane.sFrom - lastZ;
  const blend = exit > 1e-6 ? smoothStep(THREE.MathUtils.clamp((z - lastZ) / exit, 0, 1)) : 1;
  return lastColumn + (homeLane - lastColumn) * blend;
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
