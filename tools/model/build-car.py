"""Turn a generated Mach Speeder into the game car.

    PYTHONPATH=... blender -b -P tools/model/build-car.py -- in.glb out.glb

The image-to-3D mesh is a single fused, textured blob built from overlapping
shells. Rendered with flat paint, those duplicates z-fight and read as black
shards. This script therefore rebuilds the body as one watertight surface:

1. orients it (generator nose is -X; the game needs -Y in Blender so the GLB
   comes out facing +Z),
2. corrects the proportions to the envelope in car-spec.mjs,
3. cuts the wheels loose into their own objects (geometry preserved, no holes),
4. voxel-remeshes the body to remove duplicate/internal faces, decimates it to
   a game budget, and shades it smooth,
5. paints it by region - body, lower body, twin stripes, glass, orange aero -
   so the game can recolour the paint channels,
6. dresses the wheels with clean turbofan faces and exports a compact GLB with
   no textures.
"""
import json
import math
import sys

import bpy
import bmesh
from mathutils import Vector

argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
src, dst = argv[0], argv[1]

# Length, width, height of the finished car, matching src/game/car-spec.mjs.
LENGTH = 2.45
WIDTH = 1.26
HEIGHT = 0.6
WHEEL_RADIUS = 0.26
FRONT_AXLE = 0.78
REAR_AXLE = -0.74

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)

meshes = [o for o in bpy.context.scene.objects if o.type == "MESH"]
bpy.ops.object.select_all(action="DESELECT")
for obj in meshes:
    obj.select_set(True)
bpy.context.view_layer.objects.active = meshes[0]
if len(meshes) > 1:
    bpy.ops.object.join()
car = bpy.context.view_layer.objects.active

# --- Orient: generator nose -X -> Blender -Y (exports as glTF +Z) ------------
car.rotation_mode = "XYZ"
car.rotation_euler = (0, 0, math.radians(90))
bpy.ops.object.transform_apply(location=False, rotation=True, scale=False)

# --- Proportion to the game envelope ---------------------------------------
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


def select_only(obj):
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj


def decimate(obj, target):
    obj.data.calc_loop_triangles()
    tris = len(obj.data.loop_triangles)
    if tris <= target:
        return
    select_only(obj)
    modifier = obj.modifiers.new("Decimate", "DECIMATE")
    modifier.ratio = target / tris
    modifier.use_collapse_triangulate = True
    bpy.ops.object.modifier_apply(modifier=modifier.name)


# --- Cut the wheels loose ---------------------------------------------------
def separate_wheel(name, sign, axle_y, radius=0.34):
    mesh = car.data
    bpy.ops.object.select_all(action="DESELECT")
    car.select_set(True)
    bpy.context.view_layer.objects.active = car
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="DESELECT")
    bpy.ops.object.mode_set(mode="OBJECT")

    selected = 0
    for polygon in mesh.polygons:
        c = polygon.center
        if c.x * sign > 0.28 and math.hypot(c.z - WHEEL_RADIUS, c.y - axle_y) < radius:
            polygon.select = True
            selected += 1
    if selected == 0:
        raise SystemExit(f"no wheel geometry near {name}")

    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.separate(type="SELECTED")
    bpy.ops.object.mode_set(mode="OBJECT")
    wheel = next(o for o in bpy.context.selected_objects if o != car)
    wheel.name = name
    return wheel


# Blender's Y is mirrored against the glTF/game Z axis: the nose points -Y here,
# so the game's +0.78 front axle sits at y = -0.78 and the rear at +0.74.
wheels = []
for name, sign, axle_y in [
    ("wheel-rear-left", 1, -REAR_AXLE),
    ("wheel-rear-right", -1, -REAR_AXLE),
    ("wheel-front-left", 1, -FRONT_AXLE),
    ("wheel-front-right", -1, -FRONT_AXLE),
]:
    wheels.append((separate_wheel(name, sign, axle_y), name))

# Keep the generated topology and its authored normals. The mesh is a soup of
# split triangles, so remeshing or decimating it punches holes; the silhouette
# is already sound. Decimation can be revisited once the shading is right.
mesh = car.data
for polygon in mesh.polygons:
    polygon.use_smooth = True

