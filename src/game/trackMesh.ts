import * as THREE from 'three';
import {
  RAIL_HEIGHT,
  RAIL_SCALE,
  RAIL_WIDTH,
  SEAM_LENGTH,
  TRACK_THICKNESS,
  TRACK_WIDTH,
} from './constants';
import type { TrackFrame } from './track';

/** Orange plastic with seam lines and optional boost chevrons. */
export function createTrackTexture(boost = false): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('2D canvas is unavailable');
  }
  const gradient = ctx.createLinearGradient(0, 0, 128, 0);
  gradient.addColorStop(0, '#d94c0b');
  gradient.addColorStop(0.5, '#ff7a18');
  gradient.addColorStop(1, '#d94c0b');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 128, 256);
  ctx.fillStyle = 'rgba(74, 20, 0, 0.5)';
  ctx.fillRect(0, 0, 128, 4);
  ctx.fillStyle = 'rgba(255, 200, 150, 0.18)';
  ctx.fillRect(0, 4, 128, 3);
  if (boost) {
    ctx.strokeStyle = '#19e3ff';
    ctx.shadowColor = '#19e3ff';
    ctx.shadowBlur = 16;
    ctx.lineWidth = 9;
    for (const y of [190, 120]) {
      ctx.beginPath();
      ctx.moveTo(30, y);
      ctx.lineTo(64, y - 44);
      ctx.lineTo(98, y);
      ctx.stroke();
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 4;
  return texture;
}

function stripGeometry(
  frames: TrackFrame[],
  pointA: (frame: TrackFrame) => THREE.Vector3,
  pointB: (frame: TrackFrame) => THREE.Vector3,
  normalOf: (frame: TrackFrame) => THREE.Vector3,
): THREE.BufferGeometry {
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  frames.forEach((frame, index) => {
    const a = pointA(frame);
    const b = pointB(frame);
    const normal = normalOf(frame);
    positions.push(a.x, a.y, a.z, b.x, b.y, b.z);
    normals.push(normal.x, normal.y, normal.z, normal.x, normal.y, normal.z);
    const v = frame.s / SEAM_LENGTH;
    uvs.push(0, v, 1, v);
    if (index > 0) {
      const base = (index - 1) * 2;
      indices.push(base, base + 2, base + 1, base + 1, base + 2, base + 3);
    }
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  return geometry;
}

export interface TrackMesh {
  group: THREE.Group;
  dispose: () => void;
}

/**
 * Build the whole circuit as continuous swept surfaces: one drive surface, two
 * rails, and per-piece textures for boost strips. No instanced boxes, so there
 * are no gaps to catch on.
 */
export function buildTrackMesh(
  pieces: { frames: TrackFrame[]; boost?: boolean }[],
): TrackMesh {
  const group = new THREE.Group();
  const half = TRACK_WIDTH / 2;
  const railMaterial = new THREE.MeshStandardMaterial({
    color: 0xc6cedb,
    roughness: 0.34,
    metalness: 0.3,
    side: THREE.DoubleSide,
  });
  const textures: THREE.Texture[] = [];
  const geometries: THREE.BufferGeometry[] = [];

  for (const piece of pieces) {
    const frames = piece.frames;
    if (frames.length < 2) {
      continue;
    }
    const texture = createTrackTexture(piece.boost ?? false);
    textures.push(texture);
    const material = new THREE.MeshStandardMaterial({
      map: texture,
      roughness: 0.48,
      metalness: 0.06,
      side: THREE.DoubleSide,
    });

    const topLeft = (f: TrackFrame) =>
      f.position.clone().addScaledVector(f.right, -half);
    const topRight = (f: TrackFrame) =>
      f.position.clone().addScaledVector(f.right, half);
    const bottomLeft = (f: TrackFrame) =>
      topLeft(f).addScaledVector(f.up, -TRACK_THICKNESS);
    const bottomRight = (f: TrackFrame) =>
      topRight(f).addScaledVector(f.up, -TRACK_THICKNESS);

    const strips: [THREE.BufferGeometry, THREE.Material][] = [
      [stripGeometry(frames, topLeft, topRight, (f) => f.up), material],
      [
        stripGeometry(frames, bottomLeft, bottomRight, (f) =>
          f.up.clone().negate(),
        ),
        material,
      ],
      [
        stripGeometry(frames, topLeft, bottomLeft, (f) =>
          f.right.clone().negate(),
        ),
        material,
      ],
      [
        stripGeometry(frames, topRight, bottomRight, (f) => f.right.clone()),
        material,
      ],
    ];
    for (const [geometry, stripMaterial] of strips) {
      geometries.push(geometry);
      const mesh = new THREE.Mesh(geometry, stripMaterial);
      mesh.frustumCulled = false;
      group.add(mesh);
    }

    for (const side of [-1, 1]) {
      const lateral = side * (half - RAIL_WIDTH / 2);
      const base = (f: TrackFrame) =>
        f.position.clone().addScaledVector(f.right, lateral);
      const inner = (f: TrackFrame) =>
        base(f).addScaledVector(f.right, -side * (RAIL_WIDTH / 2));
      const outer = (f: TrackFrame) =>
        base(f).addScaledVector(f.right, side * (RAIL_WIDTH / 2));
      const lift = (point: THREE.Vector3, f: TrackFrame) =>
        point.clone().addScaledVector(f.up, RAIL_HEIGHT);

      const railStrips: THREE.BufferGeometry[] = [
        stripGeometry(frames, (f) => lift(inner(f), f), (f) => lift(outer(f), f), (f) => f.up),
        stripGeometry(frames, inner, (f) => lift(inner(f), f), (f) => f.right.clone().multiplyScalar(-side)),
        stripGeometry(frames, (f) => lift(outer(f), f), outer, (f) => f.right.clone().multiplyScalar(side)),
      ];
      for (const geometry of railStrips) {
        geometries.push(geometry);
        const mesh = new THREE.Mesh(geometry, railMaterial);
        mesh.frustumCulled = false;
        group.add(mesh);
      }
    }
  }

  // Supports under elevated, near-horizontal track.
  const supportMaterial = new THREE.MeshStandardMaterial({
    color: 0x232a36,
    roughness: 0.9,
  });
  const columnGeometry = new THREE.BoxGeometry(
    0.3 * RAIL_SCALE,
    1,
    0.3 * RAIL_SCALE,
  );
  for (const piece of pieces) {
    piece.frames.forEach((frame, index) => {
      if (index % 12 !== 0 || frame.position.y < 0.8 || frame.up.y < 0.3) {
        return;
      }
      const height = frame.position.y;
      const column = new THREE.Mesh(columnGeometry, supportMaterial);
      column.scale.y = height;
      column.position.set(frame.position.x, height / 2, frame.position.z);
      group.add(column);
    });
  }

  return {
    group,
    dispose: () => {
      for (const geometry of geometries) {
        geometry.dispose();
      }
      for (const texture of textures) {
        texture.dispose();
      }
      columnGeometry.dispose();
      supportMaterial.dispose();
      railMaterial.dispose();
    },
  };
}
