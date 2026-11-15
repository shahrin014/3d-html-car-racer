# Deployment Specification

## Purpose

Defines how Neon Racer gets from source to the public site: the branch model,
GitHub Pages configuration, deployment workflow, quality gate, subpath
handling, verification, rollback, and credentials.

## Target

| Item | Value |
| --- | --- |
| Repository | `github.com/shahrin014/3d-html-car-racer` |
| Production branch | `main` |
| Host | GitHub Pages |
| URL | `https://shahrin014.github.io/3d-html-car-racer/` |
| Pages source | GitHub Actions (artifact deployment) |
| Workflow | `.github/workflows/deploy-pages.yml` |

Deployment is **not** done by pushing to a `gh-pages` branch. GitHub Pages
receives the built `dist/` directory as a workflow artifact.

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

## Verification Checklist

Run this against the public URL after every deployment:

| Check | Expected |
| --- | --- |
| Base URL | Returns 200 over HTTPS |
| Assets | Script, styles, manifest, icons, and favicon return 200 under the subpath |
| Game | Menu loads; a run starts; steering and pause work; a collision costs a heart |
| Persistence | Best score survives a reload |
| Install | Manifest is valid and the app installs or opens standalone |
| Offline | After one online load, a reload with the network disabled still starts the game |
| Console | No uncaught errors during menu, run, pause, and game over |
| Revision | The deployed content matches the `main` commit recorded by the workflow run |

## First-Time Setup

1. Open **Settings → Pages**.
2. Set **Source** to **GitHub Actions**.
3. Protect `main`: block force pushes and deletion and require a pull request.
4. Run the deployment workflow and confirm the `github-pages` environment is
   created.
5. Open the published URL and run the verification checklist.

## Requirements

### Requirement: `main` is the production branch

`main` SHALL be the default branch and the only branch that deploys. Work SHALL
happen on short-lived branches merged through a pull request. Force pushes and
deletion on `main` SHALL be blocked, and merged branches SHALL be deleted.

#### Scenario: Merge reaches production

- **GIVEN** a feature branch has passed review and its checks
- **WHEN** it is merged into `main`
- **THEN** the workflow runs for the merge commit
- **AND** the public site serves that build after the workflow succeeds

#### Scenario: Feature branch does not deploy

- **GIVEN** a commit is pushed to a `feat/` branch
- **THEN** no production deployment is triggered
- **AND** the live site is unchanged

#### Scenario: Tag does not deploy

- **GIVEN** a tag is pushed
- **THEN** no deployment is triggered unless a commit also lands on `main`

#### Scenario: Hotfix follows the same path

- **GIVEN** production needs an urgent fix
- **WHEN** a `fix/` branch is merged into `main`
- **THEN** the same workflow deploys it
- **AND** no direct push bypasses review or checks

#### Scenario: Main protection

- **GIVEN** `main` is protected
- **WHEN** a contributor attempts a force push or a direct push that skips checks
- **THEN** the push is rejected

### Requirement: Pages uses artifact deployment

GitHub Pages SHALL use GitHub Actions as its source. Build output SHALL NOT be
committed, `dist/` SHALL be ignored by Git, and no `gh-pages` branch SHALL be
created or updated.

#### Scenario: Deployment leaves no build branch

- **GIVEN** a deployment has succeeded
- **THEN** no new commit exists on a `gh-pages` branch
- **AND** `dist/` is absent from `main`

#### Scenario: Pages source is Actions

- **GIVEN** the repository Pages settings are inspected
- **THEN** the source is GitHub Actions
- **AND** the site is published from the workflow artifact

### Requirement: Deployment triggers are constrained

The workflow SHALL run on pushes to `main` and on manual dispatch. It SHALL
refuse to deploy any ref other than `main` and SHALL use concurrency group
`pages` without cancelling an in-progress run.

#### Scenario: Push to main deploys

- **GIVEN** a commit lands on `main`
- **WHEN** the workflow runs
- **THEN** the site is rebuilt and deployed
- **AND** the run exposes the published environment URL

