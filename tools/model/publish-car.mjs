import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Publish the authored car model to the runtime.
 *
 * The GLB in assets/car is the source of truth: it is authored offline in
 * Blender (tools/model/build-car.py) from the image-to-3D base, then validated
 * here and copied to public/models/car.glb, which is what the game loads.
 *
 *   npm run model:car
 */
const repoRoot = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));
const source = path.join(repoRoot, 'assets/car/mach-speeder.glb');
const target = path.join(repoRoot, 'public/models/car.glb');

const bytes = await readFile(source);
const loader = new GLTFLoader();
const gltf = await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');

const box = new THREE.Box3().setFromObject(gltf.scene);
const size = box.getSize(new THREE.Vector3());
const materials = new Set();
const wheels = [];
let triangles = 0;
gltf.scene.traverse((node) => {
  if (node.name.startsWith('wheel-')) {
    wheels.push(node.name);
  }
  if (!node.isMesh) {
    return;
  }
  const geometry = node.geometry;
  const index = geometry.getIndex();
  triangles += (index ? index.count : geometry.getAttribute('position').count) / 3;
  for (const material of Array.isArray(node.material) ? node.material : [node.material]) {
    if (material?.name) {
      materials.add(material.name);
    }
  }
});

const failures = [];
const expect = (ok, message) => {
  if (!ok) failures.push(message);
};
expect(triangles <= 48000, `${triangles} triangles is above the 48k budget`);
expect(size.z <= 2.47, `length ${size.z.toFixed(2)} m is over 2.47 m`);
expect(size.x <= 1.3, `width ${size.x.toFixed(2)} m is over 1.3 m`);
expect(size.y <= 0.68, `height ${size.y.toFixed(2)} m is over 0.68 m`);
expect(box.min.y >= -0.002 && box.min.y <= 0.01, `model sits at y=${box.min.y.toFixed(3)}`);
expect(wheels.length === 4, `expected four named wheels, found ${wheels.length}`);
for (const required of ['Paint', 'PaintDeep', 'Stripe', 'Accent', 'Glass', 'Tyre']) {
  expect(materials.has(required), `missing material ${required}`);
}

if (failures.length > 0) {
  console.error(`car model check failed:\n  - ${failures.join('\n  - ')}`);
  process.exit(1);
}

await mkdir(path.dirname(target), { recursive: true });
await writeFile(target, bytes);
const stats = await stat(target);
console.log(
  `published ${path.relative(repoRoot, target)} · ${(stats.size / 1024).toFixed(0)} kB · ` +
    `${Math.round(triangles)} triangles · ${size.x.toFixed(2)} x ${size.y.toFixed(2)} x ${size.z.toFixed(2)} m`,
);
console.log(`  wheels: ${wheels.sort().join(', ')}`);
console.log(`  materials: ${[...materials].sort().join(', ')}`);
