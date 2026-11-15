/**
 * Exports every track piece to binary glTF (`.glb`) under assets/track.
 *
 * Uses the same parametric geometry as the rendered previews, so the models and
 * the images cannot drift apart. Textures are embedded, so each file stands
 * alone.
 *
 *   npm run assets:glb
 */
import { createServer } from 'node:http';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const repoRoot = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const outputDir = path.join(repoRoot, 'assets', 'track');
const port = 4312;

const PIECES = [
  'straight-12',
  'turn-45-r18',
  'turn-90-r14',
  'turn-180-r10',
  'loop-r7',
  'hill-crest-2.5',
  'boost-12',
];

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
};

const server = createServer(async (request, response) => {
  try {
    const requestPath = decodeURIComponent(
      (request.url ?? '/').split('?')[0] ?? '/',
    );
    const filePath = path.resolve(repoRoot, `.${requestPath}`);
    if (!filePath.startsWith(repoRoot)) {
      response.writeHead(403).end('Forbidden');
      return;
    }
    const contents = await readFile(filePath);
    response.writeHead(200, {
      'content-type':
        MIME_TYPES[path.extname(filePath)] ?? 'application/octet-stream',
      'cache-control': 'no-store',
    });
    response.end(contents);
  } catch {
    response.writeHead(404).end('Not found');
  }
});

await new Promise((resolve) => server.listen(port, '127.0.0.1', resolve));
await mkdir(outputDir, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 900, height: 600 },
  deviceScaleFactor: 1,
});

const failures = [];
page.on('console', (message) => {
  if (message.type() === 'error') {
    failures.push(message.text());
  }
});
page.on('pageerror', (error) => failures.push(error.message));

for (const piece of PIECES) {
  await page.goto(
    `http://127.0.0.1:${port}/tools/preview/index.html?piece=${piece}`,
    { waitUntil: 'load' },
  );
  await page.waitForFunction(() => window.__previewReady === true, undefined, {
    timeout: 30_000,
  });
  const base64 = await page.evaluate(() => window.__exportGlb());
  const file = path.join(outputDir, `${piece}.glb`);
  const bytes = Buffer.from(base64, 'base64');
  const magic = bytes.subarray(0, 4).toString('ascii');
  if (magic !== 'glTF') {
    throw new Error(`${piece}: exporter did not produce a binary glTF`);
  }
  await writeFile(file, bytes);
  const size = (await stat(file)).size;
  console.log(`exported ${path.relative(repoRoot, file)} (${(size / 1024).toFixed(1)} kB)`);
}

await browser.close();
await new Promise((resolve) => server.close(resolve));

if (failures.length > 0) {
  console.error(`Preview console errors:\n${failures.join('\n')}`);
  process.exit(1);
}
