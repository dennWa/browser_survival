"""Spielerfiguren (Mann/Frau) aus den Quaternius-„Adventurer“-Modellen bauen.

    blender -b -P werkzeuge/assets/figuren/figuren_bauen.py -- [--nur mann|frau] [--clips a,b] [--ohne-export]
            [--vorschau ORDNER [--bilder 6 | 0,5,10]] [--messen] [--pruefen]

Quellen (liegen in diesem Ordner): quelle_a.glb = Mann, quelle_b.glb = Frau (Quaternius, CC0).
Ergebnis: client/assets/3d/figur_mann.glb, figur_frau.glb (danach setzt repariere_root.mjs den Root-Knochen zurück).

Clips (24 Bilder/s):
  stehen     = Quaternius Idle_Neutral                      Schleife
  gehen      = Quaternius Walk                              Schleife (Fußtempo: --messen)
  laufen     = Quaternius Run                               Schleife (Fußtempo: --messen)
  sterben    = Quaternius Death                             einmal, clamp
  hacken     = eigen: Axt schräg von rechts oben gegen den Stamm vorn, 21 Bilder (0,875 s)   Schleife
  spitzhacke = eigen: beidhändig über Kopf, senkrecht nach vorn-unten, 20 Bilder (0,833 s)   Schleife
  hacke      = eigen: kurz bis Brusthöhe anheben, ein Schlag vorn in den Boden, 15 Bilder (0,625 s)   einmal
  abbauen    = eigen: leicht gebeugt, zwei Hammerschläge auf Hüfthöhe vorn, 24 Bilder (1 s)        Schleife
  nahkampf   = eigen: beidhändig schräg von rechts oben nach links unten, 14 Bilder (0,583 s)      einmal
  sitzen     = eigen: auf dem Boden, Knie angewinkelt, Hände auf den Oberschenkeln, Atmen, 60 Bilder (2,5 s)  Schleife
Werkzeug-Konvention (hacken/spitzhacke/hacke/abbauen/nahkampf): rechte Hand = obere Hand nahe am Werkzeugkopf, linke greift
STIEL_ABSTAND tiefer am selben Stiel (Griffpunkt wie im Spiel: Mitte Wrist–Middle1); Kopf zeigt beim Treffer zum Ziel.

Die eigenen Clips sind reine FK-Schlüssel auf allen Knochen (Three.js wertet kein IK aus): Arme/Beine werden mit einem
2-Knochen-Löser gestellt, der die Beugeachse von Knie/Ellbogen aus dem Run-Clip übernimmt (Gelenke knicken nie falsch);
die freien IK-Ziel-Knochen Foot.* (hängen an Root) werden ans Ende des Unterschenkels gesetzt. Becken = Knochen „Body“
(Eltern von Hips UND den Beinen). Root bleibt unangetastet (repariere_root.mjs).

Optionen: --clips nur diese eigenen Clips bauen (schneller beim Ausprobieren); --vorschau Kontaktbögen je Clip
(Zeilen = Ansichten, Spalten = Bilder; Werkzeug-Clips mit Stiel zwischen den Griffpunkten); --bilder Anzahl oder
Liste von Bildnummern; --messen Fußtempo von Walk/Run; --pruefen statt zu bauen die fertigen GLBs laden und prüfen
(so wie exportiert: nur Knochenspuren).
"""
import math
import os
import sys

import bpy
import numpy as np
from mathutils import Matrix, Quaternion, Vector as V

WURZEL = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))
QUELLEN = os.path.join(WURZEL, 'werkzeuge', 'assets', 'figuren')
AUSGABE = os.path.join(WURZEL, 'client', 'assets', '3d')
FIGUREN = {'mann': 'quelle_a.glb', 'frau': 'quelle_b.glb'}
# Ziel-Clip → Quaternius-Clip (ohne Präfix „CharacterArmature|“)
CLIPS = {'stehen': 'Idle_Neutral', 'gehen': 'Walk', 'laufen': 'Run', 'sterben': 'Death'}
EIGENE = ['hacken', 'spitzhacke', 'hacke', 'abbauen', 'nahkampf', 'sitzen']
WERKZEUG_CLIPS = ('hacken', 'spitzhacke', 'hacke', 'abbauen', 'nahkampf')
REIHENFOLGE_EXPORT = ['stehen', 'gehen', 'laufen', 'sterben'] + EIGENE
ENTFERNEN = ('Icosphere', 'Backpack')  # Hilfsform des Importers; Rucksack zeichnet das Spiel selbst
FAUST_QUELLE = 'Idle_Sword'  # rechte Hand hält dort ein Schwert → Fingerstellung für beide Fäuste
STIEL_ABSTAND = 0.15  # Abstand der Griffpunkte (rechts oben – links unten) in Figur-Einheiten (Figur ≈ 1,86 hoch)
WERKZEUG_KOPF = 0.52  # Werkzeugkopf ab rechtem Griff (Spiel: Axt/Spitzhacke ×1,5 ≈ 18 px bei 64 px Figurhöhe)

ARGV = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []


def argument(name, standard=None):
    if name in ARGV:
        i = ARGV.index(name)
        return ARGV[i + 1] if i + 1 < len(ARGV) and not ARGV[i + 1].startswith('--') else True
    return standard


def leere_szene():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def importiere(pfad):
    leere_szene()
    bpy.ops.import_scene.gltf(filepath=pfad)
    return [o for o in bpy.data.objects if o.type == 'ARMATURE'][0]


def aktualisiere():
    bpy.context.view_layer.update()


def F(rechts, vorne, oben):
    """Figurraum → Blender-Welt: die Figur schaut nach -Y, ihre rechte Seite liegt bei -X, oben = +Z."""
    return V((-rechts, -vorne, oben))


VORN = F(0, 1, 0)
OBEN = V((0, 0, 1))


def q_vor(w):
    """Drehung, die den Oberkörper um w (rad) nach vorn neigt (Achse Welt +X)."""
    return Quaternion(V((1, 0, 0)), w)


def q_rechts(w):
    """Drehung um die Hochachse: Vorderseite um w nach rechts."""
    return Quaternion(OBEN, -w)


def q_seite(w):
    """Seitneigung: Kopf um w nach rechts."""
    return Quaternion(V((0, 1, 0)), -w)


