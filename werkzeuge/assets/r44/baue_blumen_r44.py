"""Runde 44: Blumen aus Poly Haven (CC0) → client/assets/eigene/ph-blume-*.glb (statt der groben Kenney-Blumen im Lager)

Quellen (glTF 1k von https://polyhaven.com, vorher herunterladen nach <ordner>/<id>/<id>_1k.gltf):
  flower_empodium (5 Pflanzen a–e), flower_gazania (8 Pflanzen a–h)
Je Pflanze ein GLB: Mitte x/z = 0, Boden y = 0, mehr als MAX_DREIECKE → Blender „Decimate“ (Collapse), Texturen auf 512 px (JPEG).

Aufruf: "C:/Program Files/Blender Foundation/Blender 5.2/blender.exe" -b --factory-startup --python werkzeuge/assets/r44/baue_blumen_r44.py -- <ordner>
"""
import bpy, sys, os

WURZEL = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))
ZIEL = os.path.join(WURZEL, 'client', 'assets', 'eigene')
MAX_DREIECKE = 900
OHNE_BLUETE = {'empodium-d', 'empodium-e', 'gazania-a', 'gazania-b', 'gazania-c'}  # nur Blätter → nicht exportiert
TEX = 512
argv = sys.argv[sys.argv.index('--') + 1:]
ORDNER = argv[0]

for quelle in ('flower_empodium', 'flower_gazania'):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=os.path.join(ORDNER, quelle, f'{quelle}_1k.gltf'))
    for bild in bpy.data.images:
        if bild.size[0] > TEX:
            bild.scale(TEX, TEX)
    objekte = [o for o in bpy.context.scene.objects if o.type == 'MESH']
    for ob in objekte:
        buchstabe = ob.name.split('_')[2]
        if f"{quelle.split('_')[1]}-{buchstabe}" in OHNE_BLUETE:
            continue
        name = f"ph-blume-{quelle.split('_')[1]}-{buchstabe}"
        bpy.ops.object.select_all(action='DESELECT')
        ob.select_set(True)
        bpy.context.view_layer.objects.active = ob
        # Dreiecke zählen, ggf. dezimieren
        dreiecke = sum(len(p.vertices) - 2 for p in ob.data.polygons)
        if dreiecke > MAX_DREIECKE:
            mod = ob.modifiers.new('dez', 'DECIMATE')
            mod.ratio = MAX_DREIECKE / dreiecke
            bpy.ops.object.modifier_apply(modifier='dez')
        # Mitte/Boden in den Ursprung
        alt = ob.location.copy()
        ob.location = (0, 0, 0)
        bpy.context.view_layer.update()
        ecken = [ob.matrix_world @ v.co for v in ob.data.vertices]
        mx = (min(e.x for e in ecken) + max(e.x for e in ecken)) / 2
        my = (min(e.y for e in ecken) + max(e.y for e in ecken)) / 2
        mz = min(e.z for e in ecken)
        ob.location = (-mx, -my, -mz)
        pfad = os.path.join(ZIEL, name + '.glb')
        bpy.ops.export_scene.gltf(filepath=pfad, use_selection=True, export_format='GLB', export_image_format='JPEG',
                                  export_jpeg_quality=86, export_apply=True, export_animations=False, export_extras=False)
        neu = sum(len(p.vertices) - 2 for p in ob.data.polygons)
        print('BLUME', name, dreiecke, '→', neu, os.path.getsize(pfad) // 1024, 'KB')
        ob.location = alt
