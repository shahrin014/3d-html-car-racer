# Game Specification

## Purpose

Defines the player-facing behavior of Neon Racer: an orange-loop circuit racer
for mobile browsers. A race is three laps against the clock on a seeded,
randomly assembled circuit built from a fixed piece catalog. It covers the race
lifecycle, track generation, controls, damage and rescue, cameras, timing,
persistence, landscape presentation, accessibility, installability, and the
runtime budget.

## Default Values

These values are provisional. Tuning them changes this section, not the intent
of the requirements.

| Setting | Default |
| --- | --- |
| Laps per race | 3 |
| Race states | 5 (menu, countdown, racing, paused, finished) |
| Countdown | 3 s |
| Track width | 3 world units (three car widths) |
| Design speed | 12 m/s |
| Maximum speed | 24 m/s |
| Limp speed | 10 m/s |
| Fixed simulation step | 1/120 s |
| Maximum substeps per frame | 4 |
| Maximum frame delta | 0.1 s |
| Turn bank | 20–45° |
| Loop radius | 7 m at level 1, shrinking to 5.5 m |
| Boost impulse | 7 m/s |
| Boost cooldown | 1.6 s |
| Damage per impulse | 18 |
| Maximum damage | 100% |
| Rescue stall time | 2.5 s |
| Rescue penalty | 3 s |
| Tilt dead zone | 3° |
| Tilt range | 25° |
| Tilt smoothing | 10 Hz |
| Levels | 12 |
| Device pixel ratio cap | 2 |
| App-shell JavaScript budget | 250 KB gzip |
| Physics chunk budget | 1.75 MB gzip |

## Requirements

### Requirement: Game gestures do not manipulate the page

Game gestures SHALL NOT scroll, zoom, select text, or trigger browser
navigation. The game SHALL remain fully playable on a touchscreen with no
keyboard attached.

#### Scenario: No page scroll

- **GIVEN** a race is in progress on a touch device
- **WHEN** the player swipes or drags on the track
- **THEN** the page does not scroll or bounce
- **AND** the browser does not navigate back

#### Scenario: No text selection

- **GIVEN** the player presses and drags on the track
- **WHEN** the gesture ends
- **THEN** no text or control is selected

### Requirement: Pause and resume are lossless

The player SHALL pause from the HUD button, `Escape`, or `P`. Pausing SHALL stop
the physics simulation, timers, damage, and camera motion. The pause screen
SHALL offer Resume, Restart, and Main menu. Resuming SHALL continue the same race
with no catch-up and no change to the car's position, velocity, or damage.

#### Scenario: Pause freezes the race

- **GIVEN** a race is in progress
- **WHEN** the player pauses
- **THEN** the pause screen is shown
- **AND** car position, speed, lap time, and damage do not change while paused

#### Scenario: Resume continues where it stopped

- **GIVEN** a race was paused mid-corner at 12 m/s
- **WHEN** the player resumes
- **THEN** the car continues at 12 m/s from the same position
- **AND** no distance or time is skipped

#### Scenario: Hidden tab pauses

- **GIVEN** a race is in progress
- **WHEN** the tab becomes hidden
- **THEN** the race pauses
- **AND** no time is credited while hidden

#### Scenario: Resize while paused

- **GIVEN** a race is paused
- **WHEN** the viewport changes or the device rotates
- **THEN** the scene is reframed
- **AND** the race state is unchanged

### Requirement: Installable, offline-capable web app

The production build SHALL provide a web app manifest with the required names,
URLs, landscape orientation, display mode, colours, and 192×192 and 512×512
icons including a maskable icon. When installation is offered, the menu SHALL
show an Install app action, hidden when the app is already installed or
standalone.

#### Scenario: Install from the browser

- **GIVEN** the app is served over HTTPS and the browser offers installation
- **WHEN** the player activates Install app
- **THEN** the browser install prompt is shown
- **AND** the app launches in landscape standalone mode

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
- **AND** a race can be started

#### Scenario: Installed offline launch

- **GIVEN** the app is installed and has loaded once
- **WHEN** it is launched with no network
- **THEN** it opens and is playable

### Requirement: New versions apply on the next launch

Navigation SHALL prefer the network so a new deployment is discovered, while
hashed assets SHALL be cache-first. A new service worker SHALL NOT interrupt a
race; the update SHALL apply on the next launch.

#### Scenario: Update on next launch

- **GIVEN** a new version has been deployed
- **WHEN** the player closes and relaunches the app
- **THEN** the new version is used

#### Scenario: No mid-race interruption

