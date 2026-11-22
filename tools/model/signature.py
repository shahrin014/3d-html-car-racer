import json, sys

import bpy
from mathutils import Vector

path = sys.argv[sys.argv.index("--") + 1]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=path)

obj = next(o for o in bpy.context.scene.objects if o.type == "MESH")
mesh = obj.data
verts = [obj.matrix_world @ v.co for v in mesh.vertices]
lo = Vector((min(v[i] for v in verts) for i in range(3)))
hi = Vector((max(v[i] for v in verts) for i in range(3)))

# Bin along X (the long axis) and report width (Y) and height (Z) per bin.
bins = 12
report = []
for b in range(bins):
    x0 = lo.x + (hi.x - lo.x) * b / bins
    x1 = lo.x + (hi.x - lo.x) * (b + 1) / bins
    inside = [v for v in verts if x0 <= v.x < x1]
    if not inside:
        continue
    ys = [v.y for v in inside]
    zs = [v.z for v in inside]
    report.append({
        "x": [round(x0, 3), round(x1, 3)],
        "width": round(max(ys) - min(ys), 3),
        "top": round(max(zs), 3),
        "count": len(inside),
    })

# Highest surface: where is it in X?
top_limit = hi.z - (hi.z - lo.z) * 0.08
top = [v for v in verts if v.z >= top_limit]
print("SIGNATURE " + json.dumps({
    "size": [round(hi[i] - lo[i], 3) for i in range(3)],
    "lo": [round(v, 3) for v in lo],
    "hi": [round(v, 3) for v in hi],
    "bins": report,
    "top_x": [round(min(v.x for v in top), 3), round(max(v.x for v in top), 3)],
    "top_width": round(max(v.y for v in top) - min(v.y for v in top), 3),
}))