def weltpose(arm, namen):
    """Kopfpositionen und Drehungen (Welt) der Knochen."""
    w = arm.matrix_world
    wq = w.to_quaternion()
    kopf = {n: w @ arm.pose.bones[n].head for n in namen}
    dreh = {n: (wq @ arm.pose.bones[n].matrix.to_3x3().normalized().to_quaternion()) for n in namen}
    return kopf, dreh


def griffpunkt(arm, seite):
    """Faustmitte (hier liegt der Stiel): Mitte zwischen Middle2- und Middle4-Kopf (Three.js: Middle2R/Middle4R …)."""
    w = arm.matrix_world
    pb = arm.pose.bones
    return (w @ pb[f'Middle2.{seite}'].head + w @ pb[f'Middle4.{seite}'].head) * 0.5


def griffpunkt_handgelenk(arm, seite):
    """Bisheriger Griffpunkt des Spiels (figurHaltung.js platziereHackwerkzeug): Mitte Wrist–Middle1 (≈ Handgelenk)."""
    w = arm.matrix_world
    pb = arm.pose.bones
    return (w @ pb[f'Wrist.{seite}'].head + w @ pb[f'Middle1.{seite}'].head) * 0.5


def handmitte(arm, seite):
    """Mitte der Handfläche (offene Hand): halber Weg Wrist → Middle2."""
    w = arm.matrix_world
    pb = arm.pose.bones
    return (w @ pb[f'Wrist.{seite}'].head + w @ pb[f'Middle2.{seite}'].head) * 0.5


def ist_finger(name):
    return name.split('.')[0].rstrip('0123456789') in ('Index', 'Middle', 'Ring', 'Pinky', 'Thumb')


# ---------------------------------------------------------------------------
# Posen-Baukasten

