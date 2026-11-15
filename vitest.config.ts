import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    // Game rules live in src/; build tooling lives in build/.
    include: ['src/**/*.test.ts', 'build/**/*.test.ts'],
  },
});
