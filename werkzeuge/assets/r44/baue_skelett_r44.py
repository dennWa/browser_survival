"""Runde 44: Skelett-Zombie („ZombieBB“, Sketchfab ssaraksh, CC-BY) → client/assets/3d/zombies/skelett.glb

Quelle: !!!verteilen/model_0.obj (statisch, in einer LAUFPOSE modelliert: linker Arm vor, linkes Bein zurück) + ZombieBB_MAT_*.png (2048²).
Kein Rig, keine Animationen → hier gebaut:
1. Skelett der Spielfigur (figur_mann.glb, Quaternius) per Vorwärtskinematik auf die Pose des Modells gelegt: Gelenk-Landmarken
   (LANDMARKEN, cm im OBJ-Raum, von Hand aus Querschnitten gemessen) → jeder Knochen zeigt auf seinen Kind-Landmark.
   Eigene Knochenlängen (Skelett hat längere Arme als die Spielfigur) → Clips setzen nur Rotationen (+ Root/Body/Hips-Translation).
2. Gewichte: Blender „Automatic Weights“ (Bone Heat) über baue_figuren_r44.bone_heat. Füße hängen am Schienbein (Foot.* ist im
   Quaternius-Rig ein IK-Ziel am Root → würde sich bei anderen Beinlängen lösen).
3. Clips aus figur_mann umgebaut (zombieartig): stehen (gebückt, Schwanken, Kopf zuckt), gehen (langsamer Schlurfgang, Arme nach
   vorn, Hinken), rennen (stark vorgebeugt, Arme vorgestreckt), angriff (Nahkampf + Zupacken), sterben (unverändert).
4. Textur: Albedo × AO auf 1024² JPEG, Normalmap 1024² JPEG (nicht verpixelt, ~0,5 MB).

Aufruf (2 Stufen – Blender-Python hat kein PIL):
  python werkzeuge/assets/r44/baue_skelett_r44.py texturen
  "C:/Program Files/Blender Foundation/Blender 5.2/blender.exe" -b --factory-startup --python werkzeuge/assets/r44/baue_skelett_r44.py -- modell
"""
import sys, os, json, math, tempfile
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import numpy as np
import glbwerk as gw

WURZEL = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))
QUELLE = os.path.join(WURZEL, '!!!verteilen')
VORLAGE = os.path.join(WURZEL, 'client', 'assets', '3d', 'figur_mann.glb')
ZIEL = os.path.join(WURZEL, 'client', 'assets', '3d', 'zombies', 'skelett.glb')
ZWISCHEN = os.path.join(tempfile.gettempdir(), 'bs_skelett_r44')
TEX = 1024

# Landmarken im OBJ-Raum (cm, y oben, Blick +z, +x = linke Körperseite) – aus Querschnitten gemessen (siehe ki/runde44.md)
LANDMARKEN = {
    'Hips': (-3, 86, -6),
    'Abdomen': (-3.5, 95, -8), 'Torso': (-3.5, 111, -5), 'Chest': (0, 128, -7), 'Neck': (-3, 142, -5), 'Head': (-3.5, 149, -2),
    'Head_spitze': (-3.2, 168.8, -4),
    'Shoulder.L': (5, 136, -6), 'UpperArm.L': (13, 135, -6), 'LowerArm.L': (20, 111, 1), 'Wrist.L': (28.5, 99.5, 25), 'Wrist.L_spitze': (30, 90.5, 38),
    'Shoulder.R': (-8, 136, -5), 'UpperArm.R': (-21, 136, -4), 'LowerArm.R': (-27, 105, -8), 'Wrist.R': (-29.5, 80, 1), 'Wrist.R_spitze': (-33, 66, 6),
    'UpperLeg.L': (8, 82, -6), 'LowerLeg.L': (13, 45, -13), 'Fuss.L': (18, 10, -32), 'Zeh.L': (32, 1, -27),
    'UpperLeg.R': (-9, 82, -5), 'LowerLeg.R': (-11, 47, 10), 'Fuss.R': (-9, 9, -6), 'Zeh.R': (-9, 1, 12),
}
# Knochen → Landmark, auf den er zeigen soll (Kind-Gelenk bzw. Spitze)
ZIELE = {'Hips': 'Abdomen', 'Abdomen': 'Torso', 'Torso': 'Chest', 'Chest': 'Neck', 'Neck': 'Head', 'Head': 'Head_spitze'}
for s in 'LR':
    ZIELE.update({f'Shoulder.{s}': f'UpperArm.{s}', f'UpperArm.{s}': f'LowerArm.{s}', f'LowerArm.{s}': f'Wrist.{s}', f'Wrist.{s}': f'Wrist.{s}_spitze',
                  f'UpperLeg.{s}': f'LowerLeg.{s}', f'LowerLeg.{s}': f'Fuss.{s}'})