class Rig:
    """Stellt Posen auf dem Quaternius-Skelett in Weltkoordinaten (Bezug: Idle_Neutral Bild 0)."""

    def __init__(self, arm):
        self.arm = arm
        self.pb = arm.pose.bones
        for b in self.pb:
            b.rotation_mode = 'QUATERNION'
        self.w = arm.matrix_world.copy()
        self.wq = self.w.to_quaternion()
        self.wi = self.w.inverted()
        self.wqi = self.wq.inverted()
        self.namen = [b.name for b in self.pb]
        ad = arm.animation_data_create()
        # Bezugspose = Idle (die Bindepose der Quaternius-Rigs liegt im Blender-Import abseits der sichtbaren Pose)
        ad.action = bpy.data.actions['stehen']
        bpy.context.scene.frame_set(0)
        aktualisiere()
        self.basis = {b.name: (b.rotation_quaternion.copy(), b.location.copy()) for b in self.pb}
        ad.action = None
        self.zuruecksetzen()
        self.kopf0, self.dreh0 = weltpose(arm, self.namen)
        self.richtung, self.laenge, self.hand_achse, self.hand_flaeche = {}, {}, {}, {}
        for s in 'LR':
            for a, k in ((f'UpperArm.{s}', f'LowerArm.{s}'), (f'LowerArm.{s}', f'Wrist.{s}'),
                         (f'UpperLeg.{s}', f'LowerLeg.{s}'), (f'LowerLeg.{s}', f'Foot.{s}')):
                d = self.kopf0[k] - self.kopf0[a]
                self.laenge[a] = d.length
                self.richtung[a] = self.dreh0[a].inverted() @ d.normalized()
            # Hand: Längsachse (Handgelenk → Mittelfinger-Knöchel) und Handflächen-Normale im Knochenraum
            hand = (self.kopf0[f'Middle2.{s}'] - self.kopf0[f'Wrist.{s}']).normalized()
            knoechel = (self.kopf0[f'Index2.{s}'] - self.kopf0[f'Pinky2.{s}']).normalized()
            flaeche = knoechel.cross(hand) if s == 'R' else hand.cross(knoechel)
            self.hand_achse[s] = self.dreh0[f'Wrist.{s}'].inverted() @ hand
            self.hand_flaeche[s] = self.dreh0[f'Wrist.{s}'].inverted() @ flaeche.normalized()
        self.achse = self.miss_achsen('laufen')
        self.faust_werte = self.lies_faust(f'CharacterArmature|{FAUST_QUELLE}')
        self.faust('R')
        self.faust('L')
        for s in 'RL':  # Kontrolle der gespiegelten Faust: Fingerspitzen müssen zur Handfläche gekrümmt sein (> 0)
            fl = self.dreh(f'Wrist.{s}') @ self.hand_flaeche[s]
            print(f'  Faust {s}: Middle4 {(self.kopf(f"Middle4.{s}") - self.kopf(f"Wrist.{s}")).dot(fl):+.3f} zur Handfläche')
        self.zuruecksetzen()

    # -- Grundfunktionen
    def zuruecksetzen(self):
        for b in self.pb:
            b.rotation_quaternion, b.location = self.basis[b.name][0].copy(), self.basis[b.name][1].copy()
        aktualisiere()

    def kopf(self, name):
        return self.w @ self.pb[name].head

    def dreh(self, name):
        return self.wq @ self.pb[name].matrix.to_3x3().normalized().to_quaternion()

    def setze(self, name, rot, kopf=None):
        b = self.pb[name]
        if kopf is None:
            kopf = self.w @ b.head
        b.matrix = Matrix.Translation(self.wi @ kopf) @ (self.wqi @ rot).to_matrix().to_4x4()
        aktualisiere()

    def drehe(self, name, delta):
        self.setze(name, delta @ self.dreh(name))

    def miss_achsen(self, aktion):
        """Beugeachse von Knie/Ellbogen im Knochenraum: aus dem Bild mit der stärksten Beugung (Run)."""
        ad = self.arm.animation_data
        ad.action = bpy.data.actions[aktion]
        a0, a1 = (int(x) for x in ad.action.frame_range)
        best = {}
        for f in range(a0, a1 + 1):
            bpy.context.scene.frame_set(f)
            aktualisiere()
            kopf, dreh = weltpose(self.arm, self.namen)
            for s in 'LR':
                for a, b, e in ((f'UpperArm.{s}', f'LowerArm.{s}', f'Wrist.{s}'), (f'UpperLeg.{s}', f'LowerLeg.{s}', f'Foot.{s}')):
                    d1, d2 = (kopf[b] - kopf[a]).normalized(), (kopf[e] - kopf[b]).normalized()
                    winkel = d1.angle(d2)
                    if winkel > best.get(a, (0,))[0]:
                        n = d1.cross(d2).normalized()
                        best[a] = (winkel, b, dreh[a].inverted() @ n, dreh[b].inverted() @ n)
        ad.action = None
        self.zuruecksetzen()
        achse = {}
        for a, (winkel, b, na, nb) in best.items():
            achse[a], achse[b] = na, nb
            print(f'  Gelenkachse {a}/{b}: aus Beugung {math.degrees(winkel):.0f}°')
        return achse

    def lies_faust(self, aktion):
        ad = self.arm.animation_data
        ad.action = bpy.data.actions[aktion]
        bpy.context.scene.frame_set(0)
        aktualisiere()
        werte = {}
        for b in self.pb:
            if ist_finger(b.name) and b.name.endswith('.R'):
                q = b.rotation_quaternion.copy()
                werte[b.name] = q
                werte[b.name[:-2] + '.L'] = Quaternion((q.w, q.x, -q.y, -q.z))  # gespiegelt
        ad.action = None
        self.zuruecksetzen()
        return werte

    # -- Körperteile
    def becken(self, versatz=V((0, 0, 0)), vor=0.0, drehung=0.0, seite=0.0):
        """Becken (Knochen Body, trägt Hüfte UND Beine): verschieben (Welt) und drehen."""
        q = q_rechts(drehung) @ q_seite(seite) @ q_vor(vor)
        self.setze('Body', q @ self.dreh0['Body'], kopf=self.kopf0['Body'] + versatz)

    def rumpf(self, vor=0.0, drehung=0.0, seite=0.0):
        """Wirbelsäule beugen/drehen, verteilt auf Hips → Chest."""
        for n, anteil in (('Hips', 0.15), ('Abdomen', 0.3), ('Torso', 0.3), ('Chest', 0.25)):
            self.drehe(n, q_rechts(drehung * anteil) @ q_seite(seite * anteil) @ q_vor(vor * anteil))

    def kopf_neigen(self, vor=0.0, drehung=0.0):
        for n in ('Neck', 'Head'):
            self.drehe(n, q_rechts(drehung * 0.5) @ q_vor(vor * 0.5))

    def schulter(self, s, heben=0.0, vor=0.0):
        """Schlüsselbein: Oberarmansatz heben (rad) bzw. nach vorn ziehen (rad)."""
        n = f'Shoulder.{s}'
        d = (self.kopf(f'UpperArm.{s}') - self.kopf(n)).normalized()
        q = Quaternion(d.cross(OBEN).normalized(), heben)
        q2 = Quaternion(d.cross(VORN).normalized(), vor)
        self.drehe(n, q2 @ q)

    def ausrichten(self, name, d, h):
        """Weltdrehung des Knochens, bei der er in Richtung d zeigt und seine Beugeachse auf h liegt."""
        yl = self.richtung[name]
        xl = self.achse[name]
        xl = (xl - yl * xl.dot(yl)).normalized()
        zl = xl.cross(yl)
        yw = d.normalized()
        xw = (h - yw * h.dot(yw)).normalized()
        zw = xw.cross(yw)
        ml = Matrix((xl, yl, zl)).transposed()
        mw = Matrix((xw, yw, zw)).transposed()
        return (mw @ ml.transposed()).to_quaternion()

    def kette(self, a, b, ziel, pol):
        """2-Knochen-Löser: Ende von b nach ziel, Gelenk (Knie/Ellbogen) zeigt Richtung pol. Gibt das erreichte Ende zurück."""
        A = self.kopf(a)
        l1, l2 = self.laenge[a], self.laenge[b]
        d = ziel - A
        dist = d.length
        d = d.normalized()
        dist = min(max(dist, abs(l1 - l2) + 1e-4), (l1 + l2) * 0.999)
        cos_a = (l1 * l1 + dist * dist - l2 * l2) / (2 * l1 * dist)
        sin_a = math.sqrt(max(0.0, 1 - cos_a * cos_a))
        p = pol - d * pol.dot(d)
        if p.length < 1e-6:
            p = d.orthogonal()
        p.normalize()
        knie = A + d * (l1 * cos_a) + p * (l1 * sin_a)
        ende = A + d * dist
        d1, d2 = (knie - A).normalized(), (ende - knie).normalized()
        h = d1.cross(d2)
        h = h.normalized() if h.length > 1e-5 else p.cross(d).normalized()
        self.setze(a, self.ausrichten(a, d1, h))
        self.setze(b, self.ausrichten(b, d2, h))
        return ende

    def bein(self, s, knoechel, pol, fuss=None):
        """Bein per IK; der freie Fuß-Knochen (an Root) wird ans Unterschenkel-Ende gesetzt (flach bzw. Drehung fuss)."""
        a, b = f'UpperLeg.{s}', f'LowerLeg.{s}'
        self.kette(a, b, knoechel, pol)
        ende = self.kopf(b) + self.dreh(b) @ (self.richtung[b] * self.laenge[b])
        self.setze(f'Foot.{s}', fuss if fuss is not None else self.dreh0[f'Foot.{s}'], kopf=ende)

    def hand(self, s, griff, pol, achse, flaeche, bezug=griffpunkt):
        """Arm per IK, sodass der Bezugspunkt der Hand (Standard: Faustmitte) auf griff liegt; die Hand zeigt
        mit der Längsachse nach achse, die Handfläche nach flaeche (Welt)."""
        a, b, h = f'UpperArm.{s}', f'LowerArm.{s}', f'Wrist.{s}'
        al, fl = self.hand_achse[s], self.hand_flaeche[s]
        fl = (fl - al * fl.dot(al)).normalized()
        aw = achse.normalized()
        fw = (flaeche - aw * flaeche.dot(aw)).normalized()
        ml = Matrix((al, fl, al.cross(fl))).transposed()
        mw = Matrix((aw, fw, aw.cross(fw))).transposed()
        rot = (mw @ ml.transposed()).to_quaternion()
        versatz = V((0, 0, 0))
        for _ in range(3):
            self.kette(a, b, griff - versatz, pol)
            self.setze(h, rot)
            versatz = bezug(self.arm, s) - self.kopf(h)
        return bezug(self.arm, s)

    def unterarm(self, s):
        return (self.kopf(f'Wrist.{s}') - self.kopf(f'LowerArm.{s}')).normalized()

    def faust(self, s):
        for n, q in self.faust_werte.items():
            if n.endswith('.' + s):
                self.pb[n].rotation_quaternion = q.copy()
        aktualisiere()

    def reichweite(self, s):
        return self.laenge[f'UpperArm.{s}'] + self.laenge[f'LowerArm.{s}']


