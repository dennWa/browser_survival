"""Spielerfiguren (Mann/Frau) aus den Quaternius-„Adventurer“-Modellen bauen.

    blender -b -P werkzeuge/assets/figuren/figuren_bauen.py -- [--nur mann|frau] [--vorschau ORDNER [--bilder 0,6,9,13]] [--ohne-export] [--messen]

Quellen (liegen in diesem Ordner):
  quelle_a.glb = Mann, quelle_b.glb = Frau (Quaternius, CC0, mit eigenen Clips Idle/Run/Death/…)
  hacken_quelle.glb = alter Blender-Survivor; NUR sein Clip „hacken“ wird übernommen (Richtungs-Retargeting auf das Quaternius-Skelett).
Ergebnis: client/assets/3d/figur_mann.glb, figur_frau.glb mit den Clips stehen, laufen, hacken, sterben.
Clips: stehen = Idle_Neutral, laufen = Run (Jogging und Sprint; Tempo über timeScale im Renderer), sterben = Death, hacken = retargetet.
"""
import os
import sys

import bpy
from mathutils import Matrix, Quaternion, Vector as V

WURZEL = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))
QUELLEN = os.path.join(WURZEL, 'werkzeuge', 'assets', 'figuren')
AUSGABE = os.path.join(WURZEL, 'client', 'assets', '3d')
FIGUREN = {'mann': 'quelle_a.glb', 'frau': 'quelle_b.glb'}
# Ziel-Clip → Quaternius-Clip (ohne Präfix „CharacterArmature|“)
CLIPS = {'stehen': 'Idle_Neutral', 'laufen': 'Run', 'sterben': 'Death'}
ENTFERNEN = ('Icosphere', 'Backpack')  # Hilfsform des Importers; Rucksack zeichnet das Spiel selbst
HACK_FPS = 30  # Bildrate der Quelle

ARGV = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []


def argument(name, standard=None):
    if name in ARGV:
        i = ARGV.index(name)
        return ARGV[i + 1] if i + 1 < len(ARGV) and not ARGV[i + 1].startswith('--') else True
    return standard


def leere_szene():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def importiere(datei):
    leere_szene()
    bpy.ops.import_scene.gltf(filepath=os.path.join(QUELLEN, datei))
    return [o for o in bpy.data.objects if o.type == 'ARMATURE'][0]


def aktualisiere():
    bpy.context.view_layer.update()


# ---------------------------------------------------------------------------
# 1. Quelle: Hack-Posen des alten Survivors abtasten (Weltpositionen/-drehungen)

# Survivor-Knochen → Kind-Knochen (Richtung Knochen → Kind)
S_RICHTUNG = {
    'Spine': 'Chest', 'Chest': 'UpperChest', 'UpperChest': 'Neck', 'Neck': 'Head',
    'LeftArm': 'LeftForeArm', 'LeftForeArm': 'LeftHand', 'LeftHand': 'LeftHandIndex1',
    'RightArm': 'RightForeArm', 'RightForeArm': 'RightHand', 'RightHand': 'RightHandIndex1',
    'LeftUpLeg': 'LeftLeg', 'LeftLeg': 'LeftFoot', 'RightUpLeg': 'RightLeg', 'RightLeg': 'RightFoot',
}
S_DREHUNG = ('Hips', 'Head', 'LeftFoot', 'RightFoot')


def weltpose(arm, namen):
    """Kopfpositionen und Drehungen (Welt) der Knochen."""
    w = arm.matrix_world
    wq = w.to_quaternion()
    kopf = {n: w @ arm.pose.bones[n].head for n in namen}
    dreh = {n: (wq @ arm.pose.bones[n].matrix.to_3x3().normalized().to_quaternion()) for n in namen}
    return kopf, dreh


def tastet_hacken_ab():
    arm = importiere('hacken_quelle.glb')
    namen = [b.name for b in arm.pose.bones]
    for b in arm.pose.bones:
        b.rotation_mode = 'QUATERNION'
    arm.animation_data_create().action = None
    for b in arm.pose.bones:
        b.rotation_quaternion = Quaternion((1, 0, 0, 0))
        b.location = V((0, 0, 0))
    aktualisiere()
    ruhe = weltpose(arm, namen)
    akt = bpy.data.actions['hacken']
    arm.animation_data.action = akt
    start, ende = int(akt.frame_range[0]), int(akt.frame_range[1])
    bilder = []
    for f in range(start, ende + 1):
        bpy.context.scene.frame_set(f)
        aktualisiere()
        bilder.append(weltpose(arm, namen))
    return ruhe, bilder


