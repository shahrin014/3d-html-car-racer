# Deployment Specification (delta)

## ADDED Requirements

### Requirement: Pull requests are checked before merge

A `pull_request` workflow SHALL run the quality gate without deploy
permissions. It SHALL run type checking, unit tests, the production build
(including the transfer budget), and the browser smoke suite. The workflow SHALL
request only `contents: read` and SHALL NOT deploy.

#### Scenario: Pull request runs the gate

- **GIVEN** a pull request targets `main`
- **WHEN** it is opened or updated
- **THEN** the checks workflow runs type checking, unit tests, the build, and the browser smoke tests
- **AND** no deployment is triggered

#### Scenario: Fork pull request

- **GIVEN** a pull request comes from a fork
- **WHEN** the checks workflow runs
- **THEN** it completes with read-only permissions
- **AND** it cannot reach the deployment environment

#### Scenario: Branch protection requires the gate

- **GIVEN** `main` is protected
- **THEN** the checks workflow result is a required status check
- **AND** a failing run blocks the merge

## MODIFIED Requirements

### Requirement: A failed check blocks deployment

Type checking, unit tests, the production build, and the browser smoke suite
SHALL succeed before the artifact is uploaded. A failure SHALL stop the
workflow, SHALL NOT deploy, and SHALL leave the previous deployment live.

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

#### Scenario: Browser smoke failure

- **GIVEN** the built app cannot boot, start a run, or update the HUD
- **WHEN** the browser job runs
- **THEN** it fails
- **AND** the deploy job does not run
- **AND** the previous deployment stays live

#### Scenario: Pages is not enabled

- **GIVEN** Pages is not configured with GitHub Actions as the source
- **WHEN** the workflow runs
- **THEN** it fails with a message naming the required repository setting
- **AND** it does not silently report success

### Requirement: Browser caches update predictably

Hashed assets SHALL be immutable and cache-first. The app shell SHALL be
network-first so a new deployment is discovered promptly. A new service worker
SHALL take effect on the next launch, not mid-run. The service worker cache name
SHALL be derived from the emitted build so it changes whenever the app shell or
the core asset list changes, and SHALL be identical for identical builds.

#### Scenario: New deployment is discovered

- **GIVEN** a new build has been deployed
- **WHEN** an existing player reloads the app online
- **THEN** the new page shell is fetched
- **AND** new hashed assets are downloaded and cached

#### Scenario: No mid-run interruption

- **GIVEN** a new service worker is installed while a run is in progress
- **THEN** the run continues without a forced reload
- **AND** the update applies on the next launch

#### Scenario: Cache version tracks the build

- **GIVEN** the app shell or the core asset list changed
- **WHEN** the production build runs
- **THEN** the service worker cache name changes
- **AND** the previous cache is deleted when the new worker activates

#### Scenario: Unchanged rebuild keeps the cache

- **GIVEN** no tracked file changed
- **WHEN** the production build runs again
- **THEN** the cache name is identical
- **AND** clients do not redownload the shell

#### Scenario: Missing placeholder fails the build

- **GIVEN** the service worker no longer contains the cache version placeholder
- **WHEN** the production build runs
- **THEN** the build fails with a message naming the placeholder
