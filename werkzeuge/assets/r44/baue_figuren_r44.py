"""Runde 44: Spielerfiguren aus „Characters_ Extras“ (Elbolilloduro, Sketchfab, CC-BY) NEU gerigged – ersetzt r32/baue_figuren_r32.py.

Was vorher schlecht war (r32): Textur auf 256 px JPEG verkleinert, keine Normalen (flach), Gewichte = 2 nächste Knochenstrecken
(Gummi-Arme, Rumpf zog am Arm). Jetzt:
- Original-Textur unverändert (512 px PNG), Original-Normalen (mitgedreht), Material matt (Metall 0, Rauheit 0,85).
- Gewichte per Blender „Automatic Weights“ (Bone Heat, bis 4 Knochen je Vertex) auf einer verschweißten Kopie des Meshes,
  danach je Original-Vertex übernommen (UV-Nähte bekommen gleiche Gewichte → keine Risse). Fällt Bone Heat für Vertices aus,
  gilt die alte Abstandsformel als Rückfall.
- Skelett + Animationen wie vorher: Knoten/TRS von client/assets/3d/figur_mann.glb (Quaternius „Adventurer“), Oberarme in die
  A-Pose der Quelle gedreht, inverseBindMatrices = Inverse der A-Pose → Laufzeit-Clips (stehen/laufen/rennen/hacken/sitzen/zielen …)
  kommen weiter aus figur_mann.glb (gleiche Knochennamen) – also 1:1 dieselben Animationen wie die Standardfiguren.

Aufruf (Blender 5.x, Python mit numpy):
  "C:/Program Files/Blender Foundation/Blender 5.2/blender.exe" -b --factory-startup --python werkzeuge/assets/r44/baue_figuren_r44.py -- <quelle.glb>
  → client/assets/3d/figuren/<id>.glb + figuren.json
"""
import sys, os, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import numpy as np
import glbwerk as gw

WURZEL = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))
VORLAGE = os.path.join(WURZEL, 'client', 'assets', '3d', 'figur_mann.glb')
ZIEL = os.path.join(WURZEL, 'client', 'assets', '3d', 'figuren')
FIGUR_H = 1.75

g, _ = gw.lese_glb(VORLAGE)
knoten = g['nodes']
eltern = gw.eltern_von(g)
GELENKE = g['skins'][0]['joints']
NAME = {knoten[j]['name']: j for j in GELENKE}
W0 = {j: gw.weltmatrix(g, j, eltern) for j in GELENKE}
POS0 = {j: W0[j][:3, 3] for j in GELENKE}
ARMATUR = eltern[NAME['Root']]


def unterbaum(j):
    aus = [j]
    for c in knoten[j].get('children', []):
        if c in NAME.values():
            aus += unterbaum(c)
    return aus


def strecken(P):
    """Verformende Knochenstrecken (Name, Start, Ende, Eltern) – nur diese bekommen Gewichte."""
    p = lambda n: P[NAME[n]]
    st = [('Hips', p('Hips'), p('Abdomen'), None), ('Abdomen', p('Abdomen'), p('Torso'), 'Hips'), ('Torso', p('Torso'), p('Chest'), 'Abdomen'),
          ('Chest', p('Chest'), p('Neck'), 'Torso'), ('Neck', p('Neck'), p('Head'), 'Chest'), ('Head', p('Head'), p('Head') + np.array([0, 0.28, 0]), 'Neck')]
    for s in 'LR':
        st += [(f'Shoulder.{s}', p(f'Shoulder.{s}'), p(f'UpperArm.{s}'), 'Chest'), (f'UpperArm.{s}', p(f'UpperArm.{s}'), p(f'LowerArm.{s}'), f'Shoulder.{s}'),
               (f'LowerArm.{s}', p(f'LowerArm.{s}'), p(f'Wrist.{s}'), f'UpperArm.{s}'), (f'Wrist.{s}', p(f'Wrist.{s}'), p(f'Middle4.{s}'), f'LowerArm.{s}'),
               (f'UpperLeg.{s}', p(f'UpperLeg.{s}'), p(f'LowerLeg.{s}'), 'Hips'), (f'LowerLeg.{s}', p(f'LowerLeg.{s}'), p(f'Foot.{s}'), f'UpperLeg.{s}'),
               (f'Foot.{s}', p(f'Foot.{s}'), p(f'Foot.{s}') + np.array([0, -0.01, 0.16]), f'LowerLeg.{s}')]
    return st


def abstand_strecke(v, a, b):
    ab = b - a
    t = np.clip(((v - a) @ ab) / max(ab @ ab, 1e-12), 0, 1)
    return np.linalg.norm(v - (a + t[:, None] * ab), axis=1)


