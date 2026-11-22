"""Render a GLB car from four angles for visual review.

    PYTHONPATH=/tmp/opencode/pylibs blender -b -P tools/model/render-glb.py -- \
        model.glb /tmp/opencode/car-renders

Uses Cycles on the CPU so it works on a headless box. The car is centred on
the origin and the camera orbits it; output is one PNG per view.
"""
import math
import os
import sys

import bpy
from mathutils import Vector

argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
path = argv[0]
out_dir = argv[1] if len(argv) > 1 else "/tmp/opencode/car-renders"
os.makedirs(out_dir, exist_ok=True)

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=path)

scene = bpy.context.scene
scene.render.engine = "CYCLES"
scene.cycles.device = "CPU"
scene.cycles.samples = 24
scene.cycles.use_denoising = False
scene.render.resolution_x = 640
scene.render.resolution_y = 480
scene.render.film_transparent = False

# Single object bounds.
points = []
for obj in scene.objects:
    if obj.type == "MESH":
        for corner in obj.bound_box:
            points.append(obj.matrix_world @ Vector(corner))
lo = Vector((min(p[i] for p in points) for i in range(3)))
hi = Vector((max(p[i] for p in points) for i in range(3)))
center = (lo + hi) / 2
size = hi - lo
radius = max(size) * 2.0

world = bpy.data.worlds.new("World")
scene.world = world
world.use_nodes = True
world.node_tree.nodes["Background"].inputs[0].default_value = (0.05, 0.06, 0.08, 1)
world.node_tree.nodes["Background"].inputs[1].default_value = 0.6

# Key light, follow camera side.
key = bpy.data.objects.new("Key", bpy.data.lights.new("Key", type="AREA"))
key.data.energy = 900
key.data.size = 6
scene.collection.objects.link(key)

fill = bpy.data.objects.new("Fill", bpy.data.lights.new("Fill", type="AREA"))
fill.data.energy = 320
fill.data.size = 8
scene.collection.objects.link(fill)

camera = bpy.data.objects.new("Camera", bpy.data.cameras.new("Camera"))
camera.data.lens = 60
scene.collection.objects.link(camera)
scene.camera = camera

# Views: front 3/4 (+X nose assumed), rear 3/4, side, top.
# The game model faces +Z in glTF, which the importer turns into -Y in Blender.
views = {
    "front-3q": Vector((1.0, -1.0, 0.5)),
    "rear-3q": Vector((-1.0, 1.0, 0.5)),
    "side": Vector((1.0, 0.02, 0.22)),
    "top": Vector((0.02, 0.02, 1.0)),
}

for name, direction in views.items():
    unit = direction.normalized()
    camera.location = center + unit * radius
    # Look at the centre.
    look = center - camera.location
    camera.rotation_euler = look.to_track_quat("-Z", "Y").to_euler()
    key.location = center + Vector((unit.x, unit.y, 1.4)).normalized() * radius * 1.2
    key.rotation_euler = (center - key.location).to_track_quat("-Z", "Y").to_euler()
    fill.location = center + Vector((-unit.x, unit.y, 0.7)).normalized() * radius * 1.4
    fill.rotation_euler = (center - fill.location).to_track_quat("-Z", "Y").to_euler()
    scene.render.filepath = os.path.join(out_dir, f"{name}.png")
    bpy.ops.render.render(write_still=True)
    print("RENDERED", scene.render.filepath)
