import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { Plugin, ResolvedConfig } from 'vite';
import {
  cacheVersionFor,
  stampCacheVersion,
  type BuildFile,
} from './sw-cache-version.ts';

async function readBuildFiles(
  dir: string,
  prefix = '',
): Promise<BuildFile[]> {
  const entries = await readdir(path.join(dir, prefix), { withFileTypes: true });
  const files: BuildFile[] = [];
  for (const entry of entries) {
    // Always use forward slashes so the hash is identical on every platform.
    const relative = prefix === '' ? entry.name : `${prefix}/${entry.name}`;
    if (entry.isDirectory()) {
      files.push(...(await readBuildFiles(dir, relative)));
    } else {
      files.push({ path: relative, contents: await readFile(path.join(dir, relative)) });
    }
  }
  return files;
}

/**
 * Stamp the service worker cache name with a hash of the emitted build.
 *
 * Without this, `public/sw.js` would keep whatever constant it shipped with and
 * stale caches would outlive a deploy. The placeholder must remain in the
 * source file; `stampCacheVersion` throws if it is missing.
 */
export function serviceWorkerCacheVersion(): Plugin {
  let root = process.cwd();
  let outDir = 'dist';

  return {
    name: 'neon-racer:sw-cache-version',
    apply: 'build',
    configResolved(config: ResolvedConfig) {
      root = config.root;
      outDir = config.build.outDir;
    },
    async closeBundle() {
      const outputDir = path.resolve(root, outDir);
      const serviceWorkerPath = path.join(outputDir, 'sw.js');
      const files = await readBuildFiles(outputDir);
      const source = await readFile(serviceWorkerPath, 'utf8');
      const version = cacheVersionFor(files);
      await writeFile(
        serviceWorkerPath,
        stampCacheVersion(source, version),
        'utf8',
      );
      this.info(`service worker cache: neon-racer-${version}`);
    },
  };
}