def texturen():
    from PIL import Image
    os.makedirs(ZWISCHEN, exist_ok=True)
    alb = Image.open(os.path.join(QUELLE, 'ZombieBB_MAT_albedo.png')).convert('RGB').resize((TEX, TEX), Image.LANCZOS)
    ao = Image.open(os.path.join(QUELLE, 'ZombieBB_MAT_AO.png')).convert('L').resize((TEX, TEX), Image.LANCZOS)
    a = np.asarray(alb, np.float32) * (0.35 + 0.65 * np.asarray(ao, np.float32)[..., None] / 255)
    Image.fromarray(np.clip(a, 0, 255).astype(np.uint8)).save(os.path.join(ZWISCHEN, 'albedo.jpg'), quality=86)
    Image.open(os.path.join(QUELLE, 'ZombieBB_MAT_normal.png')).convert('RGB').resize((TEX, TEX), Image.LANCZOS).save(os.path.join(ZWISCHEN, 'normal.jpg'), quality=90)
    print('Texturen →', ZWISCHEN)


def lade_obj(pfad):
    v, vt, vn, ecken = [], [], [], []
    for z in open(pfad, errors='ignore'):
        if z.startswith('v '):
            v.append([float(x) for x in z.split()[1:4]])
        elif z.startswith('vt '):
            vt.append([float(x) for x in z.split()[1:3]])
        elif z.startswith('vn '):
            vn.append([float(x) for x in z.split()[1:4]])
        elif z.startswith('f '):
            p = [tuple(int(t) - 1 if t else -1 for t in (e.split('/') + ['', ''])[:3]) for e in z.split()[1:]]
            for k in range(1, len(p) - 1):
                ecken.append((p[0], p[k], p[k + 1]))
    v, vt, vn = np.array(v), np.array(vt), np.array(vn)
    kombi = {}; f = []
    for dr in ecken:
        f.append([kombi.setdefault(e, len(kombi)) for e in dr])
    k = np.array(list(kombi.keys()))
    return v[k[:, 0]], vt[k[:, 1]], vn[k[:, 2]], np.array(f)


# ---------------------------------------------------------------- Vorlage (Mann-Skelett) im Armatur-Raum
g, gbin = gw.lese_glb(VORLAGE)
knoten = g['nodes']
eltern = gw.eltern_von(g)
GELENKE = g['skins'][0]['joints']
NAME = {knoten[j]['name']: j for j in GELENKE}
ARMATUR = eltern[NAME['Root']]
A = gw.weltmatrix(g, ARMATUR, eltern)
A_inv = np.linalg.inv(A)


def lokal0(j):
    return gw.trs(knoten[j])


def kinder(j):
    return [c for c in knoten[j].get('children', []) if c in GELENKE]


def _mann_ziel(name):
    """Armatur-Raum-Position des Ziel-Gegenstücks in der Mann-Ruhepose (für die Knochenachse)."""
    W = lambda n: A_inv @ gw.weltmatrix(g, NAME[n], eltern)
    if name.endswith('_spitze'):
        basis = name[:-len('_spitze')]
        if basis == 'Head':
            return (A_inv @ (gw.weltmatrix(g, NAME['Head'], eltern) @ np.array([0, 0, 0, 1.0]) + np.array([0, 0.25, 0, 0])))[:3]
        return W('Middle4.' + basis[-1])[:3, 3]
    if name.startswith('Fuss.'):
        return W('Foot.' + name[-1])[:3, 3]
    return W(name)[:3, 3]


def _achsen():
    aus = {}
    for name, ziel in ZIELE.items():
        M0 = A_inv @ gw.weltmatrix(g, NAME[name], eltern)
        d = _mann_ziel(ziel) - M0[:3, 3]
        aus[name] = M0[:3, :3].T @ (d / np.linalg.norm(d))
    return aus


ACHSE0 = _achsen()


