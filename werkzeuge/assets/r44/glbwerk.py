"""Runde 44: kleines glTF/GLB-Lese-/Schreibwerkzeug nur mit numpy (läuft auch in Blenders Python – dort gibt es weder trimesh
noch scipy). Wird von baue_figuren_r44.py und baue_skelett_r44.py benutzt.

- lese_glb(pfad)            -> (json, bin)
- accessor(g, bin, i)       -> numpy-Array (normalisierte Ganzzahlen werden zu float)
- trs(knoten) / weltmatrizen(g) -> 4×4-Matrizen (Spaltenvektoren, wie glTF)
- mesh_teile(g, bin)        -> Liste {knoten, name, material, v, n, uv, f, bild (Bytes), mime}
- schreibe_glb(pfad, json, puffer)
"""
import json, struct
import numpy as np

KOMPONENTEN = {5120: np.int8, 5121: np.uint8, 5122: np.int16, 5123: np.uint16, 5125: np.uint32, 5126: np.float32}
ANZAHL = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}


def lese_glb(pfad):
    b = open(pfad, 'rb').read()
    n = struct.unpack('<I', b[12:16])[0]
    return json.loads(b[20:20 + n]), b[20 + n + 8:]


def accessor(g, binaer, i):
    a = g['accessors'][i]
    bv = g['bufferViews'][a['bufferView']]
    typ = KOMPONENTEN[a['componentType']]
    k = ANZAHL[a['type']]
    start = bv.get('byteOffset', 0) + a.get('byteOffset', 0)
    schritt = bv.get('byteStride', 0) or np.dtype(typ).itemsize * k
    roh = np.frombuffer(binaer, np.uint8, count=schritt * (a['count'] - 1) + np.dtype(typ).itemsize * k, offset=start)
    arr = np.lib.stride_tricks.as_strided(roh.view(np.uint8), shape=(a['count'], np.dtype(typ).itemsize * k), strides=(schritt, 1))
    arr = np.ascontiguousarray(arr).view(typ).reshape(a['count'], k)
    if a.get('normalized'):
        arr = arr.astype(np.float64) / np.iinfo(typ).max
    return arr if k > 1 else arr[:, 0]


def quat_matrix(q):
    x, y, z, w = q
    return np.array([[1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
                     [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
                     [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)]])


def drehvektor_matrix(achse, winkel):
    achse = np.asarray(achse, float)
    achse = achse / np.linalg.norm(achse)
    K = np.array([[0, -achse[2], achse[1]], [achse[2], 0, -achse[0]], [-achse[1], achse[0], 0]])
    return np.eye(3) + np.sin(winkel) * K + (1 - np.cos(winkel)) * K @ K


def rot_zwischen(a, b):
    a = a / np.linalg.norm(a); b = b / np.linalg.norm(b)
    achse = np.cross(a, b); s = np.linalg.norm(achse); c = np.dot(a, b)
    if s < 1e-8:
        return np.eye(3)
    return drehvektor_matrix(achse, np.arctan2(s, c))


def trs(nd):
    if 'matrix' in nd:
        return np.array(nd['matrix'], float).reshape(4, 4).T
    t = nd.get('translation', [0, 0, 0]); r = nd.get('rotation', [0, 0, 0, 1]); s = nd.get('scale', [1, 1, 1])
    m = np.eye(4); m[:3, :3] = quat_matrix(r) * np.array(s); m[:3, 3] = t
    return m


def eltern_von(g):
    return {c: i for i, nd in enumerate(g['nodes']) for c in nd.get('children', [])}


def weltmatrix(g, i, eltern=None):
    eltern = eltern if eltern is not None else eltern_von(g)
    m = trs(g['nodes'][i])
    while i in eltern:
        i = eltern[i]
        m = trs(g['nodes'][i]) @ m
    return m


def bild_bytes(g, binaer, textur_index):
    src = g['textures'][textur_index]['source']
    im = g['images'][src]
    bv = g['bufferViews'][im['bufferView']]
    o = bv.get('byteOffset', 0)
    return binaer[o:o + bv['byteLength']], im.get('mimeType', 'image/png')


def mesh_teile(g, binaer):
    """Alle Mesh-Knoten in Weltkoordinaten (Normalen mitgedreht). Ein Teil je Primitive."""
    eltern = eltern_von(g)
    teile = []
    for i, nd in enumerate(g['nodes']):
        if 'mesh' not in nd:
            continue
        M = weltmatrix(g, i, eltern)
        N = np.linalg.inv(M[:3, :3]).T
        mesh = g['meshes'][nd['mesh']]
        for pr in mesh['primitives']:
            at = pr['attributes']
            v = accessor(g, binaer, at['POSITION']).astype(np.float64)
            v = v @ M[:3, :3].T + M[:3, 3]
            n = None
            if 'NORMAL' in at:
                n = accessor(g, binaer, at['NORMAL']).astype(np.float64) @ N.T
                n /= np.maximum(np.linalg.norm(n, axis=1, keepdims=True), 1e-12)
            uv = accessor(g, binaer, at['TEXCOORD_0']).astype(np.float64) if 'TEXCOORD_0' in at else None
            f = accessor(g, binaer, pr['indices']).astype(np.int64).reshape(-1, 3) if 'indices' in pr else np.arange(len(v)).reshape(-1, 3)
            mat = g['materials'][pr['material']] if 'material' in pr else {}
            bild, mime = None, None
            tex = mat.get('pbrMetallicRoughness', {}).get('baseColorTexture')
            if tex is not None:
                bild, mime = bild_bytes(g, binaer, tex['index'])
            teile.append({'knoten': nd.get('name', f'knoten_{i}'), 'name': mesh.get('name'), 'material': mat.get('name'),
                          'mat': mat, 'v': v, 'n': n, 'uv': uv, 'f': f, 'bild': bild, 'mime': mime})
    return teile


class Puffer:
    """Sammelt bufferViews/accessors für ein GLB."""

    def __init__(self):
        self.daten = bytearray(); self.views = []; self.accs = []

    def roh(self, daten):
        start = len(self.daten)
        self.daten.extend(daten + b'\x00' * ((4 - len(daten) % 4) % 4))
        self.views.append({'buffer': 0, 'byteOffset': start, 'byteLength': len(daten)})
        return len(self.views) - 1

    def add(self, arr, comp, typ, ziel=34962, mm=False):
        v = self.roh(np.ascontiguousarray(arr).tobytes())
        if ziel:
            self.views[v]['target'] = ziel
        a = {'bufferView': v, 'componentType': comp, 'count': len(arr), 'type': typ}
        if mm:
            a['min'] = np.asarray(arr).min(0).tolist(); a['max'] = np.asarray(arr).max(0).tolist()
        self.accs.append(a)
        return len(self.accs) - 1


def schreibe_glb(pfad, gl, puffer):
    gl['accessors'] = puffer.accs; gl['bufferViews'] = puffer.views; gl['buffers'] = [{'byteLength': len(puffer.daten)}]
    js = json.dumps(gl, separators=(',', ':')).encode(); js += b' ' * ((4 - len(js) % 4) % 4)
    with open(pfad, 'wb') as d:
        d.write(struct.pack('<4sII', b'glTF', 2, 12 + 8 + len(js) + 8 + len(puffer.daten)))
        d.write(struct.pack('<I4s', len(js), b'JSON')); d.write(js)
        d.write(struct.pack('<I4s', len(puffer.daten), b'BIN\x00')); d.write(bytes(puffer.daten))
