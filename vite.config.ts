import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import { serviceWorkerCacheVersion } from './build/sw-cache-plugin.ts';

export default defineConfig({
  // Relative base keeps hashed assets and the service worker valid on both
  // project pages (https://user.github.io/repo/) and custom domains.
  base: './',
  build: {
    target: 'es2020',
    sourcemap: true,
    // Three.js dominates the shell chunk and the Rapier compat bundle carries
    // its WASM inline, so uncompressed sizes are always large. The enforced
    // limits are the gzip budgets checked in build/check-bundle-size.ts
    // (250 kB app shell + 1.75 MB physics chunk). This number only silences
    // the raw-size warning above today's intentional physics payload.
    chunkSizeWarningLimit: 4500,
    rollupOptions: {
      input: {
        // The menu, the track preview, and the race are separate pages so the
        // menu can own its own WebGL car preview and the preview page can show
        // a circuit without rendering a race. `index.html` is the landing menu,
        // `track.html` previews a generated circuit, and `game.html` hosts the
        // race. All share the app-shell bundle and budgets.
        index: resolve(import.meta.dirname, 'index.html'),
        track: resolve(import.meta.dirname, 'track.html'),
        game: resolve(import.meta.dirname, 'game.html'),
      },
      output: {
        // A stable name lets the budget gate distinguish the lazy Rapier
        // payload from the app shell.
        manualChunks: (id) =>
          id.includes('@dimforge/rapier3d-compat') ? 'physics' : undefined,
      },
    },
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
