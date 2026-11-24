import * as THREE from 'three';
import { TRACK_THICKNESS } from './constants';
import type { Circuit, Piece, TrackPath, TrackSample } from './track';

/**
 * A closed 3D layout whose plan crosses itself exactly twice. The curve is a
 * small harmonic perturbation of a two-lobed figure; the two plan crossings
 * are separated by the curve's own height so the car passes over one branch
 * and under the other without a gap or a fork.
 *
 * Coefficients were chosen so the tightest plan radius is about 1.06 at unit
 * scale (12.7 m at the 12 m base scale) and the crossing height separations are
 * about 1.7 and 2.0 units (20 m and 24 m at the base scale).
 */
const CURVE = {
  a: 0.2077455776721595,
  b: 1.7741469223166693,
  c: 0.1137670448423509,
  d: -1.9618107474537827,
  e: 1.4869825496092575,
  f: 0.5575467207097415,
};
const BASE_SCALE = 12;
const SCALE_VARIANCE = 4;
const SEGMENTS = 12;
const HEIGHT_AMPLITUDE = Math.hypot(CURVE.e, CURVE.f);

function doubleCrossingSample(
  t: number,
  scale: number,
  rotation: number,
  lift: number,
): TrackSample {
  const cosRotation = Math.cos(rotation);
  const sinRotation = Math.sin(rotation);

  const rawX =
    scale *
    (Math.sin(t) +
      CURVE.a * Math.sin(2 * t) +
      CURVE.b * Math.sin(3 * t));
  const rawY =
    scale * (CURVE.e * Math.sin(2 * t) + CURVE.f * Math.cos(2 * t));
  const rawZ =
    scale *
    (Math.cos(t) +
      CURVE.c * Math.cos(2 * t) +
      CURVE.d * Math.cos(3 * t));
  const rawTx =
    scale *
    (Math.cos(t) +
      2 * CURVE.a * Math.cos(2 * t) +
      3 * CURVE.b * Math.cos(3 * t));
  const rawTy =
    scale *
    (2 * CURVE.e * Math.cos(2 * t) -
      2 * CURVE.f * Math.sin(2 * t));
  const rawTz =
    scale *
    (-Math.sin(t) -
      2 * CURVE.c * Math.sin(2 * t) -
      3 * CURVE.d * Math.sin(3 * t));

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

function doubleCrossingLift(scale: number): number {
  return HEIGHT_AMPLITUDE * scale + TRACK_THICKNESS + 0.25;
}

function doubleCrossingSegmentPath(
  start: number,
  end: number,
  scale: number,
  rotation: number,
  lift: number,
): TrackPath {
  return (t) =>
    doubleCrossingSample(start + (end - start) * t, scale, rotation, lift);
}

function doubleCrossingArcLength(
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
    const point = doubleCrossingSample(t, scale, rotation, lift).position;
    if (previous) {
      length += point.distanceTo(previous);
    }
    previous = point;
  }
  return length;
}

/**
 * Build the two-crossing layout for one seeded attempt. The seed only chooses
 * scale, plan rotation, and which segments carry boost strips; the curve and
 * its two crossings are fixed.
 */
export function assembleDoubleCrossingCircuit(
  seed: string,
  level: number,
  seedOffset: number,
  random: () => number,
): Circuit {
  const scale = BASE_SCALE + random() * SCALE_VARIANCE;
  const rotation = random() * Math.PI * 2;
  const lift = doubleCrossingLift(scale);
  const boostCount = 2 + (random() < 0.5 ? 1 : 0);
  const boostSegments = new Set<number>();
  while (boostSegments.size < boostCount) {
    boostSegments.add(1 + Math.floor(random() * (SEGMENTS - 2)));
  }

  const pieces: Piece[] = [];
  let total = 0;
  for (let index = 0; index < SEGMENTS; index += 1) {
    const start = (index / SEGMENTS) * Math.PI * 2;
    const end = ((index + 1) / SEGMENTS) * Math.PI * 2;
    const length = doubleCrossingArcLength(
      start,
      end,
      scale,
      rotation,
      lift,
    );
    pieces.push({
      kind: 'multi-crossing',
      path: doubleCrossingSegmentPath(start, end, scale, rotation, lift),
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
    layout: 'double-crossing',
    pieces,
    frameCount: pieces.reduce(
      (count, piece) => count + Math.ceil(piece.length / 0.4),
      0,
    ),
    totalLength: total,
  };
}
