"""Inspect a GLB car model before it is cleaned up for the game.

    blender -b -P tools/model/inspect-glb.py -- path/to/model.glb

Prints the object tree, materials, triangle budget, world bounding box, and a
per-object report so the cleanup script can be written against real numbers
instead of guesses.
"""
import json
import sys

import bpy
from mathutils import Vector

argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
path = argv[0]

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=path)

objects = []
triangles = 0
bbox_min = Vector((1e9, 1e9, 1e9))
bbox_max = Vector((-1e9, -1e9, -1e9))

for obj in bpy.context.scene.objects:
    entry = {
        "name": obj.name,
        "type": obj.type,
        "parent": obj.parent.name if obj.parent else None,
        "location": [round(v, 4) for v in obj.location],
        "scale": [round(v, 4) for v in obj.scale],
    }
    if obj.type == "MESH":
        mesh = obj.data
        mesh.calc_loop_triangles()
        entry["vertices"] = len(mesh.vertices)
        entry["triangles"] = len(mesh.loop_triangles)
        entry["materials"] = [m.name if m else None for m in mesh.materials]
        entry["has_uv"] = bool(mesh.uv_layers)
        triangles += len(mesh.loop_triangles)
        for corner in obj.bound_box:
            world = obj.matrix_world @ Vector(corner)
            bbox_min = Vector((min(bbox_min[i], world[i]) for i in range(3)))
            bbox_max = Vector((max(bbox_max[i], world[i]) for i in range(3)))
    objects.append(entry)

size = bbox_max - bbox_min
report = {
    "path": path,
    "objects": objects,
    "triangles": triangles,
    "bounds_min": [round(v, 4) for v in bbox_min],
    "bounds_max": [round(v, 4) for v in bbox_max],
    "size": [round(v, 4) for v in size],
    "materials": [m.name for m in bpy.data.materials],
    "images": [i.name for i in bpy.data.images],
}
print("CAR_INSPECT " + json.dumps(report))