# ---------------------------------------------------------------------------
# Schlüssel-Verläufe

def glatt(s):
    return s * s * (3 - 2 * s)


KURVEN = {'lin': lambda s: s, 'weich': glatt, 'ein': lambda s: s ** 2.2, 'aus': lambda s: 1 - (1 - s) ** 2}


def verlauf(schluessel, t):
    """schluessel: [(zeit 0..1, {wert}, kurve bis zum nächsten Schlüssel)], fehlende Werte erben vom Vorgänger."""
    voll = []
    letzte = {}
    for zeit, werte, kurve in schluessel:
        letzte = {**letzte, **werte}
        voll.append((zeit, letzte, kurve))
    for i in range(len(voll) - 1):
        t0, w0, k = voll[i]
        t1, w1, _ = voll[i + 1]
        if t <= t1 or i == len(voll) - 2:
            s = min(1.0, max(0.0, (t - t0) / (t1 - t0)))
            s = KURVEN[k](s)
            return {n: w0[n] + (w1[n] - w0[n]) * s for n in w0}
    return dict(voll[-1][1])


# ---------------------------------------------------------------------------
# Eigene Clips

GRUND = {'tief': 0.0, 'zurueck': 0.0, 'becken_vor': 0.0, 'vor': 0.0, 'drehung': 0.0, 'seite': 0.0, 'kopf': 0.0,
         'beta': 0.0, 'rho': 0.34, 'alpha': 0.0, 'quer': 0.0, 'hub': 0.0}


def ebene(neigung_rechts=0.0, gier=0.0):
    """Schwungebene: e1 = vorn (um gier nach links gedreht), e2 = oben (um neigung_rechts zur rechten Seite gekippt)."""
    e1 = q_rechts(-gier) @ VORN
    e2 = q_rechts(-gier) @ (F(math.sin(neigung_rechts), 0, math.cos(neigung_rechts)))
    return e1.normalized(), e2.normalized()


WERKZEUG = {
    # Axt gegen den Stamm vorn: Schwungebene 50° nach rechts gekippt (Ausholen über der rechten Schulter, Treffer waagerecht vorn)
    'hacken': {
        'bilder': 21, 'ebene': ebene(math.radians(50)),
        'fuesse': {'R': F(0.04, -0.10, 0), 'L': F(-0.03, 0.08, 0)}, 'zehen': {'R': 0.35, 'L': 0.1},
        'schluessel': [
            (0.00, {'beta': 112, 'rho': 0.32, 'alpha': 155, 'drehung': 0.45, 'vor': -0.05, 'kopf': 0.1, 'tief': 0.02}, 'weich'),
            (0.18, {'beta': 116, 'alpha': 162, 'drehung': 0.5}, 'ein'),
            (0.48, {'beta': -28, 'rho': 0.37, 'alpha': 6, 'drehung': -0.2, 'vor': 0.25, 'kopf': 0.0, 'tief': 0.05, 'zurueck': 0.03}, 'aus'),
            (0.58, {'beta': -20, 'alpha': 14, 'drehung': -0.15}, 'weich'),
            (1.00, {'beta': 112, 'rho': 0.32, 'alpha': 155, 'drehung': 0.45, 'vor': -0.05, 'kopf': 0.1, 'tief': 0.02, 'zurueck': 0.0}, 'lin'),
        ],
    },
    # Spitzhacke: senkrecht über Kopf, Schlag nach vorn-unten auf Boden/Stein
    'spitzhacke': {
        'bilder': 20, 'ebene': ebene(),
        'fuesse': {'R': F(0.03, -0.08, 0), 'L': F(-0.02, 0.10, 0)}, 'zehen': {'R': 0.3, 'L': 0.1},
        'schluessel': [
            (0.00, {'beta': 55, 'rho': 0.36, 'alpha': 118, 'vor': -0.10, 'kopf': 0.12, 'quer': 0.03}, 'weich'),
            (0.12, {'beta': 60, 'alpha': 124, 'vor': -0.12}, 'ein'),
            (0.45, {'beta': -72, 'rho': 0.37, 'alpha': -38, 'vor': 0.75, 'kopf': -0.35, 'tief': 0.13, 'zurueck': 0.10}, 'aus'),
            (0.55, {'beta': -64, 'alpha': -28, 'vor': 0.7}, 'weich'),
            (1.00, {'beta': 55, 'rho': 0.36, 'alpha': 118, 'vor': -0.10, 'kopf': 0.12, 'tief': 0.0, 'zurueck': 0.0}, 'lin'),
        ],
    },
    # Hacke: aus der Griffhaltung (Stiel schräg nach vorn-unten) kurz bis Brusthöhe anheben und einmal vorn in den Boden
    'hacke': {
        'bilder': 15, 'ebene': ebene(), 'einmal': True,
        'fuesse': {'R': F(0.02, -0.06, 0), 'L': F(-0.01, 0.07, 0)}, 'zehen': {'R': 0.2, 'L': 0.1},
        'schluessel': [
            (0.00, {'beta': -62, 'rho': 0.30, 'alpha': -30, 'vor': 0.12, 'quer': 0.03}, 'aus'),
            (0.30, {'beta': 8, 'rho': 0.32, 'alpha': 62, 'vor': 0.0, 'kopf': 0.05}, 'lin'),
            (0.38, {'beta': 12, 'alpha': 68}, 'ein'),
            (0.60, {'beta': -88, 'rho': 0.38, 'alpha': -78, 'vor': 0.72, 'kopf': -0.35, 'tief': 0.15, 'zurueck': 0.09}, 'weich'),
            (0.72, {'beta': -86, 'alpha': -74, 'vor': 0.7}, 'weich'),
            (1.00, {'beta': -62, 'rho': 0.30, 'alpha': -30, 'vor': 0.12, 'kopf': 0.0, 'tief': 0.0, 'zurueck': 0.0}, 'lin'),
        ],
    },
    # Abbauen (Zerlegen von Werkbank/Ofen/Feuer …): leicht gebeugt stehend, zwei kurze Hammerschläge auf Hüfthöhe vorn
    'abbauen': {
        'bilder': 24, 'ebene': ebene(),
        'fuesse': {'R': F(0.05, -0.06, 0), 'L': F(-0.05, 0.06, 0)}, 'zehen': {'R': 0.3, 'L': 0.15},
        'schluessel': [
            (0.00, {'beta': 12, 'rho': 0.30, 'alpha': 92, 'vor': 0.3, 'kopf': -0.2, 'tief': 0.06, 'zurueck': 0.03, 'quer': 0.02}, 'ein'),
            (0.18, {'beta': -50, 'rho': 0.37, 'alpha': -42}, 'aus'),
            (0.25, {'beta': -43, 'alpha': -30}, 'weich'),
            (0.50, {'beta': 10, 'rho': 0.30, 'alpha': 88, 'quer': -0.01}, 'ein'),
            (0.68, {'beta': -51, 'rho': 0.37, 'alpha': -44}, 'aus'),
            (0.75, {'beta': -44, 'alpha': -32}, 'weich'),
            (1.00, {'beta': 12, 'rho': 0.30, 'alpha': 92, 'quer': 0.02}, 'lin'),
        ],
    },
    # Nahkampf: beidhändiger Schlag (Schläger/Brechstange/Machete) schräg von rechts oben über vorn nach links unten
    'nahkampf': {
        'bilder': 14, 'ebene': ebene(math.radians(38)), 'einmal': True,
        'fuesse': {'R': F(0.05, -0.12, 0), 'L': F(-0.04, 0.10, 0)}, 'zehen': {'R': 0.4, 'L': 0.1},
        'schluessel': [
            (0.00, {'beta': 45, 'rho': 0.30, 'alpha': 105, 'drehung': 0.2, 'kopf': 0.05}, 'aus'),
            (0.30, {'beta': 112, 'rho': 0.31, 'alpha': 160, 'drehung': 0.55, 'vor': -0.05}, 'ein'),
            (0.52, {'beta': -8, 'rho': 0.38, 'alpha': 12, 'drehung': -0.25, 'vor': 0.22, 'tief': 0.05, 'zurueck': 0.03}, 'aus'),
            (0.70, {'beta': -62, 'rho': 0.36, 'alpha': -38, 'drehung': -0.5, 'vor': 0.3}, 'weich'),
            (1.00, {'beta': 45, 'rho': 0.30, 'alpha': 105, 'drehung': 0.2, 'vor': 0.0, 'tief': 0.0, 'zurueck': 0.0}, 'lin'),
        ],
    },
}


