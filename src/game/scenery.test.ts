import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  SCENERY_CLEARANCE,
  SCENERY_LANDMARK_CLEARANCE,
  SCENERY_LANDMARK_SPACING,
  SCENERY_MAX_HEIGHT,
  SCENERY_MIN_HEIGHT,
  buildScenery,
  clearsTrack,
  planSkyline,
} from './scenery';
import { buildFrames, generateCircuit } from './track';

const frames = buildFrames(generateCircuit('skyline', 1));

describe('city skyline', () => {
  it('plans the same city for the same circuit seed', () => {
    expect(planSkyline(frames, 'skyline')).toEqual(planSkyline(frames, 'skyline'));
  });

  it('plans a different city for a different seed', () => {
    const first = planSkyline(frames, 'skyline');
    const second = planSkyline(frames, 'other-city');
    expect(first.length).toBeGreaterThan(10);
    expect(second.length).toBeGreaterThan(10);
    expect(second).not.toEqual(first);
  });

  it('keeps every building clear of the deck', () => {
    for (const seed of ['skyline', 'other-city', 'third']) {
      const buildings = planSkyline(frames, seed);
      for (const building of buildings) {
        expect(clearsTrack(frames, building.x, building.z)).toBe(true);
        expect(
          clearsTrack(frames, building.x, building.z, SCENERY_CLEARANCE),
        ).toBe(true);
      }
    }
  });

  it('puts a landmark inside the spiral opening and keeps it clear', () => {
    let circuit: ReturnType<typeof generateCircuit> | null = null;
    for (let index = 0; index < 60; index += 1) {
      const candidate = generateCircuit(`landmark-${index}`, 1);
      if (candidate.pieces.some((piece) => piece.kind === 'spiral-up')) {
        circuit = candidate;
        break;
      }
    }
    expect(circuit).not.toBeNull();
    const spiral = circuit!.pieces.find((piece) => piece.kind === 'spiral-up');
    const center = spiral?.spiralCenter;
    expect(center).toBeDefined();

    const circuitFrames = buildFrames(circuit!);
    expect(
      clearsTrack(
        circuitFrames,
        center!.x,
        center!.z,
        SCENERY_LANDMARK_CLEARANCE,
      ),
    ).toBe(true);

    const landmark = {
      x: center!.x,
      z: center!.z,
      width: 12,
      depth: 12,
      height: 26,
      rotation: 0,
    };
    const buildings = planSkyline(circuitFrames, circuit!.seed, [landmark]);
    expect(buildings).toContainEqual(landmark);
    for (const building of buildings) {
      if (building === landmark) {
        continue;
      }
      expect(
        Math.hypot(building.x - landmark.x, building.z - landmark.z),
      ).toBeGreaterThanOrEqual(SCENERY_LANDMARK_SPACING);
    }
  });

  it('mixes low blocks with taller towers', () => {
    const heights = planSkyline(frames, 'skyline').map(
      (building) => building.height,
    );
    expect(Math.min(...heights)).toBeGreaterThanOrEqual(SCENERY_MIN_HEIGHT);
    expect(Math.max(...heights)).toBeLessThanOrEqual(SCENERY_MAX_HEIGHT);
    expect(heights.filter((height) => height > 18).length).toBeGreaterThan(0);
    expect(heights.filter((height) => height <= 18).length).toBeGreaterThan(0);
  });

  it('places one instance per planned building', () => {
    const texture = new THREE.Texture();
    const scenery = buildScenery(frames, 'skyline', texture);
    const mesh = scenery.group.children[0] as THREE.InstancedMesh;
    expect(scenery.count).toBe(planSkyline(frames, 'skyline').length);
    expect(mesh.count).toBe(scenery.count);

    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    for (let index = 0; index < scenery.count; index += 1) {
      mesh.getMatrixAt(index, matrix);
      matrix.decompose(position, quaternion, scale);
      expect(position.y).toBeGreaterThan(0);
      expect(scale.y).toBeGreaterThanOrEqual(SCENERY_MIN_HEIGHT);
    }
    scenery.dispose();
    texture.dispose();
  });

  it('rejects a point that sits on the racing line', () => {
    const frame = frames[0]!;
    expect(
      clearsTrack(frames, frame.position.x, frame.position.z),
    ).toBe(false);
  });
});
