#!/usr/bin/env python3
"""Spiel-Bäume aus den Quaternius-Modellen („Stylized Nature MegaKit“, CC0) in client/assets/eigene/ bauen.

Für jedes Modell in BAEUME entsteht client/assets/3d/baeume/<name>.glb – klein und schnell für viele Instanzen:
  • Rinde: Textur + Normal-Map fliegen raus, die Rindenfarbe wird je Vertex aus der Textur gelesen (× Vertexfarbe des
    Modells = eingebackene Verschattung) → COLOR_0 (linear, u8). Kein Textur-Wechsel, kein Normal-Map-Shader.
  • Laub: Blatt-Textur auf 256 px verkleinert (transparente Pixel mit der mittleren Blattfarbe gefüllt, sonst dunkle
    Ränder), Alpha-Cutout statt Blending (MASK, doppelseitig) → keine Sortierprobleme, Schatten funktionieren.
  • Maße bleiben in Metern (1 m = 1 Kachel); Ursprung = Stammfuß. Der Client skaliert (client/darstellung/baumModell.js).
Schreibt zusätzlich client/assets/3d/baeume/baeume.json (Höhe, Breite, Dreiecke je Modell).

Aufruf: python3 werkzeuge/assets/baue_baeume.py   (braucht numpy + Pillow)
"""
import io, json, struct, pathlib
import numpy as np
from PIL import Image

WURZEL = pathlib.Path(__file__).resolve().parents[2]
QUELLE = WURZEL / 'client/assets/eigene'
ZIEL = WURZEL / 'client/assets/3d/baeume'
LAUB_PX = 256

# Spiel-Name → Quelldatei (Auswahl: niedrige Dreieckszahl, passend zu Stadtrand/Waldweg/Schneeland)
BAEUME = {
    'laubbaum_a': 'tree.glb',
    'laubbaum_b': 'tree-4.glb',
    'laubbaum_c': 'tree-5.glb',
    'laubbaum_d': 'tree-2.glb',
    'kiefer_a': 'pine.glb',
    'kiefer_b': 'pine-3.glb',
    'kiefer_c': 'pine-b.glb',
    'totbaum_a': 'dead-tree-4.glb',
}


def lies_glb(pfad):
    d = pfad.read_bytes()
    jl = struct.unpack('<I', d[12:16])[0]
    j = json.loads(d[20:20 + jl])
    return j, d[20 + jl + 8:]


def accessor(j, b, i):
    a = j['accessors'][i]
    bv = j['bufferViews'][a['bufferView']]
    n = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4}[a['type']]
    dt = {5126: '<f4', 5123: '<u2', 5125: '<u4', 5121: 'u1'}[a['componentType']]
    o = bv.get('byteOffset', 0) + a.get('byteOffset', 0)
    werte = np.frombuffer(b, dt, a['count'] * n, o).reshape(a['count'], n)
    if a.get('normalized') and dt == 'u1':
        werte = werte / 255.0
    return werte.astype(np.float32) if dt == '<f4' or a.get('normalized') else werte


def bild(j, b, i):
    bv = j['bufferViews'][j['images'][i]['bufferView']]
    o = bv.get('byteOffset', 0)
    return Image.open(io.BytesIO(b[o:o + bv['byteLength']])).convert('RGBA')


def linear(c):
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