def stelle_werkzeug(rig, cfg, t):
    """Pose eines Werkzeug-Clips zum Zeitpunkt t (0..1). Gibt (Griff rechts, Griff links, Stielrichtung) zurück."""
    p = {**GRUND, **verlauf(cfg['schluessel'], t)}
    rig.zuruecksetzen()
    rig.becken(F(0, -p['zurueck'], -p['tief']), vor=p['becken_vor'], drehung=p['drehung'] * 0.3)
    for s, r in (('R', 1), ('L', -1)):
        ziel = rig.kopf0[f'Foot.{s}'] + cfg['fuesse'][s]
        rig.bein(s, ziel, F(0.3 * r, 1, 0), q_rechts(cfg['zehen'][s] * r) @ rig.dreh0[f'Foot.{s}'])
    rig.rumpf(vor=p['vor'], drehung=p['drehung'] * 0.7, seite=p['seite'])
    rig.kopf_neigen(p['kopf'], -p['drehung'] * 0.4)
    e1, e2 = cfg['ebene']
    b, a = math.radians(p['beta']), math.radians(p['alpha'])
    u = (e1 * math.cos(a) + e2 * math.sin(a)).normalized()
    rho = p['rho']
    for _ in range(12):
        mitte = (rig.kopf('UpperArm.R') + rig.kopf('UpperArm.L')) * 0.5
        rechts = mitte + (e1 * math.cos(b) + e2 * math.sin(b)) * rho + F(p['quer'], 0, 0)
        links = rechts - u * STIEL_ABSTAND
        if all((z - rig.kopf(f'UpperArm.{s}')).length < rig.reichweite(s) * 0.97 for s, z in (('R', rechts), ('L', links))):
            break
        rho -= 0.01
    for s, z in (('R', rechts), ('L', links)):
        schulter = rig.kopf(f'UpperArm.{s}')
        hoch = min(1.0, max(0.0, (z.z - schulter.z) / 0.3))
        weit = min(1.0, max(0.0, ((z - schulter).length - 0.25) / 0.15))
        rig.schulter(s, heben=math.radians(16) * hoch, vor=math.radians(12) * weit)
    # Fäuste um den Stiel: Knöchellinie längs des Stiels, Daumen zum Werkzeugkopf; beide Hände mit derselben Längsachse
    # (gemittelte Unterarmrichtung quer zum Stiel → kleinster Handgelenk-Knick, Griffpunkte jeder Definition parallel zum Stiel)
    rig.faust('R')
    rig.faust('L')
    n = e1.cross(e2).normalized()
    flaeche_r = n if n.dot(F(-1, 0, 0)) > 0 else -n
    achse = flaeche_r.cross(u).normalized()
    pole = {'R': F(0.6, 0.2, -1), 'L': F(-0.6, 0.2, -1)}
    for _ in range(2):
        gr = rig.hand('R', rechts, pole['R'], achse, u.cross(achse))
        gl = rig.hand('L', links, pole['L'], achse, achse.cross(u))
        summe = rig.unterarm('R') + rig.unterarm('L')
        quer = summe - u * summe.dot(u)
        if quer.length < 1e-3:
            break
        achse = quer.normalized()
    return gr, gl, u


SITZEN_BILDER = 60


def stelle_sitzen(rig, t, koerper_z):
    """Sitzen auf dem Boden: Becken auf koerper_z (Höhe des Body-Kopfs), Knie hoch, Hände auf den Oberschenkeln; Atmen."""
    atem = math.sin(2 * math.pi * t)
    rig.zuruecksetzen()
    k0 = rig.kopf0['Body']
    rig.becken(V((0, 0, koerper_z - k0.z)) + F(0, -0.04, 0), vor=-0.35)
    for s, r in (('R', 1), ('L', -1)):
        ziel = rig.kopf0[f'Foot.{s}'] + F(0.06 * r, 0.50, 0)
        rig.bein(s, ziel, F(0.5 * r, 0.25, 1.0), q_rechts(0.25 * r) @ rig.dreh0[f'Foot.{s}'])
    rig.rumpf(vor=0.47 + 0.025 * atem)
    rig.drehe('Chest', q_vor(-0.03 * atem))
    rig.kopf_neigen(0.12 - 0.02 * atem)
    for s, r in (('R', 1), ('L', -1)):
        rig.schulter(s, heben=0.035 * atem)
        huefte, knie = rig.kopf(f'UpperLeg.{s}'), rig.kopf(f'LowerLeg.{s}')
        oberschenkel = (knie - huefte).normalized()
        auf = (OBEN - oberschenkel * OBEN.dot(oberschenkel)).normalized()
        griff = huefte + (knie - huefte) * 0.78 + auf * 0.10 + F(0.02 * r, 0, 0)
        rig.hand(s, griff, F(1.0 * r, -0.6, -0.3), oberschenkel - auf * 0.6, -auf, bezug=handmitte)
    return None


