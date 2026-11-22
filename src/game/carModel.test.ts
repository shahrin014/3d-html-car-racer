import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { buildCar } from './Car';

const MODEL = path.resolve(process.cwd(), 'assets/car/mach.glb');

async function shippedScene() {
  const bytes = await readFile(MODEL);
  const gltf = await new GLTFLoader().parseAsync(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    '',
  );
  return gltf.scene;
}

function materials(group: THREE.Object3D) {
  const list: THREE.Material[] = [];
  group.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if (!mesh.isMesh) {
      return;
    }
    for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
      list.push(material);
    }
  });
  return list;
}

describe('car model', () => {
  it('ships four named wheel nodes inside the physics envelope', async () => {
    const scene = await shippedScene();
    for (const name of [
      'wheel-rear-left',
      'wheel-rear-right',
      'wheel-front-left',
      'wheel-front-right',
    ]) {
      expect(scene.getObjectByName(name), name).toBeTruthy();
    }
    const box = new THREE.Box3().setFromObject(scene);
    const size = box.getSize(new THREE.Vector3());
    expect(size.x).toBeLessThanOrEqual(1.32);
    expect(size.y).toBeLessThanOrEqual(0.68);
    expect(size.z).toBeLessThanOrEqual(2.47);
    expect(box.min.y).toBeGreaterThanOrEqual(-0.002);
  });

  it('marks the livery material with the selected paint', async () => {
    const scene = await shippedScene();
    const car = buildCar(scene, 0xff0000);
    const livery = materials(car.group).filter((material) => material.name === 'Livery');
    expect(livery.length).toBeGreaterThan(0);
    for (const material of livery) {
      expect(material.userData.paint).toBe(0xff0000);
    }
  });
});
