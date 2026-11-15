import { describe, expect, it } from 'vitest';
import {
  formatKilobytes,
  isWithinBudget,
  JS_GZIP_BUDGET_BYTES,
  totalGzipBytes,
  type BundleFile,
} from './bundle-budget.ts';

function file(path: string, gzipBytes: number): BundleFile {
  return { path, rawBytes: gzipBytes * 3, gzipBytes };
}

describe('bundle budget', () => {
  it('exposes the documented 250 KB gzip budget', () => {
    expect(JS_GZIP_BUDGET_BYTES).toBe(250 * 1024);
  });

  it('sums the gzip size of every emitted script', () => {
    expect(
      totalGzipBytes([file('assets/index-a.js', 1000), file('assets/chunk-b.js', 24)]),
    ).toBe(1024);
  });

  it('accepts a bundle exactly at the budget and rejects one byte more', () => {
    expect(isWithinBudget(JS_GZIP_BUDGET_BYTES)).toBe(true);
    expect(isWithinBudget(JS_GZIP_BUDGET_BYTES + 1)).toBe(false);
  });

  it('formats sizes in kilobytes for the build log', () => {
    expect(formatKilobytes(250 * 1024)).toBe('250.00 kB');
    expect(formatKilobytes(1536)).toBe('1.50 kB');
  });
});
