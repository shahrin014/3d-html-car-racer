# Project Specification

## Purpose

Defines how Neon Racer is worked on: the branch model, Git worktrees, how each
worktree is set up, how local test runs are serialized across worktrees, and
the local gates that protect `main`. Game behavior lives in
`openspec/specs/game/spec.md`; seeded circuit generation, elevation, and
validation live in `openspec/specs/track-randomization/spec.md`; publishing
lives in `openspec/specs/deployment/spec.md`.

## Target

| Item | Value |
| --- | --- |
| Repository | `github.com/shahrin014/3d-html-car-racer` |
| Primary checkout | Repository root, kept on `main` |
| Production branch | `main` |
| Node.js | 26 LTS (`.nvmrc`) |
| Package manager | npm with `package-lock.json` |
| Lock directory | `<git-common-dir>/neon-racer-locks/` |
| Lock wrapper | `node build/run-locked.ts <name> -- <command>` |
| Local quality gate | `npm run check` |
| Commit gate | `.githooks/pre-commit` runs `npm test` |

## Branch Model

| Branch | Purpose | Deploys |
| --- | --- | --- |
| `main` | Production source of truth | Yes |
| `feat/<slug>` | New behavior or UI | No |
| `fix/<slug>` | Bug fixes | No |
| `spec/<slug>` | Spec-only changes | No |
| `gh-pages` | Reserved; not used | No |

There is one environment. No `develop`, `staging`, `nightly`, or `production`
branch is used. Every merge to `main` is a release.

## Requirements

### Requirement: `main` is the source of truth and work lands through short-lived branches

`main` SHALL be the default branch and the source of truth. Work SHALL happen on
short-lived `feat/`, `fix/`, or `spec/` branches. A branch SHALL be pushed when a
remote is configured, merged into `main` from a checkout, and `main` SHALL then
be pushed. Every merge to `main` SHALL be a release. `main` history SHALL be
append-only: force pushes and deletion SHALL NOT be used.

#### Scenario: Feature branch merges into `main`

- **GIVEN** a feature branch has passed its local checks
- **WHEN** it is merged into `main` from a checkout
- **THEN** the merge commit lands on `main`
- **AND** `main` is pushed to the remote

#### Scenario: History is append-only

- **GIVEN** `main` has published history
- **WHEN** a mistake must be corrected
- **THEN** a new commit is added, or the bad commit is reverted
- **AND** `main` is not force-pushed or deleted

#### Scenario: Branch names follow the model

- **GIVEN** a new task needs a branch
- **WHEN** the branch is created
- **THEN** it uses a `feat/`, `fix/`, or `spec/` prefix
- **AND** no long-lived integration branch is created

### Requirement: Worktrees use dedicated branches

Each Git worktree SHALL work on its own branch for the task in hand. A worktree
SHALL NOT commit directly to `main`. Work SHALL be committed to the worktree's
branch, pushed when a remote is configured, merged into `main`, and `main` SHALL
be pushed. The primary checkout SHALL stay on `main` and SHALL be fast-forwarded
before a task starts. Merge conflicts SHALL be resolved before the merge is
completed.

#### Scenario: Worktree commits to its own branch

- **GIVEN** a task runs in a worktree
- **WHEN** the work is committed
- **THEN** the commit lands on the worktree's dedicated branch
- **AND** `main` is unchanged until the branch is merged

#### Scenario: Primary checkout stays current

- **GIVEN** the primary checkout is on `main`
- **WHEN** a task starts
- **THEN** the checkout is fetched and fast-forwarded to `origin/main`
- **AND** it is left on `main` when the task is done

#### Scenario: Merge conflict is resolved by the author

- **GIVEN** the worktree branch conflicts with `main`
- **WHEN** the branch is merged
- **THEN** the author resolves the conflict
- **AND** the checks pass on the merged result

### Requirement: Each worktree is set up independently

Git worktrees do not share tracked files. Each worktree SHALL install its own
dependencies from the lockfile with `npm ci --prefer-offline` before running
scripts. A worktree MAY reuse another checkout's `node_modules` by symlink only
while both checkouts have the same `package-lock.json`. The project SHALL NOT
require environment files or secrets; any local configuration SHALL stay
untracked. Concurrent dev servers SHALL use explicit ports.

#### Scenario: Fresh worktree is usable

- **GIVEN** a new worktree has no `node_modules`
- **WHEN** dependencies are installed with `npm ci --prefer-offline`
- **THEN** `npm test` and `npm run dev` work without touching the primary checkout

#### Scenario: Shared install is only used for an identical lockfile

- **GIVEN** a worktree symlinks `node_modules` from another checkout
- **WHEN** the worktree reuses that install
- **THEN** both checkouts use the same `package-lock.json`
- **AND** the symlink is not committed

#### Scenario: Dev servers use different ports

- **GIVEN** two worktrees run dev servers at the same time
- **WHEN** the second server starts
- **THEN** it is given an explicit port such as `npm run dev -- --port 5174`
- **AND** neither server fails on a port collision