- **GIVEN** an update is installed while a race is in progress
- **THEN** the race continues without a forced reload

### Requirement: Self-contained runtime

The runtime SHALL make no third-party network requests and SHALL load no
external fonts, models, textures, or audio. All visual assets SHALL be bundled
or generated by the app.

#### Scenario: No external requests

- **GIVEN** the production build is running
- **WHEN** all network requests are inspected
- **THEN** every request is same-origin and belongs to the app

### Requirement: Mobile performance budget

Initial app-shell JavaScript SHALL remain within a 250 kB gzip budget, and the
lazy-loaded physics chunk SHALL remain within a declared 1.75 MB gzip budget. The
production build SHALL fail when either budget is exceeded. Physics SHALL run at
a fixed timestep with a bounded number of substeps per frame, and a full race
SHALL keep memory and active body counts bounded. The game SHALL target 60
frames per second on a mid-range phone.

#### Scenario: Shell transfer budget

- **GIVEN** the production build is produced
- **WHEN** the app-shell JavaScript is compressed for transfer
- **THEN** it is at most 250 kB gzip
- **AND** the physics chunk is excluded from that total

#### Scenario: Physics asset budget

- **GIVEN** the production build is produced
- **WHEN** the lazy physics chunk is compressed for transfer
- **THEN** it is at most 1.75 MB gzip
- **AND** it loads after the menu renders, not before first paint

#### Scenario: Budget breach fails the build

- **GIVEN** a change pushes the app shell or the physics chunk past its budget
- **WHEN** the production build runs
- **THEN** the build fails before any artifact is produced
- **AND** the output names the measured size and the budget

#### Scenario: Stalled frame

- **GIVEN** the tab was stalled for one second
- **WHEN** the next frame runs
- **THEN** the simulation advances by at most the frame clamp
- **AND** the car cannot teleport through track geometry

#### Scenario: Sustained race

- **GIVEN** a three-lap race lasts several minutes
- **WHEN** the car drives, jumps, and recovers repeatedly
- **THEN** active body and object counts stay bounded
- **AND** frame pacing remains playable

### Requirement: A race has a clear lifecycle

A race SHALL have exactly five states: menu, countdown, racing, paused, and
finished. Starting a race SHALL generate or load the circuit, place the car on
the grid, and run a short countdown before the timers start. A race SHALL finish
after the configured number of laps. The finish screen SHALL show the total time,
the best lap, and the damage, and SHALL offer a restart and a return to the menu.
Returning to the menu SHALL discard the race.

#### Scenario: Start from the menu

- **GIVEN** the game is showing the menu
- **WHEN** the player activates Start race
- **THEN** the countdown runs and the state becomes racing
- **AND** the car is on the start line, the lap counter reads 1 of 3, and the timers read zero

#### Scenario: Start cannot reset an active race

- **GIVEN** a race is in progress
- **WHEN** a start request is received
- **THEN** the in-progress race continues unchanged

#### Scenario: Finish happens once

- **GIVEN** the car crosses the line on the final lap
- **WHEN** the crossing is registered
- **THEN** the state becomes finished
- **AND** the total time stops changing
- **AND** the finish screen shows the total, best lap, and damage

#### Scenario: Return to the menu abandons the race

- **GIVEN** a race is paused or finished
- **WHEN** the player activates Main menu
- **THEN** the menu is shown
- **AND** resuming is not possible without starting a new race

### Requirement: Landscape-first presentation

The game SHALL run in landscape orientation. It SHALL fill the viewport, respect
safe-area insets, keep the car and HUD readable, and keep every control reachable
with a thumb without overlap. A portrait viewport SHALL show a rotate prompt and
SHALL pause the race. The pixel ratio SHALL be capped at 2.

#### Scenario: Standard landscape phone

- **GIVEN** an 844×390 CSS-pixel landscape viewport
- **WHEN** a race is in progress
- **THEN** the HUD and all controls are fully visible
- **AND** the car is fully in frame

#### Scenario: Small landscape phone

- **GIVEN** a 667×375 CSS-pixel landscape viewport
- **WHEN** the menu and a race are shown
- **THEN** text does not clip or overflow
- **AND** all primary actions remain reachable

#### Scenario: Portrait orientation

- **GIVEN** the device is in portrait
- **WHEN** the page is open
- **THEN** a rotate prompt is shown
- **AND** the race is paused and no time is credited

#### Scenario: Outer edge framing

- **GIVEN** the car is at either rail
- **THEN** the whole car remains on screen

### Requirement: Accessibility and reduced motion

