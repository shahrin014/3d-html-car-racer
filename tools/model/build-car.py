"""Turn an authored car mesh (OBJ or GLB) into the game's car asset.

    PYTHONPATH=... blender -b -P tools/model/build-car.py -- <car-id>

Reads `tools/model/cars.json` for the car's source, target envelope, and
overrides, then, for `<car-id>`:

1. imports the mesh and joins its parts,
2. works out which source axis is up and which is the nose, levels the car on
   its four tyre contacts, and grounds it on the tyres,
3. scales it to the target envelope,
4. places four wheel pivots at the detected axles,
5. writes `<car-id>.glb`, `<car-id>-livery.png`, and
   `<car-id>-paint-mask.png` (still with the baked livery; the runtime mixes
   the selected paint into the white bodywork through the mask).

Nothing is hardcoded to one mesh: axis order, up direction, nose direction,
rake, and ride height all come from the geometry. Per-car overrides exist in
cars.json for meshes that defeat the heuristics (`upAxis`, `nose`, ...).
"""
import json
import math
import os
import sys

import bpy
import numpy as np
from mathutils import Vector

argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
if not argv:
    raise SystemExit("usage: build-car.py -- <car-id>")
car_id = argv[0]

repo_root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
config_path = os.path.join(repo_root, "tools/model/cars.json")
with open(config_path) as handle:
    cars = json.load(handle)
if car_id not in cars:
    raise SystemExit(f"unknown car {car_id!r}; add it to tools/model/cars.json")
config = cars[car_id]

source = os.path.join(repo_root, config["source"])
target = config.get("target", {})
LENGTH = float(target.get("length", 2.45))
WIDTH = float(target.get("width", 1.26))
HEIGHT = float(target.get("height", 0.6))
TEXTURE_SIZE = int(config.get("textureSize", 512))
WHEEL_RADIUS = float(config.get("wheelRadius", 0.26))
NOSE = config.get("nose", "auto")
UP_OVERRIDE = config.get("upAxis", "auto")
out_dir = os.path.join(repo_root, "assets/car")

# --- Import -----------------------------------------------------------------
bpy.ops.wm.read_factory_settings(use_empty=True)
if source.lower().endswith(".obj"):
    bpy.ops.wm.obj_import(filepath=source)
else:
    bpy.ops.import_scene.gltf(filepath=source)

meshes = [o for o in bpy.context.scene.objects if o.type == "MESH"]
bpy.ops.object.select_all(action="DESELECT")
for obj in meshes:
    obj.select_set(True)
bpy.context.view_layer.objects.active = meshes[0]
if len(meshes) > 1:
    bpy.ops.object.join()
car = bpy.context.view_layer.objects.active
mesh = car.data
# Work in the object's own space; exporters handle the rest.
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)

coords = np.array([v.co[:] for v in mesh.vertices], dtype=np.float64)


def bounds(points):
    return points.min(axis=0), points.max(axis=0)


lo, hi = bounds(coords)
extent = hi - lo

# --- Work out the axes ------------------------------------------------------
# A car is longer than it is wide, wider than it is tall. That is enough to
# identify the three axes without assuming the exporter's convention.
order = np.argsort(extent)  # asc: up, width, length
if UP_OVERRIDE in (0, 1, 2):
    up_src = int(UP_OVERRIDE)
    rest = [axis for axis in range(3) if axis != up_src]
    length_src, width_src = (rest[0], rest[1]) if extent[rest[0]] > extent[rest[1]] else (rest[1], rest[0])
else:
    up_src, width_src, length_src = int(order[0]), int(order[1]), int(order[2])


def remap(points, signs, up, length, width):
    return np.stack(
        [
            signs[0] * points[:, width],
            signs[1] * points[:, length],
            signs[2] * points[:, up],
        ],
        axis=1,
    )


