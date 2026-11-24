# Game Specification

## Purpose

Defines the player-facing behavior of Neon Racer: an orange-loop circuit racer
for mobile browsers. A race is three laps against the clock on a seeded,
randomly assembled circuit built from a fixed piece catalog. It covers the race
lifecycle, track surface and features, controls, damage and rescue, cameras,
timing, persistence, landscape presentation, accessibility, installability, and
the runtime budget. Seeded circuit generation, elevation, and validation live in
`openspec/specs/track-randomization/spec.md`.

## Default Values

These values are provisional. Tuning them changes this section, not the intent
of the requirements.

| Setting | Default |
| --- | --- |
| Laps per race | 3 |
| Race states | 5 (menu, countdown, racing, paused, finished) |
| Countdown | 3 s |
| Track width | 7 world units (seven car widths) |
| Guide rail height | 0.9 world units (at least one car height) |
| Design speed | 12 m/s |
| Opponent cruise speed | 24–31.2 m/s |
| Maximum speed (flat) | 72 m/s |
| Player engine force | 80 N, with 0.015432 quadratic drag |
| Descent boost | 50% extra engine force while pointing downhill |
| Limp speed | 24 m/s |
| Fixed simulation step | 1/120 s |
| Maximum substeps per frame | 4 |
| Maximum frame delta | 0.1 s |
| Boost impulse | 7 m/s |
| Boost cooldown | 1.6 s |
| Obstacle segment | 24 m, five seeded rows across the deck |
| Obstacle block | 0.9 m wide, 0.9 m deep, 0.9 m tall |
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

Circuit generation, elevation, and validation rules live in
`openspec/specs/track-randomization/spec.md`.

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
external fonts or audio. The only model asset SHALL be the player car's GLB,
served from the app's own origin and precached with the shell; every other
visual asset SHALL be bundled or generated by the app.

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
with a thumb without overlap. A portrait viewport SHALL show a rotate prompt on
the race screen only and SHALL pause an active race; the menu and track preview
SHALL remain usable in portrait. The pixel ratio SHALL be capped at 2.

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

#### Scenario: Portrait menu and preview

- **GIVEN** the device is in portrait
- **WHEN** the menu or track preview is open
- **THEN** no rotate prompt is shown
- **AND** the page remains usable

#### Scenario: Portrait during a race

- **GIVEN** the device is in portrait
- **WHEN** the race screen is open
- **THEN** a rotate prompt is shown
- **AND** the race is paused and no time is credited

#### Scenario: Outer edge framing

- **GIVEN** the car is at either rail
- **THEN** the whole car remains on screen

### Requirement: Accessibility and reduced motion

The game SHALL respect `prefers-reduced-motion`. Controls SHALL be keyboard
reachable with visible focus and accessible names. Steering SHALL be available
from the keyboard as well as the tilt control. Damage, speed, and time SHALL be
conveyed as text, not colour alone.
The canvas SHALL have an accessible name. Dialogs SHALL focus their primary
action when opened.

#### Scenario: Reduced motion

- **GIVEN** the operating system requests reduced motion
- **WHEN** the player is hit or opens a dialog
- **THEN** camera shake, rattle, and entrance animations are effectively disabled

#### Scenario: Tilt unavailable

- **GIVEN** the device has no orientation sensor or permission was refused
- **WHEN** the player starts a race
- **THEN** the race still starts
- **AND** a connected keyboard steers the car
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

#### Scenario: The car keeps moving after the finish

- **GIVEN** the race has finished and the results screen is shown
- **WHEN** the car is past the finish line
- **THEN** it drives itself along the circuit behind the results
- **AND** rivals keep circulating
- **AND** the recorded time, laps, damage, and best time do not change

#### Scenario: The seam is not an early finish line

- **GIVEN** the car is part way around a lap
- **WHEN** its progress is matched to the sampled frames
- **THEN** only frames around the last known progress are considered
- **AND** the closing frame cannot be counted as crossing the start line early

#### Scenario: Final lap finishes the race

- **GIVEN** the car is on the last lap and has passed the final checkpoint
- **WHEN** it crosses the start line
- **THEN** the race finishes
- **AND** the total time, damage, and placing are shown
- **AND** the placing reads like "2nd of 4" and counts the rivals ahead on
  distance covered since the grid

### Requirement: The track is an orange surface with tall guide rails

