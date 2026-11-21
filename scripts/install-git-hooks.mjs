// Points Git at the repository's checked-in hooks in .githooks/, so the
// pre-commit unit test run applies to every clone. Runs automatically from the
// `npm install` / `npm ci` `prepare` lifecycle script; also available as
// `npm run hooks:install` (and `npm run hooks:uninstall`).
import { execFileSync } from 'node:child_process';
import { chmodSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const hooksDir = '.githooks';
const hookPath = fileURLToPath(new URL('../.githooks/pre-commit', import.meta.url));

function git(args) {
  return execFileSync('git', args, { cwd: repoRoot, stdio: 'pipe', encoding: 'utf8' });
}

function readConfig(key) {
  try {
    return git(['config', '--local', '--get', key]).trim();
  } catch {
    return ''; // `git config --get` exits 1 when the key is unset.
  }
}

// Installs run in CI and in packaged tarballs too; stay quiet when there is no
// checkout to configure.
try {
  git(['rev-parse', '--git-dir']);
} catch {
  process.exit(0);
}

if (!existsSync(hookPath)) {
  process.exit(0);
}

const action = process.argv[2] === 'uninstall' ? 'uninstall' : 'install';

try {
  if (action === 'uninstall') {
    const current = readConfig('core.hooksPath');
    if (current === hooksDir) {
      git(['config', '--local', '--unset', 'core.hooksPath']);
      console.log('git hooks: core.hooksPath unset.');
    } else {
      console.log('git hooks: core.hooksPath was not set by this repository; nothing to do.');
    }
  } else {
    git(['config', '--local', 'core.hooksPath', hooksDir]);
    chmodSync(hookPath, 0o755);
    console.log('git hooks: pre-commit unit tests are enabled (.githooks/pre-commit).');
  }
} catch (error) {
  // Never fail an install over this; the hooks can be enabled by hand.
  console.warn(`git hooks: could not ${action} hooks: ${error.message.trim()}`);
}