# Width sign is arbitrary (a car is symmetric); pick +.
signs = [1, 1, 1]
mapped = remap(coords, signs, up_src, length_src, width_src)
lo, hi = bounds(mapped)
height = hi[2] - lo[2]
# The tyres make the bottom of a car wider than its roof. Flip up if not.
bottom = mapped[mapped[:, 2] < lo[2] + height * 0.12]
top = mapped[mapped[:, 2] > hi[2] - height * 0.12]
if np.mean(np.abs(bottom[:, 0])) < np.mean(np.abs(top[:, 0])):
    signs[2] = -1
    mapped = remap(coords, signs, up_src, length_src, width_src)

lo, hi = bounds(mapped)
# The rear of a race car carries the wing and is the taller end. Flip the nose
# if the tall end is currently at -Y. `nose` in cars.json overrides this.
mid = (lo[1] + hi[1]) / 2
front = mapped[mapped[:, 1] < mid]
rear = mapped[mapped[:, 1] > mid]
front_top = front[:, 2].max() if len(front) else 0
rear_top = rear[:, 2].max() if len(rear) else 0
if NOSE == "-y" or (NOSE == "auto" and front_top > rear_top):
    signs[1] = -1
    mapped = remap(coords, signs, up_src, length_src, width_src)

# --- Level it on its four tyre contacts -------------------------------------
def rotate(points, axis, angle):
    c, s = math.cos(angle), math.sin(angle)
    if axis == 0:
        matrix = np.array([[1, 0, 0], [0, c, -s], [0, s, c]])
    else:
        matrix = np.array([[c, 0, s], [0, 1, 0], [-s, 0, c]])
    return points @ matrix.T


def contacts(points):
    lo, hi = bounds(points)
    h = hi[2] - lo[2]
    rows = []
    for sx in (1, -1):
        for sy in (1, -1):
            sel = points[
                (points[:, 0] * sx > 0.25 * (hi[0] - lo[0]))
                & (points[:, 1] * sy > 0.25 * (hi[1] - lo[1]))
                & (points[:, 2] < lo[2] + h * 0.28)
            ]
            if len(sel) == 0:
                continue
            rows.append((sel[:, 0].mean(), sel[:, 1].mean(), sel[:, 2].min()))
    return rows


for _ in range(4):
    rows = contacts(mapped)
    if len(rows) < 4:
        break
    data = np.array(rows)
    a, b, c = np.linalg.lstsq(
        np.stack([data[:, 0], data[:, 1], np.ones(len(data))], axis=1),
        data[:, 2],
        rcond=None,
    )[0]
    if abs(a) < 1e-5 and abs(b) < 1e-5:
        break
    mapped = rotate(mapped, 0, -math.atan(b))
    mapped = rotate(mapped, 1, math.atan(a))

rows = contacts(mapped)
if rows:
    mapped[:, 2] -= min(row[2] for row in rows)
else:
    mapped[:, 2] -= mapped[:, 2].min()

# --- Scale to the envelope --------------------------------------------------
lo, hi = bounds(mapped)
size = hi - lo
mapped[:, 0] *= WIDTH / size[0]
mapped[:, 1] *= LENGTH / size[1]
mapped[:, 2] *= HEIGHT / size[2]
lo, hi = bounds(mapped)
# Centre on the origin in plan and sit on the road.
mapped[:, 0] -= (lo[0] + hi[0]) / 2
mapped[:, 1] -= (lo[1] + hi[1]) / 2
mapped[:, 2] -= lo[2]

# Bake the remapped, levelled vertices back.
mesh.vertices.foreach_set("co", mapped.astype(np.float32).ravel())
mesh.update()
for polygon in mesh.polygons:
    polygon.use_smooth = True
mesh.use_auto_smooth = True
mesh.auto_smooth_angle = math.radians(40)

# --- Livery and paint mask --------------------------------------------------
image = None
for material in mesh.materials:
    if material and material.use_nodes:
        for node in material.node_tree.nodes:
            if node.type == "TEX_IMAGE" and node.image:
                image = node.image
                break
        if image:
            break
if image is None and bpy.data.images:
    image = bpy.data.images[0]
if image is None:
    raise SystemExit(f"{car_id}: no base-colour texture found")

