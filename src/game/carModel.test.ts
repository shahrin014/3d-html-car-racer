import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { buildCar } from './Car';
import { ACCENT_COLOR, CAR_MATERIALS, liveryFor } from './car-spec.mjs';

const MODEL = path.resolve(process.cwd(), 'assets/car/mach-speeder.glb');

async function shippedScene() {
  const bytes = await readFile(MODEL);
  const gltf = await new GLTFLoader().parseAsync(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    '',
  );
  return gltf.scene;
}

function materialsByChannel(group: THREE.Object3D) {
  const channels = new Map<string, THREE.Material[]>();
  group.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if (!mesh.isMesh) {
      return;
    }
    for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
      if (!material.name) continue;
      const list = channels.get(material.name) ?? [];
      list.push(material);
      channels.set(material.name, list);
    }
  });
  return channels;
}

describe('car model', () => {
  it('recolours the paint channels and leaves the orange aero fixed', async () => {
    const scene = await shippedScene();
    const car = buildCar(scene, 0xff0000);
    const channels = materialsByChannel(car.group);
    const livery = liveryFor(0xff0000);

    const paint = channels.get(CAR_MATERIALS.paint)?.[0] as THREE.MeshStandardMaterial;
    const deep = channels.get(CAR_MATERIALS.paintDeep)?.[0] as THREE.MeshStandardMaterial;
    const stripe = channels.get(CAR_MATERIALS.stripe)?.[0] as THREE.MeshStandardMaterial;
    const accent = channels.get(CAR_MATERIALS.accent)?.[0] as THREE.MeshStandardMaterial;
    const other = buildCar(scene, 0x00ff00);
    const otherAccent = materialsByChannel(other.group).get(CAR_MATERIALS.accent)?.[0] as THREE.MeshStandardMaterial;

    expect(paint.color.getHex()).toBe(0xff0000);
    expect(deep.color.getHex()).toBe(livery.deep);
    expect(stripe.color.getHex()).toBe(livery.stripe);
    // The orange furniture is fixed: a different paint must not tint it.
    expect(accent.color.getHex()).toBe(otherAccent.color.getHex());
    expect(new Set([accent.color.getHex(), ACCENT_COLOR]).size).toBeLessThanOrEqual(2);
  });

  it('ships four named wheel nodes inside the physics envelope', async () => {
    const scene = await shippedScene();
    const names = ['wheel-rear-left', 'wheel-rear-right', 'wheel-front-left', 'wheel-front-right'];
    for (const name of names) {
      expect(scene.getObjectByName(name), name).toBeTruthy();
    }
    const box = new THREE.Box3().setFromObject(scene);
    const size = box.getSize(new THREE.Vector3());
    expect(size.x).toBeLessThanOrEqual(1.3);
    expect(size.y).toBeLessThanOrEqual(0.68);
    expect(size.z).toBeLessThanOrEqual(2.47);
    expect(box.min.y).toBeGreaterThanOrEqual(-0.002);
  });
});
