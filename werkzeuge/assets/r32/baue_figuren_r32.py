"""⚠ ERSETZT durch werkzeuge/assets/r44/baue_figuren_r44.py (Runde 44: volle Textur, Normalen, Bone-Heat-Gewichte, A-Pose-Fix).

Runde 32: Spielerfiguren aus „Characters_ Extras“ (Elbolilloduro, Sketchfab, CC-BY) auf das Skelett der Spielfigur riggen.

Die Quellfiguren sind statisch (A-Pose, Textur). Sie bekommen das Skelett von client/assets/3d/figur_mann.glb (Quaternius
„Adventurer“, 62 Knochen) – die Animationen (stehen/laufen/hacken/sterben …) kommen zur Laufzeit aus figur_mann.glb (gleiche
Knochennamen), die Figur-GLBs enthalten nur Skelett + Mesh + Textur.

Vorgehen je Figur: Höhe auf FIGUR_H (1,75 m), Blick +z, Füße auf y = 0 → Skelett in A-Pose bringen (Oberarme so gedreht, dass
Schulter→Fingerspitze zur Figur passt) → Gewichte nach Abstand zu den Knochenstrecken (max. 2 Knochen, Seiten getrennt) →
inverseBindMatrices = Inverse der A-Pose-Weltmatrizen (die Animationen setzen absolute Knochenrotationen → passt).

Aufruf: python -I werkzeuge/assets/r32/baue_figuren_r32.py   → client/assets/3d/figuren/<id>.glb + figuren.json
"""
import sys, os, json, struct, io
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import numpy as np
from PIL import Image
from scipy.spatial.transform import Rotation as R
import modellwerk as mw

WURZEL = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))
VORLAGE = os.path.join(WURZEL, 'client', 'assets', '3d', 'figur_mann.glb')
QUELLE = os.path.join(WURZEL, 'verteilen bitte', '_sketchfab', 'f2b0b976ecdd47b49254b512c7f152b3.glb')
ZIEL = os.path.join(WURZEL, 'client', 'assets', '3d', 'figuren')
FIGUR_H = 1.75


def lese_glb(pfad):
    b = open(pfad, 'rb').read()
    n = struct.unpack('<I', b[12:16])[0]
    return json.loads(b[20:20 + n]), b[20 + n + 8:]


def trs(nd):
    t = nd.get('translation', [0, 0, 0]); r = nd.get('rotation', [0, 0, 0, 1]); s = nd.get('scale', [1, 1, 1])
    m = np.eye(4); m[:3, :3] = R.from_quat(r).as_matrix() * np.array(s); m[:3, 3] = t
    return m


g, _ = lese_glb(VORLAGE)
knoten = g['nodes']
eltern = {c: i for i, nd in enumerate(knoten) for c in nd.get('children', [])}


def welt(i):
    m = trs(knoten[i])
    while i in eltern:
        i = eltern[i]
        m = trs(knoten[i]) @ m
    return m


GELENKE = g['skins'][0]['joints']
NAME = {knoten[j]['name']: j for j in GELENKE}
W0 = {j: welt(j) for j in GELENKE}
POS0 = {j: W0[j][:3, 3] for j in GELENKE}
ARMATUR = eltern[NAME['Root']]


def unterbaum(j):
    aus = [j]
    for c in knoten[j].get('children', []):
        if c in NAME.values():
            aus += unterbaum(c)
    return aus


def rot_zwischen(a, b):
    a = a / np.linalg.norm(a); b = b / np.linalg.norm(b)
    achse = np.cross(a, b); s = np.linalg.norm(achse); c = np.dot(a, b)
    if s < 1e-8:
        return np.eye(3)
    return R.from_rotvec(achse / s * np.arctan2(s, c)).as_matrix()


# Knochenstrecken (Name, Start, Ende) für die Gewichte
def strecken(P):
    p = lambda n: P[NAME[n]]
    st = [('Hips', p('Hips'), p('Abdomen')), ('Abdomen', p('Abdomen'), p('Torso')), ('Torso', p('Torso'), p('Chest')),
          ('Chest', p('Chest'), p('Neck')), ('Neck', p('Neck'), p('Head')), ('Head', p('Head'), p('Head') + np.array([0, 0.28, 0]))]
    for s in 'LR':
        st += [(f'Shoulder.{s}', p(f'Shoulder.{s}'), p(f'UpperArm.{s}')), (f'UpperArm.{s}', p(f'UpperArm.{s}'), p(f'LowerArm.{s}')),
               (f'LowerArm.{s}', p(f'LowerArm.{s}'), p(f'Wrist.{s}')), (f'Wrist.{s}', p(f'Wrist.{s}'), p(f'Middle4.{s}')),
               (f'UpperLeg.{s}', p(f'UpperLeg.{s}'), p(f'LowerLeg.{s}')), (f'LowerLeg.{s}', p(f'LowerLeg.{s}'), p(f'Foot.{s}')),
               (f'Foot.{s}', p(f'Foot.{s}'), p(f'Foot.{s}') + np.array([0, -0.01, 0.16]))]
    return st


