import { spawn } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { hostname, tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import {
  acquireLock,
  gitCommonDir,
  LockTimeoutError,
  lockIsStale,
  readOwner,
  resolveLockPath,
  type LockOwner,
} from './lock.ts';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const runLockedPath = fileURLToPath(new URL('./run-locked.ts', import.meta.url));
const tempDirs: string[] = [];

function tempDir(): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'neon-lock-test-'));
  tempDirs.push(dir);
  return dir;
}

function writeOwner(lockPath: string, owner: Partial<LockOwner>): LockOwner {
  const full: LockOwner = {
    pid: process.pid,
    host: hostname(),
    token: 'test-token',
    startedAt: Date.now(),
    command: 'test',
    ...owner,
  };
  mkdirSync(lockPath, { recursive: true });
  writeFileSync(path.join(lockPath, 'owner.json'), JSON.stringify(full));
  return full;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

// Git exports GIT_DIR to hooks. Strip it so "outside a checkout" really means
// outside a checkout, while keeping PATH so git itself is still found.
function cleanEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  delete env.GIT_DIR;
  delete env.GIT_WORK_TREE;
  delete env.GIT_INDEX_FILE;
  return env;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe('resolveLockPath', () => {
  it('uses the shared Git directory so every worktree agrees', () => {
    const env = cleanEnv();
    const common = gitCommonDir(repoRoot, env);
    expect(common).not.toBeNull();
    expect(resolveLockPath('tests', repoRoot, env)).toBe(
      path.join(common ?? '', 'neon-racer-locks', 'tests.lock'),
    );
  });

  it('honours NEON_LOCK_DIR', () => {
    const dir = tempDir();
    expect(resolveLockPath('tests', repoRoot, { NEON_LOCK_DIR: dir })).toBe(
      path.join(dir, 'tests.lock'),
    );
  });

  it('falls back to the OS temp directory outside a checkout', () => {
    const dir = tempDir();
    const resolved = resolveLockPath('tests', dir, cleanEnv());
    expect(resolved.startsWith(tmpdir())).toBe(true);
    expect(resolved.endsWith(path.join('tests.lock'))).toBe(true);
  });

  it('rejects names that could escape the lock directory', () => {
    expect(() => resolveLockPath('../escape', repoRoot, {})).toThrow(/Invalid lock name/);
    expect(() => resolveLockPath('', repoRoot, {})).toThrow(/Invalid lock name/);
  });
});

describe('acquireLock', () => {
  it('creates the lock and records its owner', async () => {
    const lockPath = path.join(tempDir(), 'tests.lock');
    const handle = await acquireLock(lockPath, { command: 'npm test', timeoutMs: 2000 });
    expect(existsSync(lockPath)).toBe(true);
    expect(readOwner(lockPath)).toMatchObject({
      pid: process.pid,
      host: hostname(),
      command: 'npm test',
    });
    handle.release();
    expect(existsSync(lockPath)).toBe(false);
  });

  it('queues a second run until the first releases', async () => {
    const lockPath = path.join(tempDir(), 'tests.lock');
    const first = await acquireLock(lockPath, { timeoutMs: 2000 });
    const events: string[] = [];
    const second = acquireLock(lockPath, {
      timeoutMs: 2000,
      pollMs: 10,
      onWait: () => events.push('waiting'),
    });

    await sleep(60);
    expect(events.length).toBeGreaterThan(0);

    events.push('first-release');
    first.release();
    const handle = await second;
    events.push('second-acquired');
    expect(events[events.length - 1]).toBe('second-acquired');
    expect(events.indexOf('first-release')).toBeLessThan(
      events.indexOf('second-acquired'),
    );
    handle.release();
  });

  it('reclaims a lock whose process is gone', async () => {
    const lockPath = path.join(tempDir(), 'tests.lock');
    writeOwner(lockPath, { pid: 2_147_483_647, token: 'crashed' });
    const handle = await acquireLock(lockPath, { timeoutMs: 2000, pollMs: 10 });
    expect(readOwner(lockPath)?.pid).toBe(process.pid);
    handle.release();
  });

  it('reclaims a lock directory whose owner file is missing and has aged', async () => {
    const lockPath = path.join(tempDir(), 'tests.lock');
    mkdirSync(lockPath, { recursive: true });
    const old = new Date(Date.now() - 10_000);
    utimesSync(lockPath, old, old);
    const handle = await acquireLock(lockPath, {
      timeoutMs: 2000,
      pollMs: 10,
      staleMs: 1_000,
    });
    expect(readOwner(lockPath)?.pid).toBe(process.pid);
    handle.release();
  });

  it('times out with the holder named', async () => {
    const lockPath = path.join(tempDir(), 'tests.lock');
    writeOwner(lockPath, { token: 'held', command: 'npm run test:e2e' });
    await expect(
      acquireLock(lockPath, { timeoutMs: 80, pollMs: 10 }),
    ).rejects.toBeInstanceOf(LockTimeoutError);
    await expect(
      acquireLock(lockPath, { timeoutMs: 80, pollMs: 10 }),
    ).rejects.toThrow(/npm run test:e2e/);
  });

  it('does not release a lock another process reclaimed', async () => {
    const lockPath = path.join(tempDir(), 'tests.lock');
    const handle = await acquireLock(lockPath, { timeoutMs: 2000 });
    writeOwner(lockPath, { token: 'reclaimed' });
    handle.release();
    expect(existsSync(lockPath)).toBe(true);
    rmSync(lockPath, { recursive: true, force: true });
  });

  it('treats a live owner as fresh and a dead owner as stale', () => {
    const lockPath = path.join(tempDir(), 'tests.lock');
    const live = writeOwner(lockPath, { pid: process.pid });
    expect(lockIsStale(lockPath, live, Date.now(), 60_000)).toBe(false);
    const dead = writeOwner(lockPath, { pid: 2_147_483_647 });
    expect(lockIsStale(lockPath, dead, Date.now(), 60_000)).toBe(true);
  });
});

describe('run-locked', () => {
  it(
    'serializes commands started from separate processes',
    async () => {
      const dir = tempDir();
      const logFile = path.join(dir, 'order.log');
      const scriptPath = path.join(dir, 'worker.mjs');
      writeFileSync(
        scriptPath,
        [
          "import { appendFileSync } from 'node:fs';",
          'const log = process.env.LOCK_TEST_LOG;',
          "appendFileSync(log, `start ${process.pid}\\n`);",
          'setTimeout(() => {',
          "  appendFileSync(log, `end ${process.pid}\\n`);",
          '}, 200);',
        ].join('\n'),
      );

      const run = (): Promise<number> =>
        new Promise((resolve, reject) => {
          const child = spawn(
            process.execPath,
            [runLockedPath, 'tests', '--', process.execPath, scriptPath],
            {
              env: {
                ...process.env,
                NEON_LOCK_DIR: dir,
                NEON_LOCK_QUIET: '1',
                LOCK_TEST_LOG: logFile,
              },
              stdio: 'ignore',
            },
          );
          child.on('error', reject);
          child.on('exit', (code) => resolve(code ?? 1));
        });

      const [first, second] = await Promise.all([run(), run()]);
      expect(first).toBe(0);
      expect(second).toBe(0);

      const lines = readFileSync(logFile, 'utf8').trim().split('\n');
      expect(lines.map((line) => line.split(' ')[0])).toEqual([
        'start',
        'end',
        'start',
        'end',
      ]);
    },
    15_000,
  );
});