The game SHALL respect `prefers-reduced-motion`. Controls SHALL be keyboard
reachable with visible focus and accessible names. Steering SHALL NOT depend on
tilt alone. Damage, speed, and time SHALL be conveyed as text, not colour alone.
The canvas SHALL have an accessible name. Dialogs SHALL focus their primary
action when opened.

#### Scenario: Reduced motion

- **GIVEN** the operating system requests reduced motion
- **WHEN** the player is hit or opens a dialog
- **THEN** camera shake, rattle, and entrance animations are effectively disabled

#### Scenario: Tilt unavailable

- **GIVEN** the device has no orientation sensor or permission was refused
- **WHEN** the player starts a race
- **THEN** the on-screen buttons and keyboard steer the car
- **AND** no blocking prompt is shown after the start gesture

#### Scenario: Keyboard-only play

- **GIVEN** a keyboard is the only input device
- **WHEN** the player starts, steers, brakes, pauses, resumes, and restarts
- **THEN** every step is possible without a pointer
- **AND** focus is always visible

#### Scenario: Damage is announced

- **GIVEN** the car has taken damage
- **WHEN** the damage meter is read by assistive technology
- **THEN** it reports the damage as a percentage

### Requirement: The race is three laps against the clock

A race SHALL consist of the configured number of laps (3 by default) on a closed
circuit. Completing a lap SHALL require crossing every checkpoint in order and
then the start/finish line. The HUD SHALL show the current lap, the current lap
time, the total time, and the speed.

#### Scenario: Lap counting

- **GIVEN** the car has crossed the start line and every checkpoint
- **WHEN** it crosses the start line again
- **THEN** the lap counter advances by one
- **AND** the completed lap time is recorded

#### Scenario: Shortcut is rejected

- **GIVEN** the car missed a checkpoint
- **WHEN** it crosses the start line
- **THEN** the lap is not counted
- **AND** the lap counter is unchanged

#### Scenario: Final lap finishes the race

- **GIVEN** the car is on the last lap and has passed the final checkpoint
- **WHEN** it crosses the start line
- **THEN** the race finishes
- **AND** the total time and best lap are shown

### Requirement: Circuits are generated deterministically from a seed

Each circuit SHALL be generated from a seed. The same seed SHALL produce the
same circuit on every device and in every session. The default seed SHALL be the
current UTC date so the day's circuit is stable.

#### Scenario: Same seed, same circuit

- **GIVEN** a seed
- **WHEN** the circuit is generated twice, in separate sessions
- **THEN** the track geometry, feature placement, and start line are identical

#### Scenario: Daily circuit

- **GIVEN** the UTC date has not changed
- **WHEN** the player starts or restarts a race
- **THEN** the same circuit is used
- **AND** a new UTC date produces a different circuit

### Requirement: Track randomization is seeded and bounded

Randomization SHALL choose among the authored pieces in the catalog and SHALL
NOT invent new geometry. The seed SHALL decide the combination, and the level
SHALL decide the available piece sizes. A different seed or level SHALL be able
to produce a different combination, and every randomized circuit SHALL still
satisfy the closure and required-feature rules.

#### Scenario: Different seeds spread the combination

- **GIVEN** several different seeds at the same level
- **WHEN** the circuits are generated
- **THEN** more than one combination appears
- **AND** every piece still comes from the fixed catalog

#### Scenario: Levels scale the combination

- **GIVEN** one seed and two different levels
- **WHEN** both circuits are generated
- **THEN** turns tighten and loops shrink as the level rises
- **AND** both circuits are closed and contain the required features

#### Scenario: Randomization never invents geometry

- **GIVEN** one level and two different seeds
- **WHEN** both circuits are generated
- **THEN** every loop, turn, hill, and shift keeps its authored size
- **AND** only the combination and the straight lengths differ

### Requirement: Every generated circuit is closed and playable

A generated circuit SHALL be a closed loop: position and heading SHALL match at
the seam. It SHALL contain at least one vertical loop, at least two banked turns,
and at least two boost strips. It SHALL NOT self-intersect in plan view, SHALL
keep at least one car width of clearance between non-adjacent sections, and SHALL
keep every turn radius above the configured minimum. A circuit that violates a
rule SHALL be rejected and regenerated from the next deterministic seed offset.

#### Scenario: Closure

- **GIVEN** any accepted circuit
- **WHEN** the seam is inspected
- **THEN** the position and tangent match within tolerance

#### Scenario: Required features

- **GIVEN** any accepted circuit
- **THEN** it contains at least one loop, two banked turns, and two boost strips

#### Scenario: Unplayable layout is rejected

- **GIVEN** a candidate layout whose turn radius is below the minimum or whose
  sections overlap