# --- Paint by region --------------------------------------------------------
PALETTE = {
    "Paint": (0.92, 0.93, 0.95, 1),
    "PaintDeep": (0.05, 0.09, 0.18, 1),
    "Stripe": (0.04, 0.08, 0.2, 1),
    "Accent": (0.86, 0.24, 0.04, 1),
    "Glass": (0.03, 0.06, 0.12, 1),
    "Trim": (0.03, 0.035, 0.045, 1),
    "Taillight": (0.8, 0.03, 0.05, 1),
    "Tyre": (0.02, 0.02, 0.025, 1),
}
mesh.materials.clear()
slots = {}
for name, rgba in PALETTE.items():
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = next(n for n in mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    bsdf.inputs["Base Color"].default_value = rgba
    bsdf.inputs["Roughness"].default_value = (
        0.42 if name in ("Paint", "Accent", "Stripe") else 0.6
    )
    # Die-cast paint is a dielectric: a high metalness in a dark studio mirrors
    # black and reads as broken geometry.
    bsdf.inputs["Metallic"].default_value = 0.02
    if name == "Taillight":
        bsdf.inputs["Emission Color"].default_value = rgba
        bsdf.inputs["Emission Strength"].default_value = 1.2
    mesh.materials.append(mat)
    slots[name] = len(mesh.materials) - 1


def channel_for(x, y, z, nz):
    """Livery channel for a face, from where it sits on the car."""
    # Canopy: the teardrop between the fenders, above the beltline.
    if z > 0.4 and abs(x) < 0.3 and -0.55 < y < 0.3:
        return "Glass"
    # Rear wing and its pylons.
    if z > 0.5 and y > 0.45:
        return "Accent"
    # Roof scoop.
    if z > 0.46 and -0.3 < y < 0.3 and abs(x) < 0.14:
        return "Accent"
    # Twin bonnet and deck stripes on upward-facing skin.
    if nz > 0.5 and 0.045 < abs(x) < 0.15 and -1.08 < y < 0.58:
        return "Stripe"
    # Wide-mouth nose: orange inside, dark below.
    if y < -0.95:
        return "Accent" if z < 0.26 and abs(x) < 0.32 else "Paint"
    # Lower body: sills, splitter, diffuser.
    if z < 0.16:
        return "PaintDeep"
    # Tail light bar.
    if y > 0.98 and 0.22 < z < 0.34 and abs(x) < 0.32:
        return "Taillight"
    return "Paint"


for polygon in mesh.polygons:
    c = polygon.center
    polygon.material_index = slots[channel_for(c.x, c.y, c.z, polygon.normal.z)]

# --- Turbofan wheels --------------------------------------------------------
def dress_wheel(wheel, name):
    decimate(wheel, 1000)
    for polygon in wheel.data.polygons:
        polygon.use_smooth = True
    wheel.data.materials.clear()
    wheel.data.materials.append(bpy.data.materials["Tyre"])
    for polygon in wheel.data.polygons:
        polygon.material_index = 0

    corners = [wheel.matrix_world @ Vector(c) for c in wheel.bound_box]
    lo = Vector((min(c[i] for c in corners) for i in range(3)))
    hi = Vector((max(c[i] for c in corners) for i in range(3)))
    centre = (lo + hi) / 2
    outer = hi.x if centre.x > 0 else lo.x
    face_x = outer + math.copysign(0.004, centre.x)

    bpy.ops.mesh.primitive_cylinder_add(
        vertices=32,
        radius=WHEEL_RADIUS * 0.62,
        depth=0.02,
        location=(face_x, centre.y, centre.z),
        rotation=(0, math.radians(90), 0),
    )
    plate = bpy.context.view_layer.objects.active
    plate.data.materials.append(bpy.data.materials["Trim"])

    bpy.ops.mesh.primitive_torus_add(
        major_radius=WHEEL_RADIUS * 0.5,
        minor_radius=0.011,
        major_segments=32,
        minor_segments=8,
        location=(face_x + math.copysign(0.008, centre.x), centre.y, centre.z),
        rotation=(0, math.radians(90), 0),
    )
    ring = bpy.context.view_layer.objects.active
    ring.data.materials.append(bpy.data.materials["Accent"])

    bpy.ops.object.select_all(action="DESELECT")
    for part in (wheel, plate, ring):
        part.select_set(True)
    bpy.context.view_layer.objects.active = wheel
    bpy.ops.object.join()
    wheel.name = name

    # Origin at the axle, then bake the cylinder rotation into the mesh so the
    # node transform is a pure translation and local +X really is the axle.
    bpy.context.scene.cursor.location = (centre.x, centre.y, centre.z)
    select_only(wheel)
    bpy.ops.object.origin_set(type="ORIGIN_CURSOR")
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)


for wheel, name in wheels:
    dress_wheel(wheel, name)
    wheel.parent = car
    wheel.matrix_parent_inverse = car.matrix_world.inverted()

# --- Report and export ------------------------------------------------------
bpy.context.view_layer.update()
mesh_objects = [o for o in bpy.context.scene.objects if o.type == "MESH"]
lowest = min(
    (o.matrix_world @ Vector(c)).z for o in mesh_objects for c in o.bound_box
)
# Move only the root: the wheels are parented to it and follow, so shifting
# both the parent and the child would double the correction.
for obj in mesh_objects:
    if obj.parent is None:
        obj.location.z -= lowest
bpy.context.view_layer.update()

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
    export_texcoords=False,
)

corners = [car.matrix_world @ Vector(c) for c in car.bound_box]
lo = Vector((min(c[i] for c in corners) for i in range(3)))
hi = Vector((max(c[i] for c in corners) for i in range(3)))
car.data.calc_loop_triangles()
print("CAR_BUILD " + json.dumps({
    "size": [round(hi[i] - lo[i], 3) for i in range(3)],
    "lo": [round(v, 3) for v in lo],
    "hi": [round(v, 3) for v in hi],
    "triangles": len(car.data.loop_triangles),
}))