The track SHALL be one continuous orange surface seven car widths wide,
with guide rails on both edges at least one car height tall. Seams, rails,
boost strips, and the start/finish gate SHALL be visually distinct.
The deck SHALL float like a plastic track piece, with no support columns beneath
it. The surface SHALL have no gaps, cracks, or steps except the intentional gap
of a jump, and loops SHALL have distinct entrances and exits.

A jump SHALL consist of a kicker that rises to a raised lip and ends on an
upward launch angle, a deckless gap, and a lower landing ramp that enters along
the launch line below the lip and sinks back to the deck. The car SHALL leave
the lip, fly over the empty space, and land on the down-ramp. The kicker and
landing SHALL end at the gap with a clear edge; no deck or rail SHALL cross the
gap. The landing SHALL be twice as wide as the running track where the car
touches down, and SHALL then taper along one smooth centred curve back to the
normal track width, so a fast, off-line landing has room to settle before the
deck narrows and there is no sharp corner on either rail. The landing SHALL
keep its left and right guide rails along its length; only the deckless gap and
the touchdown mouth are left free, so a car coming down from the jump never
crosses a barrier as it enters the landing.

A steep ramp SHALL be an authored four-level climb whose face holds 80° between
a long eased entry and a shorter eased exit. Its surface SHALL be a boost strip
for the whole climb, with the usual chevrons facing the driving direction, so a
car that reaches the foot slowly is pushed up rather than sliding back. The
top SHALL end on a compact kicker, a short deckless gap, and a wide landing
deck at the raised height, so a car at racing speed flies off the top instead
of staying planted. The landing SHALL keep its guide rails and settle the car
on the four-level elevated deck. The route SHALL return to the lower deck on a
later leg using any allowed descent combination that balances the four-level
climb, such as a steep descent or two 2-level spiral descents.

#### Scenario: Track width

- **GIVEN** the built track
- **WHEN** the clear width between rails is measured
- **THEN** it is seven car widths

#### Scenario: Rail height

- **GIVEN** the built track
- **WHEN** the guide rail height is measured
- **THEN** it is at least one car height
- **AND** the car cannot ride over a rail at design speed

#### Scenario: Floating deck

- **GIVEN** any raised or banked track section outside a loop
- **WHEN** the space under the deck is inspected
- **THEN** there are no support columns
- **AND** no dark column face is visible on or beside the road

#### Scenario: Continuous surface

- **GIVEN** the built track
- **WHEN** the surface is inspected
- **THEN** it is one continuous mesh with no gap or step between sections,
  apart from a jump's intentional gap
- **AND** seam lines come from the surface texture, not from separate pieces

#### Scenario: Single-crossing layout

- **GIVEN** a single-crossing circuit
- **WHEN** the two diagonals meet
- **THEN** one branch is on a raised bridge at least 3.5 m above the other
- **AND** the bridge rises and falls on a spiral or ramp long enough to drive at
  speed
- **AND** the crossing satisfies the overpass clearance rules in
  `openspec/specs/track-randomization/spec.md`
- **AND** the loop's ring sits under the bridge at the crossing
- **AND** no deck or rail of the two branches touches

#### Scenario: Multi-crossing layout

- **GIVEN** a multi-crossing circuit
- **WHEN** the route passes over itself
- **THEN** each of its three plan crossings has at least 3.5 m between the upper
  and lower decks
- **AND** the route is one closed continuous deck with no forks, jumps, or gaps
- **AND** at least two boost strips push the car through the layout
- **AND** the car, rivals, camera, and lap checkpoints use the same sampled
  frames as every other layout
- **AND** the car completes a lap without a rescue

#### Scenario: Jump

- **GIVEN** a circuit with a jump, and the car is at racing speed
- **WHEN** it reaches the kicker
- **THEN** it leaves the lip and crosses the gap unsupported
- **AND** it lands on the landing ramp
- **AND** the landing ramp sits lower than the kicker lip
- **AND** the landing ramp is twice as wide as the running track
- **AND** it keeps racing without a rescue

#### Scenario: Downhill jump

- **GIVEN** a jump placed at the end of an elevated stretch
- **WHEN** the car leaves the high-deck kicker
- **THEN** it flies over the gap, which may pass over a lower section of the
  circuit
- **AND** it lands on the wide ramp and rides it down to the lower deck
- **AND** it keeps racing without a rescue

