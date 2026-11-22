/**
 * Run each browser spec in its own Playwright process.
 *
 * The full suite is small, but a single browser process grows across contexts
 * and can hit the memory ceiling on constrained CI runners. One process per
 * spec hands the browser, its GPU process, and its heap back to the OS between
 * tests while keeping the same coverage.
 *
 * Build once here, then tell every child to reuse dist/ so the Vite build is
 * never alive alongside Chromium. CI sets E2E_SKIP_BUILD=1 after its own build.
 */
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const specs = [
  'menu.spec.ts',
  'paint.spec.ts',
  'car.spec.ts',
  'opponents.spec.ts',
  'opponents-limit.spec.ts',
  'camera-pause.spec.ts',
  'fullscreen.spec.ts',
  'storage.spec.ts',
  'orientation.spec.ts',
  'offline.spec.ts',
];
const cli = fileURLToPath(
  new URL('../node_modules/@playwright/test/cli.js', import.meta.url),
);
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';

if (process.env.E2E_SKIP_BUILD !== '1') {
  const build = spawnSync(npm, ['run', 'build'], {
    stdio: 'inherit',
    env: process.env,
  });
  if (build.error) {
    throw build.error;
  }
  if (build.status !== 0) {
    process.exit(build.status ?? 1);
  }
}

const env = { ...process.env, E2E_SKIP_BUILD: '1' };

for (const spec of specs) {
  console.log(`\n▶ e2e/${spec}`);
  const result = spawnSync(
    process.execPath,
    [cli, 'test', `e2e/${spec}`, '--workers=1'],
    { stdio: 'inherit', env },
  );
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}
