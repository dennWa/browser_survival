"""Gemeinsame Maße/Palette für den Survivor (Textur-Skript mit PIL + Blender-Bauskript).

Maßeinheit Meter, Figur schaut nach -Y (Blender) = +Z (glTF/Three.js), Füße bei z=0, Höhe ≈ 1,84.
Textur-Atlas 256×256: oben Farbfelder (16 px, 16 Spalten × 4 Zeilen) – Flächen zeigen mit entarteten UVs genau
auf die Mitte eines Feldes; darunter das Gesicht (Frontprojektion des Kopfes).
"""

ATLAS = 256
ZELLE = 16

# Reihenfolge = Index im Atlas (Spalte = i % 16, Zeile = i // 16)
PALETTE = [
    'haut', 'haut_schatten', 'jacke', 'jacke_dunkel', 'hemd', 'hose', 'hose_dunkel', 'stiefel',
    'sohle', 'handschuh', 'haar', 'haar_hell', 'guertel', 'metall', 'tuch', 'weiss',
    'lippen', 'schwarz',
]
IDX = {name: i for i, name in enumerate(PALETTE)}

# Farben je Variante
FARBEN = {
    'mann': {
        'haut': (214, 166, 130), 'haut_schatten': (186, 136, 104),
        'jacke': (92, 102, 66), 'jacke_dunkel': (60, 67, 46), 'hemd': (134, 54, 46),
        'hose': (101, 88, 68), 'hose_dunkel': (72, 62, 49), 'stiefel': (60, 45, 34), 'sohle': (28, 26, 26),
        'handschuh': (66, 53, 41), 'haar': (58, 40, 28), 'haar_hell': (84, 60, 42), 'guertel': (44, 34, 26),
        'metall': (168, 158, 126), 'tuch': (156, 38, 32), 'weiss': (236, 236, 226), 'lippen': (170, 100, 90),
        'schwarz': (22, 20, 20),
    },
    'frau': {
        'haut': (230, 184, 152), 'haut_schatten': (202, 152, 122),
        'jacke': (52, 88, 98), 'jacke_dunkel': (34, 58, 66), 'hemd': (204, 192, 170),
        'hose': (66, 66, 74), 'hose_dunkel': (46, 46, 54), 'stiefel': (74, 52, 40), 'sohle': (30, 28, 28),
        'handschuh': (88, 66, 52), 'haar': (150, 98, 48), 'haar_hell': (186, 134, 70), 'guertel': (56, 40, 30),
        'metall': (176, 168, 138), 'tuch': (226, 170, 58), 'weiss': (238, 238, 230), 'lippen': (176, 82, 86),
        'schwarz': (24, 22, 22),
    },
}

# Gesichtsfeld im Atlas (Pixel, links oben) und was es in Metern abdeckt
FACE_X0, FACE_Y0, FACE_W, FACE_H = 64, 64, 128, 164
KOPF_X = (-0.11, 0.11)      # Breite, die das Feld abdeckt
KOPF_Z = (1.555, 1.835)     # Höhe (Kinn → Scheitel)


def zelle_uv(name):
    """UV (Blender-Konvention, v nach oben) der Feldmitte."""
    i = IDX[name]
    spalte, zeile = i % 16, i // 16
    return ((spalte * ZELLE + ZELLE / 2) / ATLAS, 1 - (zeile * ZELLE + ZELLE / 2) / ATLAS)


def kopf_uv(x, z):
    """Frontprojektion: Punkt am Kopf (x, z) → UV (Blender-Konvention)."""
    px = FACE_X0 + (x - KOPF_X[0]) / (KOPF_X[1] - KOPF_X[0]) * FACE_W
    py = FACE_Y0 + (1 - (z - KOPF_Z[0]) / (KOPF_Z[1] - KOPF_Z[0])) * FACE_H
    return (px / ATLAS, 1 - py / ATLAS)


def kopf_pixel(x, z):
    """Gleiche Abbildung in Atlas-Pixeln (Bild-Konvention, y nach unten)."""
    return (FACE_X0 + (x - KOPF_X[0]) / (KOPF_X[1] - KOPF_X[0]) * FACE_W,
            FACE_Y0 + (1 - (z - KOPF_Z[0]) / (KOPF_Z[1] - KOPF_Z[0])) * FACE_H)
