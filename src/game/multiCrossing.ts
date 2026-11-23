import * as THREE from 'three';
import {
  MULTI_CROSSING_SCALE,
  MULTI_CROSSING_SCALE_VARIANCE,
  MULTI_CROSSING_SEGMENTS,
  TRACK_THICKNESS,
} from './constants';
import type { Circuit, Piece, TrackPath, TrackSample } from './track';

/**
 * Multi-crossing layout: a single closed 3D path whose plan view crosses itself
 * three times. The trefoil curve is authored once; the seed only scales and
 * rotates it. Crossings are separated vertically by the curve itself, so the
 * car drives over and under its own route without gaps, jumps, or forks.
 *
 * The classic trefoil is (sin t + 2 sin 2t, cos t - 2 cos 2t, -sin 3t). The
 * first two components are the plan diagram with its three crossings; the
 * third is height. Game Y is the vertical axis, so the plan uses X/Z.
 */
function multiCrossingSample(
  t: number,
  scale: number,
  rotation: number,
  lift: number,
): TrackSample {
  const cosRotation = Math.cos(rotation);
  const sinRotation = Math.sin(rotation);

  const rawX = scale * (Math.sin(t) + 2 * Math.sin(2 * t));
  const rawY = scale * -Math.sin(3 * t);
  const rawZ = scale * (Math.cos(t) - 2 * Math.cos(2 * t));
  const rawTx = scale * (Math.cos(t) + 4 * Math.cos(2 * t));
  const rawTy = scale * (-3 * Math.cos(3 * t));
  const rawTz = scale * (-Math.sin(t) + 4 * Math.sin(2 * t));

  const x = rawX * cosRotation - rawZ * sinRotation;
  const z = rawX * sinRotation + rawZ * cosRotation;
  const tx = rawTx * cosRotation - rawTz * sinRotation;
  const tz = rawTx * sinRotation + rawTz * cosRotation;

  const tangent = new THREE.Vector3(tx, rawTy, tz).normalize();
  const right = new THREE.Vector3(tangent.z, 0, -tangent.x);
  if (right.lengthSq() < 1e-10) {
    right.set(1, 0, 0);
  }
  right.normalize();
  const up = new THREE.Vector3().crossVectors(tangent, right).normalize();

  return {
    position: new THREE.Vector3(x, rawY + lift, z),
    tangent,
    up,
    bank: 0,
  };
}

/** Lowest raw height over the trefoil, used to float the whole layout. */
function multiCrossingLift(scale: number): number {
  let minimum = Number.POSITIVE_INFINITY;
  for (let index = 0; index <= 256; index += 1) {
    const t = (index / 256) * Math.PI * 2;
    minimum = Math.min(minimum, -Math.sin(3 * t) * scale);
  }
  return -minimum + TRACK_THICKNESS + 0.25;
}

function multiCrossingSegmentPath(
  start: number,
  end: number,
  scale: number,
  rotation: number,
  lift: number,
): TrackPath {
  return (t) =>
    multiCrossingSample(start + (end - start) * t, scale, rotation, lift);
}

function multiCrossingArcLength(
  start: number,
  end: number,
  scale: number,
  rotation: number,
  lift: number,
): number {
  let length = 0;
  let previous: THREE.Vector3 | null = null;
  const steps = 96;
  for (let index = 0; index <= steps; index += 1) {
    const t = start + ((end - start) * index) / steps;
    const point = multiCrossingSample(t, scale, rotation, lift).position;
    if (previous) {
      length += point.distanceTo(previous);
    }
    previous = point;
  }
  return length;
}

/**
 * Build the trefoil layout for one seeded attempt. The seed only picks the
 * scale, the plan rotation, and which segments carry boost strips; the curve
 * itself is fixed, so every crossing and frame is reproducible.
 */
export function assembleMultiCrossingCircuit(
  seed: string,
  level: number,
  seedOffset: number,
  random: () => number,
): Circuit {
  const scale = MULTI_CROSSING_SCALE + random() * MULTI_CROSSING_SCALE_VARIANCE;
  const rotation = random() * Math.PI * 2;
  const lift = multiCrossingLift(scale);
  const boostCount = 2 + (random() < 0.5 ? 1 : 0);
  const boostSegments = new Set<number>();
  while (boostSegments.size < boostCount) {
    boostSegments.add(
      1 + Math.floor(random() * (MULTI_CROSSING_SEGMENTS - 2)),
    );
  }

  const pieces: Piece[] = [];
  let total = 0;
  for (let index = 0; index < MULTI_CROSSING_SEGMENTS; index += 1) {
    const start = (index / MULTI_CROSSING_SEGMENTS) * Math.PI * 2;
    const end = ((index + 1) / MULTI_CROSSING_SEGMENTS) * Math.PI * 2;
    const length = multiCrossingArcLength(
      start,
      end,
      scale,
      rotation,
      lift,
    );
    pieces.push({
      kind: 'multi-crossing',
      path: multiCrossingSegmentPath(start, end, scale, rotation, lift),
      length,
      matrix: new THREE.Matrix4(),
      ...(boostSegments.has(index) ? { boost: true } : {}),
    });
    total += length;
  }

  return {
    seed,
    level,
    seedOffset,
    layout: 'multi-crossing',
    pieces,
    frameCount: pieces.reduce(
      (count, piece) => count + Math.ceil(piece.length / 0.4),
      0,
    ),
    totalLength: total,
  };
}
