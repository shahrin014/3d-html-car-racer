/**
 * Enforces both JavaScript transfer budgets against the built output.
 *
 * Run after `vite build`: `node build/check-bundle-size.ts` (Node 26 strips the
 * types). Exits non-zero when the app shell or the physics chunk exceeds its
 * budget.
 */
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import {
  APP_GZIP_BUDGET_BYTES,
  bundleTotals,
  formatKilobytes,
  formatMegabytes,
  isPhysicsAsset,
  isWithinBudget,
  PHYSICS_GZIP_BUDGET_BYTES,
  type BundleFile,
} from './bundle-budget.ts';

const assetsDir = path.resolve(process.cwd(), 'dist', 'assets');

async function measureJavaScript(dir: string): Promise<BundleFile[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files: BundleFile[] = [];
  for (const entry of entries) {
    const absolute = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await measureJavaScript(absolute)));
      continue;
    }
    if (!entry.name.endsWith('.js')) {
      continue;
    }
    const contents = await readFile(absolute);
    files.push({
      path: path.relative(path.resolve(process.cwd(), 'dist'), absolute),
      rawBytes: contents.byteLength,
      gzipBytes: gzipSync(contents).byteLength,
    });
  }
  return files;
}

const files = await measureJavaScript(assetsDir);
const totals = bundleTotals(files);

for (const file of files) {
  const tier = isPhysicsAsset(file.path) ? 'physics' : 'app shell';
  console.log(
    `  [${tier}] ${file.path}  ${formatKilobytes(file.rawBytes)} raw  ${formatKilobytes(
      file.gzipBytes,
    )} gzip`,
  );
}

const appOk = isWithinBudget(totals.appGzipBytes, APP_GZIP_BUDGET_BYTES);
const physicsOk = isWithinBudget(
  totals.physicsGzipBytes,
  PHYSICS_GZIP_BUDGET_BYTES,
);

const appSummary = `App shell JavaScript: ${formatKilobytes(
  totals.appGzipBytes,
)} gzip of ${formatKilobytes(APP_GZIP_BUDGET_BYTES)} budget`;
const physicsSummary = `Physics chunk: ${formatMegabytes(
  totals.physicsGzipBytes,
)} gzip of ${formatMegabytes(PHYSICS_GZIP_BUDGET_BYTES)} budget`;

if (!appOk) {
  console.error(`✗ ${appSummary}`);
}
if (!physicsOk) {
  console.error(`✗ ${physicsSummary}`);
}
if (!appOk || !physicsOk) {
  console.error(
    'A JavaScript budget is exceeded. Shrink the bundle or raise the budget in build/bundle-budget.ts and openspec/ together.',
  );
  process.exit(1);
}

console.log(`✓ ${appSummary}`);
console.log(`✓ ${physicsSummary}`);
