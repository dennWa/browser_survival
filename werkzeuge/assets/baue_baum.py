#!/usr/bin/env python3
"""Wandelt werkzeuge/assets/quellen/tree.glb (Nutzer-Upload, Rig+Animation) in ein statisches Baum-Mesh um:
Ruhepose, Palette-Textur → Vertexfarben, Kronen-Maske (1 = Laub, 0 = Stamm). Schreibt client/assets/3d/baumDaten.js.
Aufruf: python3 werkzeuge/assets/baue_baum.py   (braucht numpy + Pillow)"""
import base64, io, json, struct, pathlib
import numpy as np
from PIL import Image

WURZEL = pathlib.Path(__file__).resolve().parents[2]
QUELLE = WURZEL / 'werkzeuge/assets/quellen/tree.glb'
ZIEL = WURZEL / 'client/assets/3d/baumDaten.js'

d = QUELLE.read_bytes()
jl = struct.unpack('<I', d[12:16])[0]
j = json.loads(d[20:20 + jl])
bin_ = d[20 + jl + 8:]

def lies(i):
    a = j['accessors'][i]; bv = j['bufferViews'][a['bufferView']]
    n = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}[a['type']]
    dt = {5126: '<f4', 5123: '<u2', 5125: '<u4', 5121: 'u1'}[a['componentType']]
    o = bv.get('byteOffset', 0) + a.get('byteOffset', 0)
    return np.frombuffer(bin_, dt, a['count'] * n, o).reshape(a['count'], n)

p = j['meshes'][0]['primitives'][0]['attributes']
pos, nor, uv = lies(p['POSITION']), lies(p['NORMAL']), lies(p['TEXCOORD_0'])
idx = lies(j['meshes'][0]['primitives'][0]['indices']).reshape(-1)
bv = j['bufferViews'][j['images'][0]['bufferView']]
tex = np.asarray(Image.open(io.BytesIO(bin_[bv['byteOffset']:bv['byteOffset'] + bv['byteLength']])).convert('RGB'), dtype=np.float32) / 255
h, w, _ = tex.shape
farbe = tex[np.clip((uv[:, 1] * h).astype(int), 0, h - 1), np.clip((uv[:, 0] * w).astype(int), 0, w - 1)]
maske = (farbe[:, 1] > farbe[:, 0] * 0.95).astype(np.float32)  # grünlich = Laub
srgb = lambda c: np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)  # Vertexfarben sind linear
farbe = srgb(farbe)

# --- Wind-Animationen (Wind_keiner/leicht/mittel/stark) → Vertex-Verschiebung je Frame (Skinning vorberechnet) ---
FRAMES = 16
joints, gew = lies(p['JOINTS_0']).astype(int), lies(p['WEIGHTS_0'])
ibm = lies(j['skins'][0]['inverseBindMatrices']).reshape(-1, 4, 4).transpose(0, 2, 1)  # glTF ist spaltenweise
knoten = j['nodes']
eltern = {c: i for i, n in enumerate(knoten) for c in n.get('children', [])}

