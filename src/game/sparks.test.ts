import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { createSparkSystem } from './sparks';

describe('sparks', () => {
  it('adds a burst and ages every particle out', () => {
    const scene = new THREE.Scene();
    const sparks = createSparkSystem(scene);
    sparks.burst(new THREE.Vector3(), new THREE.Vector3(0, 1, 0), 24);
    expect(sparks.live).toBe(24);
    sparks.update(1);
    expect(sparks.live).toBe(0);
    sparks.dispose();
    expect(scene.children).toHaveLength(0);
  });

  it('caps the pool instead of growing without bound', () => {
    const scene = new THREE.Scene();
    const sparks = createSparkSystem(scene);
    sparks.burst(new THREE.Vector3(), new THREE.Vector3(0, 1, 0), 2000);
    expect(sparks.live).toBeLessThanOrEqual(420);
    sparks.dispose();
  });

  it('sprays from a tyre and clears on a restart', () => {
    const scene = new THREE.Scene();
    const sparks = createSparkSystem(scene);
    sparks.spray(
      new THREE.Vector3(0, 0.05, 0),
      new THREE.Vector3(0, 0, -1),
      8,
    );
    expect(sparks.live).toBe(8);
    sparks.clear();
    expect(sparks.live).toBe(0);
    sparks.dispose();
  });
});
