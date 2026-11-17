# Handover — Car model rebuild (die-cast hypercar)

Task-specific handover for the work of making the car in the game match the
reference casting. Project-wide behaviour and decisions live in
`openspec/specs/` and `openspec/project.md`.

| Item | Value |
| --- | --- |
| Worktree | `/root/.local/share/opencode/worktree/62f8c4/car-model-fixes` (detached `HEAD` @ `bb60f7e`) |
| Main checkout | `/mnt/vm-shared-volume/projects/3d-html-car-racer` @ `main` (latest) |
| Remote branch | `origin/feat/orange-loop-game` (last pushed `bb60f7e`) |
| Node | `/tmp/node-v26.13.1-linux-x64/bin` must be on `PATH` (not installed system-wide) |
| Specs | `openspec/specs/` (baseline; no change folder) |

## 1. Goal

Model the car as the reference casting, not a generic wedge:

1. **`docs/reference/` (save/keep these)** — shape and detail target, from
   KOMODOZ's own posting of the Mach Speeder:
   - `mach-speeder-hero.jpg` — main render, the angle used for comparison
   - `mach-speeder-front-3q.jpg`, `mach-speeder-rear-3q.jpg` — wireframes
   - `mach-speeder-sketchfab-thumb.jpg` — Sketchfab embed thumbnail
   - The Hot Wheels card photo from the first message was a chat attachment
     and was never saved to disk; re-supply it if it is wanted on disk.
2. **Candy red paint** from the card photo (not the white/orange of the
   Mach Speeder renders). Paint is `0xa30f1d`, black aero, gold wheel faces.
3. Work in this worktree so the concurrent session on the main checkout is
   not disturbed.

## 2. Where the model lives

| Path | Role |
| --- | --- |
| `src/game/car-model.mjs` | **Single source of geometry.** Plain JS so the preview can import it directly. |
| `src/game/car-model.d.mts` | Types so TypeScript can import the `.mjs` without `allowJs`. |
| `src/game/Car.ts` | Thin game wrapper: `createCar()`, `CAR_DIMENSIONS`, `WHEEL_RADIUS`. |
| `tools/preview/car-model.mjs` | Re-exports the shared model; keeps the preview-only cockpit helpers. |
| `tools/check-car.mjs` | `npm run model:check` — geometry gate (see §4). |
| `tools/export-car-glb.mjs` | `npm run model:car` — GLB export (see §6, not yet run to completion). |
| `assets/car/car-hero.png` | Catalog 3/4 view. |
| `assets/car/car-side.png` | Side elevation; catches rake, ride height, arch clearance. |
| `assets/car/car-ref.png` | **Comparison view**, framed to match `mach-speeder-hero.jpg`. |

### How the body is built

Stations run rear (`z = -1.225`) to nose (`z = +1.225`); front faces **+Z**.
Each station carries `halfWidth, floor, shoulder, fenderX, fender, centre`, and
each section is evaluated by `topAt(x)` / `bottomAt(x)`:

- `topAt` rises from the centreline to a crown at `fenderX`, then falls to the
  shoulder — so the hood can be a valley between two fender pods.
- `bottomAt` is flat at `floor`, steps up over an arch band (fraction of the
  half width: `0.60 → 0.68`), then runs at `arch` out to the side wall.
- `archAt(z)` is a circle concentric with each tyre, `radius + 0.03`. It is
  **never** clamped by the shoulder; `sectionAt` instead lifts `shoulder` to
  `arch + 0.03` and `fender` to `arch + 0.055`. Clamping the arch the other
  way is what drove the body through both wheels earlier.

Splines are non-uniform Catmull-Rom over the real `z` of each knot (stations
are unevenly spaced, so index-based lookup slides every feature along the car).

## 3. Done (all on `origin/feat/orange-loop-game`)

| Commit | What |
| --- | --- |
| `c88ab4a` | Remodel as an enclosed die-cast: full cross-sections, wheel arches, shared by game and preview |
| `53f94c0` | Catalog lighting so candy red keeps its colour (key 1.6 → 0.5, env 0.55 → 0.3) |
| `3c01bee` | Lower into die-cast proportions (roof 0.78 → 0.71, wedge nose, aero follows) |
| `e36d120` | Wide-mouth nose, tapered hood blade, raked side intake |
| `3f26e22` | **Arch fix**: arch line concentric with the tyre and never clamped; bigger wheels |
| `4ee8a0e` | Wing back inside the 2.45 m envelope |
| `a6b8495` | `assets/README.md` + `design.md` describe the model that actually ships |
| `b57b977`, `bb60f7e` | Re-renders, scratch file dropped |

## 4. Verification

