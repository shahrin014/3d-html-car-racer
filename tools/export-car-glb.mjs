/**
 * Export the car model to GLB.
 *
 * The model in src/game/car-model.mjs stays the single source of geometry:
 * this script runs it in the browser, hands the group to three's GLTFExporter,
 * and writes public/models/car.glb. Re-run it after any geometry change so the
 * binary never drifts from the source.
 *
 *   npm run model:car
 *
 * Runs in Chromium rather than Node because GLTFExporter expects browser
 * globals, and because the preview page already carries the import map that
 * resolves "three" and "three/addons/" the same way the game does.
 */
import { createServer } from 'node:http';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const repoRoot = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const outFile = path.join(repoRoot, 'public/models/car.glb');

// Port 0 lets the OS pick a free port: a crashed run can otherwise leave a
// server holding a fixed port and block every later export.
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
};

const server = createServer(async (request, response) => {
  try {
    const requestPath = decodeURIComponent((request.url ?? '/').split('?')[0] ?? '/');
    const filePath = path.resolve(repoRoot, `.${requestPath}`);
    if (!filePath.startsWith(repoRoot)) {
      response.writeHead(403).end('Forbidden');
      return;
    }
    const contents = await readFile(filePath);
    response.writeHead(200, {
      'content-type': MIME_TYPES[path.extname(filePath)] ?? 'application/octet-stream',
      'cache-control': 'no-store',
    });
    response.end(contents);
  } catch {
    response.writeHead(404).end('Not found');
  }
});

await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const { port } = server.address();

const browser = await chromium.launch();
const page = await browser.newPage();
const failures = [];
page.on('pageerror', (error) => failures.push(error.message));
page.on('console', (message) => {
  if (message.type() === 'error') failures.push(message.text());
});

await page.goto(`http://127.0.0.1:${port}/tools/preview/index.html?piece=car`, {
  waitUntil: 'load',
});
await page.waitForFunction(() => window.__previewReady === true, undefined, {
  timeout: 30_000,
});

const result = await page.evaluate(async () => {
  const THREE = await import('three');
  const { GLTFExporter } = await import('three/addons/exporters/GLTFExporter.js');
  const model = await import('/src/game/car-model.mjs');

  const car = model.createCar();
  const exporter = new GLTFExporter();
  const buffer = await exporter.parseAsync(car.group, { binary: true });
  const bytes = new Uint8Array(buffer);

  // Round trip: read the bytes back so the file is known to load, and measure
  // the envelope the game will collide against.
  const loader = new (await import('three/addons/loaders/GLTFLoader.js')).GLTFLoader();
  const gltf = await loader.parseAsync(buffer, '');
  const box = new THREE.Box3().setFromObject(gltf.scene);
  const size = box.getSize(new THREE.Vector3());
  let triangles = 0;
  gltf.scene.traverse((node) => {
    if (node.isMesh && node.geometry?.getAttribute('position')) {
      const index = node.geometry.getIndex();
      triangles += (index ? index.count : node.geometry.getAttribute('position').count) / 3;
    }
  });

  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  }
  return {
    base64: btoa(binary),
    bytes: bytes.length,
    triangles: Math.round(triangles),
    size: [size.x, size.y, size.z].map((v) => +v.toFixed(3)),
    nodes: (() => {
      const names = [];
      gltf.scene.traverse((node) => {
        if (node.name) names.push(node.name);
      });
      return names.slice(0, 8);
    })(),
  };
});

await browser.close();
await new Promise((resolve) => server.close(resolve));

if (failures.length > 0) {
  console.error(`Page errors:\n${failures.join('\n')}`);
  process.exit(1);
}

await mkdir(path.dirname(outFile), { recursive: true });
await writeFile(outFile, Buffer.from(result.base64, 'base64'));

console.log(`wrote ${path.relative(repoRoot, outFile)}`);
console.log(
  `  ${(result.bytes / 1024).toFixed(1)} kB · ${result.triangles} triangles · ` +
    `envelope ${result.size.join(' x ')} m`,
);
console.log(`  round trip ok, sample nodes: ${result.nodes.join(', ') || '(unnamed)'}`);
