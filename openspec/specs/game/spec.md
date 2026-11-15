# Game Specification

## Purpose

Defines the player-facing behavior of Neon Racer: a three-lane, endless 3D car
racer for mobile browsers. It covers the run lifecycle, controls, traffic,
collisions, scoring, persistence, pause behavior, mobile presentation,
accessibility, installability, and the runtime budget.

## Default Values

These values are provisional. Tuning them changes this section, not the intent
of the requirements.

| Setting | Default |
| --- | --- |
| Lanes | 3 |
| Lane width | 2.6 world units |
| Starting speed | 24 m/s |
| Speed ramp | +0.5 m/s per second of play |
| Maximum speed | 64 m/s |
| Score rate | 10 points per metre |
| Lives per run | 3 |
| Invulnerability after a hit | 1.4 s |
| Traffic wave interval | 1.25 s at start, 0.55 s at maximum speed |
| Traffic approach speed | 55% of the player's current speed |
| Cars in a wave | 1–2 |
| Starting traffic | 3 cars ahead of the player |
| Same-lane spawn spacing | At least 14 world units |
| Steering button target | At least 56×56 CSS pixels |
| Device pixel ratio cap | 2 |
| Initial JavaScript budget | 250 KB gzip |

## Requirements

### Requirement: A run has a clear lifecycle

The game SHALL have exactly four modes: menu, playing, paused, and game over.
Starting a run SHALL reset score, distance, speed, lives, player lane,
invulnerability, and all traffic. A run SHALL end exactly once, when the last
heart is lost. The game-over screen SHALL show the final score and distance and
SHALL offer a restart. Returning to the menu SHALL discard the run.

#### Scenario: Start from the menu

- **GIVEN** the game is showing the menu
- **WHEN** the player activates Start run
- **THEN** the mode becomes playing
- **AND** the score is 0, the player has 3 hearts, and the car is in the centre lane

#### Scenario: Game over happens once

- **GIVEN** the player is on their last heart
- **WHEN** a collision occurs
- **THEN** the mode becomes game over
- **AND** the final score and distance are shown
- **AND** further collisions or score updates do not change that result

#### Scenario: Restart resets the run

- **GIVEN** the game-over screen is visible
- **WHEN** the player activates Race again
- **THEN** a new run starts with 3 hearts, score 0, and the starting speed
- **AND** no traffic from the previous run remains on the road

#### Scenario: Return to the menu abandons the run

- **GIVEN** a run is paused or finished
- **WHEN** the player activates Main menu
- **THEN** the menu is shown
- **AND** resuming is not possible without starting a new run

#### Scenario: Start cannot reset an active run

- **GIVEN** a run is in progress
- **WHEN** a start request is received
- **THEN** the in-progress run continues unchanged

### Requirement: Three-lane steering

The car SHALL occupy exactly one of three lanes. Each steering intent SHALL
move the car exactly one lane, and the car SHALL never leave the road. Steering
input SHALL be ignored outside a playing run. The car SHALL settle into its
target lane rather than jump instantaneously.

#### Scenario: Move left from the centre

- **GIVEN** the car is in the centre lane during a run
- **WHEN** the player steers left
- **THEN** the car moves to the left lane

#### Scenario: The road edge blocks steering

- **GIVEN** the car is in the leftmost lane
- **WHEN** the player steers left
- **THEN** the car stays in the leftmost lane
- **AND** the score and lives are unchanged

#### Scenario: Two quick inputs cross two lanes

- **GIVEN** the car is in the leftmost lane
- **WHEN** the player steers right twice
- **THEN** the car ends in the rightmost lane

#### Scenario: Steering is ignored when not playing

- **GIVEN** the game is paused
- **WHEN** the player swipes, taps, or presses an arrow key
- **THEN** the car does not change lanes

### Requirement: Touch steering inputs

During a run, a horizontal swipe, a tap on the left or right half of the track,
an on-screen left/right button, and the `←`/`→` or `A`/`D` keys SHALL each steer
the car one lane in the corresponding direction. Each on-screen button SHALL
meet the minimum touch target and SHALL have an accessible name. Keyboard input
SHALL be an addition, never a requirement.

