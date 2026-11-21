/**
 * Repository-wide exclusive lock for commands that share machine resources.
 *
 * Git worktrees isolate files, but not ports, CPU, or memory. Two worktrees
 * running `npm test` or `npm run test:e2e` at the same time fight over the
 * Playwright port and can exhaust the memory ceiling the browser suite is tuned
 * for. Commands therefore queue behind one lock per repository, stored in the
 * shared Git directory so every worktree sees the same lock.
 *
 * The lock is an atomically created directory (`mkdirSync`), which the OS
 * guarantees only one process can win. That avoids depending on `flock`, which
 * is missing on macOS and Windows, and behaves the same everywhere Node runs.
 *
 * A crashed process leaves the directory behind. The owner file records the
 * PID, host, and start time so the next run can reclaim a lock whose process is
 * gone (same host) or whose age exceeds the stale limit.
 */
import { execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import {
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { hostname, tmpdir } from 'node:os';
import path from 'node:path';

export const DEFAULT_TIMEOUT_MS = 30 * 60 * 1000;
export const DEFAULT_STALE_MS = 2 * 60 * 60 * 1000;
export const DEFAULT_POLL_MS = 1000;

const LOCK_SUBDIR = 'neon-racer-locks';
const OWNER_FILE = 'owner.json';
const LOCK_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

export interface LockOwner {
  pid: number;
  host: string;
  token: string;
  startedAt: number;
  command: string;
}

export interface LockHandle {
  path: string;
  owner: LockOwner;
  release(): void;
}

export interface WaitInfo {
  owner: LockOwner | null;
  waitedMs: number;
  timeoutMs: number;
}

export interface AcquireOptions {
  /** Give up after this long. 0 waits forever. Defaults to 30 minutes. */
  timeoutMs?: number;
  /** Reclaim a lock older than this. Defaults to 2 hours. */
  staleMs?: number;
  /** How often to retry while waiting. Defaults to 1 second. */
  pollMs?: number;
  /** Command recorded in the owner file for wait messages. */
  command?: string;
  now?: () => number;
  onWait?: (info: WaitInfo) => void;
}

export class LockTimeoutError extends Error {
  readonly lockPath: string;
  readonly owner: LockOwner | null;

  constructor(lockPath: string, owner: LockOwner | null, waitedMs: number) {
    super(
      `Timed out after ${Math.round(waitedMs / 1000)}s waiting for ${lockPath}, held by ${describeOwner(owner)}.`,
    );
    this.name = 'LockTimeoutError';
    this.lockPath = lockPath;
    this.owner = owner;
  }
}

/** The repository's shared Git directory, or null outside a checkout. */
export function gitCommonDir(
  cwd: string,
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  try {
    const output = execFileSync('git', ['rev-parse', '--git-common-dir'], {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      env,
    }).trim();
    return output === '' ? null : path.resolve(cwd, output);
  } catch {
    return null;
  }
}

/**
 * Where a named lock lives. `NEON_LOCK_DIR` overrides the location; otherwise
 * the lock sits in the shared Git directory so all worktrees agree. Outside a
 * checkout the lock falls back to a per-path directory in the OS temp folder.
 */
export function resolveLockPath(
  name: string,
  cwd = process.cwd(),
  env: NodeJS.ProcessEnv = process.env,
): string {
  if (!LOCK_NAME.test(name)) {
    throw new Error(
      `Invalid lock name "${name}": use letters, digits, dots, dashes, or underscores.`,
    );
  }
  const override = env.NEON_LOCK_DIR?.trim();
  if (override) {
    return path.join(path.resolve(cwd, override), `${name}.lock`);
  }
  const common = gitCommonDir(cwd, env);
  if (common) {
    return path.join(common, LOCK_SUBDIR, `${name}.lock`);
  }
  const digest = createHash('sha256').update(path.resolve(cwd)).digest('hex').slice(0, 12);
  return path.join(tmpdir(), `neon-racer-locks-${digest}`, `${name}.lock`);
}

export function readOwner(lockPath: string): LockOwner | null {
  try {
    const parsed: unknown = JSON.parse(
      readFileSync(path.join(lockPath, OWNER_FILE), 'utf8'),
    );
    return isLockOwner(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function processAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) {
    return false;
  }
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    // EPERM means the process exists but belongs to another user.
    return (error as NodeJS.ErrnoException).code === 'EPERM';
  }
}

/**
 * A lock is stale when its owner is dead on this host, when its owner file is
 * missing and the directory has aged past the limit, or when it is simply too
 * old to trust (for example, after a hostname change).
 */
export function lockIsStale(
  lockPath: string,
  owner: LockOwner | null,
  now = Date.now(),
  staleMs = DEFAULT_STALE_MS,
): boolean {
  if (owner) {
    if (owner.host === hostname() && !processAlive(owner.pid)) {
      return true;
    }
    return now - owner.startedAt > staleMs;
  }
  try {
    return now - statSync(lockPath).mtimeMs > staleMs;
  } catch {
    return false;
  }
}

/**
 * Move a stale lock out of the way. The rename is atomic, so only one waiter
 * can claim it; the loser sees ENOENT and retries.
 */
export function claimStaleLock(lockPath: string): boolean {
  const before = readOwner(lockPath);
  const trash = `${lockPath}.stale-${process.pid}-${randomUUID()}`;
  try {
    renameSync(lockPath, trash);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return false;
    }
    // Some platforms cannot rename a directory with open handles. Only remove
    // it in place when the owner is still the one we judged stale.
    const after = readOwner(lockPath);
    if (before === null || after === null || before.token !== after.token) {
      return false;
    }
    try {
      rmSync(lockPath, { recursive: true, force: true });
      return true;
    } catch {
      return false;
    }
  }
  rmSync(trash, { recursive: true, force: true });
  return true;
}

export function releaseLock(lockPath: string, owner: LockOwner): void {
  const current = readOwner(lockPath);
  // Never remove a lock another process reclaimed and now owns.
  if (current === null || current.token !== owner.token) {
    return;
  }
  rmSync(lockPath, { recursive: true, force: true });
}

export async function acquireLock(
  lockPath: string,
  options: AcquireOptions = {},
): Promise<LockHandle> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const staleMs = options.staleMs ?? DEFAULT_STALE_MS;
  const pollMs = options.pollMs ?? DEFAULT_POLL_MS;
  const now = options.now ?? Date.now;
  const command = options.command ?? process.argv.slice(1).join(' ');
  const startedAt = now();

  mkdirSync(path.dirname(lockPath), { recursive: true });

  for (;;) {
    try {
      mkdirSync(lockPath);
      const owner: LockOwner = {
        pid: process.pid,
        host: hostname(),
        token: randomUUID(),
        startedAt: now(),
        command,
      };
      try {
        writeFileSync(path.join(lockPath, OWNER_FILE), JSON.stringify(owner));
      } catch (error) {
        rmSync(lockPath, { recursive: true, force: true });
        throw error;
      }
      return { path: lockPath, owner, release: () => releaseLock(lockPath, owner) };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
        throw error;
      }
    }

    const owner = readOwner(lockPath);
    if (lockIsStale(lockPath, owner, now(), staleMs) && claimStaleLock(lockPath)) {
      continue;
    }

    const waitedMs = now() - startedAt;
    if (timeoutMs > 0 && waitedMs >= timeoutMs) {
      throw new LockTimeoutError(lockPath, owner, waitedMs);
    }
    options.onWait?.({ owner, waitedMs, timeoutMs });
    await sleep(pollMs + Math.floor(Math.random() * (pollMs / 4)));
  }
}

/** Run an action while holding the lock, releasing it even when the action throws. */
export async function withLock<T>(
  lockPath: string,
  action: () => Promise<T> | T,
  options: AcquireOptions = {},
): Promise<T> {
  const handle = await acquireLock(lockPath, options);
  try {
    return await action();
  } finally {
    handle.release();
  }
}

export function describeOwner(owner: LockOwner | null): string {
  if (owner === null) {
    return 'an unknown process';
  }
  return `pid ${owner.pid} on ${owner.host} (${owner.command})`;
}

function isLockOwner(value: unknown): value is LockOwner {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const owner = value as Record<string, unknown>;
  return (
    typeof owner.pid === 'number' &&
    typeof owner.host === 'string' &&
    typeof owner.token === 'string' &&
    typeof owner.startedAt === 'number' &&
    typeof owner.command === 'string'
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
