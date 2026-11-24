import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    // Game rules live in src/; build tooling lives in build/.
    include: ['src/**/*.test.ts', 'build/**/*.test.ts'],
    // The Rapier trace loads a WASM engine. One worker and one file at a time
    // keeps peak memory low enough for CI runners and small dev machines.
    fileParallelism: false,
    maxWorkers: 1,
    // CI publishes a JUnit report as an artifact and job summary. Local runs
    // keep the normal terminal reporter and do not write test-results/.
    ...(process.env.CI
      ? {
          reporters: ['default', 'junit'],
          outputFile: { junit: 'test-results/vitest-junit.xml' },
        }
      : {}),
  },
});
