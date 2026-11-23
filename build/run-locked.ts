/**
 * Run a command behind the repository-wide lock.
 *
 *   node build/run-locked.ts tests -- npm test
 *   node build/run-locked.ts tests -- node tools/run-e2e.mjs
 *
 * Commands sharing a lock name run one at a time across every worktree of the
 * repository. The first run starts immediately; later runs wait in line and
 * start when the lock is released. See build/lock.ts for the mechanism.
 *
 * Environment:
 *   NEON_LOCK_TIMEOUT_MS  give up after this long (default 1800000, 0 = forever)
 *   NEON_LOCK_STALE_MS    reclaim a lock older than this (default 7200000)
 *   NEON_LOCK_DIR         override the lock directory (default: git common dir)
 *   NEON_LOCK_QUIET=1     suppress wait and acquire notices
 */
import { spawn } from 'node:child_process';
import os from 'node:os';
import {
  acquireLock,
  describeOwner,
  LockTimeoutError,
  resolveLockPath,
  type LockHandle,
} from './lock.ts';

const USAGE = `Usage: node build/run-locked.ts <lock-name> -- <command> [args...]

Runs <command> while holding <lock-name>, so commands with the same name run one
at a time across every worktree of the repository.`;

function millisecondsFromEnv(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) {
    return fallback;
  }
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

function exitCodeForSignal(signal: NodeJS.Signals): number {
  const number = os.constants.signals[signal];
  return typeof number === 'number' ? 128 + number : 1;
}

const args = process.argv.slice(2);
const separator = args.indexOf('--');
const name = args[0];

if (separator <= 0 || name === undefined || separator === args.length - 1) {
  console.error(USAGE);
  process.exit(2);
}

const command = args.slice(separator + 1);
const [bin, ...binArgs] = command;
if (bin === undefined) {
  console.error(USAGE);
  process.exit(2);
}

const quiet = process.env.NEON_LOCK_QUIET === '1';
const lockPath = resolveLockPath(name);
const startedAt = Date.now();
let lastNotice = 0;

let handle: LockHandle;
try {
  handle = await acquireLock(lockPath, {
    timeoutMs: millisecondsFromEnv('NEON_LOCK_TIMEOUT_MS', 30 * 60 * 1000),
    staleMs: millisecondsFromEnv('NEON_LOCK_STALE_MS', 2 * 60 * 60 * 1000),
    command: command.join(' '),
    onWait: ({ owner, waitedMs }) => {
      if (quiet) {
        return;
      }
      const now = Date.now();
      if (now - lastNotice < 15_000) {
        return;
      }
      lastNotice = now;
      console.log(
        `lock: ${name} is busy (${describeOwner(owner)}); waiting, ${Math.round(
          waitedMs / 1000,
        )}s elapsed`,
      );
    },
  });
} catch (error) {
  if (error instanceof LockTimeoutError) {
    console.error(`lock: ${error.message}`);
    process.exit(1);
  }
  throw error;
}

if (!quiet) {
  const waitedMs = Date.now() - startedAt;
  const suffix = waitedMs >= 1000 ? ` after ${Math.round(waitedMs / 1000)}s` : '';
  console.log(`lock: ${name} acquired${suffix} (pid ${process.pid})`);
}

let released = false;
function release(): void {
  if (released) {
    return;
  }
  released = true;
  handle.release();
}

// Releasing from the exit handler covers normal exits and crashes that still
// run Node's exit hooks. A SIGKILL leaves the lock to the stale check.
process.on('exit', release);

// .cmd shims such as npm cannot be launched directly on Windows; a shell
// resolves them. An .exe must be launched directly so a path with spaces (for
// example C:\Program Files\nodejs\node.exe) is not split by cmd.exe.
const needsShell = process.platform === 'win32' && !/\.exe$/i.test(bin);
const child = spawn(bin, binArgs, {
  stdio: 'inherit',
  env: process.env,
  shell: needsShell,
});

const forward = (signal: NodeJS.Signals): void => {
  child.kill(signal);
};
process.on('SIGINT', () => forward('SIGINT'));
process.on('SIGTERM', () => forward('SIGTERM'));
if (process.platform !== 'win32') {
  process.on('SIGHUP', () => forward('SIGHUP'));
}

const exitCode = await new Promise<number>((resolve) => {
  child.on('error', (error) => {
    console.error(`lock: could not start ${command.join(' ')}: ${error.message}`);
    resolve(127);
  });
  child.on('exit', (code, signal) => {
    resolve(signal === null ? (code ?? 1) : exitCodeForSignal(signal));
  });
});

release();
process.exit(exitCode);