#### Scenario: Manual redeploy

- **GIVEN** `main` has already been deployed
- **WHEN** a maintainer starts the workflow manually on `main`
- **THEN** the current `main` commit is rebuilt and redeployed

#### Scenario: Manual run on another branch does not deploy

- **GIVEN** a maintainer starts the workflow on a feature branch
- **THEN** the deploy job is skipped
- **AND** the production site is unchanged

#### Scenario: Concurrent pushes queue

- **GIVEN** two commits land on `main` in quick succession
- **WHEN** both runs are queued
- **THEN** deployments do not overlap
- **AND** the newest commit is left serving production

### Requirement: The workflow builds with the pinned toolchain

The workflow SHALL read the Node version from `.nvmrc`, install with `npm ci`
and the npm cache enabled, and run `npm run check`, which performs type
checking, unit tests, and the production build.

#### Scenario: Pinned Node version

- **GIVEN** the workflow runs
- **THEN** the Node version matches `.nvmrc`
- **AND** dependencies are installed from `package-lock.json`

#### Scenario: All checks run

- **GIVEN** the workflow reaches the check step
- **THEN** type checking, unit tests, and the production build all run
- **AND** the build output is produced in `dist/`

### Requirement: The deploy job has least privilege

The deploy path SHALL configure Pages, upload `dist/`, and deploy to the
`github-pages` environment. The workflow SHALL request only `contents: read`,
`pages: write`, and `id-token: write`.

#### Scenario: Artifact reaches Pages

- **GIVEN** the build step succeeded
- **WHEN** the deploy job runs
- **THEN** the `dist/` artifact is uploaded
- **AND** the deployment is published to the `github-pages` environment

#### Scenario: Permissions are minimal

- **GIVEN** the workflow file is inspected
- **THEN** it requests no write permission beyond `pages` and `id-token`
- **AND** it uses only official `actions/*` steps

### Requirement: A failed check blocks deployment

Type checking, tests, and the build SHALL succeed before the artifact is
uploaded. A failure SHALL stop the workflow, SHALL NOT deploy, and SHALL leave
the previous deployment live.

#### Scenario: Failing test

- **GIVEN** a commit on `main` breaks a unit test
- **WHEN** the workflow runs
- **THEN** the test step fails
- **AND** no artifact is uploaded
- **AND** the previously deployed site remains available

#### Scenario: Build failure

- **GIVEN** the TypeScript build fails
- **WHEN** the workflow runs
- **THEN** the deployment step does not run
- **AND** the failure is visible in the Actions run

#### Scenario: Pages is not enabled

- **GIVEN** Pages is not configured with GitHub Actions as the source
- **WHEN** the workflow runs
- **THEN** it fails with a message naming the required repository setting
- **AND** it does not silently report success

### Requirement: The build works under the repository subpath

The build SHALL resolve assets relative to its own document so the artifact
works under `/3d-html-car-racer/` without a hardcoded repository name or
build-time base path. The manifest, icons, service worker, and service worker
scope SHALL all resolve under that subpath.

#### Scenario: Assets load under the project path

- **GIVEN** the site is served at `/3d-html-car-racer/`
- **WHEN** the page loads
- **THEN** the JavaScript, CSS, manifest, icons, and favicon all return 200
- **AND** no request incorrectly targets the domain root

#### Scenario: Service worker scope

- **GIVEN** the page is served at `/3d-html-car-racer/`
- **THEN** the registered service worker is under that path
- **AND** its scope is `/3d-html-car-racer/`

#### Scenario: No repository name in source

- **GIVEN** the source and build configuration are searched
- **THEN** asset resolution does not depend on the repository name

### Requirement: First-time setup is documented and satisfied

The repository SHALL document the First-Time Setup steps and SHALL satisfy them
before the first deployment is announced. The published URL SHALL then work
without further manual configuration.

#### Scenario: Fresh repository setup