#### Scenario: Steep ramp

- **GIVEN** a circuit with a steep ramp
- **WHEN** the car reaches the foot, even at low speed
- **THEN** the ramp's boost strip pushes it up the 80° face
- **AND** it leaves the top, crosses the gap unsupported, and lands on the
  wide landing deck
- **AND** it keeps racing without a rescue

#### Scenario: Loop entrance and exit

- **GIVEN** a vertical loop
- **WHEN** the loop is inspected
- **THEN** the car climbs a ramp from the entry straight into a raised ring
- **AND** the ring's descending side clears the entry track
- **AND** the car leaves down a ramp 6.8 m ahead of the entrance
- **AND** both ends meet the straight at zero slope

### Requirement: Obstacle segments line the deck with solid hazards

Some circuits SHALL include an obstacle segment: a straight deck lined with
solid hazard blocks. Blocks SHALL appear at the deck edges, in the middle of the
road, and as double-edge gates, so the car has to weave through the corridor
instead of driving straight down the middle. Every row SHALL keep at least one
passable gap at least a car width wide, and a car that drives into a block SHALL
be stopped by it and SHALL take impact damage. Blocks SHALL NOT move, break, or
leave the deck, and SHALL be visually distinct from the surface and the boost
strips. The obstacle segment SHALL keep the track surface continuous beneath
the blocks.

#### Scenario: Every row keeps a gap

- **GIVEN** an obstacle segment
- **WHEN** each row of blocks is measured
- **THEN** every row leaves a lateral corridor at least a car width wide, clear
  of blocks, that a car can drive through without contact

#### Scenario: Hitting a block damages the car

- **GIVEN** a race on a circuit with an obstacle segment
- **WHEN** the car drives into a block at speed
- **THEN** the block stops the car
- **AND** the impact adds damage
- **AND** the block stays fixed to the deck

#### Scenario: Rivals weave around the blocks

- **GIVEN** rivals approaching an obstacle segment
- **WHEN** they drive through the corridor
- **THEN** each rival steers a line that clears every block
- **AND** the rival stays on the deck between the rails

#### Scenario: Obstacles are visible and distinct

- **GIVEN** an obstacle segment
- **WHEN** the track is inspected
- **THEN** every block is drawn above the deck
- **AND** the blocks use a hazard pattern distinct from the surface and boost
  strips

### Requirement: The circuit sits in a city skyline

Each circuit SHALL be surrounded by deterministic scenery: low blocks and taller
towers placed outside the track envelope. The skyline SHALL derive from the
circuit seed, so the same circuit keeps the same skyline and a new circuit brings
a new one. No building SHALL come within 16 m of any track frame in plan view, so
nothing intersects the deck, rails, loop, or jump, and no building SHALL obstruct
the chase camera. Scenery SHALL be presentation only and SHALL NOT affect
physics, collision, timing, or damage.

#### Scenario: Skyline follows the circuit

- **GIVEN** a circuit seed
- **WHEN** the circuit and its skyline are generated twice
- **THEN** every building sits in the same place with the same size
- **AND** a different seed produces a different skyline

#### Scenario: Buildings keep clear of the track

- **GIVEN** any generated skyline
- **WHEN** each building is measured against every track frame in plan view
- **THEN** it is at least 16 m away
- **AND** it rises from the ground rather than from the deck

#### Scenario: Scenery is presentation only

- **GIVEN** a race in progress
- **WHEN** the car drives past the buildings
- **THEN** it never collides with them
- **AND** they add no damage, drag, or lap progress

### Requirement: The car is simulated as a rigid body

The car SHALL be simulated by a rigid-body physics engine with gravity, tyre
contact, friction, motor torque, and collisions. The simulation SHALL run at a
fixed timestep with a bounded substep count, and SHALL NOT let the car pass
through track geometry at maximum speed. The car SHALL be able to leave the
ground, complete a loop in contact with the surface, and collide with rails.

The car SHALL touch the track and rails through one rounded collider on the
chassis, and the wheel meshes SHALL be visual only. Four separately colliding
wheels are four independent point contacts and chatter against the tiled
surface, while a sharp chassis edge catches on the seams between surface
patches; one rounded box slides over them on a broad contact patch. The torque
that rolls and pitches the body onto the surface SHALL be damped, so a contact
bump does not ring the body.