#### Scenario: Swipe steering

- **GIVEN** a run is in progress on a touch device
- **WHEN** the player swipes horizontally across the track
- **THEN** the car changes one lane in the swipe direction

#### Scenario: Tap steering

- **GIVEN** a run is in progress on a touch device
- **WHEN** the player taps the right half of the track
- **THEN** the car moves one lane to the right

#### Scenario: Button steering

- **GIVEN** a run is in progress
- **WHEN** the player presses the on-screen left button
- **THEN** the car moves one lane to the left
- **AND** the button is announced as “Steer left” by assistive technology

#### Scenario: Keyboard steering

- **GIVEN** a run is in progress on a device with a keyboard
- **WHEN** the player presses the right arrow key
- **THEN** the car moves one lane to the right

### Requirement: Game gestures do not manipulate the page

Game gestures SHALL NOT scroll, zoom, select text, or trigger browser
navigation. The game SHALL remain fully playable on a touchscreen with no
keyboard attached.

#### Scenario: No page scroll

- **GIVEN** a run is in progress on a touch device
- **WHEN** the player swipes vertically or horizontally on the track
- **THEN** the page does not scroll or bounce
- **AND** the browser does not navigate back

#### Scenario: No text selection

- **GIVEN** the player presses and drags on the track
- **WHEN** the gesture ends
- **THEN** no text or control is selected

### Requirement: Traffic waves are fair

Traffic SHALL arrive in waves containing the configured one or two cars. A wave
SHALL use distinct lanes, SHALL leave at least one lane open, and SHALL NOT
stack a car in a lane that already has traffic at the spawn point.

#### Scenario: A wave never blocks the road

- **GIVEN** a traffic wave is generated
- **THEN** at most two lanes contain a new car
- **AND** at least one lane is open

#### Scenario: Traffic does not stack

- **GIVEN** a car has just spawned in a lane
- **WHEN** the next wave chooses the same lane before the first car has moved clear
- **THEN** the new car is not spawned in that lane

### Requirement: Traffic is recycled and visible from the start

Traffic SHALL approach at the configured fraction of the player's speed and
SHALL be removed after passing the player. Cars SHALL be pooled and reused so
the active count stays bounded. A run SHALL begin with traffic already visible
ahead.

#### Scenario: First traffic is visible immediately

- **GIVEN** a new run has just started
- **WHEN** the first frame is rendered
- **THEN** at least one traffic car is visible ahead of the player

#### Scenario: Passed traffic is recycled

- **GIVEN** a traffic car moves behind the player
- **WHEN** it passes the despawn line
- **THEN** it is hidden and becomes available for a later wave
- **AND** the number of active cars does not grow without bound

#### Scenario: Waves tighten with speed

- **GIVEN** the player is at the starting speed
- **WHEN** the player reaches the maximum speed
- **THEN** the interval between waves is shorter
- **AND** it never falls below the configured minimum

### Requirement: A collision costs one heart

A collision occurs when the player car's road-plane rectangle overlaps a
traffic car's rectangle. It SHALL remove exactly one heart, remove the car that
was hit, and end the run when no hearts remain.

#### Scenario: First collision

- **GIVEN** the player has 3 hearts and hits a traffic car
- **THEN** the player has 2 hearts
- **AND** the hit car disappears

#### Scenario: The third collision ends the run

- **GIVEN** the player has 1 heart
- **WHEN** a traffic car overlaps the player
- **THEN** the mode becomes game over
- **AND** the score stops changing

### Requirement: Invulnerability is brief and fair

After a collision, the player SHALL be invulnerable for the configured period.
During invulnerability collisions SHALL be ignored, the car SHALL flash, and
the timer SHALL advance only while the run is playing.

#### Scenario: Invulnerability prevents double hits

- **GIVEN** the player was just hit and is invulnerable
- **WHEN** another traffic car overlaps the player
- **THEN** no heart is lost
- **AND** the overlapping car is not removed by that contact

#### Scenario: Pausing suspends invulnerability

- **GIVEN** the player paused with invulnerability remaining
- **WHEN** the game is paused for several seconds
- **THEN** the remaining invulnerability is unchanged on resume

