# Track Randomization Specification

## Purpose

Defines how Neon Racer turns a seed and a level into a closed, playable circuit:
seeded determinism, the catalog-bounded combination family, elevated sections
that carry the track above itself, overpass clearance, and validation. Race
lifecycle, controls, and track-surface behavior live in
`openspec/specs/game/spec.md`.

## Default Values

These values are provisional. Tuning them changes this section, not the intent
of the requirements.

| Setting | Default |
| --- | --- |
| Circuit scale | 1.5× the base catalogue |
| Corner counts | 3, 4, 5, or 6 |
| Figure-eight share | about half of seeds |
| Turn radius | 12–27 m across the level ladder |
| Turn bank | 20–45° |
| Straight lengths | 12–30 m across the level ladder |
| Loop radius | 10.5 m at level 1, shrinking to about 7.1 m |
| Jump total | 44 m (kicker 9 + gap 9 + landing 26) |
| Jump lip | 2.2 m above the launch deck |
| Jump landing width | twice the running track (12 car widths), held then tapered back to normal |
| Downhill jump landing ramp | 26 m per bridge level dropped |
| Bridge level | 8 m above the lower deck |
| Bridge ramp | 20 m up and 20 m down, easing to zero slope at both ends |
| Bridge flat | 24 m |
| Elevated clearance | at least 3.5 m between decks at a plan-view crossing |
| Spiral ramp radius | 18 m centreline; 14.5 m clear inner radius |
| Spiral ramp rise | 8 m per turn; 16 m for two levels |
| Spiral ramp levels | up to 2 |
| Assembly attempts | 32 deterministic offsets |

## Requirements

### Requirement: Circuits are generated deterministically from a seed

Each circuit SHALL be generated from a seed. The same seed SHALL produce the
same circuit on every device and in every session. The game SHALL draw a fresh
seed on every page load and again for every race started from the menu, so
refreshing or racing again does not deliberately replay the previous circuit.
The seed SHALL be drawn from at least 64 bits of randomness, not from the
calendar date.

#### Scenario: Same seed, same circuit

- **GIVEN** a seed
- **WHEN** the circuit is generated twice, in separate sessions
- **THEN** the track geometry, feature placement, elevation changes, and start
  line are identical

#### Scenario: Fresh circuit on every load and race

- **GIVEN** the app has just loaded, or a race has finished
- **WHEN** the player starts a race
- **THEN** a random seed drawn on this page load or since the last start is used
- **AND** the next start draws another seed
- **AND** the circuit is not tied to the calendar date

### Requirement: Track randomization is seeded and bounded

Randomization SHALL choose among the authored pieces in the catalog and SHALL
NOT invent new geometry. The seed SHALL decide the combination and the shape,
including where the route climbs, which deck pieces it follows while elevated,
and where it descends; the level SHALL decide the available piece sizes. A
different seed or level SHALL be able to produce a different combination, and
every randomized circuit SHALL still satisfy the closure and required-feature
rules. The game SHALL randomize the track every time: a new seed is drawn on
each page load and on each race started from the menu, so the player does not
see the same circuit repeatedly.

The seed SHALL also choose the circuit's shape from a closed-polygon family:
three, four, five, or six banked corners of 360°/n each, joined by legs that all
carry the same forward length or, for an even corner count, two alternating
lengths. Rotational symmetry SHALL close the loop for any radius and leg length,
so the player sees triangles, rectangles, pentagons, and hexagons rather than
one oval.

About half of seeds SHALL instead produce a figure-eight bowtie: four 135°
banked corners and two diagonals that cross once at their midpoints, with the
vertical legs matching and the diagonals long enough to absorb the corner arcs. At the
crossing, one diagonal SHALL rise on a bridge and the other SHALL pass beneath,
and the loop SHALL sit under the bridge so the crossing threads the loop's
opening. The bridge SHALL rise on a spiral ramp, cross flat, and descend on a
matching spiral ramp, at least 3.5 m above the lower deck. Each spiral SHALL
turn one full circle per bridge level and SHALL support climbing or dropping
multiple levels; the figure-eight bridge SHALL use two levels. Its radius SHALL
leave a clear opening wide enough for a landmark building in the middle.

Elevated routes SHALL NOT be limited to the figure-eight family. The seed SHALL
be able to send a polygon circuit up a spiral or ramp, along the circuit at
bridge height, and back down in a different section, as set out below.

#### Scenario: Every race is randomized

- **GIVEN** the player is on the menu
- **WHEN** the player starts a race
- **THEN** a new seed is drawn before the circuit is assembled
- **AND** the same flow after a page refresh also draws a new seed

#### Scenario: Shapes vary across seeds

- **GIVEN** several seeds at one level
- **WHEN** the circuits are generated
- **THEN** more than one layout shape appears, including polygon circuits and
  figure-eight bowties