# ---------------------------------------------------------------------------
# 2. Ziel: Quaternius-Skelett

# Zuordnung Survivor → Quaternius
RICHTUNG = [  # (Q-Knochen, Q-Kind, S-Knochen)  Richtung Knochen→Kind wie beim Survivor
    ('Abdomen', 'Torso', 'Spine'), ('Torso', 'Chest', 'Chest'), ('Chest', 'Neck', 'UpperChest'), ('Neck', 'Head', 'Neck'),
    ('UpperArm.L', 'LowerArm.L', 'LeftArm'), ('LowerArm.L', 'Wrist.L', 'LeftForeArm'), ('Wrist.L', 'Middle1.L', 'LeftHand'),
    ('UpperArm.R', 'LowerArm.R', 'RightArm'), ('LowerArm.R', 'Wrist.R', 'RightForeArm'), ('Wrist.R', 'Middle1.R', 'RightHand'),
    ('UpperLeg.L', 'LowerLeg.L', 'LeftUpLeg'), ('LowerLeg.L', 'Foot.L', 'LeftLeg'),
    ('UpperLeg.R', 'LowerLeg.R', 'RightUpLeg'), ('LowerLeg.R', 'Foot.R', 'RightLeg'),
]
# (Q-Knochen, S-Knochen): Drehung relativ zur Ruhe übernehmen
DREHUNG = [('Hips', 'Hips'), ('Head', 'Head')]
# Freie IK-Ziele (hängen im Rig an Root, nicht an der Beinkette): folgen dem Unterschenkel; Füße bleiben dabei flach
ANHANG = {'Foot.L': ('LowerLeg.L', True), 'Foot.R': ('LowerLeg.R', True), 'PT.L': ('LowerLeg.L', False), 'PT.R': ('LowerLeg.R', False)}
# Reihenfolge, in der gesetzt wird (Eltern zuerst)
REIHENFOLGE = ['Hips', 'Abdomen', 'Torso', 'Chest', 'Neck', 'Head', 'UpperArm.L', 'LowerArm.L', 'Wrist.L', 'UpperArm.R', 'LowerArm.R', 'Wrist.R',
               'UpperLeg.L', 'LowerLeg.L', 'UpperLeg.R', 'LowerLeg.R', 'Foot.L', 'Foot.R']


def setze_matrix(pb, rot_arm, kopf_arm):
    pb.matrix = Matrix.Translation(kopf_arm) @ rot_arm.to_matrix().to_4x4()
    aktualisiere()


