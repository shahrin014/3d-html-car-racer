# Asset catalog

Rendered references for every gameplay asset. Track, city, and cockpit geometry
is still generated procedurally at runtime; the car is the one authored model and
the game loads each car's GLB from `public/models/<id>.glb`.

Regenerate the whole catalog with:

```bash
npm run assets                 # all assets
npm run assets -- mach-hero mach-side cockpit  # only the named ones
```

Rendering is deterministic: `tools/preview/` rebuilds each asset from the same
parametric definitions the game uses, in headless Chromium with three.js.

## Track pieces

| Piece | Image | Geometry | Notes |
| --- | --- | --- | --- |
| Straight | ![straight](track/straight-12.png) | 12 m, flat | Joins both ends at zero slope |
| Bend | ![bend](track/turn-45-r18.png) | 45°, R18 | Bank ~39° at 12 m/s |
| Turn | ![turn](track/turn-90-r14.png) | 90°, R14 | Bank ~45° at 12 m/s |
| Hairpin | ![hairpin](track/turn-180-r10.png) | 180°, R10 | Bank clamped at 45° |
| Loop | ![loop](track/loop-r7.png) | R7 vertical, 360° | Ring lifted 0.8 m on 3.4 m entry and exit ramps; ends 6.8 m apart |
| Loop return | ![loop return](track/loop-return-14.png) | 14 m S-curve | Returns the loop's offset exit to the centreline |
| Spiral ramp · 1 level | ![spiral 1](track/spiral-r12-1.png) | R12, 360°, +5.3 m | One bridge level; the exit sits directly over the entry |
| Spiral ramp · 2 levels | ![spiral 2](track/spiral-r12.png) | R12, 720°, +10.7 m | Two bridge levels; the exit sits directly over the entry |
| Spiral plan | ![spiral plan](track/spiral-r12-plan.png) | R12, 720° | 21 m clear opening inside the rail; a landmark building fits |
| Bridge ramp · up | ![bridge ramp up](track/bridge-ramp-up.png) | 13.3 m, +5.3 m | Eases to flat at both ends |
| Bridge ramp · down | ![bridge ramp down](track/bridge-ramp-down.png) | 13.3 m, −5.3 m | Eases to flat at both ends |
| Bridge deck | ![bridge deck](track/bridge-deck-16.png) | 16 m, flat | Raised crossing deck |
| Hill | ![hill](track/hill-crest-2.5.png) | 16 m, crest 2.5 m | Zero slope at both ends |
| Launch ramp | ![ramp up](track/ramp-up-1.6.png) | 8 m, 1.6 m lip | Ends on an 11° launch; an empty gap follows |
| Landing ramp | ![ramp down](track/ramp-down-1.6.png) | 16 m, 1.6 m lip | Enters on the launch line and flattens to the deck |
| Jump gap | — | No mesh | The intentional deckless space between a launch ramp and its landing |
| Steep ramp | ![steep ramp](track/steep-ramp-80.png) | 80° face, four bridge levels | Short entry ease, boost strip, compact sky jump at the lip |
| Steep descent | ![steep descent](track/steep-ramp-80-down.png) | 80° face, four bridge levels | Matching descent with a short bottom ease |
| Boost straight | ![boost](track/boost-12.png) | 12 m + armed strip | Chevrons face the driving direction |
| Obstacle corridor | ![obstacle corridor](track/obstacle-corridor-24.png) | 24 m, five seeded rows across the deck | Edge, centre, and gate rows that rivals weave around. Shown at runtime scale (7 m deck) |