# ---------------------------------------------------------------------------
# Netz-Auswertung (verformte Punkte wie gerendert)

class Netz:
    ARM_GRUPPEN = ('UpperArm', 'LowerArm', 'Wrist', 'Shoulder')
    GESAESS = ('Body', 'Hips', 'UpperLeg.L', 'UpperLeg.R')

    def __init__(self, arm):
        self.objekte = [o for o in bpy.data.objects if o.type == 'MESH' and o.parent == arm]
        self.gruppe = []
        for o in self.objekte:
            namen = {g.index: g.name for g in o.vertex_groups}
            dom = []
            for v in o.data.vertices:
                best = max(v.groups, key=lambda g: g.weight, default=None)
                dom.append(namen.get(best.group, '') if best else '')
            self.gruppe.extend(dom)
        self.gruppe = np.array(self.gruppe)
        self.arm_maske = np.array([g.split('.')[0] in self.ARM_GRUPPEN or ist_finger(g) for g in self.gruppe])
        self.gesaess_maske = np.isin(self.gruppe, self.GESAESS)

    def punkte(self):
        dg = bpy.context.evaluated_depsgraph_get()
        alle = []
        for o in self.objekte:
            oe = o.evaluated_get(dg)
            me = oe.to_mesh()
            co = np.empty(len(me.vertices) * 3, dtype=np.float64)
            me.vertices.foreach_get('co', co)
            oe.to_mesh_clear()
            m = np.array(oe.matrix_world)
            alle.append(co.reshape(-1, 3) @ m[:3, :3].T + m[:3, 3])
        return np.concatenate(alle)


def abstand_zur_strecke(punkte, a, b):
    a, b = np.array(a), np.array(b)
    ab = b - a
    t = np.clip(((punkte - a) @ ab) / (ab @ ab), 0, 1)
    return np.linalg.norm(punkte - (a + t[:, None] * ab), axis=1)


def sitz_hoehe(rig, netz):
    """Body-Höhe, bei der das Gesäß den Boden berührt (tiefster Gesäß-Punkt = 0)."""
    z = rig.kopf0['Body'].z - 0.6
    for _ in range(6):
        stelle_sitzen(rig, 0.0, z)
        tief = netz.punkte()[netz.gesaess_maske][:, 2].min()
        z -= tief
        if abs(tief) < 5e-4:
            break
    return z


# ---------------------------------------------------------------------------
# Clips schreiben

def schreibe_clip(rig, name, bilder, stelle):
    """stelle(t) stellt die Pose für t = 0..1 ein; Schlüssel auf allen Knochen für Bild 0..bilder (24 Bilder/s)."""
    puffer = []
    for i in range(bilder + 1):
        stelle(i / bilder)
        puffer.append({b.name: (b.rotation_quaternion.copy(), b.location.copy()) for b in rig.pb})
    act = bpy.data.actions.new(name)
    act.use_fake_user = True
    ad = rig.arm.animation_data
    ad.action = act
    vorher = {}
    for i, pose in enumerate(puffer):
        for b in rig.pb:
            q, loc = pose[b.name]
            if b.name in vorher and q.dot(vorher[b.name]) < 0:
                q = Quaternion((-q.w, -q.x, -q.y, -q.z))  # kürzester Weg (kein Umklappen beim Interpolieren)
            vorher[b.name] = q
            b.rotation_quaternion = q
            b.location = loc
            b.keyframe_insert('rotation_quaternion', frame=i)
            b.keyframe_insert('location', frame=i)
    ad.action = None
    rig.zuruecksetzen()
    return act


def baue_eigene(rig, netz, auswahl):
    info = {}
    for name in auswahl:
        if name in WERKZEUG:
            cfg = WERKZEUG[name]
            schreibe_clip(rig, name, cfg['bilder'], lambda t, cfg=cfg: stelle_werkzeug(rig, cfg, t))
        elif name == 'sitzen':
            z = sitz_hoehe(rig, netz)
            info['sitz_body_z'] = z
            schreibe_clip(rig, name, SITZEN_BILDER, lambda t: stelle_sitzen(rig, t, z))
    return info


# ---------------------------------------------------------------------------
# Prüfen: Kennzahlen je Clip (so wie das Skelett die Schlüssel abspielt)

def pruefbericht(arm, netz, clips):
    w = arm.matrix_world
    ad = arm.animation_data
    sz = bpy.context.scene
    for name in clips:
        act = bpy.data.actions.get(name)
        if not act:
            print(f'PRUEF {name}: FEHLT')
            continue
        ad.action = act
        a0, a1 = (int(round(x)) for x in act.frame_range)
        tief, hoch, hand, frei, frei_gruppe, huefte, knick = 9, -9, [], 9, '', [], 0
        tief_gruppe, hand_alt, winkel_alt = '', [], 0.0
        pb = arm.pose.bones
        for f in range(a0, a1 + 1):
            sz.frame_set(f)
            aktualisiere()
            p = netz.punkte()
            i = int(p[:, 2].argmin())
            if p[i, 2] < tief:
                tief, tief_gruppe = float(p[i, 2]), netz.gruppe[i]
            hoch = max(hoch, p[:, 2].max())
            huefte.append((w @ pb['UpperLeg.L'].head).z)
            for s in 'LR':  # Handgelenk-Knick: Winkel Unterarm ↔ Handachse
                ua = pb[f'Wrist.{s}'].head - pb[f'LowerArm.{s}'].head
                ha = pb[f'Middle2.{s}'].head - pb[f'Wrist.{s}'].head
                knick = max(knick, math.degrees(ua.angle(ha)))
            if name in WERKZEUG_CLIPS:
                gr, gl = griffpunkt(arm, 'R'), griffpunkt(arm, 'L')
                hand.append((gr - gl).length)
                hr, hl = griffpunkt_handgelenk(arm, 'R'), griffpunkt_handgelenk(arm, 'L')
                hand_alt.append((hr - hl).length)
                winkel_alt = max(winkel_alt, math.degrees((hr - hl).angle(gr - gl)))
                u = (gr - gl).normalized()
                koerper = ~netz.arm_maske
                d = abstand_zur_strecke(p[koerper], gl - u * 0.05, gr + u * (WERKZEUG_KOPF + 0.04))
                i = int(d.argmin())
                if d[i] < frei:
                    frei, frei_gruppe = float(d[i]), f'{netz.gruppe[koerper][i]} @Bild {f}'
        text = (f'PRUEF {name}: Bilder {a0}-{a1} ({(a1 - a0) / sz.render.fps:.3f} s), Netz z {tief:.3f} ({tief_gruppe})…{hoch:.3f}, '
                f'Hüftgelenk z {min(huefte):.3f}…{max(huefte):.3f}, Handgelenk-Knick max {knick:.0f}°')
        if hand:
            text += (f', Griffabstand (Faust) {min(hand):.3f}…{max(hand):.3f}, Stiel-Körper-Abstand min {frei:.3f} ({frei_gruppe}); '
                     f'alter Griffpunkt Wrist/Middle1: Abstand {min(hand_alt):.3f}…{max(hand_alt):.3f}, Abweichung zur Stielrichtung max {winkel_alt:.1f}°')
        print(text)
    ad.action = None