def baue_hacken(arm, ruhe_s, bilder_s):
    """Clip „hacken“ auf dem Quaternius-Skelett aus den Survivor-Posen (Richtungen, Hüftbewegung skaliert)."""
    pb = arm.pose.bones
    for b in pb:
        b.rotation_mode = 'QUATERNION'
    arm.animation_data_create().action = None
    w = arm.matrix_world
    wq = w.to_quaternion()
    wi = w.inverted()
    wqi = wq.inverted()
    # Bezugspose = Idle (die Bindepose der Quaternius-Rigs liegt im Blender-Import abseits der sichtbaren Pose)
    arm.animation_data.action = bpy.data.actions['stehen']
    bpy.context.scene.frame_set(0)
    aktualisiere()
    basis = {b.name: (b.rotation_quaternion.copy(), b.location.copy()) for b in pb}
    arm.animation_data.action = None
    ruhe_q_kopf, ruhe_q_dreh = weltpose(arm, [b.name for b in pb])
    s_kopf0, s_dreh0 = ruhe_s
    skala = ruhe_q_kopf['Hips'].z / s_kopf0['Hips'].z
    nach_s = {q: s for q, _, s in RICHTUNG}
    kind_von = {q: k for q, k, _ in RICHTUNG}
    drehung_s = dict(DREHUNG)
    puffer = []
    fuss_ruhe = min(ruhe_q_kopf['Foot.L'].z, ruhe_q_kopf['Foot.R'].z)

    def loese(kopf_s, dreh_s, hoehe):
        for b in pb:
            b.rotation_quaternion, b.location = basis[b.name][0].copy(), basis[b.name][1].copy()
        aktualisiere()
        for name in REIHENFOLGE:
            b = pb[name]
            if name in drehung_s:
                s = drehung_s[name]
                delta = dreh_s[s] @ s_dreh0[s].inverted()
                rot_welt = delta @ ruhe_q_dreh[name]
                if name == 'Hips':
                    ziel_kopf = ruhe_q_kopf['Hips'] + (kopf_s['Hips'] - s_kopf0['Hips']) * skala + V((0, 0, hoehe))
                else:
                    ziel_kopf = w @ b.head  # Kopfposition bleibt (hängt am Elternknochen)
                setze_matrix(b, wqi @ rot_welt, wi @ ziel_kopf)
            elif name in ANHANG:
                eltern, flach = ANHANG[name]
                _, dreh_e = weltpose(arm, [eltern])
                kopf_e = w @ pb[eltern].head
                rel = ruhe_q_dreh[eltern].inverted()
                ziel_kopf = kopf_e + dreh_e[eltern] @ (rel @ (ruhe_q_kopf[name] - ruhe_q_kopf[eltern]))
                rot_welt = ruhe_q_dreh[name] if flach else dreh_e[eltern] @ (rel @ ruhe_q_dreh[name])
                setze_matrix(b, wqi @ rot_welt, wi @ ziel_kopf)
            else:
                s = nach_s[name]
                kind = pb[kind_von[name]]
                ziel = (kopf_s[S_RICHTUNG[s]] - kopf_s[s]).normalized()
                if kind.name in ANHANG:  # Fuß ist freies Ziel: Richtung zum Knöchel aus der Bezugspose ableiten
                    _, dreh_b = weltpose(arm, [name])
                    ist = wqi @ (dreh_b[name] @ (ruhe_q_dreh[name].inverted() @ (ruhe_q_kopf[kind.name] - ruhe_q_kopf[name]))).normalized()
                else:
                    ist = (kind.head - b.head).normalized()
                diff = ist.rotation_difference(wqi @ ziel)
                neu = diff.to_matrix() @ b.matrix.to_3x3()
                setze_matrix(b, neu.to_quaternion(), b.head.copy())

    for kopf_s, dreh_s in bilder_s:
        loese(kopf_s, dreh_s, 0.0)
        # Bodenkontakt: tiefster Fuß soll auf Fußhöhe der Bezugspose stehen (Hüfte nachführen, neu lösen)
        tiefste = min((w @ pb['Foot.L'].head).z, (w @ pb['Foot.R'].head).z)
        loese(kopf_s, dreh_s, fuss_ruhe - tiefste)
        puffer.append({b.name: (b.rotation_quaternion.copy(), b.location.copy()) for b in pb})
    act = bpy.data.actions.new('hacken')
    act.use_fake_user = True
    arm.animation_data.action = act
    faktor = bpy.context.scene.render.fps / HACK_FPS
    for i, pose in enumerate(puffer):
        bild = 1 + i * faktor
        for b in pb:
            q, loc = pose[b.name]
            b.rotation_quaternion = q
            b.keyframe_insert('rotation_quaternion', frame=bild)
            if b.name == 'Hips':
                b.location = loc
                b.keyframe_insert('location', frame=bild)
    arm.animation_data.action = None
    return act, puffer


# ---------------------------------------------------------------------------

def vorschau_rendern(ordner, praefix, ansichten):
    os.makedirs(ordner, exist_ok=True)
    sz = bpy.context.scene
    sz.render.engine = 'BLENDER_WORKBENCH'
    sh = sz.display.shading
    sh.light, sh.color_type = 'STUDIO', 'MATERIAL'
    sz.world = bpy.data.worlds.new('w')
    sz.world.color = (0.55, 0.62, 0.7)
    cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam'))
    sz.collection.objects.link(cam)
    sz.camera = cam
    cam.data.type = 'ORTHO'
    cam.data.ortho_scale = 2.4
    sz.render.resolution_x, sz.render.resolution_y = 480, 600
    for name, ort in ansichten:
        cam.location = V(ort)
        cam.rotation_euler = (V((0, 0, 0.9)) - cam.location).to_track_quat('-Z', 'Y').to_euler()
        sz.render.filepath = os.path.join(ordner, f'{praefix}_{name}.png')
        bpy.ops.render.render(write_still=True)


