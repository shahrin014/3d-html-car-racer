/**
 * Enforces the initial JavaScript transfer budget against the built output.
 *
 * Run after `vite build`: `node build/check-bundle-size.ts` (Node 26 strips the
 * types). Exits non-zero when the gzipped JavaScript exceeds the budget.
 */
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import {
  formatKilobytes,
  isWithinBudget,
  JS_GZIP_BUDGET_BYTES,
  totalGzipBytes,
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
const total = totalGzipBytes(files);

for (const file of files) {
  console.log(
    `  ${file.path}  ${formatKilobytes(file.rawBytes)} raw  ${formatKilobytes(
      file.gzipBytes,
    )} gzip`,
  );
}

const summary = `Initial JavaScript: ${formatKilobytes(
  total,
)} gzip of ${formatKilobytes(JS_GZIP_BUDGET_BYTES)} budget`;

if (!isWithinBudget(total)) {
  console.error(`✗ ${summary}`);
  console.error(
    'The initial JavaScript budget is exceeded. Shrink the bundle or raise the budget in build/bundle-budget.ts and openspec/ together.',
  );
  process.exit(1);
}

console.log(`✓ ${summary}`);