def anpassen():
    """Vorwärtskinematik im Armatur-Raum: Knochen auf Landmarken. Liefert lokale (t, R) je Gelenk + Welt-Bindematrizen."""
    hips_welt = gw.weltmatrix(g, NAME['Hips'], eltern)[:3, 3]
    s = hips_welt[1] / (LANDMARKEN['Hips'][1] / 100.0)
    welt = lambda name: (np.array(LANDMARKEN[name]) - np.array(LANDMARKEN['Hips'])) / 100.0 * s + hips_welt  # Szene (m)
    arm = lambda p: (A_inv @ np.append(p, 1))[:3]  # → Armatur-Raum
    lok_t, lok_R, B = {}, {}, {}

    def lauf(j, Rp, pp):
        L = lokal0(j)
        name = knoten[j]['name']
        if name in LANDMARKEN and name not in ('Hips',) and pp is not None:
            p = arm(welt(name))
        else:
            p = (pp if pp is not None else np.zeros(3)) + Rp @ L[:3, 3]
        R = Rp @ L[:3, :3]
        if name in ZIELE:
            achse = ACHSE0[name]
            ziel = arm(welt(ZIELE[name])) - p
            R = gw.rot_zwischen(R @ achse, ziel) @ R
        lok_t[j] = Rp.T @ (p - (pp if pp is not None else np.zeros(3)))
        lok_R[j] = Rp.T @ R
        M = np.eye(4); M[:3, :3] = R; M[:3, 3] = p
        B[j] = A @ M  # Welt (Szene)
        for c in kinder(j):
            lauf(c, R, p)
    wurzel = NAME['Root']
    L = lokal0(wurzel)
    lauf(wurzel, np.eye(3), None)
    lok_t[wurzel] = L[:3, 3]
    return lok_t, lok_R, B, welt


# ---------------------------------------------------------------- Clips
def quat_aus(Rm):
    m = Rm; t = np.trace(m)
    if t > 0:
        s = math.sqrt(t + 1) * 2; return np.array([(m[2, 1] - m[1, 2]) / s, (m[0, 2] - m[2, 0]) / s, (m[1, 0] - m[0, 1]) / s, s / 4])
    i = int(np.argmax(np.diag(m)))
    if i == 0:
        s = math.sqrt(1 + m[0, 0] - m[1, 1] - m[2, 2]) * 2; return np.array([s / 4, (m[0, 1] + m[1, 0]) / s, (m[0, 2] + m[2, 0]) / s, (m[2, 1] - m[1, 2]) / s])
    if i == 1:
        s = math.sqrt(1 + m[1, 1] - m[0, 0] - m[2, 2]) * 2; return np.array([(m[0, 1] + m[1, 0]) / s, s / 4, (m[1, 2] + m[2, 1]) / s, (m[0, 2] - m[2, 0]) / s])
    s = math.sqrt(1 + m[2, 2] - m[0, 0] - m[1, 1]) * 2; return np.array([(m[0, 2] + m[2, 0]) / s, (m[1, 2] + m[2, 1]) / s, s / 4, (m[1, 0] - m[0, 1]) / s])


def slerp(a, b, t):
    d = np.dot(a, b)
    if d < 0:
        b = -b; d = -d
    if d > 0.9995:
        q = a + t * (b - a); return q / np.linalg.norm(q)
    th = math.acos(d)
    return (math.sin((1 - t) * th) * a + math.sin(t * th) * b) / math.sin(th)


def werte(sampler, zeit):
    """Sampler (input, output, interpolation) zu Zeit auswerten."""
    ein, aus, art = sampler
    if art == 'CUBICSPLINE':
        aus = aus.reshape(len(ein), 3, -1)[:, 1]
    if zeit <= ein[0]:
        return aus[0]
    if zeit >= ein[-1]:
        return aus[-1]
    i = int(np.searchsorted(ein, zeit) - 1)
    if art == 'STEP':
        return aus[i]
    t = (zeit - ein[i]) / max(ein[i + 1] - ein[i], 1e-9)
    if aus.shape[1] == 4:
        return slerp(aus[i], aus[i + 1], t)
    return aus[i] * (1 - t) + aus[i + 1] * t