- **GIVEN** Pages has never been enabled
- **WHEN** a maintainer follows the documented steps and runs the workflow
- **THEN** the site is published at the documented URL
- **AND** the published site runs the verification checklist

### Requirement: Every deployment is verified

A deployment SHALL be considered complete only after the Verification Checklist
passes against the public URL.

#### Scenario: Post-deploy smoke test

- **GIVEN** the workflow succeeded
- **WHEN** the verification checklist is run on a phone-sized viewport
- **THEN** all checks pass before the deployment is announced

#### Scenario: Broken asset path

- **GIVEN** a required asset returns 404 at the public URL
- **THEN** the deployment is treated as failed
- **AND** it is corrected before further work continues

### Requirement: Rollback is immediate and repeatable

A bad deployment SHALL be recoverable without rewriting history. The preferred
rollback is a revert commit on `main`, which triggers a normal deployment.
Alternatively, the last known-good workflow run on `main` SHALL be re-run to
rebuild and redeploy that commit. A failed deployment SHALL never replace the
last successful one.

#### Scenario: Revert the bad commit

- **GIVEN** a deployment introduced a regression
- **WHEN** a revert commit is merged to `main`
- **THEN** the workflow deploys the reverted state
- **AND** the live site returns to the previous behavior

#### Scenario: Re-run the last good deployment

- **GIVEN** the last successful workflow run is retained
- **WHEN** a maintainer re-runs that workflow
- **THEN** that commit is rebuilt and deployed
- **AND** the site matches the known-good revision

#### Scenario: Failed deploy does not go live

- **GIVEN** the deploy step fails
- **THEN** GitHub Pages continues serving the previous successful deployment

### Requirement: Browser caches update predictably

Hashed assets SHALL be immutable and cache-first. The app shell SHALL be
network-first so a new deployment is discovered promptly. A new service worker
SHALL take effect on the next launch, not mid-run. The service worker cache
version SHALL be bumped whenever the set of core cached files changes.

#### Scenario: New deployment is discovered

- **GIVEN** a new build has been deployed
- **WHEN** an existing player reloads the app online
- **THEN** the new page shell is fetched
- **AND** new hashed assets are downloaded and cached

#### Scenario: No mid-run interruption

- **GIVEN** a new service worker is installed while a run is in progress
- **THEN** the run continues without a forced reload
- **AND** the update applies on the next launch

#### Scenario: Stale core assets are removed

- **GIVEN** the core asset list changed and the cache version was bumped
- **WHEN** the new service worker activates
- **THEN** caches from the previous version are deleted

### Requirement: Deployment uses no stored secrets

Building and deploying SHALL require no repository or environment secrets. The
workflow SHALL use the automatic `GITHUB_TOKEN`, and fork pull requests SHALL
NOT be able to deploy.

#### Scenario: No secret configuration

- **GIVEN** a fresh clone with repository access
- **WHEN** the deployment workflow runs
- **THEN** it succeeds without any manually created secret

#### Scenario: Fork pull request

- **GIVEN** a pull request from a fork
- **WHEN** its checks run
- **THEN** it cannot deploy to the production environment

### Requirement: Deployment status is observable

The workflow SHALL be the deployment record. Each run SHALL show the commit,
check results, artifact upload, and published environment URL. The README SHALL
name the production branch, the workflow, and the live URL.

#### Scenario: Finding the deployed revision

- **GIVEN** a player reports a problem with the live site
- **WHEN** a maintainer opens the latest successful deployment run
- **THEN** the run identifies the exact `main` commit that is live

#### Scenario: Diagnosing a failure

- **GIVEN** a deployment failed
- **WHEN** a maintainer opens the run
- **THEN** the failing step and its output are visible
- **AND** the live URL and current revision are unchanged

## Out of Scope

- Pull-request preview deployments.
- Scheduled or nightly publishing.
- Custom domains and DNS configuration.
- Separate staging or QA environments.
- Native App Store or Play Store release pipelines.
- Self-hosted runners.
- Server-side rendering or a backend service.
