#!/usr/bin/env python3
"""
UV-Vorlage für ein GLB: liest die UVs + eingebettete Textur und schreibt (in den Ausgabeordner)
  <name>_textur.png       die vorhandene Textur (Original, unverändert)
  <name>_uv_gitter.png    Textur + UV-Dreiecksgitter (zeigt, welche Insel welcher Körperteil ist)
  <name>_uv_leer.png      nur das Gitter auf transparentem/weißem Grund = Malvorlage (Ebene darüberlegen)
und druckt Eckdaten (Vertices, UV-Bereich, Material, Texturgröße, Skelett ja/nein).
Aufruf:  python3 werkzeuge/assets/uv_vorlage.py client/assets/eigene/cat.glb [ausgabeordner]
Nur Lesen – ändert kein Asset. Braucht Pillow + numpy.
"""
import io, json, struct, sys
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw

DTYPE = {5126: np.float32, 5123: np.uint16, 5125: np.uint32, 5121: np.uint8}
ANZ = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4}


def lade(pfad):
    d = Path(pfad).read_bytes()
    laenge = struct.unpack('<I', d[12:16])[0]
    j = json.loads(d[20:20 + laenge])
    return j, d[20 + laenge + 8:]


def accessor(j, bin_, i):
    a = j['accessors'][i]
    bv = j['bufferViews'][a['bufferView']]
    n = ANZ[a['type']]
    off = bv.get('byteOffset', 0) + a.get('byteOffset', 0)
    return np.frombuffer(bin_, dtype=DTYPE[a['componentType']], count=a['count'] * n, offset=off).reshape(a['count'], n)


def main():
    pfad = Path(sys.argv[1])
    aus = Path(sys.argv[2] if len(sys.argv) > 2 else '.')
    aus.mkdir(parents=True, exist_ok=True)
    name = pfad.stem
    j, bin_ = lade(pfad)
    bild = None
    if j.get('images'):
        bv = j['bufferViews'][j['images'][0]['bufferView']]
        off = bv.get('byteOffset', 0)
        bild = Image.open(io.BytesIO(bin_[off:off + bv['byteLength']])).convert('RGBA')
        bild.save(aus / f'{name}_textur.png')
    gr = bild.size if bild else (1024, 1024)
    print(f'{name}: Textur {gr[0]}x{gr[1]}' if bild else f'{name}: KEINE Textur eingebettet (Material nur Farbe/Palette)')
    print('Skelett:', 'ja' if j.get('skins') else 'nein', '| Animationen:', len(j.get('animations', [])))
    if bild and min(gr) < 512:  # Mini-Paletten (z. B. 32x32) für die Vorlage hochskalieren, Pixel bleiben scharf
        f = 1024 // min(gr)
        gr = (gr[0] * f, gr[1] * f)
        bild = bild.resize(gr, Image.NEAREST)
        bild.save(aus / f'{name}_textur.png')
        print(f'  (Vorlage {f}× vergrößert auf {gr[0]}x{gr[1]}; Original bleibt {gr[0]//f}x{gr[1]//f})')
    gitter = Image.new('RGBA', gr, (0, 0, 0, 0))
    g = ImageDraw.Draw(gitter)
    for m in j['meshes']:
        for p in m['primitives']:
            at = p['attributes']
            if 'TEXCOORD_0' not in at:
                print(f"  {m.get('name')}: keine UVs")
                continue
            uv = accessor(j, bin_, at['TEXCOORD_0']).astype(float)
            idx = accessor(j, bin_, p['indices']).reshape(-1) if 'indices' in p else np.arange(len(uv))
            print(f"  {m.get('name')}: {len(uv)} Vertices, {len(idx)//3} Dreiecke, UV x {uv[:,0].min():.3f}–{uv[:,0].max():.3f}, y {uv[:,1].min():.3f}–{uv[:,1].max():.3f}, Material {j['materials'][p['material']].get('name') if 'material' in p else '-'}")
            px = np.column_stack([uv[:, 0] * gr[0], uv[:, 1] * gr[1]])  # glTF: v nach unten, Ursprung oben links
            for t in idx.reshape(-1, 3):
                pts = [tuple(px[i]) for i in t]
                g.polygon(pts, outline=(255, 40, 120, 255))
    unter = Image.new('RGBA', gr, (255, 255, 255, 255))
    leer = Image.alpha_composite(unter, gitter)
    leer.save(aus / f'{name}_uv_leer.png')
    if bild:
        Image.alpha_composite(bild, gitter).save(aus / f'{name}_uv_gitter.png')
    print('geschrieben nach', aus)


main()