The pose that is drawn SHALL be low-pass filtered, while the physics pose and
all game logic SHALL keep the unfiltered state. The body rests directly on a
faceted deck, so contact bumps it a few millimetres at 8–14 Hz; filtering the
rendered pose only removes that buzz without delaying handling.

The front wheels SHALL steer about the vertical axis outside the rolling spin,
so a steered wheel spins about its own axle instead of precessing.

#### Scenario: Acceleration

- **GIVEN** the car is on the start line at rest
- **WHEN** the race starts
- **THEN** motor torque accelerates it without input
- **AND** speed approaches the maximum speed

#### Scenario: Descent surge

- **GIVEN** the car holds throttle on a downhill section or the loop
- **WHEN** the track falls away beneath it
- **THEN** its engine force rises by half
- **AND** it gains speed faster than on the flat

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

#### Scenario: One chassis collider touches the road

- **GIVEN** the car is racing on the circuit
- **WHEN** its colliders are inspected
- **THEN** the chassis carries a single rounded collider that contacts both the
  deck and the rails
- **AND** the wheels have no colliders
- **AND** body chatter, measured as the RMS of the roll rate above 1.6 Hz over a
  driven lap, stays below 1.2 rad/s

#### Scenario: Steered wheels do not wobble

- **GIVEN** the car is steering while the wheels are rolling
- **WHEN** the front wheels are inspected
- **THEN** each wheel spins about its own steered axle
- **AND** the axle does not precess as the wheel turns

#### Scenario: Rendered pose is filtered

- **GIVEN** the car is racing on the circuit
- **WHEN** its rendered pose is compared with the rigid-body pose
- **THEN** the rendered pose is low-pass filtered with a 0.04 s time constant
- **AND** it snaps to the rigid-body pose on the first frame and after a rescue
  teleport
- **AND** the unfiltered rigid-body pose still drives handling, damage, and lap
  progress

### Requirement: Handling stays predictable at speed

The guide SHALL keep the car pointing where it travels within measurable bounds
over a driven lap: the mean absolute slip angle SHALL stay under 10°, the maximum
under 45°, and frames above 10° of slip SHALL be less than 45% of the lap.
Holding full lock at racing speed SHALL NOT spin the car: after one second the
nose SHALL stay within 45° of the tangent, slip below 25°, and speed above
8 m/s. Positive steering SHALL move the car to the right of the screen and turn
its nose further from the track frame's right vector than neutral
steering does.

#### Scenario: Slip stays bounded over a lap

- **GIVEN** the car is driven around a lap with throttle held
- **WHEN** its slip angle is sampled at the simulation rate
- **THEN** the mean absolute slip stays under 10°
- **AND** the maximum stays under 45°
- **AND** slip above 10° covers less than 45% of the samples

#### Scenario: Full lock does not spin the car

- **GIVEN** the car is at racing speed on the circuit
- **WHEN** the player holds full lock for one second
- **THEN** the nose stays within 45° of the tangent
- **AND** slip stays under 25°
- **AND** speed stays above 8 m/s

### Requirement: The rigid-body engine is the only simulation

The rigid-body engine SHALL be the only vehicle simulation; there SHALL be no
arcade fallback that quietly replaces it. It SHALL load lazily before the first
race, and the countdown SHALL NOT advance until it is ready, so a slow first load
cannot start the race without physics. If the engine cannot load, Start SHALL be
disabled and labelled "Physics unavailable".

#### Scenario: Countdown waits for the engine

- **GIVEN** the player has pressed Start
- **WHEN** the engine is still loading
- **THEN** the countdown is held
- **AND** it starts from its full duration once the engine is ready

#### Scenario: Engine failure is reported

- **GIVEN** the engine cannot load
- **WHEN** the player tries to start
- **THEN** Start is disabled and labelled "Physics unavailable"
- **AND** no alternate handling model is used

### Requirement: The race can include computer opponents

The menu SHALL let the player choose a field of zero to thirty opponents,
defaulting to three, and the choice SHALL persist across reloads. Each opponent
SHALL use a palette paint that differs from the player's paint; opponent paints
SHALL stay distinct until every non-player paint has been used, after which they
cycle. Opponents SHALL be drawn from the catalog car models and mixed across the
field, so a grid is not built entirely from the player's car. Opponents SHALL follow the circuit on a kinematic racing line with their
own lane and pace, slowing on climbs and accelerating on descents, SHALL stay on
the deck through banks and loops, and SHALL be solid: the player's car collides
with them without taking damage. They SHALL NOT change lap counting, timing, or
the three-lap race against the clock.