```bash
export PATH=/tmp/node-v26.13.1-linux-x64/bin:$PATH
cd <worktree>
npm run model:check     # geometry gate
npx tsc --noEmit        # typecheck
npx vitest run          # 20 tests
npx vite build && node build/check-bundle-size.ts   # 152.74 / 250 kB gzip
```

Last `model:check`: **22 398 triangles · 1.02 × 0.92 × 2.46 m · arch
clearance 30 mm · passed**. It fails on non-finite coordinates, zero-area
faces, inward shell winding (signed volume), envelope overrun, and any body
vertex inside a tyre — that last one is the bug class that bit twice.

## 5. State of this worktree

Committed on top of `bb60f7e` as **`2cf4dde`** ("Reshape the car toward the
Mach Speeder reference"): the geometry pass of §6, `docs/reference/`, the
`car-ref` view, `tools/check-car.mjs`, `tools/export-car-glb.mjs`, and the
`package.json` scripts. This document is the only other local commit.

Still untracked:

```
?? node_modules    SYMLINK to the main checkout — do not commit
```

`node_modules` shows as untracked because `.gitignore` uses `node_modules/`
(trailing slash matches directories only, not symlinks). Stage explicit paths;
never `git add -A` here.

## 6. GLB conversion — requested, not finished

The separate session adding "all models must be GLB" was running its own
`assets-glb` worktree with `tools/export-glb.mjs` and **held port 4312**, which
is why a fixed-port export collided. `tools/export-car-glb.mjs` was written to
avoid that (OS-assigned port) and adds `npm run model:car`, which:

- runs Chromium with the preview import map,
- `GLTFExporter.parseAsync(..., { binary: true })` on `createCar().group`,
- **round-trips the bytes through `GLTFLoader`** and reports envelope,
  triangle count and node names,
- writes `public/models/car.glb`.

It never completed: renders started getting killed with *"Command was killed:
the process daemon stopped"*, including the plain `node tools/render-assets.mjs
car` run (the `car-ref` and `car-side` pieces do finish). Treat that as an
environment/resource issue, not a code issue.

Decisions still open:

- **Runtime loading**: the game calls `createCar()` synchronously. Switching to
  `GLTFLoader` makes startup async and touches `Game.ts`, which the concurrent
  session is editing. Coordinate before wiring it up.
- **Budget**: ~22 k triangles is roughly a 1–1.5 MB GLB, against a PWA that
  currently ships 152 kB gzip of JS and downloads no assets at runtime. The
  service-worker cache config and the deployment spec both need a decision.
- If the other session's generic exporter also emits the car, keep one of the
  two tools, not both.

## 7. Comparison vs `mach-speeder-hero.jpg` — what is still wrong

`assets/car/car-ref.png` is framed to the reference angle. Latest pass already
applied: fender crowns pulled inboard into pods with a deeper hood valley, twin
intake tunnels in the nose face, aero-disc wheels replacing the 10 spokes,
longer fastback canopy, wider and higher wing, deeper side scoop.

Still to fix, in rough priority order:

1. **Nose still reads as a solid wedge.** The reference's face is two large
   *holes* with a central tongue; mine are flat dark boxes. Needs the pods to
   project forward of a recessed centre, or real openings in the shell.
2. **Silhouette is too tall and short at the tail.** The reference's deck runs
   long and low to a cut-off tail; mine drops away within 0.5 m of the rear
   axle. Extend the rear stations and flatten `centre` toward `z = -1.225`.
3. **Front fender/hood contrast is still mild** — reference crown ≈ 0.65 over a
   ≈ 0.35 hood. Check against `model:check`'s arch floor (`arch + 0.055`) before
   raising crowns further.
4. **Side scoop is a decal**, not a recessed opening; consider a dark inset box
   behind the panel so it reads with depth.
5. **Wing endplates and uprights** are plain boxes; the reference's are shaped
   and the wing sits further aft over the tail.
6. Wheels: aero disc added, but the reference's has a black centre and a
   stronger rim lip — verify it reads at game camera distance.

## 8. Environment notes

- Node is only at `/tmp/node-v26.13.1-linux-x64/bin`.
- `node_modules` in this worktree is a **symlink** to the main checkout; remove
  it if the main checkout moves.
- Three worktrees exist: the main checkout plus this one and `fix-cockpit-view`
  (another session). All were at `bb60f7e`; this one is detached, so push with
  `git push origin HEAD:feat/orange-loop-game` after fetching.
- Long-running Chromium commands (`render-assets`, and previously the GLB
  export) are being killed by the harness. Run them in the background, one
  piece at a time (`node tools/render-assets.mjs car-ref`).
- `tools/render-assets.mjs` renders the pieces named on the command line;
  `assets/README.md` lists the documented invocation.