def messen(arm):
    """Ausgabe: Clip-Längen und Schrittgeschwindigkeit von Walk/Run (für timeScale im Renderer)."""
    w = arm.matrix_world
    for name in ('Walk', 'Run', 'Idle_Neutral', 'Death'):
        akt = bpy.data.actions.get(f'CharacterArmature|{name}')
        if not akt:
            continue
        a, e = akt.frame_range
        arm.animation_data.action = akt
        ys = []
        for f in range(int(a), int(e) + 1):
            bpy.context.scene.frame_set(f)
            aktualisiere()
            h = (w @ arm.pose.bones['Hips'].head)
            fl = (w @ arm.pose.bones['Foot.L'].head)
            ys.append((fl - h).y)
        dauer = (e - a) / bpy.context.scene.render.fps
        hub = max(ys) - min(ys)
        print(f'MESSUNG {name}: Bilder {a}-{e}, Dauer {dauer:.2f}s, Fussweg relativ zur Hüfte {hub:.2f} m, Tempo ≈ {hub / (dauer / 2) if dauer else 0:.2f} m/s')
    arm.animation_data.action = None


def baue_figur(name, datei, ruhe_s, bilder_s):
    arm = importiere(datei)
    for o in list(bpy.data.objects):
        if o.name.split('.')[0] in ENTFERNEN:
            bpy.data.objects.remove(o, do_unlink=True)
    if argument('--messen'):
        messen(arm)
    # Clips auswählen/umbenennen
    for ziel, quelle in CLIPS.items():
        akt = bpy.data.actions[f'CharacterArmature|{quelle}']
        kopie = akt.copy()
        kopie.name = ziel
        kopie.use_fake_user = True
    for akt in list(bpy.data.actions):
        if akt.name.startswith('CharacterArmature|'):
            bpy.data.actions.remove(akt)
    for akt in bpy.data.actions:
        akt.use_fake_user = True
    ad = arm.animation_data
    ad.action = None
    while ad.nla_tracks:
        ad.nla_tracks.remove(ad.nla_tracks[0])
    hacken, _ = baue_hacken(arm, ruhe_s, bilder_s)

    ordner = argument('--vorschau')
    if ordner:
        bilder = [int(x) for x in (argument('--bilder', '0,6,9,13') or '0').split(',')]
        for i in bilder:
            sz = bpy.context.scene
            ad.action = hacken
            sz.frame_set(int(round(1 + i * sz.render.fps / HACK_FPS)))
            aktualisiere()
            vorschau_rendern(ordner, f'{name}_hacken_{i:02d}', [('seite', (6, 0, 1.0)), ('vorn', (2.5, -5, 1.6))])
        ad.action = None

    if '--ohne-export' in ARGV:
        return
    ad.action = None
    for akt_name in ('stehen', 'laufen', 'hacken', 'sterben'):
        spur = ad.nla_tracks.new()
        spur.name = akt_name
        spur.strips.new(akt_name, 1, bpy.data.actions[akt_name]).name = akt_name
    for b in arm.pose.bones:
        b.rotation_quaternion = Quaternion((1, 0, 0, 0))
        b.location = V((0, 0, 0))
    os.makedirs(AUSGABE, exist_ok=True)
    pfad = os.path.join(AUSGABE, f'figur_{name}.glb')
    bpy.ops.export_scene.gltf(
        filepath=pfad, export_format='GLB', export_image_format='NONE', export_materials='EXPORT',
        export_animations=True, export_skins=True, export_cameras=False, export_lights=False, export_yup=True,
    )
    print('GLB geschrieben:', pfad, os.path.getsize(pfad), 'Bytes')


def hauptprogramm():
    ruhe_s, bilder_s = tastet_hacken_ab()
    nur = argument('--nur')
    for name, datei in FIGUREN.items():
        if nur and nur != name:
            continue
        baue_figur(name, datei, ruhe_s, bilder_s)


hauptprogramm()