All pieces are 3.0 m wide in the catalogue (three car widths), 0.12 m thick,
with 0.35 m guide rails, and start and end unbanked so any two pieces join
cleanly. Every solid piece has a PNG and a GLB. The jump gap is intentionally
empty air and has no mesh. The loop return, bridge ramps, and bridge deck are
runtime connectors, included so the inventory matches every `Piece.kind` the
generator can emit. The launch and landing ramps are the exception: they intentionally
share a launch tangent, with the empty gap between them. The deck floats: there
are no support columns under elevated track. The game scales the catalogue by
1.5× and widens the deck to 7 m at runtime, so the track in play is wider than
the catalogue. The spiral ramp follows the same rule: its R12 catalogue ring
becomes an R18 ring that climbs 8 m per turn and leaves a 29 m opening for a
landmark building. One-level spirals serve the elevated polygon routes; the
single-crossing bridge uses two turns, so it rises 16 m before the flat crossing.
Elevated sections are not limited to the single-crossing layout: a seed may keep the route
aloft after the climb and bring it back down on a ramp or spiral in another
section, crossing over lower track. The steep ramp is the dramatic alternative
to a staged four-level climb: at runtime it rises 32 m over an 8.3 m plan
footprint, its face holds 80° between a 3.2 m entry ease and a 2.1 m exit ease,
and its surface is a boost strip so a car that arrives slowly still makes the
climb. Its top carries a compact kicker, a 4 m gap, and an 18 m wide landing
deck at the raised height, so the car launches off the top and lands back on
the four-level deck; the route can return on a steep descent or another
balanced combination of allowed descents.

## Buildings

![city block](buildings/building-block.png)

![city tower](buildings/building-tower.png)

![wide block](buildings/building-wide.png)

Deterministic city scenery placed around every generated circuit: a low block,
a wide block, and a tower, each with a lit-window façade. The game instantiates
these proportions as one instanced mesh, seeded by the circuit, and keeps every
building at least 16 m from the deck. They are presentation only and carry no
colliders.

## Cars

Five selectable cars share one pipeline. All five are 2.45 x 1.26 x 0.60 m with a
0.26 m wheel radius and a visual body that overhangs the 1.0 m physics collider.
Each is a fused, textured mesh; the game keeps its baked livery and mixes the
selected paint into the masked bodywork through a paint mask, so nine paint
colours work on every car without redrawing its livery.

### Mach

![Mach hero](car/mach-hero.png)

![Mach side](car/mach-side.png)

![Mach rear](car/mach-rear.png)

![Mach reference angle](car/mach-ref.png)

Low, wide endurance prototype with floating fender pods, a wide central mouth,
deep side scallops, a teardrop canopy, and an orange rear wing.

### GT

![GT hero](car/gt-hero.png)

![GT side](car/gt-side.png)

![GT rear](car/gt-rear.png)

![GT reference angle](car/gt-ref.png)

Long-nose GT with a low canopy, wide haunches, and a rear wing.

### Twin

![Twin hero](car/twin-hero.png)

![Twin side](car/twin-side.png)

![Twin rear](car/twin-rear.png)

![Twin reference angle](car/twin-ref.png)

Low, wide twin-tail prototype with a light body and blue livery accents.

### Blade

![Blade hero](car/blade-hero.png)

![Blade side](car/blade-side.png)

![Blade rear](car/blade-rear.png)

![Blade reference angle](car/blade-ref.png)

Low, wide open-wheeler with a silver body, red and black camo livery, a
canopy, and exposed red-rimmed wheels.

### Manga

![Manga hero](car/manga-hero.png)

![Manga side](car/manga-side.png)

![Manga rear](car/manga-rear.png)

![Manga reference angle](car/manga-ref.png)

Wide-bodied manga-liveried coupe with a white body, red aero, and comic-panel
decals. The authored mesh was lopsided, so it is built with `symmetrize`: the
car is cut on its centreline and one half mirrored.

### Shared files

| File | Role |
| --- | --- |
| `car/<id>.glb` | Body shell, smoothing, and four wheel pivots |
| `car/<id>-livery.png` | Baked livery texture |
| `car/<id>-paint-mask.png` | White bodywork mask used for repainting |

At runtime the livery texture and the mask are bound to the body material. The
default is the **stock livery**: the car keeps its own colours. Choosing a paint
replaces only the masked bodywork, scaled by the livery's own luminance on a
light car (so creases and shading survive) or applied flat on a dark car (whose
texture carries little shading); the graphics, glazing, and tyres stay as
authored.

The wheels are part of the body surface, so each model ships four empty pivots
named `wheel-rear-left`, `wheel-rear-right`, `wheel-front-left`, and
`wheel-front-right` at the axle centres. The game turns the front pair for
steering and spins all four.