def abstand_strecke(v, a, b):
    ab = b - a
    t = np.clip(((v - a) @ ab) / max(ab @ ab, 1e-12), 0, 1)
    return np.linalg.norm(v - (a + t[:, None] * ab), axis=1)


def rigge(t, kennung):
    v = t['v'].copy(); f = t['f']; fuv = t['fuv']
    # Höhe, Boden, Mitte
    v = v - np.array([(v[:, 0].min() + v[:, 0].max()) / 2, v[:, 1].min(), (v[:, 2].min() + v[:, 2].max()) / 2])
    v *= FIGUR_H / np.ptp(v[:, 1])
    # Arme (A-Pose) liegen quer zur Blickrichtung → breite Achse auf x drehen
    if np.ptp(v[:, 2]) > np.ptp(v[:, 0]):
        v = np.stack([v[:, 2], v[:, 1], -v[:, 0]], 1)
    # Blick +z: Zehen zeigen nach vorn (Fußsohle-Punkte liegen vor dem Knöchel)
    sohle = v[v[:, 1] < 0.04]; knoechel = v[(v[:, 1] > 0.08) & (v[:, 1] < 0.12)]
    if len(sohle) and len(knoechel) and sohle[:, 2].mean() < knoechel[:, 2].mean():
        v = v * np.array([-1, 1, -1])
    # Becken der Vorlage auf die Figur (x/z) – Figur bleibt, Skelett steht mittig
    # A-Pose: Oberarm je Seite drehen, bis Schulter→Fingerspitze zur Figur passt
    P = dict(POS0); W = dict(W0)
    for s, zeichen in (('L', 1), ('R', -1)):
        ua = NAME[f'UpperArm.{s}']; spitze0 = POS0[NAME[f'Middle4.{s}']]
        schulter = POS0[ua]
        seite = v[(v[:, 0] * zeichen > 0.18) & (v[:, 1] < schulter[1])]
        if not len(seite):
            continue
        spitze = seite[np.argmax(np.linalg.norm(seite - schulter, axis=1))]
        q = rot_zwischen(spitze0 - schulter, spitze - schulter)
        M = np.eye(4); M[:3, :3] = q; M[:3, 3] = schulter - q @ schulter
        for j in unterbaum(ua):
            W[j] = M @ W0[j]; P[j] = W[j][:3, 3]
    # Gewichte: 2 nächste Knochenstrecken, Seiten getrennt (rechts/links nicht über die Mitte binden)
    st = strecken(P)
    d = np.stack([abstand_strecke(v, a, b) for _, a, b in st], 1)
    for k, (n, _, _) in enumerate(st):
        if n.endswith('.L'):
            d[v[:, 0] < -0.03, k] = 1e3
        elif n.endswith('.R'):
            d[v[:, 0] > 0.03, k] = 1e3
    # Beine nicht über der Hüfte, Arme nicht unterhalb der Hand-Höhe am Rumpf vorbei: weicher Aufschlag reicht hier
    ordnung = np.argsort(d, axis=1)[:, :2]
    d2 = np.take_along_axis(d, ordnung, 1)
    w = 1 / (d2 + 0.01) ** 4
    w /= w.sum(1, keepdims=True)
    joints = np.array([[NAME[st[k][0]] for k in reihe] for reihe in ordnung])
    jidx = {j: i for i, j in enumerate(GELENKE)}
    ji = np.vectorize(jidx.get)(joints)
    return v, f, fuv, ji, w, W


