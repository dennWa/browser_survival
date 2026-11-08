"""Runde 44: Sketchfab-Pakete (CC-BY) in einzelne Spielordner-Modelle zerlegen → client/assets/eigene/<name>.glb

- „Some interior pack“ (photon / that one larry)  → si-*.glb (Möbel; Kühlschrank/Automat samt Türen als EIN Modell)
- „Stone Pack“ (ashkan.fancy)                     → sp-*.glb (Felsen groß/mittel/klein + Runensteine; Kristall-Effekte p1/p2 entfallen)
- „Grass patches“ (DJMaesen)                      → gp-gras-*.glb (Grasbüschel, Alpha-MASK statt BLEND = billig, keine Animation)

Je Modell: Weltlage gebacken, Mitte x/z = 0, Boden y = 0, Blick (Front) nach +z (DREHUNG je Modell), Texturen höchstens MAX_TEX px
(JPEG ohne Alpha, PNG mit Alpha – nicht verpixelt), Normalmap bei den Steinen, Runen leuchten (emissive). Normalen bleiben.
Höhen/Kategorien: werkzeuge/assets/eigene_kategorien.mjs (HOEHEN), danach `npm run eigene:index`.

Aufruf: python werkzeuge/assets/r44/zerlege_pakete_r44.py   (PIL + numpy)
"""
import sys, os, io, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import numpy as np
from PIL import Image
import glbwerk as gw

WURZEL = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))
QUELLE = os.path.join(WURZEL, '!!!verteilen')
ZIEL = os.path.join(WURZEL, 'client', 'assets', 'eigene')
MAX_TEX = 512

# Paket → [(Ausgabename, [Knotennamen-Anfänge], Drehung um y in Grad)]
PAKETE = {
    'some_interior_pack.glb': [
        ('si-kommode', ['Furniture_CabinetDrawer01a'], -90), ('si-kommode-2', ['Furniture_CabinetDrawer02a'], -90),
        ('si-stuhl', ['Furniture_chair01a'], -90), ('si-stuhl-2', ['Furniture_chair03a'], -90),
        ('si-sofa', ['Furniture_Couch01a'], -90), ('si-sofa-2', ['Furniture_Couch02a'], -90),
        ('si-schreibtisch', ['Furniture_Desk01a'], -90), ('si-stehlampe', ['Furniture_Lamp01a'], -90),
        ('si-regal', ['Furniture_shelf01a'], -90), ('si-frisiertisch', ['Furniture_Vanity01a'], -90),
        ('si-heizkoerper', ['Radiator01a'], -90), ('si-kuehlschrank', ['refrigerator01a', 'refrigeratorDoor01a', 'refrigeratorDoor02a'], -90),
        ('si-spuele', ['SinkKitchen01a'], -90), ('si-getraenkeautomat', ['VendingMachineSoda01a_reference'], -90),
    ],
    'stone_pack.glb': [(f'sp-fels-gross-{i}', [n], 0) for i, n in enumerate(['BIG_1', 'Big_2', 'Big_3', 'Big_4', 'Big_5'], 1)]
    + [(f'sp-fels-{i}', [n], 0) for i, n in enumerate(['Mid_1', 'Mid_2', 'Mid_3', 'Mid_4', 'Mid_5'], 1)]
    + [(f'sp-stein-{i}', [f'Small_{i}'], 0) for i in range(1, 9)]
    + [(f'sp-runenstein-{i}', [f'Runic_{i}'], 0) for i in range(1, 8)],
    'grass_patches.glb': [(f'gp-gras-{i}', [f'grasspatch{i}'], 0) for i in range(1, 4)],
}


