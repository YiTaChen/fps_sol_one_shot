"""Build the Ash Exchange exterior in Blender and export the game mesh.

Run from the repository root:
    blender -b -t 3 --python scripts/build-exchange-asset.py
"""

from collections import defaultdict
from math import cos, pi, sin, tau
from pathlib import Path

import bpy
from mathutils import Vector


def to_blender(point):
    x, y, z = point
    return (x, -z, y)


def linear(hex_color):
    values = tuple(int(hex_color[index:index + 2], 16) / 255 for index in (0, 2, 4))
    return tuple(value / 12.92 if value < 0.04045 else ((value + 0.055) / 1.055) ** 2.4 for value in values)


def make_material(name, color, roughness, metalness, emission=0):
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    shader = material.node_tree.nodes.get('Principled BSDF')
    rgba = (*linear(color), 1.0)
    shader.inputs['Base Color'].default_value = rgba
    shader.inputs['Roughness'].default_value = roughness
    shader.inputs['Metallic'].default_value = metalness
    if emission:
        shader.inputs['Emission Color'].default_value = rgba
        shader.inputs['Emission Strength'].default_value = emission
    return material


class Batch:
    def __init__(self):
        self.vertices = []
        self.faces = []
        self.smooth = []

    def append(self, vertices, faces, smooth=False):
        offset = len(self.vertices)
        self.vertices.extend(to_blender(vertex) for vertex in vertices)
        self.faces.extend(tuple(offset + index for index in face) for face in faces)
        self.smooth.extend([smooth] * len(faces))


batches = defaultdict(Batch)


def box(material, center, size):
    x, y, z = center
    width, height, depth = (side / 2 for side in size)
    batches[material].append(
        [(x - width, y - height, z - depth), (x + width, y - height, z - depth),
         (x + width, y + height, z - depth), (x - width, y + height, z - depth),
         (x - width, y - height, z + depth), (x + width, y - height, z + depth),
         (x + width, y + height, z + depth), (x - width, y + height, z + depth)],
        [(3, 2, 1, 0), (4, 5, 6, 7), (0, 1, 5, 4), (2, 3, 7, 6),
         (0, 4, 7, 3), (1, 2, 6, 5)],
    )


def tube(material, centers, radii, sides=16, cap=False, smooth=True):
    centers = [Vector(center) for center in centers]
    vertices = []
    for index, center in enumerate(centers):
        axis = centers[min(index + 1, len(centers) - 1)] - centers[max(index - 1, 0)]
        axis.normalize()
        basis = Vector((0, 0, 1)) if abs(axis.z) < 0.85 else Vector((0, 1, 0))
        normal = axis.cross(basis).normalized()
        tangent = axis.cross(normal)
        for side in range(sides):
            angle = side * tau / sides
            vertices.append(center + radii[index] * (cos(angle) * normal + sin(angle) * tangent))
    faces = []
    for index in range(len(centers) - 1):
        for side in range(sides):
            a = index * sides + side
            b = index * sides + (side + 1) % sides
            faces.append((a, b, b + sides, a + sides))
    batches[material].append(vertices, faces, smooth)
    if cap:
        offset = (len(centers) - 1) * sides
        batches[material].append(vertices[:sides], [tuple(reversed(range(sides)))])
        batches[material].append(vertices[offset:], [tuple(range(sides))])


def bar(material, start, end, radius, sides=12):
    tube(material, (start, end), (radius, radius), sides=sides, cap=True)


def front_ring(material, x, y, z, profile, sides=48):
    vertices = [(x + cos(side * tau / sides) * radius,
                 y + sin(side * tau / sides) * radius, z + depth)
                for radius, depth in profile for side in range(sides)]
    faces = []
    for ring in range(len(profile)):
        nxt = (ring + 1) % len(profile)
        for side in range(sides):
            following = (side + 1) % sides
            faces.append((ring * sides + side, ring * sides + following,
                          nxt * sides + following, nxt * sides + side))
    batches[material].append(vertices, faces, smooth=True)


def duct_elbow(center, direction=1):
    x, y, z = center
    centers = [(x + direction * 1.1 * sin(i * pi / 16), y - 1.1 * (1 - cos(i * pi / 16)), z)
               for i in range(9)]
    tube('tarnished iron', centers, [0.47] * len(centers), sides=20)
    return centers[-1]