### Requirement: Hits produce immediate feedback

A collision SHALL produce a red screen flash and a short camera shake. Both
SHALL be suppressed when the device requests reduced motion.

#### Scenario: Default hit feedback

- **GIVEN** reduced motion is not requested
- **WHEN** the player collides with traffic
- **THEN** a red flash is shown
- **AND** the camera shakes briefly

#### Scenario: Reduced motion hit feedback

- **GIVEN** the device requests reduced motion
- **WHEN** the player collides with traffic
- **THEN** the heart count still drops
- **AND** camera shake and the flash animation are suppressed

### Requirement: Speed ramps to a readable ceiling

Speed SHALL start at the configured value, increase linearly with game time,
and SHALL never exceed the configured maximum. Game time SHALL advance only
during a playing run.

#### Scenario: Speed ramps

- **GIVEN** a run has been playing for 10 seconds at the default ramp
- **THEN** the speed is 29 m/s

#### Scenario: Speed caps

- **GIVEN** a run has been playing for several minutes
- **THEN** the speed never exceeds 64 m/s

#### Scenario: Paused time is not game time

- **GIVEN** a run is paused for 30 seconds
- **WHEN** it resumes
- **THEN** the speed has not changed

### Requirement: Score follows distance

Score SHALL be the floor of distance in metres multiplied by the configured
points per metre. The HUD SHALL refresh the score at least ten times per second
while playing. The game-over screen SHALL show distance alongside the final
score.

#### Scenario: Score follows distance

- **GIVEN** the player has travelled 12.9 metres
- **THEN** the displayed score is 129

#### Scenario: HUD stays current

- **GIVEN** a run is in progress
- **WHEN** the car covers distance
- **THEN** the score display updates at least every 100 ms

#### Scenario: Final distance is reported

- **GIVEN** a run ends after travelling 540.4 metres
- **THEN** the game-over screen shows 540 m of distance

### Requirement: Best score persists on the device

The best score SHALL be stored locally. A higher final score SHALL replace it
and be visible on the next launch; a lower score SHALL NOT. A missing or corrupt
value SHALL be treated as 0. Storage failure SHALL NOT prevent play.

#### Scenario: Best score survives a reload

- **GIVEN** the player finishes with a score higher than the stored best
- **WHEN** the page is reloaded
- **THEN** the menu and the next run show the new best score

#### Scenario: Best score only increases

- **GIVEN** the stored best is 900
- **WHEN** the player finishes with 500
- **THEN** the stored best remains 900

#### Scenario: Corrupt storage is ignored

- **GIVEN** the stored best value is not a number
- **WHEN** the game loads
- **THEN** the best score is shown as 0
- **AND** the game is playable

#### Scenario: Storage is unavailable

- **GIVEN** the browser blocks local storage
- **WHEN** a run ends
- **THEN** the game still shows the result and allows a restart

### Requirement: Pause and resume are lossless

The player SHALL pause from the HUD button, `Escape`, or `P`. Pausing SHALL stop
score, traffic, and invulnerability. The pause screen SHALL offer Resume,
Restart, and Main menu. Resuming SHALL continue the same run with no catch-up.

#### Scenario: Pause freezes the run

- **GIVEN** a run is in progress
- **WHEN** the player pauses
- **THEN** the pause screen is shown
- **AND** the score and traffic positions do not change while paused

#### Scenario: Resume continues where it stopped

- **GIVEN** a run was paused with 1.0 seconds of invulnerability remaining
- **WHEN** the player resumes
- **THEN** the run continues from that state
- **AND** 1.0 second of invulnerability remains

#### Scenario: Hidden tab pauses

- **GIVEN** a run is in progress
- **WHEN** the tab becomes hidden
- **THEN** the game pauses
- **AND** no score is earned while hidden
- **AND** no catch-up distance is applied on return

#### Scenario: Resize while paused

- **GIVEN** a run is paused
- **WHEN** the viewport is resized or the device rotates
- **THEN** the scene is reframed
- **AND** the run state is unchanged

### Requirement: Mobile-first presentation