- **WHEN** generation validates it
- **THEN** it is rejected
- **AND** generation continues with a different deterministic offset

### Requirement: The track is a narrow orange surface with guide rails

The track SHALL be one continuous surface about three car widths wide with guide
rails on both edges. It SHALL read as orange plastic with visible segment seams,
and the rails, supports, boost strips, and start/finish gate SHALL be visually
distinct. Supports SHALL connect raised track to the ground, including under
loops. The surface SHALL NOT contain gaps, cracks, or steps, and vertical loops
SHALL have a distinct entrance and exit.

#### Scenario: Track width

- **GIVEN** the built track
- **WHEN** the clear width between rails is measured
- **THEN** it is about three car widths

#### Scenario: Supported geometry

- **GIVEN** any raised track section outside a loop
- **THEN** it is connected to the ground by at least one support

#### Scenario: Continuous surface

- **GIVEN** the built track
- **WHEN** the surface is inspected
- **THEN** it is one continuous mesh with no gap or step between sections
- **AND** seam lines come from the surface texture, not from separate pieces

#### Scenario: Loop entrance and exit

- **GIVEN** a vertical loop
- **WHEN** the loop is inspected
- **THEN** the car climbs a ramp from the entry straight into a raised ring
- **AND** the ring's descending side clears the entry track
- **AND** the car leaves down a ramp 6.8 m ahead of the entrance
- **AND** both ends meet the straight at zero slope

### Requirement: The car is simulated as a rigid body

The car SHALL be simulated by a rigid-body physics engine with gravity, tyre
contact, friction, motor torque, and collisions. The simulation SHALL run at a
fixed timestep with a bounded substep count, and SHALL NOT let the car pass
through track geometry at maximum speed. The car SHALL be able to leave the
ground, complete a loop in contact with the surface, and collide with rails.

#### Scenario: Acceleration

- **GIVEN** the car is on the start line at rest
- **WHEN** the race starts
- **THEN** motor torque accelerates it without input
- **AND** speed approaches the design speed

#### Scenario: Loop

- **GIVEN** the car enters a loop at or above the design speed
- **WHEN** it traverses the loop
- **THEN** it stays in contact with the track surface
- **AND** it exits upright and on the track

#### Scenario: No tunnelling

- **GIVEN** the car travels at maximum speed
- **WHEN** the simulation advances
- **THEN** it does not pass through a plank or rail in a single step

#### Scenario: Rail contact

- **GIVEN** the car steers into a rail
- **WHEN** contact occurs
- **THEN** the car is deflected back onto the track
- **AND** the impact contributes to damage

### Requirement: Device tilt steers the car

Steering SHALL follow the device's left/right tilt. The neutral angle SHALL be
captured when the race starts. A small dead zone SHALL prevent drift, and the
signal SHALL be smoothed so the car does not twitch. Where the platform requires
permission for orientation events, it SHALL be requested from the Start gesture
and a refusal SHALL NOT block play.

#### Scenario: Tilt right

- **GIVEN** a racing car on a straight
- **WHEN** the device rolls right past the dead zone
- **THEN** the car steers toward the right rail
- **AND** returns to neutral when the device is level again

#### Scenario: Dead zone

- **GIVEN** the device is within the dead zone
- **THEN** the steering target stays centred

#### Scenario: Permission refused

- **GIVEN** the platform requires permission and the player refuses it
- **THEN** the race still starts
- **AND** fallback controls steer the car

### Requirement: Fallback controls always work

On-screen left and right buttons, a brake control, the `←`/`→` and `A`/`D` keys,
`Escape`/`P` for pause, and a camera toggle SHALL be available during a race.
Each control SHALL have an accessible name, SHALL meet the minimum touch target,
and SHALL remain reachable in landscape. Tilt SHALL never be the only way to
play.

#### Scenario: Button steering

- **GIVEN** a race is in progress
- **WHEN** the player presses the on-screen left button
- **THEN** the car steers left
- **AND** the button is announced as “Steer left”

#### Scenario: Keyboard steering

- **GIVEN** a race is in progress on a device with a keyboard
- **WHEN** the player presses the right arrow key
- **THEN** the car steers right

#### Scenario: Brake

- **GIVEN** a race is in progress at speed
- **WHEN** the player holds the brake control
- **THEN** the car decelerates

### Requirement: Boost strips accelerate the car

The track SHALL contain boost strips, visually distinct from the surface. Driving
over an armed strip SHALL add forward impulse to the car. Each strip SHALL have a
cooldown so one pass cannot retrigger continuously.