def add_entrance():
    x, z = -43.15, -5.64
    for direction in (-1, 1):
        jamb = x + direction * 1.43
        box('blackened steel', (jamb, 1.58, z), (0.21, 3.12, 0.34))
        box('warm galvanized metal', (jamb + direction * 0.03, 1.59, z + 0.181), (0.075, 2.9, 0.028))
        for height in (0.25, 0.72, 1.93, 2.68, 2.94):
            bar('blackened steel', (jamb, height, z + 0.16), (jamb, height, z + 0.218), 0.035, 6)
        box('blackened steel', (jamb, 0.105, z + 0.075), (0.4, 0.21, 0.52))
        bar('blackened steel', (jamb, 2.55, z + 0.03), (jamb, 3.13, z + 1.07), 0.058)
    box('blackened steel', (x, 3.16, z + 0.52), (3.32, 0.16, 1.38))
    for rib in range(11):
        rib_x = x - 1.46 + rib * 0.292
        box('warm galvanized metal', (rib_x, 3.25, z + 0.53), (0.042, 0.07, 1.39))
    box('blackened steel', (x, 3.02, z + 0.71), (2.35, 0.13, 0.29))
    for offset in (-0.79, 0, 0.79):
        box('amber glass', (x + offset, 2.949, z + 0.7), (0.57, 0.019, 0.155))


ROTOR_PIVOT = (-40.8, 7.58, -6.95)


def add_heat_exchange():
    x, y, z = ROTOR_PIVOT
    for offset in (-1.09, 1.09):
        box('blackened steel', (x + offset, 6.43, z - 0.83), (0.22, 1.0, 2.76))
        box('blackened steel', (x + offset, 6.89, z - 0.83), (0.30, 0.16, 2.92))
    bar('tarnished iron', (x, y, z - 1.76), (x, y, z - 0.10), 1.25, 40)
    front_ring('blackened steel', x, y, z, [(1.08, -0.22), (1.34, -0.22), (1.34, 0.09), (1.06, 0.09)])
    front_ring('warm galvanized metal', x, y, z, [(1.245, 0.09), (1.305, 0.09), (1.304, 0.14), (1.245, 0.14)])
    front_ring('oxide', x, y, z, [(0.93, -0.15), (1.07, -0.15), (1.07, 0.06), (0.94, 0.06)])
    for index in range(18):
        angle = index * tau / 18
        bolt_x, bolt_y = x + cos(angle) * 1.17, y + sin(angle) * 1.17
        bar('warm galvanized metal', (bolt_x, bolt_y, z + 0.085), (bolt_x, bolt_y, z + 0.17), 0.045, 6)
    bar('blackened steel', (x, y, z - 0.47), (x, y, z + 0.025), 0.24, 20)
    for index in range(9):
        angle = index * tau / 9
        profile = [(0.23, angle - 0.07), (0.71, angle + 0.28),
                   (0.94, angle + 0.34), (0.89, angle + 0.11),
                   (0.38, angle - 0.16)]
        points = [(x + radius * cos(theta), y + radius * sin(theta), z - 0.065)
                  for radius, theta in profile]
        batches['exchange rotor'].append(points, [tuple(range(5))])
    for row in range(-6, 7):
        off_y = row * 0.133
        half = (0.98 ** 2 - off_y ** 2) ** 0.5
        bar('blackened steel', (x - half, y + off_y, z + 0.045),
            (x + half, y + off_y, z + 0.045), 0.014, 8)
    elbow_start = x + 1.2
    bar('tarnished iron', (elbow_start - 0.26, y + 0.19, z - 0.86),
        (elbow_start + 1.04, y + 0.19, z - 0.86), 0.47, 20)
    exit_x, exit_y, exit_z = duct_elbow((elbow_start + 1.04, y + 0.19, z - 0.86))
    bar('tarnished iron', (exit_x, exit_y, exit_z), (exit_x, 6.13, exit_z), 0.47, 20)
    for height in (6.36, 6.62):
        bar('oxide', (exit_x, height, exit_z), (exit_x, height + 0.1, exit_z), 0.52, 20)

    for stack_x, height in ((-38.35, 10.4), (-37.41, 9.35)):
        bar('oxide', (stack_x, 6.23, -10.5), (stack_x, height, -10.5), 0.34, 16)
        for ring_y in (7.05, 8.17, height - 0.14):
            bar('warm galvanized metal', (stack_x, ring_y, -10.5),
                (stack_x, ring_y + 0.08, -10.5), 0.37, 16)
        box('blackened steel', (stack_x, height + 0.025, -10.5), (0.8, 0.085, 0.79))

    for height, offset in ((4.86, 0.0), (5.19, 0.22)):
        path = [(-46.75, 4.15 + offset, -5.75), (-46.75, height - 0.35, -5.60),
                (-46.62, height - 0.08, -5.60), (-46.37, height, -5.60), (-32.34, height, -5.60),
                (-31.96, height + 0.11, -5.60), (-31.83, height + 0.4, -5.60),
                (-31.83, 6.31, -5.70)]
        tube('oxide', path, [0.115] * len(path), sides=12)
        for index in range(8):
            px = -46.1 + index * 1.84
            bar('warm galvanized metal', (px - 0.04, height, -5.60), (px + 0.04, height, -5.60), 0.138)
            box('blackened steel', (px, height, -5.81), (0.058, 0.26, 0.31))


