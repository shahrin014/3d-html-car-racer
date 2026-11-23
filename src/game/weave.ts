// WIP — multi-crossing layout draft. This module is typechecked but not wired
// into generateCircuit, the game, or the preview yet. See
// docs/multi-crossing-wip.md for the handoff and remaining steps.
import * as THREE from 'three';
import { TRACK_THICKNESS } from './constants';
import {
  WEAVE_SCALE,
  WEAVE_SCALE_VARIANCE,
  WEAVE_SEGMENTS,
} from './constants';
import type { Circuit, Piece, TrackPath, TrackSample } from './track';

/**
 * Weave layout: a single closed 3D path whose plan view crosses itself three
 * times. The trefoil curve is authored once; the seed only scales and rotates
 * it. Crossings are separated vertically by the curve itself, so the car drives
 * over and under its own route without gaps, jumps, or forks.
 *
 * The classic trefoil is (sin t + 2 sin 2t, cos t - 2 cos 2t, -sin 3t). Game Y
 * is the vertical axis, so the second component is height and X/Z is the plan.
 */
function weaveSample(
  t: number,
  scale: number,
  rotation: number,
  lift: number,
): TrackSample {
  const cosRotation = Math.cos(rotation);
  const sinRotation = Math.sin(rotation);

  const rawX = scale * (Math.sin(t) + 2 * Math.sin(2 * t));
  const rawY = scale * (Math.cos(t) - 2 * Math.cos(2 * t));
  const rawZ = scale * -Math.sin(3 * t);
  const rawTx = scale * (Math.cos(t) + 4 * Math.cos(2 * t));
  const rawTy = scale * (-Math.sin(t) + 4 * Math.sin(2 * t));
  const rawTz = scale * (-3 * Math.cos(3 * t));

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

/** Lowest raw height over the trefoil, used to float the whole weave. */
function weaveLift(scale: number): number {
  let minimum = Number.POSITIVE_INFINITY;
  for (let index = 0; index <= 256; index += 1) {
    const t = (index / 256) * Math.PI * 2;
    minimum = Math.min(minimum, scale * (Math.cos(t) - 2 * Math.cos(2 * t)));
  }
  return -minimum + TRACK_THICKNESS + 0.25;
}

function weaveSegmentPath(
  start: number,
  end: number,
  scale: number,
  rotation: number,
  lift: number,
): TrackPath {
  return (t) =>
    weaveSample(start + (end - start) * t, scale, rotation, lift);
}

function weaveArcLength(
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
    const point = weaveSample(t, scale, rotation, lift).position;
    if (previous) {
      length += point.distanceTo(previous);
    }
    previous = point;
  }
  return length;
}

export function assembleWeaveCircuit(
  seed: string,
  level: number,
  seedOffset: number,
  random: () => number,
): Circuit {
  const scale = WEAVE_SCALE + random() * WEAVE_SCALE_VARIANCE;
  const rotation = random() * Math.PI * 2;
  const lift = weaveLift(scale);
  const boostCount = 2 + (random() < 0.5 ? 1 : 0);
  const boostSegments = new Set<number>();
  while (boostSegments.size < boostCount) {
    boostSegments.add(1 + Math.floor(random() * (WEAVE_SEGMENTS - 2)));
  }

  const pieces: Piece[] = [];
  let total = 0;
  for (let index = 0; index < WEAVE_SEGMENTS; index += 1) {
    const start = (index / WEAVE_SEGMENTS) * Math.PI * 2;
    const end = ((index + 1) / WEAVE_SEGMENTS) * Math.PI * 2;
    const length = weaveArcLength(start, end, scale, rotation, lift);
    pieces.push({
      kind: 'multi-crossing',
      path: weaveSegmentPath(start, end, scale, rotation, lift),
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
