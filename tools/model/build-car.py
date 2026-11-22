"""Turn the authored Mach Speeder OBJ into the game car.

    PYTHONPATH=... blender -b -P tools/model/build-car.py -- in.obj out.glb

The source is a single fused, textured mesh generated from the reference
photos, and its baked livery is what makes it look right. This script keeps
that texture, fits the model to the game envelope, adds four wheel pivots, and
writes a body-paint mask alongside the GLB. The runtime multiplies the mask
into the texture so the selected paint recolours the white body while the blue
stripes, orange aero, and glazing stay exactly as authored.

Wheel pivots are empty nodes: the casting's wheels are part of the body
surface, and cutting them out left holes in the arches.
"""
import json
import math
import sys

import bpy
import numpy as np
from mathutils import Vector

argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
src, dst = argv[0], argv[1]

LENGTH = 2.45
WIDTH = 1.26
HEIGHT = 0.6
WHEEL_RADIUS = 0.26
FRONT_AXLE = -0.81
REAR_AXLE = 0.79
TEXTURE_SIZE = 512
MASK_SIZE = 512

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.wm.obj_import(filepath=src)
car = [o for o in bpy.context.scene.objects if o.type == "MESH"][0]

# --- Fit to the envelope ----------------------------------------------------
car.rotation_mode = "XYZ"
car.rotation_euler = (0, 0, math.radians(-90))
bpy.ops.object.transform_apply(location=False, rotation=True, scale=False)
bpy.context.view_layer.update()
corners = [car.matrix_world @ Vector(c) for c in car.bound_box]
lo = Vector((min(c[i] for c in corners) for i in range(3)))
hi = Vector((max(c[i] for c in corners) for i in range(3)))
size = hi - lo
car.scale = (WIDTH / size.x, LENGTH / size.y, HEIGHT / size.z)
bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
bpy.context.view_layer.update()
corners = [car.matrix_world @ Vector(c) for c in car.bound_box]
lo = Vector((min(c[i] for c in corners) for i in range(3)))
hi = Vector((max(c[i] for c in corners) for i in range(3)))
car.location = (-(lo.x + hi.x) / 2, -(lo.y + hi.y) / 2, -lo.z)
bpy.ops.object.transform_apply(location=True, rotation=False, scale=False)

mesh = car.data
for polygon in mesh.polygons:
    polygon.use_smooth = True
mesh.use_auto_smooth = True
mesh.auto_smooth_angle = math.radians(40)

# --- Texture: downscale and build the paint mask ---------------------------
image = None
for material in mesh.materials:
    if material and material.use_nodes:
        for node in material.node_tree.nodes:
            if node.type == "TEX_IMAGE" and node.image:
                image = node.image
                break
if image is None:
    raise SystemExit("no base-colour texture found")

if max(image.size) > TEXTURE_SIZE:
    image.scale(TEXTURE_SIZE, TEXTURE_SIZE)
    image.pack()

# The livery ships as its own PNG next to the model: the GLB stays small and
# the runtime can bind the map and the paint mask together.
livery_path = dst.rsplit("/", 1)[0] + "/mach-speeder-livery.png"
image.filepath_raw = livery_path
image.file_format = "PNG"
image.save()
for material in mesh.materials:
    material.name = "Livery"

width, height = image.size
pixels = np.array(image.pixels[:], dtype=np.float32).reshape(height, width, 4)

# White bodywork is the only repaintable region: high value, low saturation.
rgb = pixels[..., :3]
value = rgb.max(axis=2)
chroma = rgb.max(axis=2) - rgb.min(axis=2)
mask = ((value > 0.5) & (chroma < 0.14)).astype(np.float32)

# Blur the mask so livery edges do not tear when the paint changes.
size_k = 5
kernel = np.ones(size_k, dtype=np.float32) / size_k
for axis in (0, 1):
    mask = np.apply_along_axis(
        lambda row: np.convolve(row, kernel, mode="same"), axis, mask
    )
mask = np.clip(mask * 1.6 - 0.25, 0, 1)

mask_img = bpy.data.images.new("PaintMask", width=width, height=height, alpha=False)
rgba = np.zeros((height, width, 4), dtype=np.float32)
rgba[..., 0] = mask
rgba[..., 1] = mask
rgba[..., 2] = mask
rgba[..., 3] = 1.0
mask_img.pixels = rgba.ravel().tolist()
mask_path = dst.rsplit("/", 1)[0] + "/mach-speeder-paint-mask.png"
mask_img.filepath_raw = mask_path
mask_img.file_format = "PNG"
mask_img.save()

# --- Wheel pivots -----------------------------------------------------------
verts = [v.co for v in mesh.vertices]
centres = {}
for name, sx, sy in [
    ("wheel-rear-left", 1, 1),
    ("wheel-rear-right", -1, 1),
    ("wheel-front-left", 1, -1),
    ("wheel-front-right", -1, -1),
]:
    sel = [
        v
        for v in verts
        if v.x * sx > 0.3 and v.y * sy > 0.35 and abs(v.z - WHEEL_RADIUS) < 0.3
    ]
    if not sel:
        raise SystemExit(f"no wheel geometry near {name}")
    cx = sum(v.x for v in sel) / len(sel)
    cy = sum(v.y for v in sel) / len(sel)
    centres[name] = Vector((cx, cy, WHEEL_RADIUS))

for name, centre in centres.items():
    bpy.ops.object.empty_add(type="PLAIN_AXES", location=(centre.x, centre.y, centre.z))
    pivot = bpy.context.view_layer.objects.active
    pivot.name = name
    pivot.parent = car
    pivot.matrix_parent_inverse = car.matrix_world.inverted()

# --- Export -----------------------------------------------------------------
bpy.ops.object.select_all(action="SELECT")
bpy.ops.export_scene.gltf(
    filepath=dst,
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
corners = [car.matrix_world @ Vector(c) for c in car.bound_box]
lo = Vector((min(c[i] for c in corners) for i in range(3)))
hi = Vector((max(c[i] for c in corners) for i in range(3)))
print("CAR_BUILD " + json.dumps({
    "size": [round(hi[i] - lo[i], 3) for i in range(3)],
    "lo": [round(v, 3) for v in lo],
    "hi": [round(v, 3) for v in hi],
    "triangles": len(mesh.loop_triangles),
    "wheels": sorted(centres),
    "mask": mask_path,
    "livery": livery_path,
}))