#### Scenario: Configurable field

- **GIVEN** the menu is shown
- **WHEN** the player raises or lowers the opponent count
- **THEN** the count moves within zero to thirty and is shown as a number
- **AND** the same count is used on the next race
- **AND** the count is restored after a reload

#### Scenario: Distinct rival paints

- **GIVEN** a race with opponents
- **WHEN** the cars are inspected
- **THEN** every opponent has a paint different from the player's
- **AND** opponents take distinct paints until every non-player paint is used
- **AND** a field larger than the palette cycles through those paints in order

#### Scenario: Rivals are solid

- **GIVEN** the player's car drives into an opponent
- **WHEN** contact occurs
- **THEN** the player's car is deflected
- **AND** the impact adds no damage

#### Scenario: Rivals stay on the circuit

- **GIVEN** a race with opponents
- **WHEN** the field drives a lap
- **THEN** every opponent stays on the deck
- **AND** follows the turns, banks, and loop of the circuit

#### Scenario: Rivals respond to the terrain

- **GIVEN** a race with opponents
- **WHEN** a rival climbs a ramp, hill, or loop
- **THEN** its pace falls below its cruise speed
- **AND** its pace rises above cruise speed on the following descent

### Requirement: The player car is a selectable catalog car

The player car SHALL be one of the cars in the catalog - Mach, a low wide
endurance prototype, GT, a long-nose grand tourer, or Twin - each with its own baked
livery and paint mask. The selected model SHALL be loaded from
`models/<id>.glb` together with its baked livery and paint mask, and cloned per
car. The GLB SHALL declare four named wheel pivots at the axles so the front
pair can steer and every wheel can spin. The selected paint SHALL recolour only
the white bodywork through the mask; the blue stripes, orange aero, glazing,
and tyres SHALL stay as authored. The model SHALL sit on the road surface at
the origin, face +Z, and stay inside the physics envelope.

#### Scenario: The carousel offers the catalog cars

- **GIVEN** the menu is shown
- **WHEN** the car carousel is inspected
- **THEN** it shows a live 3D preview of the current car and its name
- **AND** previous and next controls cycle through every catalog car
- **AND** a dot marks the current car
- **AND** Mach, GT, Twin, Blade, and Manga are all offered

#### Scenario: The preview car repaints with the chosen paint

- **GIVEN** the menu is shown with a car in the carousel
- **WHEN** the player activates a paint swatch
- **THEN** the car in the carousel changes colour immediately
- **AND** the same paint is used by the race once the car drives

#### Scenario: Selecting a car applies and persists

- **GIVEN** the menu is shown
- **WHEN** the player selects a car
- **THEN** that car's model replaces the player car, keeping the current paint
- **AND** the same car is used after a reload

#### Scenario: Corrupt car falls back

- **GIVEN** the stored car id is not one of the catalog cars
- **WHEN** the game loads
- **THEN** the first catalog car is used

#### Scenario: Wheels come from the model

- **GIVEN** a car GLB
- **THEN** it contains exactly four nodes named `wheel-rear-left`,
  `wheel-rear-right`, `wheel-front-left`, and `wheel-front-right`
- **AND** each wheel spins about its own +X axis while the front pair steers
  about +Y

#### Scenario: Paint recolours only the bodywork

- **GIVEN** a loaded car and its paint mask
- **WHEN** the player selects a paint
- **THEN** the white bodywork takes that colour, keeping the livery's shading
- **AND** the blue stripes, orange wing/scoop/intakes, glazing, and tyres do
  not change colour

#### Scenario: The car loads before a race

- **GIVEN** a cold load
- **WHEN** the shell boots
- **THEN** the car model is fetched from the app's own origin
- **AND** the start button is enabled only once the model is ready
- **AND** the model is available offline after the first load

### Requirement: The player car's paint is selectable

The menu SHALL offer the stock livery, which is the default and keeps each
car's baked colours, plus nine named car paints, as labelled swatches that can be
activated by touch, mouse, or keyboard. The selection SHALL apply to the car immediately, SHALL
persist across reloads, and SHALL expose its state to assistive technology. An
unknown or corrupt stored paint SHALL fall back to the default.

