import { defineConfig } from 'vite';
import { serviceWorkerCacheVersion } from './build/sw-cache-plugin.ts';

export default defineConfig({
  // Relative base keeps hashed assets and the service worker valid on both
  // project pages (https://user.github.io/repo/) and custom domains.
  base: './',
  build: {
    target: 'es2020',
    sourcemap: true,
    // Three.js dominates the single chunk (~556 kB raw). The warning measures
    // uncompressed bytes and cannot be satisfied without shipping more requests
    // for the same payload, so the enforced limit is the gzip budget checked in
    // build/check-bundle-size.ts (250 kB gzip, per openspec/project.md). This
    // number is a headroom alarm above today's bundle, not a target.
    chunkSizeWarningLimit: 600,
  },
  plugins: [serviceWorkerCacheVersion()],
  server: {
    host: true,
    port: 5173,
  },
  preview: {
    host: true,
    port: 4173,
  },
});