# ---------------------------------------------------------------------------
# Vorschau: Kontaktbogen je Clip

ANSICHTEN = [('rechts', (-6, 0, 1.0)), ('vorn', (-3.2, -5, 1.7)), ('spiel', (-1.2, -3.2, 5.2))]


def vorschau_szene():
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
    cam.data.ortho_scale = 2.5
    sz.render.resolution_x, sz.render.resolution_y = 250, 320

    def material(name, farbe):
        m = bpy.data.materials.new(name)
        m.diffuse_color = farbe
        return m

    bpy.ops.mesh.primitive_plane_add(size=3, location=(0, -0.3, 0))
    boden = bpy.context.active_object
    boden.data.materials.append(material('boden', (0.42, 0.5, 0.36, 1)))
    bpy.ops.mesh.primitive_cylinder_add(vertices=8, radius=0.02, depth=1.0)
    stiel = bpy.context.active_object
    stiel.data.materials.append(material('stiel', (0.45, 0.25, 0.1, 1)))
    bpy.ops.mesh.primitive_cube_add(size=1.0)
    kopf = bpy.context.active_object
    kopf.data.materials.append(material('kopf', (0.8, 0.82, 0.86, 1)))
    return cam, stiel, kopf


def setze_stiel(stiel, kopf, arm, sichtbar):
    stiel.hide_render = kopf.hide_render = not sichtbar
    if not sichtbar:
        return
    gr, gl = griffpunkt(arm, 'R'), griffpunkt(arm, 'L')
    u = (gr - gl).normalized()
    a, b = gl - u * 0.06, gr + u * (WERKZEUG_KOPF + 0.04)
    rot = u.to_track_quat('Z', 'Y').to_matrix().to_4x4()
    stiel.matrix_world = Matrix.Translation((a + b) * 0.5) @ rot @ Matrix.Diagonal((1, 1, (b - a).length, 1))
    kopf.matrix_world = Matrix.Translation(gr + u * WERKZEUG_KOPF) @ rot @ Matrix.Diagonal((0.035, 0.22, 0.045, 1))


def vorschau_rendern(arm, netz, ordner, praefix, clips):
    os.makedirs(ordner, exist_ok=True)
    cam, stiel, kopf = vorschau_szene()
    sz = bpy.context.scene
    ad = arm.animation_data
    wahl = argument('--bilder', '6')
    for name in clips:
        act = bpy.data.actions.get(name)
        if not act:
            continue
        ad.action = act
        a0, a1 = (int(round(x)) for x in act.frame_range)
        if ',' in str(wahl):
            bilder = [a0 + int(x) for x in wahl.split(',')]
        else:
            n = max(1, int(wahl))
            bilder = sorted({a0 + round(i * (a1 - a0) / n) for i in range(n)})
        # Bildausschnitt: Hüllquader von Figur (+ Stiel) über alle gezeigten Bilder
        lo, hi = np.full(3, 9.0), np.full(3, -9.0)
        for f in bilder:
            sz.frame_set(f)
            aktualisiere()
            p = netz.punkte()
            if name in WERKZEUG_CLIPS:
                gr, gl = griffpunkt(arm, 'R'), griffpunkt(arm, 'L')
                p = np.vstack([p, np.array(gr + (gr - gl).normalized() * (WERKZEUG_KOPF + 0.1))])
            lo, hi = np.minimum(lo, p.min(0)), np.maximum(hi, p.max(0))
        lo[2] = min(lo[2], 0.0)
        mitte = V(((lo + hi) / 2).tolist())
        cam.data.ortho_scale = float(max(hi[2] - lo[2], max(hi[0] - lo[0], hi[1] - lo[1]) * 1.25)) * 1.12 + 0.1
        dateien = []
        for f in bilder:
            sz.frame_set(f)
            aktualisiere()
            setze_stiel(stiel, kopf, arm, name in WERKZEUG_CLIPS)
            if argument('--nah'):  # Nahansicht der Hände (Griff/Faust prüfen)
                mitte = (griffpunkt(arm, 'R') + griffpunkt(arm, 'L')) * 0.5 if name in WERKZEUG_CLIPS else handmitte(arm, 'R')
                cam.data.ortho_scale = 0.8
            zeile = []
            for ansicht, ort in ANSICHTEN:
                cam.location = mitte + (V(ort) - V((0, 0, 0.9))) * 3
                cam.rotation_euler = (mitte - cam.location).to_track_quat('-Z', 'Y').to_euler()
                sz.render.filepath = os.path.join(ordner, f'_tmp_{ansicht}_{f}.png')
                bpy.ops.render.render(write_still=True)
                zeile.append(sz.render.filepath)
            dateien.append(zeile)
        kontaktbogen(dateien, os.path.join(ordner, f'{praefix}_{name}.png'))
    ad.action = None
    stiel.hide_render = kopf.hide_render = True


