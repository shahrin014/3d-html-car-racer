# Game Specification (delta)

## MODIFIED Requirements

### Requirement: Mobile performance budget

Initial JavaScript transfer SHALL remain within the configured budget, and the
production build SHALL fail when the budget is exceeded. The game SHALL target
60 frames per second on a mid-range phone, and a long run SHALL keep memory and
active object counts bounded.

#### Scenario: Transfer budget

- **GIVEN** the production build is produced
- **WHEN** the JavaScript bundle is compressed for transfer
- **THEN** it is at most 250 KB gzip

#### Scenario: Budget breach fails the build

- **GIVEN** a change pushes the gzipped JavaScript past the budget
- **WHEN** the production build runs
- **THEN** the build fails before any artifact is produced
- **AND** the output names the measured size and the budget

#### Scenario: Sustained run

- **GIVEN** a run lasts several minutes
- **WHEN** traffic spawns, passes, and is recycled repeatedly
- **THEN** the active car count stays bounded
- **AND** frame pacing remains playable