def knoten_matrix(knoten):
    m = np.eye(4)
    if 'matrix' in knoten:
        return np.array(knoten['matrix']).reshape(4, 4).T
    t = knoten.get('translation', [0, 0, 0])
    x, y, z, w = knoten.get('rotation', [0, 0, 0, 1])
    s = knoten.get('scale', [1, 1, 1])
    r = np.array([[1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
                  [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
                  [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)]])
    m[:3, :3] = r * np.array(s)
    m[:3, 3] = t
    return m


def laub_textur(img):
    img = img.resize((LAUB_PX, LAUB_PX), Image.LANCZOS)
    a = np.asarray(img).astype(np.float32)
    deck = a[:, :, 3] > 127
    if deck.any():
        mittel = a[deck][:, :3].mean(axis=0)
        a[~deck, :3] = mittel  # Farbe hinter den Löchern = Blattfarbe → keine dunklen Kanten beim Filtern
    a[:, :, 3] = np.where(deck, 255, 0)
    puffer = io.BytesIO()
    Image.fromarray(a.astype(np.uint8), 'RGBA').save(puffer, 'PNG', optimize=True)
    return puffer.getvalue()


class GlbSchreiber:
    def __init__(self):
        self.bin = bytearray()
        self.j = {'asset': {'version': '2.0', 'generator': 'baue_baeume.py'}, 'buffers': [], 'bufferViews': [], 'accessors': [],
                  'meshes': [{'primitives': []}], 'nodes': [{'mesh': 0, 'name': 'baum'}], 'scenes': [{'nodes': [0]}], 'scene': 0, 'materials': []}

    def view(self, daten, ziel=None):
        while len(self.bin) % 4:
            self.bin.append(0)
        bv = {'buffer': 0, 'byteOffset': len(self.bin), 'byteLength': len(daten)}
        if ziel:
            bv['target'] = ziel
        self.bin += daten
        self.j['bufferViews'].append(bv)
        return len(self.j['bufferViews']) - 1

    def acc(self, arr, typ, komponente, ziel=34962, normalisiert=False, grenzen=False):
        a = {'bufferView': self.view(arr.tobytes(), ziel), 'componentType': komponente, 'count': len(arr), 'type': typ}
        if normalisiert:
            a['normalized'] = True
        if grenzen:
            a['min'] = arr.min(axis=0).tolist()
            a['max'] = arr.max(axis=0).tolist()
        self.j['accessors'].append(a)
        return len(self.j['accessors']) - 1

    def primitiv(self, pos, nor, idx, farbe, uv=None, material=0):
        attr = {'POSITION': self.acc(pos.astype('<f4'), 'VEC3', 5126, grenzen=True),
                'NORMAL': self.acc(nor.astype('<f4'), 'VEC3', 5126),
                'COLOR_0': self.acc((np.clip(farbe, 0, 1) * 255).round().astype('u1'), 'VEC3', 5121, normalisiert=True)}
        if uv is not None:
            attr['TEXCOORD_0'] = self.acc(uv.astype('<f4'), 'VEC2', 5126)
        typ = ('<u2', 5123) if len(pos) < 65536 else ('<u4', 5125)
        self.j['meshes'][0]['primitives'].append({'attributes': attr, 'indices': self.acc(idx.astype(typ[0]), 'SCALAR', typ[1], 34963), 'material': material})

    def schreibe(self, pfad):
        self.j['buffers'] = [{'byteLength': len(self.bin)}]
        js = json.dumps(self.j, separators=(',', ':')).encode()
        js += b' ' * (-len(js) % 4)
        while len(self.bin) % 4:
            self.bin.append(0)
        laenge = 12 + 8 + len(js) + 8 + len(self.bin)
        pfad.write_bytes(struct.pack('<III', 0x46546C67, 2, laenge) + struct.pack('<II', len(js), 0x4E4F534A) + js
                         + struct.pack('<II', len(self.bin), 0x004E4942) + bytes(self.bin))


def baue(name, datei):
    j, b = lies_glb(QUELLE / datei)
    knoten = next(k for k in j['nodes'] if 'mesh' in k)
    m = knoten_matrix(knoten)
    w = GlbSchreiber()
    hat_laub = False
    dreiecke = 0
    alle = []
    for pr in j['meshes'][knoten['mesh']]['primitives']:
        a = pr['attributes']
        pos = accessor(j, b, a['POSITION'])
        pos = (np.c_[pos, np.ones(len(pos))] @ m.T)[:, :3]
        nor = accessor(j, b, a['NORMAL']) @ m[:3, :3].T
        nor /= np.maximum(np.linalg.norm(nor, axis=1, keepdims=True), 1e-6)
        uv = accessor(j, b, a['TEXCOORD_0'])
        idx = accessor(j, b, pr['indices']).reshape(-1)
        vfarbe = accessor(j, b, a['COLOR_0'])[:, :3] if 'COLOR_0' in a else np.ones((len(pos), 3), np.float32)
        mat = j['materials'][pr['material']]
        tex = mat['pbrMetallicRoughness']['baseColorTexture']['index']
        img = bild(j, b, j['textures'][tex]['source'])
        dreiecke += len(idx) // 3
        alle.append(pos)
        if mat.get('alphaMode', 'OPAQUE') == 'OPAQUE':
            # Rinde: Texturfarbe je Vertex (leicht geglättet: kleines Vorschaubild) × eingebackene Verschattung
            klein = np.asarray(img.convert('RGB').resize((64, 64), Image.BOX), dtype=np.float32) / 255
            # glTF-UV: v=0 oben → Bildzeile = v
            px = klein[np.clip(((uv[:, 1] % 1) * 64).astype(int), 0, 63), np.clip(((uv[:, 0] % 1) * 64).astype(int), 0, 63)]
            w.primitiv(pos, nor, idx, linear(px) * vfarbe, material=0)
        else:
            hat_laub = True
            # Eingebackene Verschattung: Laub nah am Stamm und unten dunkler, Spitzen außen/oben heller → Tiefe auch von oben
            r = np.hypot(pos[:, 0], pos[:, 2])
            aussen = r / max(r.max(), 1e-6)
            oben = (pos[:, 1] - pos[:, 1].min()) / max(np.ptp(pos[:, 1]), 1e-6)
            ao = (0.45 + 0.55 * aussen ** 0.8) * (0.8 + 0.2 * oben)
            w.primitiv(pos, nor, idx, vfarbe * ao[:, None], uv=uv, material=1)
            png = laub_textur(img)
    w.j['materials'].append({'name': 'rinde', 'pbrMetallicRoughness': {'metallicFactor': 0, 'roughnessFactor': 1}})
    if hat_laub:
        w.j['images'] = [{'bufferView': w.view(png), 'mimeType': 'image/png'}]
        w.j['samplers'] = [{'magFilter': 9729, 'minFilter': 9987}]
        w.j['textures'] = [{'source': 0, 'sampler': 0}]
        w.j['materials'].append({'name': 'laub', 'alphaMode': 'MASK', 'alphaCutoff': 0.5, 'doubleSided': True,
                                 'pbrMetallicRoughness': {'baseColorTexture': {'index': 0}, 'metallicFactor': 0, 'roughnessFactor': 1}})
    ziel = ZIEL / f'{name}.glb'
    w.schreibe(ziel)
    p = np.concatenate(alle)
    return {'datei': f'{name}.glb', 'quelle': datei, 'hoehe': round(float(p[:, 1].max()), 3),
            'breite': round(float(max(np.ptp(p[:, 0]), np.ptp(p[:, 2]))), 3), 'dreiecke': dreiecke, 'laub': hat_laub, 'bytes': ziel.stat().st_size}


if __name__ == '__main__':
    ZIEL.mkdir(parents=True, exist_ok=True)
    index = {}
    for name, datei in BAEUME.items():
        index[name] = baue(name, datei)
        print(name, index[name])
    (ZIEL / 'baeume.json').write_text(json.dumps(index, indent=1, ensure_ascii=False) + '\n')
