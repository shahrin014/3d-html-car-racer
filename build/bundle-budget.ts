/**
 * Initial JavaScript transfer budgets.
 *
 * The app shell (everything a first paint needs) stays inside 250 KB gzip.
 * Rapier is a lazy-loaded WASM-backed physics chunk, so it is accounted for
 * separately at 1.75 MB gzip (measured 1.57 MB in the shipped build). `openspec/specs/game/spec.md` and
 * `openspec/project.md` repeat both numbers, and the production build fails
 * when either is exceeded.
 *
 * Vite's chunk-size warning measures uncompressed bytes and is therefore a
 * poor proxy; this module measures the bytes a phone actually downloads.
 */

export const APP_GZIP_BUDGET_BYTES = 250 * 1024;
export const PHYSICS_GZIP_BUDGET_BYTES = 1.75 * 1024 * 1024;
const KiB = 1024;

export interface BundleFile {
  /** Path relative to the build output directory. */
  path: string;
  rawBytes: number;
  gzipBytes: number;
}

export interface BundleTotals {
  /** Initial shell JavaScript: every emitted script except the physics chunk. */
  appGzipBytes: number;
  /** The lazy-loaded Rapier chunk. */
  physicsGzipBytes: number;
}

export function totalGzipBytes(files: readonly BundleFile[]): number {
  return files.reduce((total, file) => total + file.gzipBytes, 0);
}

/** Manual-chunk name from `vite.config.ts`; the hash suffix changes per build. */
export function isPhysicsAsset(path: string): boolean {
  return /(^|\/)physics-[^/]+\.js$/.test(path);
}

export function bundleTotals(files: readonly BundleFile[]): BundleTotals {
  let appGzipBytes = 0;
  let physicsGzipBytes = 0;
  for (const file of files) {
    if (isPhysicsAsset(file.path)) {
      physicsGzipBytes += file.gzipBytes;
    } else {
      appGzipBytes += file.gzipBytes;
    }
  }
  return { appGzipBytes, physicsGzipBytes };
}

export function isWithinBudget(
  totalBytes: number,
  budgetBytes: number,
): boolean {
  return totalBytes <= budgetBytes;
}

export function formatKilobytes(bytes: number): string {
  return `${(bytes / KiB).toFixed(2)} kB`;
}

export function formatMegabytes(bytes: number): string {
  return `${(bytes / (KiB * KiB)).toFixed(2)} MB`;
}
