import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  CAR_HEIGHT,
  CAR_WIDTH,
  LOOP_OFFSET,
  LOOP_RADIUS,
  LOOP_RETURN_LENGTH,
  MIN_TURN_RADIUS,
  RAIL_HEIGHT,
  TRACK_WIDTH,
} from './constants';
import { buildFrames, generateCircuit, loopPath, shiftPath, turnPath } from './track';

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
  it('gives the track four or more car widths and a car-height rail', () => {
    expect(TRACK_WIDTH).toBeGreaterThanOrEqual(CAR_WIDTH * 4);
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
    expect(start.up.dot(end.up)).toBeCloseTo(1, 6);
    const shifted = shiftPath(LOOP_OFFSET, LOOP_RETURN_LENGTH)(1);
    expect(shifted.position.x).toBeCloseTo(-LOOP_OFFSET, 6);
  });

  it('clamps turn banking to the documented range', () => {
    const bank = turnPath(MIN_TURN_RADIUS, 90, true)(0.5).bank;
    const degrees = Math.abs((bank * 180) / Math.PI);
    expect(degrees).toBeGreaterThanOrEqual(20);
    expect(degrees).toBeLessThanOrEqual(45);
  });
});
