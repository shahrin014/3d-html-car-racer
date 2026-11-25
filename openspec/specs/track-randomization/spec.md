# Track Randomization Specification

## Purpose

Defines how Neon Racer turns a seed and a level into a closed, playable circuit:
seeded determinism, the catalog-bounded combination family, elevated sections
that carry the track above itself, overpass clearance, and validation. Race
lifecycle, controls, and track-surface behavior live in
`openspec/specs/game/spec.md`.

## Layout terminology

A **crossing** is a point where the route passes over and under itself. It is
not the vertical loop: the loop is a separate catalog segment, while a crossing
is a property of the plan and height of the whole layout. Layouts are classified
by shape and crossing count:

| Layout | Crossing count | Meaning |
| --- | --- | --- |
| Polygon | 0 | Three to six banked corners joined by legs; no self-crossing. |
| Single-crossing | 1 | The current four-corner bridge layout, with one pass over another. |
| Double-crossing | 2 | A closed 3D route that passes over itself twice. |

The former names "figure-eight" and "bowtie" are not used for any layout. The
two-crossing layout is a closed curve with two over/under passes.

## Default Values

These values are provisional. Tuning them changes this section, not the intent
of the requirements.

| Setting | Default |
| --- | --- |
| Circuit scale | 1.5× the base catalogue |
| Corner counts | 3, 4, 5, or 6 |
| Single-crossing share | about half of seeds |
| Crossovers | Auto, 0, 1, or 2 in the preview |
| Crossing clearance | at least 3.5 m between the upper and lower passes |
| Double-crossing boost strips | 2–3 per layout |
| Double-crossing scale | 12–16 m for the base two-crossing curve |
| Double-crossing segments | 12 sampled pieces for mesh, boost, and progress
| Turn radius | 12–27 m across the level ladder |
| Turn bank | 20–45° |
| Straight lengths | 12–30 m across the level ladder |
| Loop radius | 10.5 m at level 1, shrinking to about 7.1 m |
| Jump total | 44 m (kicker 9 + gap 9 + landing 26) |
| Jump lip | 2.2 m above the launch deck |
| Jump landing width | twice the running track (12 car widths), tapering smoothly back to normal |
| Downhill jump landing ramp | 26 m per bridge level dropped |
| Bridge level | 8 m above the lower deck |
| Bridge ramp | 20 m up and 20 m down, easing to zero slope at both ends |
| Bridge flat | 24 m |
| Elevated clearance | at least 3.5 m between decks at a plan-view crossing |
| Spiral ramp radius | 18 m centreline; 14.5 m clear inner radius |
| Spiral ramp rise | 8 m per turn; 16 m for two levels |
| Spiral ramp levels | up to 2 |
| Steep ramp pitch | 80° held between eased entry and exit |
| Steep ramp rise | 32 m (four bridge levels) |
| Steep ramp plan run | about 8.3 m, including a 3.2 m entry ease and a 2.1 m exit ease |
| Sky jump at the lip | 4 m kicker to a 1 m lip, 4 m gap, 18 m wide landing |
| Steep ramp surface | boost strip along the whole climb |
| Steep descent | same 80° face, 2.1 m entry ease and 3.2 m exit ease |
| Sky-jump leg extension | 24 m added to every leg when a seed selects the steep climb |
| Obstacle segment | 24 m straight with five seeded rows of edge blocks |
| Obstacle block placement | edge (2.5 m), centre, and double-edge rows; every row keeps a car-wide gap |
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

About half of seeds SHALL instead produce a single-crossing layout: four 135°
banked corners and two diagonals that cross once at their midpoints, with the
vertical legs matching and the diagonals long enough to absorb the corner arcs. At the
crossing, one diagonal SHALL rise on a bridge and the other SHALL pass beneath,
and the loop SHALL sit under the bridge so the crossing threads the loop's
opening. The bridge SHALL rise on a spiral ramp, cross flat, and descend on a
matching spiral ramp, at least 3.5 m above the lower deck. Each spiral SHALL
turn one full circle per bridge level and SHALL support climbing or dropping
multiple levels; the single-crossing bridge SHALL use two levels. Its radius
SHALL leave a clear opening wide enough for a landmark building in the middle.

