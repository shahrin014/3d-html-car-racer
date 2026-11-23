import { describe, expect, it } from 'vitest';
import {
  APP_GZIP_BUDGET_BYTES,
  bundleTotals,
  formatKilobytes,
  formatMegabytes,
  isPhysicsAsset,
  isWithinBudget,
  PHYSICS_GZIP_BUDGET_BYTES,
  totalGzipBytes,
  type BundleFile,
} from './bundle-budget.ts';

function file(path: string, gzipBytes: number): BundleFile {
  return { path, rawBytes: gzipBytes * 3, gzipBytes };
}

describe('bundle budget', () => {
  it('exposes the documented 250 KB app and 1.75 MB physics budgets', () => {
    expect(APP_GZIP_BUDGET_BYTES).toBe(250 * 1024);
    expect(PHYSICS_GZIP_BUDGET_BYTES).toBe(1.75 * 1024 * 1024);
  });

  it('sums the gzip size of every emitted script', () => {
    expect(
      totalGzipBytes([file('assets/index-a.js', 1000), file('assets/chunk-b.js', 24)]),
    ).toBe(1024);
  });

  it('separates the lazy physics chunk from the app shell', () => {
    expect(isPhysicsAsset('assets/physics-a1b2c3.js')).toBe(true);
    expect(isPhysicsAsset('assets\\physics-a1b2c3.js')).toBe(true);
    expect(isPhysicsAsset('assets/index-a1b2c3.js')).toBe(false);
    expect(isPhysicsAsset('assets/rapier-a1b2c3.js')).toBe(false);
    expect(
      bundleTotals([
        file('assets/index-a.js', 200),
        file('assets/chunk-b.js', 100),
        file('assets/physics-c.js', 1200),
      ]),
    ).toEqual({ appGzipBytes: 300, physicsGzipBytes: 1200 });
  });

  it('accepts a bundle exactly at each budget and rejects one byte more', () => {
    expect(isWithinBudget(APP_GZIP_BUDGET_BYTES, APP_GZIP_BUDGET_BYTES)).toBe(true);
    expect(isWithinBudget(APP_GZIP_BUDGET_BYTES + 1, APP_GZIP_BUDGET_BYTES)).toBe(false);
    expect(
      isWithinBudget(PHYSICS_GZIP_BUDGET_BYTES, PHYSICS_GZIP_BUDGET_BYTES),
    ).toBe(true);
    expect(
      isWithinBudget(
        PHYSICS_GZIP_BUDGET_BYTES + 1,
        PHYSICS_GZIP_BUDGET_BYTES,
      ),
    ).toBe(false);
  });

  it('formats sizes for the build log', () => {
    expect(formatKilobytes(250 * 1024)).toBe('250.00 kB');
    expect(formatKilobytes(1536)).toBe('1.50 kB');
    expect(formatMegabytes(1.75 * 1024 * 1024)).toBe('1.75 MB');
  });
});