`npm run model:car` validates and publishes every car in `tools/model/cars.json`
to `public/models/<id>.*` (including `<id>-preview.png` for the menu carousel),
where the shell precaches them. The previews above
are rendered from those published files through the game's own runtime module,
so the catalog cannot drift from the cars in the game.

## Adding a car

The build is driven by `tools/model/cars.json`; nothing in it assumes the Mach's axes, rake, or ride height.

1. Put the source mesh and its texture under `assets/car/source/<id>/`
   (OBJ with an MTL, or a GLB).
2. Add an entry to `tools/model/cars.json`:
   ```json
   "my-car": {
     "label": "My Car",
     "source": "assets/car/source/my-car/my-car.obj",
     "target": { "length": 2.45, "width": 1.26, "height": 0.6 },
     "wheelRadius": 0.26,
     "textureSize": 512,
     "nose": "auto",
     "paintBase": [0.7, 0.7, 0.7],
     "paintTolerance": 0.12,
     "symmetrize": false,
     "paintExcludeCabin": false,
     "preview": "assets/car/my-car-hero.png"
   }
   ```
3. Build and publish:
   ```bash
   PYTHONPATH=... blender -b -P tools/model/build-car.py -- my-car
   npm run model:car
   ```

4. Add the car to `CARS` in `src/game/car-spec.mjs` so the menu offers it and
   the game can load it by id.
5. Add catalog entries in `tools/preview/preview.mjs` and
   `tools/render-assets.mjs` (`<id>-hero`, `-side`, `-rear`, `-ref`) and run
   `npm run assets -- <id>-hero <id>-side <id>-rear <id>-ref`.

The builder detects which source axis is up (smallest extent), which is the
nose (the taller end carries the rear wing), levels the car on its four tyre
contacts, and grounds it on the tyres. If a mesh defeats those heuristics,
override `nose` (`"-y"` or `"auto"`) or `upAxis` (`0`, `1`, `2`) for that car
only. Scale, wheel radius, and texture size come from the same entry.

Two optional flags fix authored meshes that are hard to use as-is:

- `symmetrize` cuts the car on its centreline and mirrors one half, which also
  mirrors the livery. Use it when a generated mesh is visibly lopsided.
- `paintExcludeCabin` keeps the windows and roof out of the paint mask when
  their UVs sample the body colour.

`paintBase` is the body colour the paint mask should cover, with
`paintTolerance` as its RGB distance. Dark cars should also set
`paintExcludeWheels: true`, which carves the wheels' and glazing's UV footprints
out of the mask so the paint does not recolour tyres or glass.

At runtime, pass the id: `preloadCarModel(id)`. The catalog renderer takes the
same id in `tools/preview/car-model.mjs`.

## Cockpit

![cockpit](cockpit/cockpit-view.png)

Driver's-eye view. In the game the cockpit is a PNG frame
(`src/game/assets/cockpit-frame.png`) with a transparent windscreen, so the live
track shows through the middle while the dashboard, A-pillars, and roof header
sit on top. A separate transparent steering-wheel PNG
(`src/game/assets/cockpit-wheel.png`) sits in front of the frame and turns with
the player's steering input, up to 70 degrees of lock. The exterior shell is
hidden. Both PNGs are generated art with no downloaded photos.

## Adding a piece

1. Add a path function and an entry in `PIECES` in `tools/preview/preview.mjs`.
2. Add the piece to `PIECES` in `tools/render-assets.mjs`.
3. Run `npm run assets`.
4. Copy the render into this table and update
   `openspec/specs/track-randomization/spec.md` for the new geometry.

## Track models

Each track piece is also exported as a self-contained binary glTF (`.glb`) with
embedded textures:

```bash
npm run assets:glb
```

Pass piece ids to export only those models:

```bash
npm run assets:glb -- spiral-r12
```

The files live next to the previews in `assets/track/` and use the same
parametric definitions, so models and images cannot drift apart. The car is
exported separately as `assets/car/mach.glb`; the cockpit is a camera
rig and has no model.