Elevated routes SHALL NOT be limited to the single-crossing family. The seed
SHALL be able to send a polygon circuit up a spiral or ramp, along the circuit
at bridge height, and back down in a different section, as set out below.

When the crossovers control selects 2, the generator SHALL produce a
double-crossing layout: one closed 3D route whose plan passes over itself twice. At every crossing the upper pass SHALL
clear the lower pass by at least the elevated clearance, so no two branches
share a deck. The route SHALL be a single closed path with no forks and no
rescue-forcing breaks. It SHALL carry at least two boost strips, and the car,
rivals, lap checkpoints, rescue, and camera SHALL use the same sampled frames as
every other layout. Crossings SHALL be achieved by vertical separation, not by a
jump, gap, or disconnected bridge: the deck SHALL remain continuous through each
crossing, with the lower branch visible beneath the upper deck. The
generated layout SHALL keep the tightest turn drivable at racing speed. The
layout SHALL be assembled from the same catalog pieces as every other family,
so segment counts apply to it. The layout family SHALL be chosen
deterministically from the seed and the crossovers control and SHALL be
identical in the track preview and the race. The preview SHALL be able to
request polygon, single-crossing, and double-crossing layouts.

#### Scenario: Every race is randomized

- **GIVEN** the player is on the menu
- **WHEN** the player starts a race
- **THEN** a new seed is drawn before the circuit is assembled
- **AND** the same flow after a page refresh also draws a new seed

#### Scenario: Shapes vary across seeds

- **GIVEN** several seeds at one level
- **WHEN** the circuits are generated
- **THEN** more than one layout shape appears, including polygon circuits and
  single-crossing layouts
- **AND** the crossovers control can request a double-crossing layout
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

#### Scenario: Single-crossing bridge

- **GIVEN** a single-crossing circuit
- **WHEN** the bridge is assembled
- **THEN** it rises on a two-level spiral and descends on a matching spiral
- **AND** each spiral leaves an opening wide enough for a landmark building

#### Scenario: Double-crossing layout

- **GIVEN** the crossovers control set to 2
- **WHEN** the circuit is generated
- **THEN** its plan crosses itself twice
- **AND** every crossing has at least the elevated clearance between passes
- **AND** the route is one closed path with at least two boost strips
- **AND** it carries the car through a lap without a rescue

#### Scenario: Elevation counts on a two-crossing layout

- **GIVEN** the crossovers control set to 2 and minimums for spirals, ramps, or
  steep ramps
- **WHEN** the circuit is generated
- **THEN** the bridge approach and exit carry those pieces
- **AND** every climb stays on the crossing chord
- **AND** the descents are chosen from the allowed descent kinds rather than
  mirroring the climbs
- **AND** the layout still has two plan crossings

#### Scenario: Preview and race share the layout

- **GIVEN** a previewed double-crossing seed
- **WHEN** the player starts the race from the preview
- **THEN** the race uses the same double-crossing circuit and crossing count

#### Scenario: Double-crossing is deterministic

- **GIVEN** the crossovers control set to 2
- **WHEN** the circuit is generated twice
- **THEN** every crossing, boost strip, and track frame is identical

#### Scenario: Randomization never invents geometry

- **GIVEN** one level and two different seeds
- **WHEN** both circuits are generated
- **THEN** every loop, hill, obstacle segment, ramp, spiral, and shift keeps
  its authored size
- **AND** every turn keeps the level's authored radius, except the
  two-crossing layout, which may use a tighter radius above the minimum
- **AND** the double-crossing layout is assembled from the same catalog pieces
  as the other families
- **AND** only the layout family, crossing count, combination, corner count,
  straight lengths, obstacle rows, and elevation route differ

### Requirement: The preview can set minimum segment counts