#### Scenario: The stock livery and nine paints are offered

- **GIVEN** the menu is shown
- **WHEN** the paint picker is inspected
- **THEN** the stock livery and nine paints are shown
- **AND** the nine paints each have a name and a distinct colour
- **AND** exactly one option is marked as the current paint
- **AND** every swatch has an accessible name and a pressed state

#### Scenario: Stock keeps a dark car's own livery

- **GIVEN** a car whose baked body colour is dark
- **WHEN** the paint is the stock livery
- **THEN** the car keeps its own colours
- **AND** choosing a paint recolours its bodywork through the paint mask

#### Scenario: Selection applies and persists

- **GIVEN** the menu is shown
- **WHEN** the player activates a paint
- **THEN** the car is repainted immediately
- **AND** that swatch becomes the current paint
- **AND** the same paint is used after a reload

#### Scenario: Corrupt paint falls back

- **GIVEN** the stored paint id is not one of the ten
- **WHEN** the game loads
- **THEN** the stock livery is used

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

### Requirement: Steering is screen-relative

Every steering input SHALL be screen-relative: a right input SHALL turn the car
toward the right of the screen, and a left input toward the left, whatever the
source. Tilt, the arrow keys, and `A`/`D` SHALL all share one sign convention,
and the front wheels SHALL visibly point into the turn.

The car SHALL be tuned so that steering turns its nose into the corner instead of
sliding it across the track. Holding full lock at racing speed SHALL NOT spin the
car past the tangent by more than 45°, and the throttle SHALL NOT add sideways
velocity of its own.

#### Scenario: Steering direction agrees across inputs

- **GIVEN** a race is in progress on a device with a keyboard
- **WHEN** the player presses the right arrow key or `D`
- **THEN** the car moves toward the right of the screen
- **AND** the left arrow key and `A` move it toward the left
- **AND** tilt agrees with the same directions

#### Scenario: Full lock at speed

- **GIVEN** the car is on a straight at racing speed
- **WHEN** the player holds full steering lock for one second
- **THEN** the car turns and drifts toward that side
- **AND** its nose stays within 45° of the direction of the track
- **AND** it does not spin out or stop

### Requirement: Touch and keyboard controls

A brake control, a drift control, the `←`/`→` and `A`/`D` keys, `Escape`/`P` for
pause, and a camera toggle SHALL be available during a race. Touch steering
SHALL use the device's tilt; there SHALL be no on-screen left/right steering
buttons. Each control SHALL have an accessible name, SHALL meet the minimum
touch target, and SHALL remain reachable in landscape.

#### Scenario: Tilt steering

- **GIVEN** a race is in progress on a touch device
- **WHEN** the player rolls the device to the right
- **THEN** the car steers right

#### Scenario: Keyboard steering

- **GIVEN** a race is in progress on a device with a keyboard
- **WHEN** the player presses the right arrow key
- **THEN** the car steers right

#### Scenario: Brake

- **GIVEN** a race is in progress at speed
- **WHEN** the player holds the brake control
- **THEN** the car decelerates

### Requirement: Space drifts the car

The drift control — the `Space` key or the on-screen Drift button — SHALL swing
the car's nose further into the turn and let the body slide wide with the travel
direction lagging the nose. The normal guide and rescue SHALL remain active, and
a drift SHALL NOT be needed to complete a lap. Releasing the control SHALL
restore normal grip and centre the car again.

#### Scenario: Drifting through a corner

- **GIVEN** the car is on the track at speed
- **WHEN** the player holds drift and steers into a corner
- **THEN** the nose points further off the tangent than normal steering
- **AND** the car travels wider toward the outside of the turn
- **AND** it does not spin out or leave the guide

#### Scenario: Releasing the drift

- **GIVEN** the car is mid-drift
- **WHEN** the player releases the drift control
- **THEN** lateral grip returns and the car settles back onto its line

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

#### Scenario: Failed jump recovery

- **GIVEN** the car leaves a kicker below the speed needed to clear the gap
- **WHEN** it drops below the launch line or the landing deck
- **THEN** the rescue triggers after a short grace, without waiting for the
  generic off-track timer
- **AND** the car is placed on the solid run-up before the kicker
- **AND** a time penalty is added

#### Scenario: No game over

