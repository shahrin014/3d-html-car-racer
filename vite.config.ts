import { defineConfig } from 'vite';

export default defineConfig({
  // Relative base keeps hashed assets and the service worker valid on both
  // project pages (https://user.github.io/repo/) and custom domains.
  base: './',
  build: {
    target: 'es2020',
    sourcemap: true,
  },
  server: {
    host: true,
    port: 5173,
  },
  preview: {
    host: true,
    port: 4173,
  },
});