def kontaktbogen(dateien, ziel):
    """dateien[spalte][zeile] → ein Bild (Spalten = Bilder, Zeilen = Ansichten)."""
    spalten, zeilen = len(dateien), len(dateien[0])
    bilder = [[bpy.data.images.load(p) for p in sp] for sp in dateien]
    bw, bh = bilder[0][0].size
    bogen = np.ones((zeilen * bh, spalten * bw, 4), dtype=np.float32)
    for i, sp in enumerate(bilder):
        for j, img in enumerate(sp):
            px = np.empty(bw * bh * 4, dtype=np.float32)
            img.pixels.foreach_get(px)
            bogen[(zeilen - 1 - j) * bh:(zeilen - j) * bh, i * bw:(i + 1) * bw] = px.reshape(bh, bw, 4)
            bpy.data.images.remove(img)
    aus = bpy.data.images.new('bogen', spalten * bw, zeilen * bh, alpha=True)
    aus.pixels.foreach_set(bogen.ravel())
    aus.filepath_raw = ziel
    aus.file_format = 'PNG'
    aus.save()
    bpy.data.images.remove(aus)
    for sp in dateien:
        for p in sp:
            os.remove(p)
    print('Vorschau:', ziel)


# ---------------------------------------------------------------------------
# Messen: Fußtempo (für timeScale im Renderer)

def fusstempo(arm, act):
    """Mittleres Tempo des Standfußes relativ zum Becken (Figur-Einheiten/s) – entspricht dem Gehtempo bei timeScale 1."""
    w = arm.matrix_world
    ad = arm.animation_data
    ad.action = act
    a0, a1 = (int(round(x)) for x in act.frame_range)
    fps = bpy.context.scene.render.fps
    werte = {'L': [], 'R': []}
    for f in range(a0, a1 + 1):
        bpy.context.scene.frame_set(f)
        aktualisiere()
        body = w @ arm.pose.bones['Body'].head
        for s in 'LR':
            fuss = w @ arm.pose.bones[f'Foot.{s}'].head
            werte[s].append((fuss.z, fuss.y - body.y))
    ad.action = None
    tempi = []
    for s, liste in werte.items():
        zmin = min(z for z, _ in liste)
        for (z0, y0), (z1, y1) in zip(liste, liste[1:]):
            if z0 < zmin + 0.012 and z1 < zmin + 0.012:
                tempi.append(abs(y1 - y0) * fps)
    return sum(tempi) / len(tempi) if tempi else 0.0, (a1 - a0) / fps


def messen(arm):
    for name in ('gehen', 'laufen'):
        act = bpy.data.actions.get(name)
        if act:
            tempo, dauer = fusstempo(arm, act)
            print(f'MESSUNG {name}: Dauer {dauer:.3f} s, Standfuß-Tempo {tempo:.3f} Figur-Einheiten/s')


# ---------------------------------------------------------------------------

def figur_hoehe(netz):
    p = netz.punkte()
    return p[:, 2].max() - p[:, 2].min()


def baue_figur(name, datei):
    print(f'== Figur {name}')
    arm = importiere(os.path.join(QUELLEN, datei))
    for o in list(bpy.data.objects):
        if o.name.split('.')[0] in ENTFERNEN:
            bpy.data.objects.remove(o, do_unlink=True)
    # Clips auswählen/umbenennen
    for ziel, quelle in CLIPS.items():
        kopie = bpy.data.actions[f'CharacterArmature|{quelle}'].copy()
        kopie.name = ziel
        kopie.use_fake_user = True
    ad = arm.animation_data
    ad.action = None
    while ad.nla_tracks:
        ad.nla_tracks.remove(ad.nla_tracks[0])
    rig = Rig(arm)  # braucht noch Idle_Sword (Faust) → erst danach die Quell-Clips löschen
    for akt in list(bpy.data.actions):
        if akt.name.startswith('CharacterArmature|'):
            bpy.data.actions.remove(akt)
    netz = Netz(arm)
    rig.zuruecksetzen()
    print(f'  Figurhöhe (Idle) {figur_hoehe(netz):.3f}')
    wahl = argument('--clips')
    auswahl = [c for c in EIGENE if not wahl or wahl is True or c in wahl.split(',')]
    info = baue_eigene(rig, netz, auswahl)
    if 'sitz_body_z' in info:
        z = info['sitz_body_z']
        stelle_sitzen(rig, 0.0, z)
        print(f'  Sitzen: Body-Kopf z {z:.3f}, Hüftgelenk z {rig.kopf("UpperLeg.L").z:.3f}, Hips-Kopf z {rig.kopf("Hips").z:.3f}')
        rig.zuruecksetzen()
    if argument('--messen'):
        messen(arm)
    pruefbericht(arm, netz, auswahl)

    ordner = argument('--vorschau')
    if ordner and '--ohne-export' in ARGV:
        vorschau_rendern(arm, netz, ordner, name, auswahl if wahl else REIHENFOLGE_EXPORT)
    if '--ohne-export' in ARGV:
        return
    ad.action = None
    for akt_name in REIHENFOLGE_EXPORT:
        if akt_name not in bpy.data.actions:
            raise RuntimeError(f'Clip {akt_name} fehlt (mit --clips nur zusammen mit --ohne-export verwenden)')
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


def pruefe_figur(name):
    """Fertiges GLB laden (nach repariere_root.mjs) und prüfen/rendern – nur die exportierten Knochenspuren."""
    print(f'== Prüfe figur_{name}.glb')
    arm = importiere(os.path.join(AUSGABE, f'figur_{name}.glb'))
    ad = arm.animation_data_create()
    ad.action = None
    while ad.nla_tracks:
        ad.nla_tracks.remove(ad.nla_tracks[0])
    for b in arm.pose.bones:
        b.rotation_mode = 'QUATERNION'
    netz = Netz(arm)
    namen = sorted(a.name for a in bpy.data.actions)
    print('  Clips:', ', '.join(namen))
    if argument('--messen'):
        messen(arm)
    pruefbericht(arm, netz, [n for n in REIHENFOLGE_EXPORT if n in namen])
    ordner = argument('--vorschau')
    if ordner:
        wahl = argument('--clips')
        vorschau_rendern(arm, netz, ordner, f'{name}_glb', wahl.split(',') if wahl and wahl is not True else REIHENFOLGE_EXPORT)


def hauptprogramm():
    nur = argument('--nur')
    for name, datei in FIGUREN.items():
        if nur and nur != name:
            continue
        if argument('--pruefen'):
            pruefe_figur(name)
        else:
            baue_figur(name, datei)


hauptprogramm()
