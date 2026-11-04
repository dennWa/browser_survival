"""Kontaktbogen eines Pakets: python -I sichte.py <quelle(.obj|.glb)> <ausgabe.png> [--zerlege abstand] [--bild textur.png] [--hoch z]"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import numpy as np
from PIL import Image
import modellwerk as mw

args = sys.argv[1:]
quelle, ziel = args[0], args[1]
zerlege = float(args[args.index('--zerlege') + 1]) if '--zerlege' in args else None
bild = Image.open(args[args.index('--bild') + 1]) if '--bild' in args else None
hoch = (0, 0, 1) if '--hoch' in args and args[args.index('--hoch') + 1] == 'z' else (0, 1, 0)
splitter = float(args[args.index('--splitter') + 1]) if '--splitter' in args else None
teile = mw.lade_glb(quelle) if quelle.endswith('.glb') else mw.lade_obj(quelle, bild)
bilder, namen = [], []
for t in teile:
    if splitter:
        t = mw.ohne_splitter(t, splitter)
    fc = mw.farben_backen(t)
    if zerlege is None:
        bilder.append(mw.render(t['v'], t['f'], fc, 200, hoch=hoch))
        sz = np.ptp(t['v'], axis=0)
        namen.append(f"{t['name'][:22]} {sz[0]:.1f}x{sz[1]:.1f}x{sz[2]:.1f}")
        continue
    lab = mw.komponenten(mw.verschweisse(t['v'], t['f']))
    gr = (mw.gruppiere_nah if '--nah' in args else mw.gruppiere)(t['v'], t['f'], lab, zerlege)
    for g in range(gr.max() + 1):
        m = gr == g
        v, f = mw.teilmesh(t['v'], t['f'], m)
        sz = np.ptp(v, axis=0)
        bilder.append(mw.render(v, f, fc[m], 200, hoch=hoch))
        namen.append(f"{g} {sz[0]:.2f}x{sz[1]:.2f}x{sz[2]:.2f} n{m.sum()}")
print(len(bilder), 'Teile')
mw.kontaktbogen(bilder, namen, 8, ziel)