def trs(n, t=None, r=None, sk=None):
    t = np.array(t if t is not None else n.get('translation', [0, 0, 0]), float)
    x, y, z, w = r if r is not None else n.get('rotation', [0, 0, 0, 1])
    sk = np.array(sk if sk is not None else n.get('scale', [1, 1, 1]), float)
    R = np.array([[1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
                  [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
                  [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)]])
    m = np.eye(4); m[:3, :3] = R * sk; m[:3, 3] = t
    return m

def slerp(a, b, f):
    a, b = np.array(a, float), np.array(b, float)
    if a @ b < 0: b = -b
    if a @ b > 0.9995:
        q = a + (b - a) * f
    else:
        th = np.arccos(a @ b); q = (np.sin((1 - f) * th) * a + np.sin(f * th) * b) / np.sin(th)
    return q / np.linalg.norm(q)

def kanal(anim, node, pfad, t):
    for c in anim['channels']:
        if c['target']['node'] == node and c['target']['path'] == pfad:
            sm = anim['samplers'][c['sampler']]
            zeit, wert = lies(sm['input'])[:, 0], lies(sm['output'])
            i = min(max(np.searchsorted(zeit, t, side='right') - 1, 0), len(zeit) - 2)
            f = np.clip((t - zeit[i]) / (zeit[i + 1] - zeit[i]), 0, 1)
            return slerp(wert[i], wert[i + 1], f) if pfad == 'rotation' else wert[i] + (wert[i + 1] - wert[i]) * f
    return None

def welt(anim, t):
    cache = {}
    def w(i):
        if i not in cache:
            n = knoten[i]
            lokal = trs(n, kanal(anim, i, 'translation', t), kanal(anim, i, 'rotation', t), kanal(anim, i, 'scale', t))
            cache[i] = (w(eltern[i]) if i in eltern else np.eye(4)) @ lokal
        return cache[i]
    return w

ph = np.c_[pos, np.ones(len(pos))]
def haut(anim, t):
    w = welt(anim, t)
    sk = [w(jn) @ ibm[k] for k, jn in enumerate(j['skins'][0]['joints'])]
    out = np.zeros((len(pos), 3))
    for v in range(len(pos)):
        m = sum(gew[v, k] * sk[joints[v, k]] for k in range(4))
        out[v] = (m @ ph[v])[:3]
    return out

REIHE = ['Wind_keiner', 'Wind_leicht', 'Wind_mittel', 'Wind_stark']
anims = {a['name']: a for a in j['animations']}
ruhe = haut(anims['Wind_keiner'], 0.0)  # Ruhepose = Bindepose (Kontrolle unten)
verschub, perioden = [], []
for name in REIHE:
    a = anims[name]; dauer = max(lies(s['input'])[:, 0].max() for s in a['samplers']); perioden.append(float(dauer))
    for fr in range(FRAMES):
        verschub.append(haut(a, dauer * fr / FRAMES) - pos)
verschub = np.array(verschub)  # [4*FRAMES, Vertices, 3]
grenze = float(np.abs(verschub).max())
quant = np.round(verschub / grenze * 32767).astype(np.int16)
print('Bindepose-Abweichung', float(np.abs(ruhe - pos).max()), 'max Verschub je Stufe', [round(float(np.abs(verschub[i * FRAMES:(i + 1) * FRAMES]).max()), 2) for i in range(4)])

# Stammfuß auf den Ursprung (x/z), Fuß auf y = 0
fuss = pos[:, 1] < 5
pos = pos - np.array([pos[fuss, 0].mean(), pos[:, 1].min(), pos[fuss, 2].mean()], dtype=np.float32)

def b64(a, dt): return base64.b64encode(np.ascontiguousarray(a, dt).tobytes()).decode()
inhalt = f"""// GENERIERT von werkzeuge/assets/baue_baum.py aus quellen/tree.glb – nicht von Hand ändern.
// Ruhepose des Baums: Position/Normale/Farbe (linear)/Kronen-Maske als Float32-Base64, Indizes Uint16.
export const BAUM_DATEN = {{
  hoehe: {float(pos[:, 1].max()):.2f},
  breite: {float(max(pos[:, 0].max() - pos[:, 0].min(), pos[:, 2].max() - pos[:, 2].min())):.2f},
  position: '{b64(pos, '<f4')}',
  normale: '{b64(nor, '<f4')}',
  farbe: '{b64(farbe, '<f4')}',
  maske: '{b64(maske, '<f4')}',
  index: '{b64(idx, '<u2')}',
  // Wind: Reihen = Stufe*{FRAMES}+Frame (Stufen keiner/leicht/mittel/stark), Spalten = Vertex, je xyz Int16 × windGrenze; Rohmaße (vor Maßstab)
  windFrames: {FRAMES},
  windPerioden: {json.dumps([round(x, 3) for x in perioden])},
  windGrenze: {grenze:.5f},
  wind: '{b64(quant.transpose(0, 1, 2).reshape(-1), '<i2')}',
}};
"""
ZIEL.write_text(inhalt)
print('Vertices', len(pos), 'Dreiecke', len(idx) // 3, 'Höhe', pos[:, 1].max(), 'x', pos[:, 0].min(), pos[:, 0].max(), 'z', pos[:, 2].min(), pos[:, 2].max(), 'Laub', int(maske.sum()))