if max(image.size) > TEXTURE_SIZE:
    image.scale(TEXTURE_SIZE, TEXTURE_SIZE)
    image.pack()

os.makedirs(out_dir, exist_ok=True)
livery_path = os.path.join(out_dir, f"{car_id}-livery.png")
image.filepath_raw = livery_path
image.file_format = "PNG"
image.save()
for material in mesh.materials:
    material.name = "Livery"

png_w, png_h = image.size
pixels = np.array(image.pixels[:], dtype=np.float32).reshape(png_h, png_w, 4)
rgb = pixels[..., :3]
value = rgb.max(axis=2)
chroma = rgb.max(axis=2) - rgb.min(axis=2)
mask = ((value > 0.5) & (chroma < 0.14)).astype(np.float32)

kernel = np.ones(5, dtype=np.float32) / 5
for axis in (0, 1):
    mask = np.apply_along_axis(lambda row: np.convolve(row, kernel, mode="same"), axis, mask)
mask = np.clip(mask * 1.6 - 0.25, 0, 1)

mask_img = bpy.data.images.new("PaintMask", width=png_w, height=png_h, alpha=False)
rgba = np.zeros((png_h, png_w, 4), dtype=np.float32)
rgba[..., 0] = mask
rgba[..., 1] = mask
rgba[..., 2] = mask
rgba[..., 3] = 1.0
mask_img.pixels = rgba.ravel().tolist()
mask_path = os.path.join(out_dir, f"{car_id}-paint-mask.png")
mask_img.filepath_raw = mask_path
mask_img.file_format = "PNG"
mask_img.save()

# --- Wheel pivots -----------------------------------------------------------
# The wheels are part of the body mesh, so the game's wheel nodes are empty
# pivots at the four contact patches. Use the lowest few percent of each
# quadrant: that is the tyre footprint, not the body beside it.
wheel_pivots = {}
for sx in (1, -1):
    for sy in (1, -1):
        quad = mapped[
            (mapped[:, 0] * sx > 0.2 * WIDTH)
            & (mapped[:, 1] * sy > 0.2 * LENGTH)
        ]
        if len(quad) == 0:
            continue
        low = quad[quad[:, 2] <= np.percentile(quad[:, 2], 2)]
        cx = float(low[:, 0].mean())
        cy = float(low[:, 1].mean())
        cz = float(low[:, 2].min())
        side = "left" if cx >= 0 else "right"
        axle = "rear" if cy >= 0 else "front"
        wheel_pivots[f"wheel-{axle}-{side}"] = (
            cx,
            cy,
            cz + WHEEL_RADIUS * (HEIGHT / 0.6),
        )

for name, (x, y, z) in wheel_pivots.items():
    bpy.ops.object.empty_add(type="PLAIN_AXES", location=(x, y, z))
    pivot = bpy.context.view_layer.objects.active
    pivot.name = name
    pivot.parent = car
    pivot.matrix_parent_inverse = car.matrix_world.inverted()

# --- Export -----------------------------------------------------------------
out_glb = os.path.join(out_dir, f"{car_id}.glb")
bpy.ops.object.select_all(action="SELECT")
bpy.ops.export_scene.gltf(
    filepath=out_glb,
    export_format="GLB",
    use_selection=False,
    export_apply=True,
    export_image_format="NONE",
    export_materials="EXPORT",
    export_yup=True,
    export_animations=False,
    export_skins=False,
    export_normals=True,
    export_texcoords=True,
)

mesh.calc_loop_triangles()
lo, hi = bounds(mapped)
print("CAR_BUILD " + json.dumps({
    "id": car_id,
    "size": [round(float(hi[i] - lo[i]), 3) for i in range(3)],
    "lo": [round(float(v), 3) for v in lo],
    "hi": [round(float(v), 3) for v in hi],
    "triangles": len(mesh.loop_triangles),
    "wheels": sorted(wheel_pivots),
    "axes": {"up": up_src, "length": length_src, "width": width_src, "signs": signs},
    "files": [out_glb, livery_path, mask_path],
}))