The track preview SHALL list every selectable catalog `Piece` kind in a
scrollable vertical table with a minimum-count control offering **0**, **1**,
**2**, **3**, **4**, and **5** for every non-core catalog kind.
Whole-layout families are selected by the Crossovers control, not by a count.
**0** SHALL mean "0 or more": no minimum, so the seed decides. A positive value
SHALL require at least that many pieces in the generated circuit. Structural
straights, turns, and boost strips remain always present. A minimum for a climb
SHALL NOT require the same number of matching descents; the planner SHALL
balance it with any allowed descent combination. The generator SHALL count
pieces by kind and search deterministic seed offsets and salted attempts until
it finds a playable circuit satisfying every minimum, and the same seed and
count list SHALL always settle on the same circuit. Structural kinds (straight,
turn, and boost) are always present and SHALL NOT be configurable. The loop and
its return SHALL move together, and the jump launch, gap, and landing SHALL move
together. Elevation up and down pieces SHALL be independent: a climb may return
on any allowed combination of descents, such as a steep climb followed by two
2-level spiral descents. The preview SHALL also offer a crossovers control with
**Auto**, **0**, **1**, and **2**: 0 forces a polygon, 1 forces the
single-crossing layout, and 2 forces the double-crossing layout. The
double-crossing layout is generated from the same catalog pieces, so catalog
segment counts apply to it like any other layout. The single-crossing layout
keeps one loop under the bridge and adds extra loop-and-return pairs to its
vertical legs, growing both legs so the bowtie still closes, when the loop
minimum asks for more. The preview SHALL provide a button that randomizes a
compatible mix of counts and regenerates. No count set SHALL be rejected: if the
requested minimums cannot be assembled, the preview SHALL keep the chosen counts
in the table, build the seed's best circuit without them, and leave Start race
enabled. Starting the race from the preview SHALL pass the counts of the circuit
that was actually built to the race, so the race uses the same circuit. The
preview SHALL keep the seed and every non-zero count in the URL as
`?seed=<seed>&counts=<kind>:<value>,...&crossovers=0|1|2` and SHALL provide a control to copy
that link. Loading the link SHALL reproduce the same circuit. Legacy
Legacy `require` links MAY still be accepted.

#### Scenario: Crossover count is forced

- **GIVEN** the preview with crossovers set to 0, 1, or 2
- **WHEN** the track is regenerated
- **THEN** the circuit uses a polygon, single-crossing, or double-crossing layout
  respectively
- **AND** the single-crossing layout keeps the loop under the bridge
- **AND** the double-crossing layout passes over other track exactly twice

#### Scenario: Minimum count appears

- **GIVEN** the preview and a segment with minimum 1
- **WHEN** the track is regenerated
- **THEN** the circuit contains at least one piece of that kind
- **AND** the circuit is closed and playable
- **AND** the preview reports that every rule is met

#### Scenario: Minimum count above one

- **GIVEN** the preview and a segment with minimum 2
- **WHEN** the track is regenerated
- **THEN** the circuit contains at least two pieces of that kind
- **AND** the preview reports the actual count and that the rule is met

#### Scenario: Loop minimum on a single-crossing layout

- **GIVEN** the crossovers control is set to 1 and the loop minimum is 3
- **WHEN** the track is regenerated
- **THEN** the layout stays a single-crossing bridge
- **AND** the circuit contains at least three loops and three loop returns
- **AND** the loop at the crossing still sits under the bridge
- **AND** the preview reports that every rule is met

#### Scenario: A minimum does not force a matching descent

- **GIVEN** the preview with spiral-up minimum 5 and spiral-down minimum 1
- **WHEN** the track is regenerated
- **THEN** the circuit contains at least five spiral climbs and one spiral descent
- **AND** the remaining descents may be ramps, jumps, or other allowed descents

#### Scenario: Repeated flat features

- **GIVEN** the preview with a flat feature minimum of 5
- **WHEN** the track is regenerated
- **THEN** the circuit contains at least five of that feature
- **AND** the feature-slot planner distributes them across the legs

#### Scenario: Zero means no minimum

- **GIVEN** the preview and a segment with minimum 0
- **WHEN** the track is regenerated
- **THEN** the seed is free to include or omit that kind
- **AND** the preview reports that every rule is met

#### Scenario: Independent elevation transitions

- **GIVEN** the preview with a steep climb minimum and the steep descent at 0
- **WHEN** the track is regenerated
- **THEN** the circuit contains at least the steep climb minimum
- **AND** it may return to the lower deck on any allowed descent combination

