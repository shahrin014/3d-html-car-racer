import { copyFile, readFile, stat, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Publish the authored car assets to the runtime.
 *
 * The GLB, livery PNG, and paint mask in assets/car are the source of truth:
 * they are authored offline in Blender (tools/model/build-car.py), checked
 * here, and copied to public/models/, which is what the game loads and
 * precaches.
 *
 *   npm run model:car
 *
 * Structural checks (four wheel nodes, materials, envelope) run in
 * src/game/carModel.test.ts, where a GLTFLoader is available.
 */
const repoRoot = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));
const files = [
  ['assets/car/mach-speeder.glb', 'public/models/car.glb', 4 * 1024 * 1024],
  ['assets/car/mach-speeder-livery.png', 'public/models/car-livery.png', 1024 * 1024],
  [
    'assets/car/mach-speeder-paint-mask.png',
    'public/models/car-paint-mask.png',
    256 * 1024,
  ],
];

const failures = [];
for (const [from, to, limit] of files) {
  const source = path.join(repoRoot, from);
  const bytes = await readFile(source);
  if (bytes.length > limit) {
    failures.push(`${from} is ${(bytes.length / 1024).toFixed(0)} kB, over ${(limit / 1024).toFixed(0)} kB`);
  }
  if (from.endsWith('.glb') && bytes.subarray(0, 4).toString('ascii') !== 'glTF') {
    failures.push(`${from} is not a binary glTF`);
  }
  await mkdir(path.dirname(path.join(repoRoot, to)), { recursive: true });
  await copyFile(source, path.join(repoRoot, to));
}

if (failures.length > 0) {
  console.error(`car publish failed:\n  - ${failures.join('\n  - ')}`);
  process.exit(1);
}

for (const [, to] of files) {
  const size = (await stat(path.join(repoRoot, to))).size;
  console.log(`published ${to} · ${(size / 1024).toFixed(0)} kB`);
}