- **GIVEN** the car is destroyed or repeatedly stuck
- **THEN** no game-over screen is shown
- **AND** the player can still finish the race

### Requirement: The race offers chase and cockpit cameras

The game SHALL offer a chase camera and a driver's-eye cockpit camera during a
race, selectable with a labelled control. Both cameras SHALL roll with the car
through banks and loops so the track stays in frame. The selection SHALL persist
for the session.

The chase camera SHALL smooth its orientation in the car's frame and SHALL stay
at least 0.6 m above the deck beneath it. It SHALL NOT be driven by a
world-space lerp toward the car's arc, because that cuts the chord through the
loop and puts the view under the road.

The cockpit camera SHALL replace the exterior shell with a PNG cockpit frame
drawn in camera space. The frame SHALL carry the dashboard, A-pillars, and roof
header, with a transparent windscreen so the live track is visible through the
middle. A separate transparent steering-wheel PNG SHALL sit in front of the
frame. The exterior body SHALL be hidden while the cockpit camera is active.
The steering wheel SHALL turn with the steering input, clockwise for a right
turn, and SHALL be clamped at 70 degrees of lock.

#### Scenario: Chase camera through a loop

- **GIVEN** the chase camera is active
- **WHEN** the car traverses a loop
- **THEN** the car stays in frame
- **AND** the horizon rolls with the track
- **AND** the camera stays above the deck it is over for the whole lap
- **AND** no road geometry passes between the camera and the car

#### Scenario: Cockpit camera

- **GIVEN** the cockpit camera is active
- **WHEN** the car drives and banks
- **THEN** the view is from the driver's position
- **AND** the exterior shell is hidden
- **AND** the track is visible through the transparent windscreen
- **AND** the dashboard and steering wheel stay locked to the view
- **AND** no car geometry blocks the track ahead

#### Scenario: Cockpit steering wheel

- **GIVEN** the cockpit camera is active
- **WHEN** the player steers right
- **THEN** the steering wheel turns clockwise
- **AND** it turns counter-clockwise when the player steers left
- **AND** it never turns past 70 degrees of lock

#### Scenario: Camera toggle

- **GIVEN** a race is in progress
- **WHEN** the player activates the camera control
- **THEN** the camera switches
- **AND** the choice is kept after pausing and resuming

### Requirement: The best race time persists for the level

The best total time SHALL be stored locally per level, so the record survives
the circuit being reseeded on every load. A faster total SHALL replace it, and
the menu and finish screen SHALL show it. A missing or corrupt value SHALL be
treated as absent. Storage failure SHALL NOT prevent play.

#### Scenario: Best time survives a reload

- **GIVEN** the player finishes with a time faster than the stored best at that
  level
- **WHEN** the page is reloaded and a different circuit is drawn
- **THEN** the menu still shows the new best time

#### Scenario: Slower race does not replace the best

- **GIVEN** the stored best is 2:10.4
- **WHEN** the player finishes in 2:30.0
- **THEN** the stored best remains 2:10.4

#### Scenario: Corrupt storage is ignored

- **GIVEN** the stored best value is not a time
- **WHEN** the game loads
- **THEN** the best time is shown as absent
- **AND** the game is playable

### Requirement: Every 3D asset ships as binary glTF

Every solid catalog asset SHALL be exported as a binary glTF (`.glb`) file in
its catalog folder: track pieces under `assets/track/`, buildings under
`assets/buildings/`, and the car under `assets/car/`, with the same geometry
and materials as the rendered preview. The track catalog SHALL list every piece
kind the generator can emit, including runtime connectors, and SHALL mark the
intentional jump gap as having no mesh. The car SHALL also ship its livery and
paint-mask PNGs, and all three SHALL be published to `public/models/`, which is
what the game loads. Export SHALL be reproducible from the catalog definitions with
a single command. Every file SHALL be a valid glTF 2.0 binary and SHALL be
committed alongside its preview.

#### Scenario: Track pieces have models

- **GIVEN** the track catalog
- **THEN** every solid track piece has a matching `.glb` file under
  `assets/track/`
- **AND** the intentional jump gap is listed with no mesh
- **AND** each file begins with the glTF binary magic

#### Scenario: Buildings have models

- **GIVEN** the building catalog
- **THEN** every building has a matching `.glb` file under `assets/buildings/`
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