def lies_clip(name):
    a = next(x for x in g['animations'] if x['name'] == name)
    spuren = {}
    dauer = 0
    for ch in a['channels']:
        sm = a['samplers'][ch['sampler']]
        ein = gw.accessor(g, gbin, sm['input']).astype(float)
        aus = gw.accessor(g, gbin, sm['output']).astype(float)
        aus = aus.reshape(len(aus), -1)
        dauer = max(dauer, ein[-1])
        spuren[(ch['target']['node'], ch['target']['path'])] = (ein, aus, sm.get('interpolation', 'LINEAR'))
    return spuren, dauer


def achsen_dreh(achse, grad):
    return gw.drehvektor_matrix(np.array(achse, float), math.radians(grad))


def baue_clips(B, lok_R):
    """Zombie-Clips aus den Mann-Clips. Versatz = Drehung um eine WELT-Achse, im Elternraum (Ruhe-/Bindepose) angewandt."""
    welt_R = {j: B[j][:3, :3] / np.linalg.norm(B[j][:3, 0]) for j in GELENKE}

    def im_eltern(j, Rw):
        p = eltern[j]
        Rp = welt_R[p] if p in welt_R else np.eye(3)
        return Rp.T @ Rw @ Rp

    def versatz(name, achse, grad):
        j = NAME[name]
        return quat_aus(im_eltern(j, achsen_dreh(achse, grad)))

    def qmul(a, b):
        x1, y1, z1, w1 = a; x2, y2, z2, w2 = b
        return np.array([w1 * x2 + x1 * w2 + y1 * z2 - z1 * y2, w1 * y2 - x1 * z2 + y1 * w2 + z1 * x2,
                         w1 * z2 + x1 * y2 - y1 * x2 + z1 * w2, w1 * w2 - x1 * x2 - y1 * y2 - z1 * z2])

    X, Y, Z = (1, 0, 0), (0, 1, 0), (0, 0, 1)
    # (Name, Quelle, Zeitdehnung, Funktion t→ {Knochen: [(achse, grad), …]})
    def stehen_v(t):
        w = math.sin(t * 1.7); z = (math.sin(t * 7.3) * math.sin(t * 2.1)) ** 9  # seltenes Zucken
        return {'Torso': [(X, 14), (Z, 6 * w)], 'Chest': [(X, 10)], 'Neck': [(Z, 18 + 25 * z), (X, 12)], 'Head': [(Z, 12 * math.sin(t * 1.1)), (X, -8)],
                'UpperArm.L': [(X, -35 - 6 * w)], 'UpperArm.R': [(X, -20 + 5 * w)], 'Wrist.L': [(X, 35)], 'Wrist.R': [(X, 35)]}

    def gehen_v(t):
        w = math.sin(t * 2 * math.pi / 1.45)
        return {'Hips': [(Z, 7 * w)], 'Torso': [(X, 24)], 'Chest': [(X, 12), (Z, -5 * w)], 'Neck': [(Z, 26), (X, 10)], 'Head': [(Z, 10 * w)],
                'UpperArm.L': [(X, -100), (Y, -10)], 'UpperArm.R': [(X, -85), (Y, 12)], 'LowerArm.L': [(X, -10)], 'LowerArm.R': [(X, -20)],
                'Wrist.L': [(X, 40)], 'Wrist.R': [(X, 45)], 'LowerLeg.R': [(X, 10 + 8 * max(0, w))]}

    def rennen_v(t):
        w = math.sin(t * 9)
        return {'Torso': [(X, 30)], 'Chest': [(X, 12)], 'Neck': [(X, -14), (Z, 14)], 'Head': [(Z, 8 * w)],
                'UpperArm.L': [(X, -95 + 10 * w)], 'UpperArm.R': [(X, -95 - 10 * w)], 'Wrist.L': [(X, 30)], 'Wrist.R': [(X, 30)]}

    def angriff_v(t):
        return {'Torso': [(X, 20)], 'Neck': [(X, -10), (Z, 15)], 'UpperArm.L': [(X, -40)], 'UpperArm.R': [(X, -40)]}

    PLAN = [('stehen', 'stehen', 1.6, stehen_v, 3.2), ('gehen', 'gehen', 1.45, gehen_v, None), ('rennen', 'laufen', 1.1, rennen_v, None),
            ('angriff', 'nahkampf', 1.0, angriff_v, None), ('sterben', 'sterben', 1.0, lambda t: {'Torso': [(X, 10)]}, None)]
    behalte_t = {NAME[n] for n in ('Root', 'Body', 'Hips')}
    clips = []
    for neu, quelle, dehnung, fn, mindauer in PLAN:
        spuren, dauer = lies_clip(quelle)
        ziel_dauer = max(dauer * dehnung, mindauer or 0)
        n = max(2, int(round(ziel_dauer * 24)) + 1)
        zeiten = np.linspace(0, ziel_dauer, n)
        kanaele = []
        for j in GELENKE:
            name = knoten[j]['name']
            if name.startswith('Foot') or name.startswith('PT'):
                continue
            rs = spuren.get((j, 'rotation'))
            werte_r = []
            for t in zeiten:
                tq = (t / dehnung) % dauer if dauer > 0 and quelle != 'sterben' else min(t / dehnung, dauer)
                q = werte(rs, tq) if rs else quat_aus(lokal0(j)[:3, :3])
                for achse, grad in fn(t).get(name, []):
                    q = qmul(versatz(name, achse, grad), q)
                werte_r.append(q / np.linalg.norm(q))
            kanaele.append((j, 'rotation', np.array(werte_r)))
            ts = spuren.get((j, 'translation'))
            if j in behalte_t and ts:
                kanaele.append((j, 'translation', np.array([werte(ts, (t / dehnung) % dauer if quelle != 'sterben' else min(t / dehnung, dauer)) for t in zeiten])))
        clips.append((neu, zeiten, kanaele))
    return clips