def normiere(v, n):
    """Höhe FIGUR_H, Füße y=0, Mitte x/z=0, Arme quer (x), Blick +z – Normalen werden mitgedreht."""
    v = v - np.array([(v[:, 0].min() + v[:, 0].max()) / 2, v[:, 1].min(), (v[:, 2].min() + v[:, 2].max()) / 2])
    v = v * (FIGUR_H / np.ptp(v[:, 1]))
    D = np.eye(3)
    if np.ptp(v[:, 2]) > np.ptp(v[:, 0]):
        D = np.array([[0, 0, 1], [0, 1, 0], [-1, 0, 0]], float)
        v = v @ D.T
    sohle = v[v[:, 1] < 0.04]; knoechel = v[(v[:, 1] > 0.08) & (v[:, 1] < 0.12)]
    if len(sohle) and len(knoechel) and sohle[:, 2].mean() < knoechel[:, 2].mean():
        F = np.diag([-1.0, 1, -1]); v = v @ F.T; D = F @ D
    return v, (n @ D.T if n is not None else None)


def a_pose(v):
    P = dict(POS0); W = dict(W0)
    for s, zeichen in (('L', 1), ('R', -1)):
        ua = NAME[f'UpperArm.{s}']; spitze0 = POS0[NAME[f'Middle4.{s}']]
        schulter = POS0[ua]
        seite = v[(v[:, 0] * zeichen > 0.18) & (v[:, 1] < schulter[1]) & (v[:, 1] > 0.6)]
        if not len(seite):
            continue
        # Fingerspitze = seitlich äußerster Punkt (r32 nahm den weitesten Punkt → oft Mantelsaum/Hüfte → Arm-Knochen senkrecht,
        # Arme blieben im Spiel steif in A-Pose)
        spitze = seite[np.argmax(seite[:, 0] * zeichen)]
        q = gw.rot_zwischen(spitze0 - schulter, spitze - schulter)
        M = np.eye(4); M[:3, :3] = q; M[:3, 3] = schulter - q @ schulter
        for j in unterbaum(ua):
            W[j] = M @ W0[j]; P[j] = W[j][:3, 3]
    return P, W


def abstands_gewichte(v, st):
    d = np.stack([abstand_strecke(v, a, b) for _, a, b, _ in st], 1)
    for k, (n, _, _, _) in enumerate(st):
        if n.endswith('.L'):
            d[v[:, 0] < -0.03, k] = 1e3
        elif n.endswith('.R'):
            d[v[:, 0] > 0.03, k] = 1e3
    w = 1 / (d + 0.01) ** 4
    return w / w.sum(1, keepdims=True)


def bone_heat(v, f, st):
    """Blender Automatic Weights auf verschweißter Kopie → Gewichtsmatrix (len(v) × len(st)); Zeilen ohne Gewicht = 0."""
    import bpy
    schluessel = np.round(v / 1e-5).astype(np.int64)
    _, ersten, abbild = np.unique(schluessel, axis=0, return_index=True, return_inverse=True)
    abbild = abbild.reshape(-1)
    vm = v[ersten]; fm = abbild[f]
    fm = fm[(fm[:, 0] != fm[:, 1]) & (fm[:, 1] != fm[:, 2]) & (fm[:, 0] != fm[:, 2])]
    for o in list(bpy.data.objects):
        bpy.data.objects.remove(o, do_unlink=True)
    me = bpy.data.meshes.new('figur')
    me.from_pydata(vm.tolist(), [], fm.tolist())
    me.validate(); me.update()
    ob = bpy.data.objects.new('figur', me)
    arm_d = bpy.data.armatures.new('skelett')
    arm = bpy.data.objects.new('skelett', arm_d)
    sz = bpy.context.scene.collection
    sz.objects.link(ob); sz.objects.link(arm)
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.mode_set(mode='EDIT')
    for name, a, b, eltern_name in st:
        kn = arm_d.edit_bones.new(name)
        kn.head = a.tolist(); kn.tail = b.tolist()
        if eltern_name:
            kn.parent = arm_d.edit_bones[eltern_name]
    bpy.ops.object.mode_set(mode='OBJECT')
    bpy.ops.object.select_all(action='DESELECT')
    ob.select_set(True); arm.select_set(True)
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.parent_set(type='ARMATURE_AUTO')
    wm = np.zeros((len(vm), len(st)))
    index = {name: k for k, (name, *_r) in enumerate(st)}
    gruppen = {vg.index: index.get(vg.name) for vg in ob.vertex_groups}
    for vx in me.vertices:
        for ge in vx.groups:
            k = gruppen.get(ge.group)
            if k is not None:
                wm[vx.index, k] = ge.weight
    return wm[abbild]


def rigge(t):
    v, n = normiere(t['v'], t['n'])
    P, W = a_pose(v)
    st = strecken(P)
    w = bone_heat(v, t['f'], st)
    leer = w.sum(1) < 1e-6
    rueck = abstands_gewichte(v, st)
    w[leer] = rueck[leer]
    # bis 4 Einflüsse, normiert
    ordnung = np.argsort(-w, axis=1)[:, :4]
    w4 = np.take_along_axis(w, ordnung, 1)
    w4[w4 < 0.02] = 0
    w4 /= np.maximum(w4.sum(1, keepdims=True), 1e-9)
    jidx = {j: i for i, j in enumerate(GELENKE)}
    ji = np.vectorize(lambda k: jidx[NAME[st[k][0]]])(ordnung)
    ji[w4 == 0] = 0
    return v, n, ji, w4, W, int(leer.sum())


