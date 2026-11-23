import { copyFile, readFile, stat, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Publish every authored car to the runtime.
 *
 * Cars are listed in tools/model/cars.json. For each id this copies
 * `<id>.glb`, `<id>-livery.png`, and `<id>-paint-mask.png` from
 * assets/car/ to public/models/, which is what the game loads and precaches.
 *
 *   npm run model:car
 */
const repoRoot = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));

const cars = JSON.parse(
  await readFile(path.join(repoRoot, 'tools/model/cars.json'), 'utf8'),
);

const limits = {
  glb: 4 * 1024 * 1024,
  livery: 1024 * 1024,
  mask: 256 * 1024,
  preview: 1024 * 1024,
};
const failures = [];

for (const [id, config] of Object.entries(cars)) {
  const kinds = ['glb', 'livery', 'mask'];
  if (config.preview) {
    kinds.push('preview');
  }
  for (const kind of kinds) {
    const suffix =
      kind === 'glb'
        ? '.glb'
        : kind === 'livery'
          ? '-livery.png'
          : kind === 'mask'
            ? '-paint-mask.png'
            : '-preview.png';
    const from =
      kind === 'preview' ? config.preview : `assets/car/${id}${suffix}`;
    const to = `public/models/${id}${suffix}`;
    const bytes = await readFile(path.join(repoRoot, from));
    if (bytes.length > limits[kind]) {
      failures.push(
        `${from} is ${(bytes.length / 1024).toFixed(0)} kB, over ${(limits[kind] / 1024).toFixed(0)} kB`,
      );
    }
    if (kind === 'glb' && bytes.subarray(0, 4).toString('ascii') !== 'glTF') {
      failures.push(`${from} is not a binary glTF`);
    }
    await mkdir(path.dirname(path.join(repoRoot, to)), { recursive: true });
    await copyFile(path.join(repoRoot, from), path.join(repoRoot, to));
    const size = (await stat(path.join(repoRoot, to))).size;
    console.log(`published ${to} · ${(size / 1024).toFixed(0)} kB`);
  }
}

if (failures.length > 0) {
  console.error(`car publish failed:\n  - ${failures.join('\n  - ')}`);
  process.exit(1);
}