def add_service_condenser():
    x, z = 26.55, -24.58
    box('blackened steel', (x, 0.14, z), (3.42, 0.28, 1.79))
    box('tarnished iron', (x, 0.8, z + 0.11), (3.03, 1.14, 1.43))
    box('blackened steel', (x, 1.43, z + 0.11), (3.26, 0.16, 1.54))
    for side in (-1, 1):
        rail_x = x + side * 1.59
        box('blackened steel', (rail_x, 0.78, z - 0.62), (0.13, 1.22, 0.16))
        box('warm galvanized metal', (rail_x, 0.16, z - 0.75), (0.21, 0.14, 0.26))
    for index in range(22):
        fin_x = x - 1.45 + 0.137 * index
        box('warm galvanized metal', (fin_x, 0.83, z - 0.66), (0.049, 0.91, 0.18))
    for offset in (-0.97, 0.97):
        bar('oxide', (x + offset, 0.28, z - 0.51), (x + offset, 1.64, z - 0.51), 0.091)
        bar('blackened steel', (x + offset, 1.24, z - 0.51), (x + offset, 1.33, z - 0.51), 0.13)
    bar('oxide', (x - 1.46, 1.62, z - 0.51), (x + 1.46, 1.62, z - 0.51), 0.09)
    box('blackened steel', (x + 1.01, 1.02, z - 0.79), (0.46, 0.51, 0.17))
    box('cyan glass', (x + 1.01, 1.10, z - 0.88), (0.29, 0.094, 0.025))
    for offset in (-0.07, 0.07):
        box('amber glass', (x + 1.01 + offset, 0.95, z - 0.88), (0.046, 0.042, 0.022))
    for offset in (-1.1, 1.1):
        path = [(x + offset, 1.51, z + 0.24), (x + offset, 2.02, z + 0.24),
                (x + offset, 2.29, z + 0.35), (x + offset, 2.42, z + 0.61),
                (x + offset, 2.42, -22.91)]
        tube('oxide', path, [0.16] * len(path), sides=16)
        bar('warm galvanized metal', (x + offset, 1.83, z + 0.24),
            (x + offset, 1.92, z + 0.24), 0.185, 16)


bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
materials = {
    'blackened steel': make_material('Blackened structural steel', '333b3c', 0.60, 0.72),
    'warm galvanized metal': make_material('Weathered galvanized edges', '88918b', 0.52, 0.61),
    'tarnished iron': make_material('Tarnished fan steel', '5d6768', 0.57, 0.53),
    'exchange rotor': make_material('Exchange fan vanes', '777267', 0.51, 0.57),
    'oxide': make_material('Oxidized heat exchange pipe', '805842', 0.61, 0.46),
    'cyan glass': make_material('Freight condenser status', '75dce5', 0.46, 0.03, 0.8),
    'amber glass': make_material('Amber service lamps', 'ffc786', 0.44, 0.05, 3.4),
}
add_entrance()
add_heat_exchange()
add_service_condenser()
for name, batch in batches.items():
    mesh = bpy.data.meshes.new(name)
    pivot = Vector(to_blender(ROTOR_PIVOT)) if name == 'exchange rotor' else Vector((0, 0, 0))
    vertices = [Vector(vertex) - pivot for vertex in batch.vertices]
    mesh.from_pydata(vertices, [], batch.faces)
    mesh.validate()
    mesh.update()
    for polygon, smooth in zip(mesh.polygons, batch.smooth):
        polygon.use_smooth = smooth
    obj = bpy.data.objects.new(name, mesh)
    obj.location = pivot
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(materials[name])

output = Path('src/assets/ash-exchange.glb').resolve()
output.parent.mkdir(parents=True, exist_ok=True)
bpy.ops.export_scene.gltf(filepath=str(output), export_format='GLB', export_animations=False)
