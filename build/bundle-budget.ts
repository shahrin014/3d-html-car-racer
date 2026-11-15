/**
 * Initial JavaScript transfer budget.
 *
 * `openspec/specs/game/spec.md` caps the initial JavaScript transfer at 250 KB
 * gzip and `openspec/project.md` repeats it as a hard constraint. Vite's chunk
 * size warning measures uncompressed bytes and is therefore a poor proxy; this
 * module measures the bytes a phone actually downloads and fails the build when
 * the budget is exceeded.
 */

export const JS_GZIP_BUDGET_BYTES = 250 * 1024;

export interface BundleFile {
  /** Path relative to the build output directory. */
  path: string;
  rawBytes: number;
  gzipBytes: number;
}

export function totalGzipBytes(files: readonly BundleFile[]): number {
  return files.reduce((total, file) => total + file.gzipBytes, 0);
}

export function isWithinBudget(
  totalBytes: number,
  budgetBytes: number = JS_GZIP_BUDGET_BYTES,
): boolean {
  return totalBytes <= budgetBytes;
}

export function formatKilobytes(bytes: number): string {
  return `${(bytes / 1024).toFixed(2)} kB`;
}
