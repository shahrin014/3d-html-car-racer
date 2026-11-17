import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  CAR_HEIGHT,
  CAR_WIDTH,
  JUMP_GAP_LENGTH,
  JUMP_HEIGHT,
  JUMP_KICKER_LENGTH,
  JUMP_LANDING_LENGTH,
  JUMP_LAUNCH_SLOPE,
  JUMP_LENGTH,
  LOOP_OFFSET,
  LOOP_RADIUS,
  LOOP_RETURN_LENGTH,
  MIN_TURN_RADIUS,
  RAIL_HEIGHT,
  TRACK_WIDTH,
} from './constants';
import {
  buildFrames,
  gapPath,
  generateCircuit,
  jumpPlanarLength,
  kickerPath,
  landingPath,
  loopPath,
  shiftPath,
  turnPath,
  type TrackPath,
} from './track';

/** Local frame at the end of a path, as the piece placement composes it. */
function endFrame(path: TrackPath): THREE.Matrix4 {
  const sample = path(1);
  return new THREE.Matrix4().makeBasis(
    new THREE.Vector3().crossVectors(sample.up, sample.tangent).normalize(),
    sample.up,
    sample.tangent,
  ).setPosition(sample.position);
}

const SEED = '2026-11-15';

describe('circuit generation', () => {
  it('is deterministic for the same seed and level', () => {
    const first = buildFrames(generateCircuit(SEED, 1));
    const second = buildFrames(generateCircuit(SEED, 1));
    expect(first.length).toBe(second.length);
    const a = first[Math.floor(first.length / 2)];
    const b = second[Math.floor(second.length / 2)];
    expect(a?.position.x).toBeCloseTo(b?.position.x ?? 0, 6);
    expect(a?.position.z).toBeCloseTo(b?.position.z ?? 0, 6);
  });

  it('produces a different circuit for a different seed', () => {
    const first = buildFrames(generateCircuit(SEED, 1));
    const second = buildFrames(generateCircuit('2026-11-16', 1));
    const a = first[Math.floor(first.length / 2)];
    const b = second[Math.floor(second.length / 2)];
    const differs =
      Math.abs((a?.position.x ?? 0) - (b?.position.x ?? 0)) > 1e-6 ||
      Math.abs((a?.position.z ?? 0) - (b?.position.z ?? 0)) > 1e-6;
    expect(differs).toBe(true);
  });

  it('closes back onto the start line', () => {
    const frames = buildFrames(generateCircuit(SEED, 1));
    const first = frames[0];
    const last = frames[frames.length - 1];
    expect(first).toBeDefined();
    expect(last).toBeDefined();
    expect(first?.position.distanceTo(last?.position ?? new THREE.Vector3())).toBeLessThan(0.02);
    const dot = first?.tangent.dot(last?.tangent ?? new THREE.Vector3()) ?? 0;
    expect(dot).toBeGreaterThan(0.999);
  });

  it('contains a loop, banked turns, and boost strips', () => {
    const circuit = generateCircuit(SEED, 1);
    expect(circuit.pieces.filter((piece) => piece.kind === 'loop').length).toBeGreaterThan(0);
    expect(circuit.pieces.filter((piece) => piece.kind === 'turn').length).toBeGreaterThanOrEqual(2);
    expect(circuit.pieces.filter((piece) => piece.kind === 'boost').length).toBeGreaterThanOrEqual(1);
  });

  it('keeps frames evenly spaced along the track', () => {
    const frames = buildFrames(generateCircuit(SEED, 1));
    const gaps: number[] = [];
    for (let index = 1; index < frames.length; index += 1) {
      const previous = frames[index - 1];
      const current = frames[index];
      if (previous && current) {
        gaps.push(previous.position.distanceTo(current.position));
      }
    }
    const average = gaps.reduce((sum, gap) => sum + gap, 0) / gaps.length;
    expect(average).toBeGreaterThan(0.2);
    expect(average).toBeLessThan(0.9);
  });
});