### Requirement: Local test runs are serialized across worktrees

Git worktrees share the Playwright preview port, CPU, and memory. `npm test` and
`npm run test:e2e` SHALL acquire an exclusive, repository-wide lock before
running. The lock SHALL live in the shared Git directory so every worktree sees
it and `git status` stays clean. A second run SHALL wait for the first and SHALL
start automatically once the lock is released. `npm run test:watch` and the dev
servers SHALL NOT take the lock.

#### Scenario: Second run queues behind the first

- **GIVEN** worktree A is running `npm test`
- **WHEN** worktree B runs `npm test` or `npm run test:e2e`
- **THEN** B waits without starting its tests
- **AND** B starts as soon as A releases the lock
- **AND** the two runs never overlap

#### Scenario: The lock stays out of version control

- **GIVEN** a test run is in progress
- **WHEN** the repository status is checked
- **THEN** the lock lives inside the shared Git directory
- **AND** `git status` reports no new file

#### Scenario: Watch mode and dev servers are not serialized

- **GIVEN** a developer starts `npm run test:watch` or `npm run dev`
- **WHEN** the command starts
- **THEN** no repository-wide lock is taken
- **AND** the command can run alongside a queued test run

### Requirement: Lock failures are recoverable and observable

The lock SHALL be released when the command exits, fails, or is interrupted. A
lock left behind by a dead process SHALL be reclaimed automatically. A run that
waits longer than the configured timeout SHALL fail with a message naming the
holder instead of running.

#### Scenario: A failing run releases the lock

- **GIVEN** a run holds the lock and its tests fail
- **WHEN** the command exits
- **THEN** the lock is released
- **AND** the next queued run starts

#### Scenario: An interrupted run releases the lock

- **GIVEN** a run holds the lock
- **WHEN** it receives `SIGINT` or `SIGTERM`
- **THEN** the lock is released
- **AND** the next queued run starts

#### Scenario: A stale lock is reclaimed

- **GIVEN** a previous run crashed without releasing the lock
- **WHEN** its process is no longer alive
- **THEN** the next run reclaims the lock immediately
- **AND** it does not wait for the timeout

#### Scenario: Waiting too long fails clearly

- **GIVEN** the lock is held by a live process
- **WHEN** a run waits longer than the configured timeout
- **THEN** it exits with an error naming the holder's PID and command
- **AND** the command does not run

### Requirement: Commits run the unit suite locally

`npm ci` and `npm install` SHALL point `core.hooksPath` at `.githooks/`, so the
pre-commit hook runs `npm test` before a commit is created. A failing unit test
SHALL abort the commit. The hook SHALL NOT run the browser suite. The bypass
SHALL be documented: `git commit --no-verify`, `SKIP_UNIT_TESTS=1`, or
`npm run hooks:uninstall`.

#### Scenario: Failing unit test aborts the commit

- **GIVEN** a change breaks a unit test
- **WHEN** the developer commits
- **THEN** the pre-commit hook runs `npm test`
- **AND** the commit is aborted

#### Scenario: Passing unit test allows the commit

- **GIVEN** the unit suite passes
- **WHEN** the developer commits
- **THEN** the commit is created

#### Scenario: Work-in-progress bypass

- **GIVEN** a developer needs a commit before the tests pass
- **WHEN** they run `git commit --no-verify` or set `SKIP_UNIT_TESTS=1`
- **THEN** the hook is skipped for that commit

#### Scenario: Missing dependencies are reported

- **GIVEN** `node_modules` is missing
- **WHEN** the developer commits
- **THEN** the hook fails with the `npm ci` instruction
- **AND** the commit is aborted

### Requirement: The local quality gate matches CI

`npm run check` SHALL run type checking, the unit suite, and the production
build in that order. It SHALL stop at the first failure. The production build
SHALL enforce the JavaScript transfer budgets. The pull-request workflow SHALL
run the same steps.

#### Scenario: The gate passes

- **GIVEN** the change type checks, tests pass, and the build fits its budgets
- **WHEN** `npm run check` runs
- **THEN** every step succeeds
- **AND** `dist/` contains the production build

#### Scenario: A type error stops the gate

- **GIVEN** a change has a type error
- **WHEN** `npm run check` runs
- **THEN** type checking fails
- **AND** the unit suite and build do not run

#### Scenario: A test failure stops the gate

- **GIVEN** a change breaks a unit test
- **WHEN** `npm run check` runs
- **THEN** the unit suite fails
- **AND** the production build does not run

#### Scenario: An over-budget build stops the gate

- **GIVEN** a change pushes a bundle past its gzip budget
- **WHEN** `npm run check` runs
- **THEN** the build fails with the budget named
- **AND** the change is not committed to `main`

## Out of Scope

- Distributed locking across machines or shared network filesystems.
- Queueing GitHub Actions runs; the workflows already use concurrency groups.
- Per-worktree databases or services; the project has no local backend.
- A `gh-pages` branch or a second hosting environment.