def modell():
    import importlib
    fig = importlib.import_module('baue_figuren_r44')
    v, uv, vn, f = lade_obj(os.path.join(QUELLE, 'model_0.obj'))
    lok_t, lok_R, B, welt = anpassen()
    v = np.array([welt_p for welt_p in ((v - np.array(LANDMARKEN['Hips'])) / 100.0 * (gw.weltmatrix(g, NAME['Hips'], eltern)[1, 3] / (LANDMARKEN['Hips'][1] / 100.0)) + gw.weltmatrix(g, NAME['Hips'], eltern)[:3, 3])])
    vn = vn / np.maximum(np.linalg.norm(vn, axis=1, keepdims=True), 1e-9)
    # Verformende Strecken (Bindepose) für Bone Heat
    P = {j: B[j][:3, 3] for j in GELENKE}
    p = lambda n: P[NAME[n]]
    st = [('Hips', p('Hips'), p('Abdomen'), None), ('Abdomen', p('Abdomen'), p('Torso'), 'Hips'), ('Torso', p('Torso'), p('Chest'), 'Abdomen'),
          ('Chest', p('Chest'), p('Neck'), 'Torso'), ('Neck', p('Neck'), p('Head'), 'Chest'), ('Head', p('Head'), welt('Head_spitze'), 'Neck')]
    for s in 'LR':
        st += [(f'Shoulder.{s}', p(f'Shoulder.{s}'), p(f'UpperArm.{s}'), 'Chest'), (f'UpperArm.{s}', p(f'UpperArm.{s}'), p(f'LowerArm.{s}'), f'Shoulder.{s}'),
               (f'LowerArm.{s}', p(f'LowerArm.{s}'), p(f'Wrist.{s}'), f'UpperArm.{s}'), (f'Wrist.{s}', p(f'Wrist.{s}'), welt(f'Wrist.{s}_spitze'), f'LowerArm.{s}'),
               (f'UpperLeg.{s}', p(f'UpperLeg.{s}'), p(f'LowerLeg.{s}'), 'Hips'), (f'LowerLeg.{s}', p(f'LowerLeg.{s}'), welt(f'Fuss.{s}'), f'UpperLeg.{s}')]
    w = fig.bone_heat(v, f, st)
    leer = w.sum(1) < 1e-6
    if leer.any():
        d = np.stack([fig.abstand_strecke(v, a, b) for _, a, b, _ in st], 1)
        r = 1 / (d + 0.01) ** 4; w[leer] = (r / r.sum(1, keepdims=True))[leer]
    ordnung = np.argsort(-w, axis=1)[:, :4]
    w4 = np.take_along_axis(w, ordnung, 1); w4[w4 < 0.02] = 0
    w4 /= np.maximum(w4.sum(1, keepdims=True), 1e-9)
    jidx = {j: i for i, j in enumerate(GELENKE)}
    ji = np.vectorize(lambda k: jidx[NAME[st[k][0]]])(ordnung); ji[w4 == 0] = 0
    print('Vertices', len(v), 'Dreiecke', len(f), 'ohne Heat', int(leer.sum()))

    pu = gw.Puffer()
    attr = {'POSITION': pu.add(v.astype(np.float32), 5126, 'VEC3', mm=True), 'NORMAL': pu.add(vn.astype(np.float32), 5126, 'VEC3'),
            'TEXCOORD_0': pu.add(np.stack([uv[:, 0], 1 - uv[:, 1]], 1).astype(np.float32), 5126, 'VEC2'),
            'JOINTS_0': pu.add(ji.astype(np.uint8), 5121, 'VEC4'), 'WEIGHTS_0': pu.add(w4.astype(np.float32), 5126, 'VEC4')}
    idx = pu.add(f.astype(np.uint16).reshape(-1), 5123, 'SCALAR', 34963)
    ibm = pu.add(np.stack([np.linalg.inv(B[j]).T.reshape(-1) for j in GELENKE]).astype(np.float32), 5126, 'MAT4', ziel=None)
    bilder = [pu.roh(open(os.path.join(ZWISCHEN, n), 'rb').read()) for n in ('albedo.jpg', 'normal.jpg')]
    # Knoten: Armatur + Gelenke mit angepassten lokalen TRS
    alt_neu, neue = {}, []

    def kopiere(i):
        nd = {'name': knoten[i]['name'], 'translation': lok_t[i].tolist(), 'rotation': quat_aus(lok_R[i]).tolist()}
        alt_neu[i] = len(neue); neue.append(nd)
        ks = [kopiere(c) for c in kinder(i)]
        if ks:
            nd['children'] = ks
        return alt_neu[i]
    armk = {k: knoten[ARMATUR][k] for k in ('name', 'translation', 'rotation', 'scale') if k in knoten[ARMATUR]}
    neue.append(armk)
    armk['children'] = [kopiere(NAME['Root'])]
    neue.append({'name': 'Skelett', 'mesh': 0, 'skin': 0})
    anims = []
    for name, zeiten, kanaele in baue_clips(B, lok_R):
        ein = pu.add(zeiten.astype(np.float32), 5126, 'SCALAR', ziel=None)
        pu.accs[ein]['min'] = [float(zeiten[0])]; pu.accs[ein]['max'] = [float(zeiten[-1])]
        samplers, channels = [], []
        for j, pfad, werte_ in kanaele:
            aus = pu.add(werte_.astype(np.float32), 5126, 'VEC4' if pfad == 'rotation' else 'VEC3', ziel=None)
            samplers.append({'input': ein, 'output': aus, 'interpolation': 'LINEAR'})
            channels.append({'sampler': len(samplers) - 1, 'target': {'node': alt_neu[j], 'path': pfad}})
        anims.append({'name': name, 'samplers': samplers, 'channels': channels})
    gl = {'asset': {'version': '2.0', 'generator': 'browser_survival r44 skelett'}, 'scene': 0,
          'scenes': [{'nodes': [0, len(neue) - 1]}], 'nodes': neue,
          'meshes': [{'name': 'Skelett', 'primitives': [{'attributes': attr, 'indices': idx, 'material': 0}]}],
          'skins': [{'joints': [alt_neu[j] for j in GELENKE], 'inverseBindMatrices': ibm, 'skeleton': alt_neu[NAME['Root']]}],
          'materials': [{'name': 'Skelett', 'pbrMetallicRoughness': {'baseColorTexture': {'index': 0}, 'metallicFactor': 0, 'roughnessFactor': 0.9},
                         'normalTexture': {'index': 1, 'scale': 1}}],
          'images': [{'bufferView': bilder[0], 'mimeType': 'image/jpeg'}, {'bufferView': bilder[1], 'mimeType': 'image/jpeg'}],
          'textures': [{'source': 0, 'sampler': 0}, {'source': 1, 'sampler': 0}],
          'samplers': [{'magFilter': 9729, 'minFilter': 9987}], 'animations': anims}
    os.makedirs(os.path.dirname(ZIEL), exist_ok=True)
    gw.schreibe_glb(ZIEL, gl, pu)
    print('→', ZIEL, os.path.getsize(ZIEL) // 1024, 'KB')


if __name__ == '__main__':
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:]
    if argv and argv[0] == 'texturen':
        texturen()
    else:
        modell()