#### Scenario: Zero leaves the loop to the seed

- **GIVEN** the preview with the loop set to 0
- **WHEN** the track is regenerated
- **THEN** the seed may include or omit the loop
- **AND** the circuit always closes and contains at least two banked turns and two boost strips
- **AND** the car can complete a lap without a rescue

#### Scenario: Randomize segment counts

- **GIVEN** the preview with no rules set
- **WHEN** the player presses Randomize
- **THEN** a random compatible mix of minimum counts is set
- **AND** the track regenerates with every rule met

#### Scenario: Impossible count still builds a track

- **GIVEN** a count the generator cannot assemble, such as more transitions
  than the free legs can hold
- **WHEN** the player regenerates
- **THEN** the preview keeps the chosen counts in the table
- **AND** builds the seed's best circuit without them
- **AND** Start race stays enabled and races that circuit

#### Scenario: Shareable preview URL

- **GIVEN** a preview with a seed and segment counts
- **WHEN** the player copies the link or reloads the page
- **THEN** the URL contains the seed, every non-zero count, and the
  crossovers selection
- **AND** loading the URL produces the same circuit

#### Scenario: Preview and race share segment counts

- **GIVEN** a preview with minimum counts
- **WHEN** the player starts the race
- **THEN** the race circuit meets every minimum
- **AND** it matches the circuit the preview actually built

### Requirement: Every accepted circuit upholds every positive minimum count

Every positive minimum count SHALL be a hard requirement for every layout
family: polygon, single-crossing, and double-crossing. Before accepting a
circuit, the generator SHALL count the assembled pieces by kind and verify that
the count is at least the requested minimum for every kind. It SHALL search its
deterministic seed offsets and salted attempts until it finds a playable circuit
that satisfies the whole set. Repeating a feature SHALL grow the layout where
it needs room — longer polygon legs, longer single-crossing vertical legs and
diagonals, or a larger two-crossing octagon — instead of silently dropping the
piece. A circuit that misses any positive minimum SHALL NOT be accepted. When
the requested set and forced layout cannot be assembled, the preview SHALL use
the impossible-set fallback, keep the counts in the table, and report the unmet
rules rather than claim that every rule is met.

#### Scenario: Every segment kind upholds its minimum

- **GIVEN** any selectable segment kind and a minimum from 1 to 5
- **WHEN** the circuit is generated for any layout family
- **THEN** the accepted circuit contains at least that many pieces of that kind
- **AND** the circuit closes, stays playable, and keeps the elevation clearance

#### Scenario: Repeated features grow the layout

- **GIVEN** the crossovers control forces single-crossing or double-crossing
  and a minimum repeats a flat or elevation feature
- **WHEN** the track is regenerated
- **THEN** the layout grows to fit every requested piece
- **AND** the preview reports that every rule is met

#### Scenario: An unmet minimum is never presented as met

- **GIVEN** a count set that no layout family can fit
- **WHEN** the track is regenerated
- **THEN** no circuit that misses a minimum is reported as meeting it
- **AND** the preview keeps the chosen counts, reports the unmet rules, and
  starts the fallback circuit

### Requirement: Obstacle segments are seeded and leave a gap in every row

Some seeds SHALL include an obstacle segment as an authored straight from the
catalog. The segment SHALL keep its authored 24 m length. The seed SHALL choose
each row's blocks: an edge block, a centre block, or a double-edge gate, and
the same seed SHALL produce the same obstacle layout. Every row SHALL keep at
least one gap at least a car width wide, clear of blocks, and every block SHALL
sit inside the track and above the deck. Rivals SHALL steer a weaving line
through each corridor that clears every block, so neither the player nor a rival
is forced through a block. The obstacle segment SHALL NOT be combined with a
climb/descent on the same leg; a leg MAY place the corridor just before its
boost strip.

#### Scenario: Obstacles are deterministic

- **GIVEN** one seed and level
- **WHEN** the circuit is generated twice
- **THEN** every obstacle block has the same position and orientation
- **AND** the obstacle segment keeps its authored length

#### Scenario: Every row keeps a gap