- **AND** some circuits carry a crest where others carry a jump
- **AND** every circuit is closed
- **AND** polygon layouts turn the same way at every corner, so they stay convex

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

#### Scenario: Spiral bridge

- **GIVEN** a figure-eight circuit
- **WHEN** the bridge is assembled
- **THEN** it rises on a two-level spiral and descends on a matching spiral
- **AND** each spiral leaves an opening wide enough for a landmark building

#### Scenario: Randomization never invents geometry

- **GIVEN** one level and two different seeds
- **WHEN** both circuits are generated
- **THEN** every loop, hill, ramp, spiral, and shift keeps its authored size
- **AND** every turn keeps the level's authored radius
- **AND** only the combination, corner count, straight lengths, and elevation
  route differ

### Requirement: Elevated sections climb in stages and descend elsewhere

Some seeds SHALL produce a circuit whose route leaves the lower deck, holds
bridge height along the circuit, and rejoins the lower deck in a different
section. Bridge height SHALL be one or more bridge levels above the lower deck.
A route MAY climb in one or two stages and descend in one or two stages. Each
stage SHALL be an authored spiral or ramp and SHALL add or remove one or two
bridge levels. A circuit MAY mix one-level and two-level stages, and MAY mix
spiral and ramp stages, so both transition shapes and both spiral heights
appear in the same circuit. The elevated stretch SHALL continue through at
least one authored straight or banked turn beyond a climb. The descent stages
SHALL sit at a different plan position from the climb stages; the route SHALL
NOT drop back onto the lower deck at the climbing point. The elevated deck SHALL
hold its height, within the authored bank, between stages. Every stage SHALL
meet the deck it joins at zero slope, so a car at racing speed is not launched.
The elevated section SHALL remain part of the closed circuit and SHALL satisfy
the overpass rules for every lower section it passes over.

#### Scenario: Mixed one-level and two-level stages

- **GIVEN** several seeds at one level
- **WHEN** the circuits are generated
- **THEN** some circuits combine one-level and two-level transitions
- **AND** every transition returns the deck to a valid height
- **AND** each circuit returns to the lower deck after its last descent

#### Scenario: Mixed spiral and ramp stages

- **GIVEN** several seeds at one level
- **WHEN** the circuits are generated
- **THEN** some circuits use both a spiral stage and a ramp stage
- **AND** a ramp stage uses an authored ramp length for its height
- **AND** a two-level stage uses a ramp only when the leg has room

#### Scenario: Some seeds keep the route elevated

- **GIVEN** several seeds at one level
- **WHEN** the circuits are generated
- **THEN** at least one circuit climbs to bridge height and continues elevated
- **AND** it descends in a different section on a ramp or spiral
- **AND** every other circuit still closes

#### Scenario: Spiral up continues on an elevated deck

- **GIVEN** a circuit whose elevated section begins with a spiral
- **WHEN** the route after the spiral is inspected
- **THEN** the deck continues at bridge height through the following pieces
- **AND** the route does not return to the lower deck before the descent
- **AND** the descent sits at a different plan position from the spiral

#### Scenario: Descent is a ramp or a spiral in another section

- **GIVEN** several seeds that produce elevated sections
- **WHEN** each descent is inspected
- **THEN** every descent is an authored ramp or spiral
- **AND** both a ramp descent and a spiral descent appear across the seeds
- **AND** no descent returns onto the climb's plan position

#### Scenario: Elevation is held between transitions

- **GIVEN** an elevated section between its climb and its descent
- **WHEN** the sampled frames are inspected
- **THEN** every frame stays at bridge height within a small tolerance
- **AND** the deck stays clear of the lower deck wherever the two overlap in
  plan view

#### Scenario: Transitions do not launch the car

- **GIVEN** the car is at racing speed
- **WHEN** it enters the climb or the descent
- **THEN** each join meets at zero slope
- **AND** the car keeps contact with the deck
- **AND** it is not rescued

#### Scenario: Elevated layouts still close

- **GIVEN** any circuit with an elevated section
- **WHEN** the seam is inspected
- **THEN** the seam position and heading match
- **AND** validation accepts the circuit

### Requirement: Elevated decks pass over lower track without touching

An elevated section SHALL be allowed to cross over a lower section of the same
circuit in plan view. At every such crossing, the upper deck SHALL clear the
lower deck by at least 3.5 m measured between deck surfaces, so the car, its
deck, and the guide rails on the lower route pass beneath without contact. The
crossing SHALL NOT add support columns, braces, or any geometry that touches the
lower deck or rails. Both branches SHALL remain fully drivable: a car on the
lower branch SHALL pass under the upper deck, and a car on the upper branch
SHALL pass over the lower route. Crossings SHALL NOT be limited to the
figure-eight layout; the seed SHALL be able to route any elevated section over
a lower section.

#### Scenario: Elevated route crosses a lower route

