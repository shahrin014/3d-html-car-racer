---
name: Add a Car
description: Add, replace, or fix a selectable car in Neon Racer — prepare the source mesh, configure and run the Blender build, tune the paint mask, publish the assets, register the car, and render the catalog. Use when a new car model, texture, paint mask, carousel entry, or cars.json change is requested.
---

# Add a car

Every car in this project is built from a description in `tools/model/cars.json`
by `tools/model/build-car.py`. Nothing is hardcoded per car: axis order, up
direction, nose, rake, ride height, and wheel positions are derived from the
mesh, and the runtime loads the same GLB for the game and the menu carousel.
Do not special-case a car in TypeScript to compensate for a bad build — fix the
config, the source, or the heuristics instead.

Work in a dedicated branch from `origin/main` (see `AGENTS.md`), commit and push
each finished change, then merge to `main` and push. CI runs the E2E suite and
deploy; **do not run E2E locally**. Locally run `npm run check`
(typecheck + unit tests + size budgets).

## 1. Put the source under `assets/car/source/<id>/`

Use a short lowercase id (`blade`, `gt`) because it becomes the asset name:
`public/models/<id>.glb`, `<id>-livery.png`, `<id>-paint-mask.png`.

- **OBJ**: the mesh, an MTL beside it, and the texture PNG. The MTL's
  `map_Kd` must match the texture filename. If the downloaded `.mtl` names a
  generic texture (`texture_20250901.png`), rewrite `map_Kd` to the real file.
- **GLB**: a single file is enough.

Downscale textures to 1024×1024 before committing (catalog enlarges them to
512 for the livery anyway). A 4096² PNG is ~13 MB; one car should not double the
repo. In Blender:

```python
img = bpy.data.images.load('/path/source.png')
img.scale(1024, 1024)
img.filepath_raw = '/repo/assets/car/source/<id>/<id>.png'
img.file_format = 'PNG'
img.save()
```

## 2. Describe the car in `tools/model/cars.json`

Add one entry. Start from a sibling entry, e.g. `twin`:

```json
"<id>": {
  "label": "Blade",
  "source": "assets/car/source/blade/blade.obj",
  "target": { "length": 2.45, "width": 1.26, "height": 0.62 },
  "wheelRadius": 0.26,
  "textureSize": 512,
  "nose": "auto",
  "paintBase": [0.6, 0.6, 0.65],
  "paintTolerance": 0.22,
  "preview": "assets/car/blade-hero.png"
}
```

| Field | Meaning |
| --- | --- |
| `target` | Visual envelope in metres. Keep `length` 2.45 and `width` 1.26 so the car matches the 1.0 m physics collider; `height` is the real roof height (0.6–0.66). |
| `wheelRadius` | Metres; places the four wheel pivots. |
| `textureSize` | Livery resolution written into the GLB (512 is the norm). |
| `nose` | `"auto"`, `"-y"`, or `"+y"`; only override when auto-detection points backwards. |
| `upAxis` | `"auto"` normally; `0`, `1`, or `2` only when auto-detection is wrong. |
| `paintBase` | sRGB colour of the bodywork to mask for repainting, or omit for "light neutral" detection. |
| `paintTolerance` | Distance in sRGB space around `paintBase`; raise until the mask covers the panels, stop before it eats wheels, glass, or graphics. |
| `paintExcludeWheels` | `true` when wheels or glazing share the body colour (dark cars). |
| `preview` | Optional still published as `public/models/<id>-preview.png`. The menu now previews live 3D, so this is only needed for parity/older builds. |

## 3. Build

The build script needs numpy inside Blender. If `import numpy` fails there, point
Blender at a Python directory that has it (`PYTHONPATH=/tmp/opencode/pylibs`) or
install numpy into Blender's Python.

```bash
PYTHONPATH=... blender -b -P tools/model/build-car.py -- <id>
```

It prints one `CAR_BUILD {...}` line. Check that `size` matches the target,
`triangles` is under ~60k, and all four wheel pivots are listed.

## 4. Verify the build before publishing

```bash
PYTHONPATH=... blender -b -P .opencode/skills/add-car/scripts/inspect-car.py -- <id>
```

Pass criteria:

- `LOW 0.0` and `HIGH` ≈ the target height.
- All four `CONTACT` values within 0.01 of each other and near 0. A larger
  spread means the car is raked or one corner floats; do not "fix" it in the
  runtime.
- Four `wheel-*` pivots, roughly symmetric, at `wheelRadius` above the ground.
- `MASK` between about 0.15 and 0.55 of the texture.

Then render the catalog views (step 7) and look at the hero and side renders.
Reject a build that is upside down, nose-backwards, floating, or sunk.

## 5. Tune the paint mask