The game SHALL fill the viewport, respect safe-area insets, keep the car fully
visible in every lane, and keep score, best score, hearts, pause, and steering
controls visible without overlap. Portrait is preferred; landscape SHALL remain
playable. The pixel ratio SHALL be capped at 2.

#### Scenario: Standard phone portrait

- **GIVEN** a 390×844 CSS-pixel portrait viewport
- **WHEN** a run is in progress
- **THEN** the HUD and both steering buttons are fully visible
- **AND** the car is fully in frame

#### Scenario: Small phone

- **GIVEN** a 320×568 CSS-pixel portrait viewport
- **WHEN** the menu and a run are shown
- **THEN** text does not clip or overflow horizontally
- **AND** all primary actions remain reachable

#### Scenario: Outer lane framing

- **GIVEN** the car is in the leftmost or rightmost lane
- **THEN** the whole car remains on screen

#### Scenario: Landscape

- **GIVEN** an 844×390 CSS-pixel landscape viewport
- **WHEN** a run is in progress
- **THEN** the road, car, HUD, and controls are usable without overlap

### Requirement: Motion and accessibility preferences

The game SHALL respect `prefers-reduced-motion`. Controls SHALL be keyboard
reachable with visible focus and accessible names. Remaining lives SHALL be
conveyed as text, not color alone. The canvas SHALL have an accessible name.
Dialogs SHALL focus their primary action when opened.

#### Scenario: Reduced motion

- **GIVEN** the operating system requests reduced motion
- **WHEN** the player is hit or opens a dialog
- **THEN** camera shake and flash/entrance animations are effectively disabled

#### Scenario: Keyboard-only play

- **GIVEN** a keyboard is the only input device
- **WHEN** the player starts, steers, pauses, resumes, and restarts
- **THEN** every step is possible without a pointer
- **AND** focus is always visible

#### Scenario: Lives are announced

- **GIVEN** the player has lost one heart
- **WHEN** the hearts indicator is read by assistive technology
- **THEN** it announces that 2 of 3 lives remain

### Requirement: Installable, offline-capable web app

The production build SHALL provide a web app manifest with the required names,
URLs, display mode, orientation, colours, and 192×192 and 512×512 icons
including a maskable icon. When installation is offered, the menu SHALL show an
Install app action, hidden when the app is already installed or standalone.

#### Scenario: Install from the browser

- **GIVEN** the app is served over HTTPS and the browser offers installation
- **WHEN** the player activates Install app
- **THEN** the browser install prompt is shown
- **AND** the app launches in standalone mode

#### Scenario: Already installed

- **GIVEN** the app is running in standalone display mode
- **THEN** the Install app action is hidden

#### Scenario: No install prompt available

- **GIVEN** the browser does not offer an install prompt
- **THEN** no broken or inactive Install app action is shown

### Requirement: The app works offline after first load

A service worker SHALL cache the app shell and build assets. After one
successful online visit, the game SHALL reload and start offline, and an
installed app SHALL launch offline.

#### Scenario: Offline reload

- **GIVEN** the game has loaded successfully once while online
- **WHEN** the device goes offline and the page is reloaded
- **THEN** the game shell and assets load from cache
- **AND** a run can be started

#### Scenario: Installed offline launch

- **GIVEN** the app is installed and has loaded once
- **WHEN** it is launched with no network
- **THEN** it opens and is playable

### Requirement: New versions apply on the next launch

Navigation SHALL prefer the network so a new deployment is discovered, while
hashed assets SHALL be cache-first. A new service worker SHALL NOT interrupt a
run; the update SHALL apply on the next launch.

#### Scenario: Update on next launch

- **GIVEN** a new version has been deployed
- **WHEN** the player closes and relaunches the app
- **THEN** the new version is used

#### Scenario: No mid-run interruption

- **GIVEN** an update is installed while a run is in progress
- **THEN** the run continues without a forced reload

### Requirement: Self-contained runtime

The runtime SHALL make no third-party network requests and SHALL load no
external fonts, models, textures, or audio. All visual assets SHALL be bundled
or generated by the app.

#### Scenario: No external requests

- **GIVEN** the production build is running
- **WHEN** all network requests are inspected
- **THEN** every request is same-origin and belongs to the app

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