def schreibe_figur(pfad, t, v, n, ji, w, W):
    pu = gw.Puffer()
    uv = t['uv']
    pos = pu.add(v.astype(np.float32), 5126, 'VEC3', mm=True)
    attr = {'POSITION': pos}
    if n is not None:
        attr['NORMAL'] = pu.add(n.astype(np.float32), 5126, 'VEC3')
    attr['TEXCOORD_0'] = pu.add(uv.astype(np.float32), 5126, 'VEC2')
    attr['JOINTS_0'] = pu.add(ji.astype(np.uint8), 5121, 'VEC4')
    attr['WEIGHTS_0'] = pu.add(w.astype(np.float32), 5126, 'VEC4')
    gross = len(v) >= 65535
    idx = pu.add(t['f'].astype(np.uint32 if gross else np.uint16).reshape(-1), 5125 if gross else 5123, 'SCALAR', 34963)
    ibm = np.stack([np.linalg.inv(W[j]).T.reshape(-1) for j in GELENKE]).astype(np.float32)
    ibm_a = pu.add(ibm, 5126, 'MAT4', ziel=None)
    bild_view = pu.roh(t['bild'])
    alt_neu = {}; neue = []

    def kopiere(i):
        nd = {k: knoten[i][k] for k in ('name', 'translation', 'rotation', 'scale') if k in knoten[i]}
        alt_neu[i] = len(neue); neue.append(nd)
        kinder = [c for c in knoten[i].get('children', []) if c in GELENKE]
        nd['children'] = [kopiere(c) for c in kinder]
        if not nd['children']:
            del nd['children']
        return alt_neu[i]
    arm = {k: knoten[ARMATUR][k] for k in ('name', 'translation', 'rotation', 'scale') if k in knoten[ARMATUR]}
    neue.append(arm)
    arm['children'] = [kopiere(NAME['Root'])]
    neue.append({'name': 'Figur', 'mesh': 0, 'skin': 0})
    gl = {'asset': {'version': '2.0', 'generator': 'browser_survival r44 figuren'}, 'scene': 0,
          'scenes': [{'nodes': [0, len(neue) - 1]}], 'nodes': neue,
          'meshes': [{'name': 'Figur', 'primitives': [{'attributes': attr, 'indices': idx, 'material': 0}]}],
          'skins': [{'joints': [alt_neu[j] for j in GELENKE], 'inverseBindMatrices': ibm_a, 'skeleton': alt_neu[NAME['Root']]}],
          'materials': [{'name': 'Figur', 'pbrMetallicRoughness': {'baseColorTexture': {'index': 0}, 'metallicFactor': 0, 'roughnessFactor': 0.85}}],
          'images': [{'bufferView': bild_view, 'mimeType': t['mime']}], 'textures': [{'source': 0, 'sampler': 0}],
          'samplers': [{'magFilter': 9729, 'minFilter': 9987}]}
    gw.schreibe_glb(pfad, gl, pu)
    return os.path.getsize(pfad)


if __name__ == '__main__':
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    quelle = argv[0] if argv else os.path.join(WURZEL, '!!!verteilen', 'characters__extras.glb')
    os.makedirs(ZIEL, exist_ok=True)
    gq, bq = gw.lese_glb(quelle)
    liste = []
    for t in sorted(gw.mesh_teile(gq, bq), key=lambda t: t['knoten']):
        n = t['knoten']; mat = t['material'] or n
        if 'Monster' in mat or 'Killer' in mat:
            continue  # Monster/Killer: keine Spielerfiguren
        frau = 'Female' in mat
        nummer = ''.join(ch for ch in mat.split('Character_')[-1] if ch.isdigit()) or '0'
        kennung = ('sheriff' + ('_b' if '_01' in mat else '')) if 'Sheriff' in mat else (('frau_' if frau else 'mann_') + nummer)
        v, nrm, ji, w, W, leer = rigge(t)
        groesse = schreibe_figur(os.path.join(ZIEL, kennung + '.glb'), t, v, nrm, ji, w, W)
        liste.append({'id': kennung, 'datei': kennung + '.glb', 'koerper': 'frau' if frau else 'mann', 'quelle': n, 'bytes': groesse})
        print('FIGUR', kennung, len(v), 'Vertices', groesse // 1024, 'KB', 'ohne Heat:', leer)
    liste.sort(key=lambda e: e['id'])
    with open(os.path.join(ZIEL, 'figuren.json'), 'w', encoding='utf-8') as d:
        json.dump(liste, d, indent=1)
        d.write('\n')