def bild(g, binaer, tex_index, alpha=False, max_px=MAX_TEX, als_normal=False):
    roh, _ = gw.bild_bytes(g, binaer, tex_index)
    im = Image.open(io.BytesIO(roh))
    hat_alpha = alpha and im.mode in ('RGBA', 'LA', 'P')
    im = im.convert('RGBA' if hat_alpha else 'RGB')
    if max(im.size) > max_px:
        im = im.resize((max_px, max_px * im.size[1] // im.size[0]), Image.LANCZOS)
    aus = io.BytesIO()
    if hat_alpha:
        im.save(aus, 'PNG', optimize=True); return aus.getvalue(), 'image/png'
    im.save(aus, 'JPEG', quality=90 if als_normal else 86); return aus.getvalue(), 'image/jpeg'


def teile_unter(g, binaer, wurzel):
    """Alle Primitive unter Knoten `wurzel` (inkl.) in Weltkoordinaten."""
    eltern = gw.eltern_von(g)
    aus = []
    stapel = [wurzel]
    while stapel:
        i = stapel.pop()
        nd = g['nodes'][i]
        stapel += nd.get('children', [])
        if 'mesh' not in nd:
            continue
        M = gw.weltmatrix(g, i, eltern); N = np.linalg.inv(M[:3, :3]).T
        for pr in g['meshes'][nd['mesh']]['primitives']:
            at = pr['attributes']
            v = gw.accessor(g, binaer, at['POSITION']).astype(np.float64) @ M[:3, :3].T + M[:3, 3]
            n = gw.accessor(g, binaer, at['NORMAL']).astype(np.float64) @ N.T if 'NORMAL' in at else None
            if n is not None:
                n /= np.maximum(np.linalg.norm(n, axis=1, keepdims=True), 1e-12)
            uv = gw.accessor(g, binaer, at['TEXCOORD_0']).astype(np.float64) if 'TEXCOORD_0' in at else None
            f = gw.accessor(g, binaer, pr['indices']).astype(np.int64).reshape(-1, 3)
            if np.linalg.det(M[:3, :3]) < 0:
                f = f[:, ::-1]
            aus.append({'v': v, 'n': n, 'uv': uv, 'f': f, 'mat': pr.get('material')})
    return aus


def material(g, binaer, mi, pu, gl, cache):
    """Quell-Material → Spiel-Material (baseColor, ggf. Normal/Emissive, Alpha MASK)."""
    if mi in cache:
        return cache[mi]
    m = g['materials'][mi]
    pbr = m.get('pbrMetallicRoughness', {})
    sg = m.get('extensions', {}).get('KHR_materials_pbrSpecularGlossiness')
    farbe_tex = (sg or {}).get('diffuseTexture') or pbr.get('baseColorTexture')
    alpha = m.get('alphaMode') in ('BLEND', 'MASK')

    def tex(index, **k):
        daten, mime = bild(g, binaer, index, **k)
        gl['images'].append({'bufferView': pu.roh(daten), 'mimeType': mime})
        gl['textures'].append({'source': len(gl['images']) - 1, 'sampler': 0})
        return len(gl['textures']) - 1
    neu = {'name': m.get('name', 'm'), 'pbrMetallicRoughness': {'metallicFactor': 0, 'roughnessFactor': max(0.6, pbr.get('roughnessFactor', 0.8))}}
    if farbe_tex is not None:
        neu['pbrMetallicRoughness']['baseColorTexture'] = {'index': tex(farbe_tex['index'], alpha=alpha)}
    if 'baseColorFactor' in pbr and farbe_tex is None:
        neu['pbrMetallicRoughness']['baseColorFactor'] = pbr['baseColorFactor']
    if 'normalTexture' in m and not alpha:
        neu['normalTexture'] = {'index': tex(m['normalTexture']['index'], als_normal=True)}
    if 'emissiveTexture' in m:
        neu['emissiveTexture'] = {'index': tex(m['emissiveTexture']['index'])}
        neu['emissiveFactor'] = m.get('emissiveFactor', [1, 1, 1])
    if alpha:
        neu['alphaMode'] = 'MASK'; neu['alphaCutoff'] = 0.45; neu['doubleSided'] = True
    gl['materials'].append(neu)
    cache[mi] = len(gl['materials']) - 1
    return cache[mi]


def schreibe(name, g, binaer, wurzeln, drehung):
    teile = [t for w in wurzeln for t in teile_unter(g, binaer, w)]
    alle = np.concatenate([t['v'] for t in teile])
    mitte = np.array([(alle[:, 0].min() + alle[:, 0].max()) / 2, alle[:, 1].min(), (alle[:, 2].min() + alle[:, 2].max()) / 2])
    D = gw.drehvektor_matrix([0, 1, 0], math.radians(drehung))
    if np.ptp(alle, axis=0).max() > 50:  # in cm exportiert (Grass patches) → m
        D = D * 0.01
    pu = gw.Puffer()
    gl = {'asset': {'version': '2.0', 'generator': 'browser_survival r44 pakete'}, 'scene': 0, 'scenes': [{'nodes': [0]}],
          'nodes': [{'name': name, 'mesh': 0}], 'materials': [], 'images': [], 'textures': [],
          'samplers': [{'magFilter': 9729, 'minFilter': 9987}], 'meshes': [{'name': name, 'primitives': []}]}
    cache = {}
    dreiecke = 0
    for t in teile:
        v = (t['v'] - mitte) @ D.T
        attr = {'POSITION': pu.add(v.astype(np.float32), 5126, 'VEC3', mm=True)}
        if t['n'] is not None:
            attr['NORMAL'] = pu.add((t['n'] @ (D / np.linalg.norm(D[0])).T).astype(np.float32), 5126, 'VEC3')
        if t['uv'] is not None:
            attr['TEXCOORD_0'] = pu.add(t['uv'].astype(np.float32), 5126, 'VEC2')
        gross = len(v) >= 65535
        idx = pu.add(t['f'].astype(np.uint32 if gross else np.uint16).reshape(-1), 5125 if gross else 5123, 'SCALAR', 34963)
        prim = {'attributes': attr, 'indices': idx}
        if t['mat'] is not None:
            prim['material'] = material(g, binaer, t['mat'], pu, gl, cache)
        gl['meshes'][0]['primitives'].append(prim)
        dreiecke += len(t['f'])
    if not gl['images']:
        for k in ('images', 'textures', 'samplers'):
            del gl[k]
    pfad = os.path.join(ZIEL, name + '.glb')
    gw.schreibe_glb(pfad, gl, pu)
    groesse = np.ptp((alle - mitte) @ D.T, axis=0)
    print(f'{name:24s} {dreiecke:6d} Dreiecke  {os.path.getsize(pfad) // 1024:5d} KB  Maße {groesse.round(2).tolist()}')


if __name__ == '__main__':
    nur = sys.argv[1:]
    for datei, liste in PAKETE.items():
        g, binaer = gw.lese_glb(os.path.join(QUELLE, datei))
        for name, anfaenge, drehung in liste:
            if nur and not any(name.startswith(n) for n in nur):
                continue
            wurzeln = []
            for anfang in anfaenge:
                treffer = [i for i, nd in enumerate(g['nodes']) if nd.get('name', '').startswith(anfang) and 'mesh' not in nd]
                wurzeln += treffer[:1]
            if not wurzeln:
                print('FEHLT', name, anfaenge); continue
            schreibe(name, g, binaer, wurzeln, drehung)
