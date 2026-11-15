# Asset catalog

Rendered references for every gameplay asset. These images are documentation and
design review material, not files loaded at runtime: the game builds all geometry
and textures procedurally, and still downloads no models, textures, or fonts.

Regenerate the whole catalog with:

```bash
npm run assets                 # all assets
npm run assets -- car cockpit  # only the named ones
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
| Hill | ![hill](track/hill-crest-2.5.png) | 16 m, crest 2.5 m | Zero slope at both ends |
| Boost straight | ![boost](track/boost-12.png) | 12 m + armed strip | Chevrons face the driving direction |

All pieces are 3.0 m wide (three car widths), 0.12 m thick, with 0.35 m guide
rails, and start and end unbanked so any two pieces join cleanly.

## Car

![car](car/car-hero.png)

Die-cast hypercar, 2.45 × 1.0 × 0.72 m, 1.4 m wheelbase. The shell is lofted from
longitudinal cross-sections (not stacked boxes), with a lofted canopy, curved
intake and stripe patches sampled from the same surface, an airfoil rear wing on
tube struts, and lathed wheels with gold multi-spoke faces. Candy red paint,
black aero, and gold rims are shared with the game.

## Cockpit

![cockpit](cockpit/cockpit-view.png)

Driver's-eye view: a generated dashboard texture (speed, damage, lap, timer) on a
single plane, a simple steering wheel, and the hood. No modelled interior, no
downloaded art. In the game the rig is attached to the cockpit camera, and the
exterior shell is hidden to keep the view clear.

## Adding a piece

1. Add a path function and an entry in `PIECES` in `tools/preview/preview.mjs`.
2. Add the piece to `PIECES` in `tools/render-assets.mjs`.
3. Run `npm run assets`.
4. Copy the render into this table and update `openspec/changes/` for the new
   geometry.