describe('track pieces', () => {
  it('gives the track seven car widths and a car-height rail', () => {
    expect(TRACK_WIDTH).toBe(CAR_WIDTH * 7);
    expect(RAIL_HEIGHT).toBeGreaterThanOrEqual(CAR_HEIGHT);
  });

  it('turns the car upside down at the top of the loop', () => {
    const top = loopPath()(0.5);
    expect(top.up.y).toBeCloseTo(-1, 6);
    expect(top.position.y).toBeGreaterThan(LOOP_RADIUS * 1.8);
  });

  it('swings the loop exit sideways, then the shift returns to the centreline', () => {
    const path = loopPath();
    const start = path(0);
    const end = path(1);
    expect(end.position.x - start.position.x).toBeCloseTo(LOOP_OFFSET, 5);
    // The exit lane must clear the entry lane by more than a track width.
    expect(end.position.x - start.position.x).toBeGreaterThan(TRACK_WIDTH);
    expect(start.up.dot(end.up)).toBeCloseTo(1, 6);
    const shifted = shiftPath(LOOP_OFFSET, LOOP_RETURN_LENGTH)(1);
    expect(shifted.position.x).toBeCloseTo(-LOOP_OFFSET, 6);
  });

  it('joins a kicker, gap, and landing into one launch', () => {
    const kicker = kickerPath();
    const gap = gapPath();
    const landing = landingPath();
    // The kicker lifts the car and ends pointing up the launch line; the gap
    // is empty space on that line; the landing ramp enters on the same line
    // and sinks back to a flat deck. Composing the three placed frames proves
    // the module ends flat, at ground height, and facing the way it started.
    const launch = new THREE.Vector3(0, JUMP_LAUNCH_SLOPE, 1).normalize();
    expect(kicker(1).position.y).toBeCloseTo(JUMP_HEIGHT, 6);
    expect(kicker(1).tangent.angleTo(launch)).toBeLessThan(1e-6);
    expect(gap(0).position.y).toBeCloseTo(0, 6);
    expect(gap(1).tangent.angleTo(new THREE.Vector3(0, 0, 1))).toBeLessThan(1e-6);
    expect(landing(0).tangent.angleTo(new THREE.Vector3(0, 0, 1))).toBeLessThan(
      1e-6,
    );

    const world = new THREE.Matrix4()
      .multiply(endFrame(kicker))
      .multiply(endFrame(gap))
      .multiply(endFrame(landing));
    const end = new THREE.Vector3(0, 0, 0).applyMatrix4(world);
    const heading = new THREE.Vector3(0, 0, 1)
      .transformDirection(world)
      .normalize();
    const up = new THREE.Vector3(0, 1, 0).transformDirection(world).normalize();
    expect(end.y).toBeCloseTo(0, 6);
    expect(heading.dot(new THREE.Vector3(0, 0, 1))).toBeCloseTo(1, 6);
    expect(up.dot(new THREE.Vector3(0, 1, 0))).toBeCloseTo(1, 6);

    expect(JUMP_LENGTH).toBe(
      JUMP_KICKER_LENGTH + JUMP_GAP_LENGTH + JUMP_LANDING_LENGTH,
    );
    expect(JUMP_LENGTH).toBe(30);
    // The module's plan advance is what the leg budget must reserve; it is
    // slightly longer than the three piece lengths because of the launch tilt.
    expect(jumpPlanarLength()).toBeGreaterThan(JUMP_LENGTH);
    expect(Math.hypot(end.x, end.z)).toBeCloseTo(jumpPlanarLength(), 4);
  });

  it('marks gap frames as non-solid for physics and the guide', () => {
    for (let index = 0; index < 40; index += 1) {
      const circuit = generateCircuit(`jump-check-${index}`, 1);
      if (!circuit.pieces.some((piece) => piece.kind === 'gap')) {
        continue;
      }
      const frames = buildFrames(circuit);
      const inGap = frames.filter((frame) => !frame.solid);
      expect(inGap.length).toBeGreaterThan(0);
      // Closure still holds with a jump in the layout.
      expect(
        frames[0]?.position.distanceTo(frames[frames.length - 1]!.position) ?? 1,
      ).toBeLessThan(0.05);
      return;
    }
    throw new Error('no jump circuit found');
  });

  it('clamps turn banking to the documented range', () => {
    const bank = turnPath(MIN_TURN_RADIUS, 90, true)(0.5).bank;
    const degrees = Math.abs((bank * 180) / Math.PI);
    expect(degrees).toBeGreaterThanOrEqual(20);
    expect(degrees).toBeLessThanOrEqual(45);
  });
});
