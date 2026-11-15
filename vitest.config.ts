import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    // Game rules live in src/; build tooling lives in build/.
    include: ['src/**/*.test.ts', 'build/**/*.test.ts'],
    // The Rapier trace loads a WASM engine. Running test files one at a time
    // keeps peak memory low enough for CI runners and small dev machines.
    fileParallelism: false,
  },
});