def schreibe_figur(pfad, v, f, fuv, ji, w, W, bild):
    # Vertexweise UVs: Quelle hat UV je Vertex (trimesh) → aus fuv zurückgewinnen
    uv = np.zeros((len(v), 2))
    uv[f.reshape(-1)] = fuv.reshape(-1, 2)
    uv[:, 1] = 1 - uv[:, 1]
    puffer = bytearray(); views = []; accs = []

    def add(arr, comp, typ, ziel=34962, norm=False, mm=False):
        daten = arr.tobytes(); start = len(puffer); puffer.extend(daten + b'\x00' * ((4 - len(daten) % 4) % 4))
        views.append({'buffer': 0, 'byteOffset': start, 'byteLength': len(daten), **({'target': ziel} if ziel else {})})
        a = {'bufferView': len(views) - 1, 'componentType': comp, 'count': len(arr), 'type': typ}
        if norm: a['normalized'] = True
        if mm: a['min'] = arr.min(0).tolist(); a['max'] = arr.max(0).tolist()
        accs.append(a); return len(accs) - 1
    pos = add(v.astype(np.float32), 5126, 'VEC3', mm=True)
    tex = add(uv.astype(np.float32), 5126, 'VEC2')
    j4 = np.zeros((len(v), 4), np.uint8); j4[:, :2] = ji
    w4 = np.zeros((len(v), 4), np.float32); w4[:, :2] = w
    jo = add(j4, 5121, 'VEC4'); we = add(w4, 5126, 'VEC4')
    idx = add(f.astype(np.uint16 if len(v) < 65535 else np.uint32).reshape(-1), 5123 if len(v) < 65535 else 5125, 'SCALAR', 34963)
    ibm = np.stack([np.linalg.inv(W[j]).T.reshape(-1) for j in GELENKE]).astype(np.float32)  # spaltenweise
    ibm_a = add(ibm, 5126, 'MAT4', ziel=None)
    daten, mime = mw.bild_bytes(bild.convert('RGB'), 256, 'JPEG')
    bv_start = len(puffer); puffer.extend(daten + b'\x00' * ((4 - len(daten) % 4) % 4))
    views.append({'buffer': 0, 'byteOffset': bv_start, 'byteLength': len(daten)})
    # Knoten: Armatur (wie Vorlage) + Gelenke (TRS der Vorlage) + Mesh
    alt_neu = {}
    neue = []
    def kopiere(i):
        nd = {k: knoten[i][k] for k in ('name', 'translation', 'rotation', 'scale') if k in knoten[i]}
        alt_neu[i] = len(neue); neue.append(nd)
        kinder = [c for c in knoten[i].get('children', []) if c in GELENKE]
        nd['children'] = [kopiere(c) for c in kinder]
        if not nd['children']: del nd['children']
        return alt_neu[i]
    arm = {k: knoten[ARMATUR][k] for k in ('name', 'translation', 'rotation', 'scale') if k in knoten[ARMATUR]}
    neue.append(arm)
    arm['children'] = [kopiere(NAME['Root'])]
    neue.append({'name': 'Figur', 'mesh': 0, 'skin': 0})
    gl = {'asset': {'version': '2.0', 'generator': 'browser_survival r32 figuren'}, 'scene': 0,
          'scenes': [{'nodes': [0, len(neue) - 1]}], 'nodes': neue,
          'meshes': [{'name': 'Figur', 'primitives': [{'attributes': {'POSITION': pos, 'TEXCOORD_0': tex, 'JOINTS_0': jo, 'WEIGHTS_0': we}, 'indices': idx, 'material': 0}]}],
          'skins': [{'joints': [alt_neu[j] for j in GELENKE], 'inverseBindMatrices': ibm_a, 'skeleton': alt_neu[NAME['Root']]}],
          'materials': [{'name': 'Figur', 'pbrMetallicRoughness': {'baseColorTexture': {'index': 0}, 'metallicFactor': 0, 'roughnessFactor': 0.85}}],
          'images': [{'bufferView': len(views) - 1, 'mimeType': mime}], 'textures': [{'source': 0, 'sampler': 0}],
          'samplers': [{'magFilter': 9729, 'minFilter': 9987}],
          'accessors': accs, 'bufferViews': views, 'buffers': [{'byteLength': len(puffer)}]}
    js = json.dumps(gl, separators=(',', ':')).encode(); js += b' ' * ((4 - len(js) % 4) % 4)
    with open(pfad, 'wb') as d:
        d.write(struct.pack('<4sII', b'glTF', 2, 12 + 8 + len(js) + 8 + len(puffer)))
        d.write(struct.pack('<I4s', len(js), b'JSON')); d.write(js)
        d.write(struct.pack('<I4s', len(puffer), b'BIN' + bytes(1))); d.write(bytes(puffer))
    return os.path.getsize(pfad)


if __name__ == '__main__':
    os.makedirs(ZIEL, exist_ok=True)
    teile = mw.lade_glb(QUELLE)
    liste = []
    for t in sorted(teile, key=lambda t: t['name']):
        n = t['name']
        if 'Monster' in n or 'Killer' in n:
            continue  # Monster/Killer: keine Spielerfiguren
        mat = t.get('material') or n
        frau = 'Female' in mat
        nummer = ''.join(ch for ch in mat.split('Character_')[-1] if ch.isdigit()) or '0'
        kennung = ('sheriff' + ('_b' if '_01' in n else '')) if 'Sheriff' in n else (('frau_' if frau else 'mann_') + nummer)
        v, f, fuv, ji, w, W = rigge(t, kennung)
        groesse = schreibe_figur(os.path.join(ZIEL, kennung + '.glb'), v, f, fuv, ji, w, W, t['bild'])
        liste.append({'id': kennung, 'datei': kennung + '.glb', 'koerper': 'frau' if frau else 'mann', 'quelle': n, 'bytes': groesse})
        print(kennung, len(v), 'Vertices', groesse // 1024, 'KB')
    with open(os.path.join(ZIEL, 'figuren.json'), 'w', encoding='utf-8') as d:
        json.dump(liste, d, indent=1)
        d.write('\n')