- **GIVEN** any generated obstacle segment
- **WHEN** each row is measured against the blocks in that row
- **THEN** a gap at least a car width wide stays clear of blocks in every row
- **AND** every block stays inside the rails and above the deck

#### Scenario: Rivals weave clear of the blocks

- **GIVEN** any generated obstacle segment
- **WHEN** the weaving line rivals follow is sampled across the corridor
- **THEN** the line clears every block by a car's width
- **AND** the line returns to the rival's home lane outside the corridor

#### Scenario: Not every seed carries obstacles

- **GIVEN** several seeds at one level
- **WHEN** the circuits are generated
- **THEN** at least one circuit includes an obstacle segment
- **AND** at least one circuit does not
- **AND** every circuit still closes and satisfies the required features

### Requirement: Elevated sections climb in stages and descend elsewhere

Some seeds SHALL produce a circuit whose route leaves the lower deck, holds
bridge height along the circuit, and rejoins the lower deck in a different
section. Bridge height SHALL be one or more bridge levels above the lower deck.
A route MAY climb in one or two stages and descend in one or two stages. Each
stage SHALL be an authored spiral or ramp and SHALL add or remove one or two
bridge levels. A circuit MAY mix one-level and two-level stages, and MAY mix
spiral and ramp stages, so both transition shapes and both spiral heights
appear in the same circuit. A four-level climb MAY instead be an authored steep
sky jump: an 80° ramp whose face holds between a short entry ease and a shorter
exit ease, ending on a compact kicker at the raised deck. The steep ramp SHALL
carry a boost strip along the whole climb, so a car that reaches the foot
slowly is pushed up instead of sliding back. The kicker SHALL launch the car
over a short gap onto a wide landing deck at the same height, so the car flies
off the top rather than staying planted. The route SHALL return to the lower
deck on a later leg by any allowed combination that balances the four-level
climb: a matching steep descent, two 2-level spiral descents, or another
combination of allowed descents. The seed SHALL pre-roll the steep climb
independently of the level's straight lengths. When it selects the steep
climb, the assembly SHALL extend every leg enough for the sky-jump module and
SHALL use the climb, so the segment does not depend on a rare long leg. Other
authored transitions SHALL likewise remain in rotation; a representative
level-1 sample (at least 300 seeds) SHALL contain every piece kind the
generator can emit.
The elevated stretch SHALL continue
through at least one authored straight or banked turn beyond a climb. The
descent stages SHALL sit at a different plan position from the climb stages;
the route SHALL NOT drop back onto the lower deck at the climbing point. The
elevated deck SHALL hold its height, within the authored bank, between stages.
Every stage SHALL meet the deck it joins at zero slope, except the steep
ramp's launch lip, which intentionally ends on its compact jump.
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

#### Scenario: Steep ramp climb and jump

- **GIVEN** a circuit whose four-level climb is a steep sky jump
- **WHEN** the car reaches its foot, even at low speed
- **THEN** the boost strip pushes it up the 80° face
- **AND** it leaves the lip, crosses the gap unsupported, and lands on the
  wide landing deck at the raised height
- **AND** the deck continues at four bridge levels until the allowed descents
  return it to the lower deck elsewhere
- **AND** the ramp and descent meet the lower and upper decks at zero slope

#### Scenario: Every segment stays in the stock rotation

- **GIVEN** a representative sample of 300 level-1 seeds
- **WHEN** the circuits are generated
- **THEN** every authored piece kind appears: straight, turns, loop, loop
  return, spirals, bridge ramps and deck, hill, jump pieces, steep ramp and
  descent, boost, and obstacle corridor
- **AND** the steep climb appears without requiring a rare long leg

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
single-crossing layout; the seed SHALL be able to route any elevated section over
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

#### Scenario: Crossings are not only single-crossing layouts

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
- **AND** it stays centred and tapers along one smooth curve back to the normal
  track width before the next piece begins, with no sharp corner
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
the seam. It SHALL contain at least two banked turns and at least two boost
strips. Unless the generator is asked to exclude the loop, it SHALL also contain
at least one vertical loop. It SHALL NOT self-intersect at one elevation,
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
- **THEN** it contains two banked turns and two boost strips
- **AND** it contains at least one loop unless the generator was asked to exclude it

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