The mask marks which texels receive the chosen paint. The build compares each
texel to `paintBase` in sRGB space. To choose a base, sample the texture's
dominant colours (Blender's `image.pixels` are 0–1 sRGB here):

```python
import numpy as np
a = np.array(img.pixels[:], dtype=np.float32).reshape(h, w, 4)[..., :3].reshape(-1, 3)
keys, counts = np.unique((a * 10).astype(np.int32), axis=0, return_counts=True)
for i in np.argsort(counts)[-10:][::-1]:
    print([round(float(x) / 10, 2) for x in keys[i]], round(float(counts[i] / len(a)), 3))
```

Rules of thumb:

- Light/silver body: use the body colour (e.g. `[0.6, 0.6, 0.65]`) and a
  tolerance of ~0.2. A huge `MASK` share (>0.7) means the base is catching
  background or the whole sheet — raise the threshold or lower the tolerance.
- Dark body: `paintBase` `[0, 0, 0]` plus `"paintExcludeWheels": true`, because
  wheels, tyres, and glazing are also near-black.
- Bright livery graphics and pinstripes should stay masked *out*, so they survive
  a repaint.
- Always inspect `assets/car/<id>-paint-mask.png`: the white areas must be body
  panels, not wheels or windows.
- Sanity check a real repaint by temporarily passing a colour in
  `tools/preview/car-model.mjs` (`createRuntimeCar(0x39d353, id, 0.7)`), render
  `<id>-hero`, look, then restore the file with `git checkout --`.

## 6. Publish the assets

```bash
npm run model:car
```

Publishes every car in `cars.json` to `public/models/` and enforces size limits
(GLB 4 MB, livery 1 MB, mask 256 KB). A missing `preview` prints a warning and
skips that file; a missing GLB, livery, or mask fails.

## 7. Register the car and add it to the catalog

1. Add it to `CARS` in `src/game/car-spec.mjs`. **Order matters**: the first
   entry is the default car.
   ```js
   { id: 'blade', name: 'Blade', paintBaseLuma: 0.65 },
   ```
   `paintBaseLuma` is the luminance of the livery's body colour: roughly 0.6–0.8
   for a light body (paint is scaled by livery luminance so shading survives),
   `0.0` for a dark body (paint is applied flat).
2. Add four catalog pieces in `tools/preview/preview.mjs`:
   `<id>-hero`, `<id>-side` (`view: 'side'`), `<id>-rear` (`view: 'rear'`), and
   `<id>-ref` (`view: 'ref'`), each with `kind: 'car'` and `carId: '<id>'`.
3. Add the same four to `PIECES` in `tools/render-assets.mjs`:
   ```js
   { id: 'blade-hero', folder: 'car', name: 'blade-hero' },
   { id: 'blade-side', folder: 'car', name: 'blade-side' },
   { id: 'blade-rear', folder: 'car', name: 'blade-rear' },
   { id: 'blade-ref', folder: 'car', name: 'blade-ref' },
   ```
4. Render them. The preview loads the published GLB from `public/models`, so
   publish first or the render times out.
   ```bash
   npm run assets -- <id>-hero <id>-side <id>-rear <id>-ref
   ```
5. Publish again to copy the hero into `public/models/<id>-preview.png`:
   `npm run model:car`.

## 8. Update the docs and braces

- `assets/README.md`: add a `### <Name>` section with the four renders and a
  one-line description; update the car count and the paint sentence if the
  wording says "both"/"three".
- `README.md`: add the car to the list in the intro.
- `openspec/project.md` (Car glossary row) and
  `openspec/specs/game/spec.md` (the carousel scenario's "… are all offered"
  line).
- `e2e/car.spec.ts`: the carousel dot count. Add a load assertion for the new
  car if it is cheap (click its dot, expect its name and its `.glb` request).

## 9. Check, commit, merge

```bash
npm run check        # typecheck, unit tests, size budgets — no E2E
```

Then commit on the branch, push it, and follow `AGENTS.md`: merge into `main`,
push, and confirm CI (`Deploy to GitHub Pages`) succeeds. Do not run the E2E
suite locally.

## Troubleshooting

| Symptom | Cause / fix |
| --- | --- |
| Car upside down or on its side | `upAxis` auto-detect picked the wrong axis; set `"upAxis"` explicitly. |
| Nose and tail swapped (wing at the front) | Set `"nose": "-y"` or `"+y"`. |
| One corner floats, car raked | Geometry has no flat tyre contact; check the render, adjust the source or accept the levelling. Never add a runtime tilt. |
| Paint hides wheels or glass | Add `"paintExcludeWheels": true`, or tighten `paintTolerance`. |
| Paint covers almost the whole car | `paintBase` matches background/noise; sample the texture again and lower the tolerance. |
| Paint looks flat and unshaded on a light car | `paintBaseLuma` is too low in `CARS`; raise it toward 0.7. |
| `preview missing for <id>` warning | Render the catalog hero first, then `npm run model:car` again. |
| Catalog render times out | The GLB was not published; run `npm run model:car` before `npm run assets`. |
| Car looks stale on the live site | Service-worker cache: new deploys hash `dist/` and invalidate the old cache; hard-refresh once. |

## File map

| Path | Role |
| --- | --- |
| `tools/model/cars.json` | Per-car build config; the only place a car is described. |
| `tools/model/build-car.py` | Imports, orients, levels, scales, builds mask + pivots, writes GLB/PNG. |
| `tools/model/publish-car.mjs` | Validates and copies to `public/models/`. |
| `src/game/car-spec.mjs` | `CARS` registry: id, display name, `paintBaseLuma`. |
| `src/game/car-runtime.mjs` | Shared loader and repaint shader for game + menu. |
| `src/menuCarousel.ts` | Live 3D menu preview. |
| `tools/preview/preview.mjs` | Catalog piece definitions (render framing). |
| `tools/render-assets.mjs` | Catalog renderer used by `npm run assets`. |
| `assets/README.md` | Catalog with the rendered cars. |
