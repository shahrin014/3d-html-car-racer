/**
 * Renders the asset catalog (track pieces, car, cockpit) into assets/.
 *
 * Uses the same parametric geometry as tools/preview/preview.mjs, so the images
 * are a reproducible reference rather than hand-made art.
 *
 *   npm run assets
 */
import { createServer } from 'node:http';
import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const repoRoot = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const outputDir = path.join(repoRoot, 'assets');
const port = 4310;

const PIECES = [
  { id: 'straight-12', folder: 'track' },
  { id: 'turn-45-r18', folder: 'track' },
  { id: 'turn-90-r14', folder: 'track' },
  { id: 'turn-180-r10', folder: 'track' },
  { id: 'loop-r7', folder: 'track' },
  { id: 'loop-r7-plan', folder: 'track' },
  { id: 'hill-crest-2.5', folder: 'track' },
  { id: 'ramp-up-1.6', folder: 'track' },
  { id: 'ramp-down-1.6', folder: 'track' },
  { id: 'boost-12', folder: 'track' },
  { id: 'building-block', folder: 'buildings' },
  { id: 'building-tower', folder: 'buildings' },
  { id: 'building-wide', folder: 'buildings' },
  { id: 'car', folder: 'car', name: 'car-hero' },
  { id: 'car-side', folder: 'car', name: 'car-side' },
  { id: 'car-ref', folder: 'car', name: 'car-ref' },
  { id: 'cockpit', folder: 'cockpit', name: 'cockpit-view' },
];

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
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
  viewport: { width: 1100, height: 760 },
  deviceScaleFactor: 1,
});

const failures = [];
page.on('console', (message) => {
  if (message.type() === 'error') {
    failures.push(message.text());
  }
});
page.on('pageerror', (error) => failures.push(error.message));

const only = process.argv.slice(2).filter((arg) => !arg.startsWith('--'));
const selected = only.length > 0 ? PIECES.filter((entry) => only.includes(entry.id)) : PIECES;

for (const piece of selected) {
  const folder = path.join(outputDir, piece.folder);
  await mkdir(folder, { recursive: true });
  await page.goto(
    `http://127.0.0.1:${port}/tools/preview/index.html?piece=${piece.id}`,
    { waitUntil: 'load' },
  );
  await page.waitForFunction(() => window.__previewReady === true, undefined, {
    timeout: 30_000,
  });
  const file = path.join(folder, `${piece.name ?? piece.id}.png`);
  await page.screenshot({ path: file });
  console.log(`rendered ${path.relative(repoRoot, file)}`);
}

await browser.close();
await new Promise((resolve) => server.close(resolve));

if (failures.length > 0) {
  console.error(`Preview console errors:\n${failures.join('\n')}`);
  process.exit(1);
}