#### Scenario: Strip triggers

- **GIVEN** the car crosses an armed boost strip
- **THEN** it gains a forward impulse
- **AND** the strip visually confirms the boost

#### Scenario: Cooldown

- **GIVEN** a strip was just triggered
- **WHEN** the car remains over it
- **THEN** it does not trigger again until the cooldown expires

### Requirement: Impacts damage the car and reduce performance

Collisions above the configured impulse threshold SHALL increase damage. Damage
SHALL reduce engine force and top speed, and SHALL be reported in the HUD. At
maximum damage the car SHALL enter a limp mode, and the race SHALL continue. The
damage value SHALL NOT end the race or reset the lap.

#### Scenario: First impact

- **GIVEN** an undamaged car hits a rail
- **THEN** damage increases
- **AND** the top speed is lower than before the impact

#### Scenario: Limp mode

- **GIVEN** the car is at maximum damage
- **WHEN** the player continues
- **THEN** acceleration and top speed are limited
- **AND** the race can still be finished

#### Scenario: Reduced motion feedback

- **GIVEN** the device requests reduced motion
- **WHEN** an impact occurs
- **THEN** damage still increases
- **AND** camera rattle and spark animation are suppressed

### Requirement: The car is rescued rather than failing

If the car is off the track, inverted, or below the configured speed for the
configured time, it SHALL be placed back on the track at the last checkpoint,
facing forward, with a time penalty. Damage SHALL be preserved. There SHALL NOT
be a game-over state.

#### Scenario: Stall recovery

- **GIVEN** the car has been below the speed threshold for the configured time
- **WHEN** the rescue triggers
- **THEN** the car is placed at the last checkpoint facing forward
- **AND** a time penalty is added
- **AND** damage is unchanged

#### Scenario: No game over

- **GIVEN** the car is destroyed or repeatedly stuck
- **THEN** no game-over screen is shown
- **AND** the player can still finish the race

### Requirement: The race offers chase and cockpit cameras

The game SHALL offer a chase camera and a driver's-eye cockpit camera during a
race, selectable with a labelled control. Both cameras SHALL roll with the car
through banks and loops so the track stays in frame. The selection SHALL persist
for the session.

#### Scenario: Chase camera through a loop

- **GIVEN** the chase camera is active
- **WHEN** the car traverses a loop
- **THEN** the car stays in frame
- **AND** the horizon rolls with the track

#### Scenario: Cockpit camera

- **GIVEN** the cockpit camera is active
- **WHEN** the car drives and banks
- **THEN** the view is from the driver's position
- **AND** no car geometry blocks the track ahead

#### Scenario: Camera toggle

- **GIVEN** a race is in progress
- **WHEN** the player activates the camera control
- **THEN** the camera switches
- **AND** the choice is kept after pausing and resuming

### Requirement: The best race time persists for the circuit

The best total time SHALL be stored locally per circuit seed. A faster total
SHALL replace it, and the menu and finish screen SHALL show it. A missing or
corrupt value SHALL be treated as absent. Storage failure SHALL NOT prevent play.

#### Scenario: Best time survives a reload

- **GIVEN** the player finishes with a time faster than the stored best
- **WHEN** the page is reloaded
- **THEN** the menu shows the new best time for the same circuit

#### Scenario: Slower race does not replace the best

- **GIVEN** the stored best is 2:10.4
- **WHEN** the player finishes in 2:30.0
- **THEN** the stored best remains 2:10.4

#### Scenario: Corrupt storage is ignored

- **GIVEN** the stored best value is not a time
- **WHEN** the game loads
- **THEN** the best time is shown as absent
- **AND** the game is playable

### Requirement: Every track asset ships as binary glTF

Every track piece SHALL be exported as a binary glTF (`.glb`) file under
`assets/track/`, with the same geometry and embedded materials as its rendered
preview. Export SHALL be reproducible from the catalog definitions with a single
command. Every file SHALL be a valid glTF 2.0 binary and SHALL be committed
alongside its preview.

#### Scenario: Track pieces have models

- **GIVEN** the track catalog
- **THEN** every track piece has a matching `.glb` file under `assets/track/`
- **AND** each file begins with the glTF binary magic

#### Scenario: Export is reproducible

- **GIVEN** the catalog definitions
- **WHEN** `npm run assets:glb` runs
- **THEN** every track piece is regenerated
- **AND** the model geometry and materials match the rendered preview

#### Scenario: Models open without external files

- **GIVEN** an exported track model
- **WHEN** it is opened in a glTF viewer
- **THEN** its textures are embedded in the file
- **AND** no sidecar files are required
