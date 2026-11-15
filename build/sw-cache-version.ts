/**
 * Derives the service worker cache name from the emitted build.
 *
 * The cache is versioned automatically so nobody has to remember to bump a
 * constant when `CORE_ASSETS`, the app shell, or the service worker changes.
 * The version hashes every emitted file's path and content, so two builds of
 * the same source share a cache and any change lands in a fresh one.
 */
import { createHash } from 'node:crypto';

/** Cache name prefix, kept stable so old caches are recognisable. */
export const CACHE_NAME_PREFIX = 'neon-racer';

/** Placeholder in `public/sw.js`, replaced by the build. */
export const CACHE_VERSION_TOKEN = '__BUILD_CACHE_VERSION__';

export interface BuildFile {
  /** Path relative to the build output directory, using forward slashes. */
  path: string;
  contents: Uint8Array | string;
}

/** Stable, short version for a set of build files. */
export function cacheVersionFor(files: Iterable<BuildFile>): string {
  const sorted = [...files].sort((a, b) => (a.path < b.path ? -1 : 1));
  const version = createHash('sha256');
  for (const file of sorted) {
    version.update(file.path);
    version.update('\0');
    version.update(createHash('sha256').update(file.contents).digest());
    version.update('\n');
  }
  return version.digest('hex').slice(0, 12);
}

/**
 * Replace the placeholder with `neon-racer-<version>`.
 *
 * Throws when the placeholder is missing so a refactor cannot silently ship an
 * unversioned cache.
 */
export function stampCacheVersion(source: string, version: string): string {
  if (!source.includes(CACHE_VERSION_TOKEN)) {
    throw new Error(
      `Service worker is missing the ${CACHE_VERSION_TOKEN} placeholder; the cache would never be invalidated.`,
    );
  }
  return source.replaceAll(
    CACHE_VERSION_TOKEN,
    `${CACHE_NAME_PREFIX}-${version}`,
  );
}