- **GIVEN** a seed whose elevated section crosses a lower section in plan view
- **WHEN** the crossing is inspected
- **THEN** the upper deck sits at least 3.5 m above the lower deck
- **AND** the two decks and their rails do not touch
- **AND** the lower deck runs continuously beneath the upper deck

#### Scenario: Car passes under an overpass

- **GIVEN** the car is on the lower branch at racing speed
- **WHEN** it passes beneath the elevated deck
- **THEN** it keeps contact with the lower deck
- **AND** it is neither rescued nor deflected

#### Scenario: Car passes over a lower route

- **GIVEN** the car is on the elevated branch
- **WHEN** it crosses above the lower route
- **THEN** it keeps contact with the elevated deck
- **AND** it is neither rescued nor deflected

#### Scenario: An overpass has no supports

- **GIVEN** any elevated crossing
- **WHEN** the space between the decks is inspected
- **THEN** no column, brace, or support touches either deck

#### Scenario: Crossings are not only figure-eights

- **GIVEN** several seeds at one level
- **WHEN** the circuits are generated
- **THEN** at least one polygon circuit carries an elevated section that crosses
  a lower section
- **AND** that crossing satisfies the clearance rule

#### Scenario: A low crossing is rejected

- **GIVEN** a candidate whose non-adjacent sections overlap in plan with less
  than 3.5 m of vertical separation
- **WHEN** generation validates it
- **THEN** it is rejected
- **AND** generation continues with a different deterministic offset

### Requirement: Jumps launch long, land wide, and can vault down a level

A jump SHALL be a pronounced obstacle: a kicker that rises to a raised lip and
ends on an upward launch angle, a deckless gap, and a lower landing ramp that
enters along the launch line below the lip and sinks back to flat deck. The
whole module SHALL be longer than a flat hill slot (44 m total), so a leg
reserves more deck for a jump than for a crest. The landing SHALL be twice as
wide as the running track, so the deck, guide rails, physics colliders, and the
jump-failure bound all widen there and a fast, off-line landing has room to
settle.

A jump MAY instead be a downhill jump placed at the end of an elevated stretch:
the kicker stays on the high deck, the gap vaults over whatever route lies
beneath, and a longer landing sinks one or two bridge levels to a lower deck.
The landing still meets the lower deck at zero slope. Because the gap is
elevated, it MAY cross over a lower section of the same circuit as an overpass,
and the crossing must satisfy the overpass clearance rule. When the seed offers
a downhill descent it picks between a ramp, a spiral, and a jump.

#### Scenario: Long jump module

- **GIVEN** a circuit carrying a jump
- **WHEN** the jump module is measured
- **THEN** its total is longer than the hill slot a crest would fill
- **AND** a faster, higher lip launches across a longer deckless gap

#### Scenario: Wide landing

- **GIVEN** the landing of a jump
- **WHEN** its width is measured
- **THEN** it is twice as wide as the running track where the car touches down
- **AND** it stays centred and tapers symmetrically back to the normal track
  width before the next piece begins
- **AND** the rails and physics deck follow the same symmetric taper
- **AND** the failure bound does not count a car parked on the doubled deck as
  having left the track

#### Scenario: Downhill jump over a lower route

- **GIVEN** a jump placed at the end of an elevated stretch
- **WHEN** the module is inspected
- **THEN** the kicker base sits on the high deck
- **AND** the landing ends at least one bridge level below the kicker base
- **AND** the circuit still closes and validation accepts it
- **AND** where the gap crosses a lower section, the vertical separation obeys
  the overpass clearance rule

### Requirement: Every generated circuit is closed and playable

A generated circuit SHALL be a closed loop: position and heading SHALL match at
the seam. It SHALL contain at least one vertical loop, at least two banked turns,
and at least two boost strips. It SHALL NOT self-intersect at one elevation,
SHALL keep at least one car width of clear air between the edges of non-adjacent
sections that share a height, and SHALL keep every turn radius above the
configured minimum. A plan-view crossing SHALL be accepted only when the two branches are
at least 3.5 m apart vertically, as an overpass. A circuit that violates a rule
SHALL be rejected and regenerated from the next deterministic seed offset.

#### Scenario: Closure

- **GIVEN** any accepted circuit
- **WHEN** the seam is inspected
- **THEN** the position and tangent match within tolerance

#### Scenario: Required features

- **GIVEN** any accepted circuit
- **THEN** it contains at least one loop, two banked turns, and two boost strips

#### Scenario: Unplayable layout is rejected

- **GIVEN** a candidate layout whose turn radius is below the minimum or whose
  sections overlap at the same elevation
- **WHEN** generation validates it
- **THEN** it is rejected
- **AND** generation continues with a different deterministic offset

#### Scenario: Same-level overlap is rejected

- **GIVEN** a candidate whose non-adjacent sections overlap in plan view without
  enough vertical separation to form an overpass
- **WHEN** generation validates it
- **THEN** it is rejected
- **AND** the reason names the plan-view overlap
