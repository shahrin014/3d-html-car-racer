"""
Inspect a built car: stance, wheel pivots, and paint-mask coverage.

    PYTHONPATH=... blender -b -P .opencode/skills/add-car/scripts/inspect-car.py -- <car-id>

Reads assets/car/<car-id>.glb and assets/car/<car-id>-paint-mask.png, both
written by tools/model/build-car.py. Prints the world bounding box, how far each
corner sits above the ground, the four wheel pivots, and what share of the
texture the paint mask covers. Pure bpy plus the standard library, so it runs in
Blender without extra Python packages.
"""

import os
import sys

import bpy  # noqa: E402

argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
if not argv:
    raise SystemExit("usage: inspect-car.py -- <car-id>")
car_id = argv[0]

repo_root = os.path.dirname(os.path.abspath(__file__))
while not os.path.exists(os.path.join(repo_root, "tools/model/cars.json")):
    parent = os.path.dirname(repo_root)
    if parent == repo_root:
        raise SystemExit("run this from inside the Neon Racer repository")
    repo_root = parent
glb = os.path.join(repo_root, "assets/car", f"{car_id}.glb")
mask_path = os.path.join(repo_root, "assets/car", f"{car_id}-paint-mask.png")
for path in (glb, mask_path):
    if not os.path.exists(path):
        raise SystemExit(f"missing {path}; run tools/model/build-car.py -- {car_id}")

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=glb)

cars = [o for o in bpy.context.scene.objects if o.type == "MESH"]
if not cars:
    raise SystemExit(f"{glb} has no mesh")
car = cars[0]
points = [car.matrix_world @ vertex.co for vertex in car.data.vertices]
xs = [p.x for p in points]
ys = [p.y for p in points]
zs = [p.z for p in points]

print("CAR", car_id)
print(
    "SIZE",
    [round(max(v) - min(v), 3) for v in (xs, ys, zs)],
    "LOW",
    round(min(zs), 4),
    "HIGH",
    round(max(zs), 4),
)
print("TRIS", len(car.data.polygons))

# Each quadrant is one corner: the lowest point there is that tyre's contact
# patch. If a corner is above the ground, one tyre carries the car and the
# stance will look raked.
for name, (sx, sy) in {
    "front-left": (1, -1),
    "front-right": (-1, -1),
    "rear-left": (1, 1),
    "rear-right": (-1, 1),
}.items():
    corner = [p.z for p in points if p.x * sx > 0 and p.y * sy > 0]
    if corner:
        print(f"CONTACT {name}", round(min(corner), 4))

pivots = sorted(o.name for o in bpy.context.scene.objects if o.name.startswith("wheel-"))
print("PIVOTS", pivots)
for pivot in pivots:
    obj = bpy.context.scene.objects[pivot]
    print("PIVOT", pivot, [round(v, 3) for v in obj.location])

image = bpy.data.images.load(mask_path)
pixels = image.pixels[:]
red = pixels[0::4]
painted = sum(1 for value in red if value > 0.5)
print("MASK", round(painted / len(red), 3))
