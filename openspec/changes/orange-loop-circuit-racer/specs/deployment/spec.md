# Deployment Specification (delta)

## MODIFIED Requirements

### Requirement: Pull requests are checked before merge

A `pull_request` workflow SHALL run the quality gate without deploy
permissions. It SHALL run type checking, unit tests, the production build
(including the transfer budget), and the browser smoke suite. The browser suite
SHALL run at a landscape phone viewport and SHALL cover orientation handling and
the input fallbacks. The workflow SHALL request only `contents: read` and SHALL
NOT deploy.

#### Scenario: Pull request runs the gate

- **GIVEN** a pull request targets `main`
- **WHEN** it is opened or updated
- **THEN** the checks workflow runs type checking, unit tests, the build, and the browser smoke tests
- **AND** no deployment is triggered

#### Scenario: Landscape coverage

- **GIVEN** a pull request changes layout, controls, or physics
- **WHEN** the browser job runs
- **THEN** the suite runs at 844×390
- **AND** it exercises button and keyboard steering with tilt unavailable

#### Scenario: Fork pull request

- **GIVEN** a pull request comes from a fork
- **WHEN** the checks workflow runs
- **THEN** it completes with read-only permissions
- **AND** it cannot reach the deployment environment

#### Scenario: Branch protection requires the gate

- **GIVEN** `main` is protected
- **THEN** the checks workflow result is a required status check
- **AND** a failing run blocks the merge

### Requirement: Every deployment is verified

A deployment SHALL be considered complete only after the Verification Checklist
passes against the public URL.

#### Scenario: Post-deploy smoke test

- **GIVEN** the workflow succeeded
- **WHEN** the verification checklist is run on a landscape phone-sized viewport
- **THEN** all checks pass before the deployment is announced
- **AND** the race starts, a lap completes, and the HUD reports time and damage

#### Scenario: Installed orientation

- **GIVEN** the deployed build is installed on a phone
- **WHEN** it is launched from the home screen
- **THEN** it opens in landscape

#### Scenario: Broken asset path

- **GIVEN** a required asset returns 404 at the public URL
- **THEN** the deployment is treated as failed
- **AND** it is corrected before further work continues
