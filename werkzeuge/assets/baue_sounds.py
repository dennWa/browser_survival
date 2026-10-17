"""
Sound-Pipeline: lädt freie (CC0) Geräuschpakete, schneidet/normalisiert sie mit ffmpeg und legt sie als kleine
Mono-OGGs in client/audio/samples/ ab (+ samples.json). client/audio/sound.js spielt sie anstelle der Synthese
(fehlt eine Datei, bleibt die Synthese als Ersatz).

Einrichten: ffmpeg muss installiert sein. Ausführen:  python3 werkzeuge/assets/baue_sounds.py
Downloads landen in werkzeuge/assets/.cache (gitignored). Lizenzen: client/audio/samples/LIZENZEN.md (alles CC0).
"""
import json
import shutil
import subprocess
import urllib.request
import zipfile
from pathlib import Path

WURZEL = Path(__file__).resolve().parents[2]
CACHE = Path(__file__).resolve().parent / '.cache' / 'sounds'
ZIEL = WURZEL / 'client' / 'audio' / 'samples'

QUELLEN = {
    'impact': 'https://kenney.nl/media/pages/assets/impact-sounds/87b4ddecda-1677589768/kenney_impact-sounds.zip',
    'rpg': 'https://kenney.nl/media/pages/assets/rpg-audio/8e99002d76-1677590336/kenney_rpg-audio.zip',
    'zombies': 'https://opengameart.org/sites/default/files/zombies.zip',
    'waffen': 'https://opengameart.org/sites/default/files/sounds.zip',
    'zombienoises': 'https://opengameart.org/sites/default/files/zombienoises.zip',
}

LIZENZEN = [
    ('Impact Sounds', 'Kenney (kenney.nl)', 'CC0', 'https://kenney.nl/assets/impact-sounds', 'Hacken, Treffer, Aufprall, Türen'),
    ('RPG Audio', 'Kenney (kenney.nl)', 'CC0', 'https://kenney.nl/assets/rpg-audio', 'Axthieb, Türen, Knarren, Stoff'),
    ('Zombies Sound Pack', 'artisticdude', 'CC0', 'https://opengameart.org/content/zombies-sound-pack', 'Zombie-Laute'),
    ('Zombie Noises and Moans', 'ianzazz', 'CC0', 'https://opengameart.org/content/zombie-noises-and-moans', 'Zombie-Stöhnen'),
    ('Gunshot Sounds', 'Tabasco', 'CC0', 'https://opengameart.org/content/gunshot-sounds', 'Pistole, Schrotflinte'),
]

# Name → Liste von Varianten. Eintrag = (Quelle, Dateiname, [ffmpeg-Optionen vor dem Ausgang]) – Lautstärke relativ (dB)
def imp(n, db=0):
    return ('impact', n, db)


def rpg(n, db=0):
    return ('rpg', n, db)


SAMPLES = {
    'pistole': [('waffen', 'cz.wav', 0, 0.0, 0.9)],
    'schrotflinte': [('waffen', 'shotty.wav', 0, 0.0, 0.7)],
    'aufheben': [rpg('cloth1.ogg', -4), rpg('cloth3.ogg', -4), rpg('handleSmallLeather.ogg', -4)],
    'hack_holz': [rpg('chop.ogg', 2), imp('impactWood_heavy_000.ogg'), imp('impactWood_heavy_001.ogg'), imp('impactWood_heavy_003.ogg')],
    'hack_stein': [imp(f'impactMining_00{i}.ogg') for i in range(5)],
    'treffer_zombie': [imp('impactPunch_medium_000.ogg'), imp('impactPunch_medium_002.ogg'), imp('impactSoft_heavy_001.ogg')],
    'treffer_spieler': [imp('impactPunch_heavy_000.ogg'), imp('impactPunch_heavy_003.ogg')],
    'tuer_auf': [rpg('doorOpen_1.ogg'), rpg('doorOpen_2.ogg')],
    'tuer_zu': [rpg(f'doorClose_{i}.ogg') for i in range(1, 5)],
    'tuer_schlag': [imp('impactWood_heavy_002.ogg'), imp('impactWood_heavy_004.ogg'), imp('impactWood_medium_001.ogg')],
    'tuer_bricht': [imp('impactWood_heavy_000.ogg'), imp('impactPlank_medium_003.ogg')],
    'aufprall': [imp('impactMetal_heavy_000.ogg'), imp('impactMetal_heavy_002.ogg')],
    'fahrzeug_schaden': [imp('impactMetal_medium_001.ogg'), imp('impactMetal_medium_003.ogg'), imp('impactPlate_heavy_001.ogg')],
    'fahrzeug_kaputt': [imp('impactMetal_heavy_004.ogg')],
    'autotuer': [imp('impactMetal_light_002.ogg'), rpg('metalLatch.ogg')],
    'gebaut': [imp('impactWood_medium_000.ogg'), imp('impactWood_medium_003.ogg'), imp('impactPlank_medium_001.ogg')],
    'werkeln': [imp('impactPlank_medium_000.ogg'), imp('impactPlank_medium_004.ogg'), imp('impactWood_light_002.ogg')],
    'graben': [imp('impactSoft_medium_000.ogg'), imp('impactSoft_medium_003.ogg')],
    'stein_bricht': [imp('impactMining_003.ogg')],
    'zombie_stoehnen': [('zombienoises', 'zombienoise1.ogg', 0), ('zombienoises', 'zombienoise2.ogg', 0)] + [('zombies', f'zombie-{i}.wav', 0) for i in (16, 17, 18, 21)],
    'zombie_angriff': [('zombienoises', 'fastzombie1.ogg', 0)] + [('zombies', f'zombie-{i}.wav', 0) for i in (5, 7, 11, 24)],
    'zombie_tod': [('zombienoises', 'zombienoise3.ogg', 0), ('zombies', 'zombie-19.wav', 0), ('zombies', 'zombie-20.wav', 0)],
}


def lade(name):
    ordner = CACHE / name
    if ordner.exists():
        return ordner
    ordner.mkdir(parents=True)
    zip_pfad = CACHE / f'{name}.zip'
    anfrage = urllib.request.Request(QUELLEN[name], headers={'User-Agent': 'Mozilla/5.0'})
    print(f'  lade {name} …')
    zip_pfad.write_bytes(urllib.request.urlopen(anfrage, timeout=120).read())
    with zipfile.ZipFile(zip_pfad) as z:
        z.extractall(ordner)
    return ordner


def finde(ordner, datei):
    treffer = [p for p in ordner.rglob(datei) if '__MACOSX' not in p.parts]
    if not treffer:
        raise FileNotFoundError(f'{datei} nicht in {ordner}')
    return treffer[0]


def ffmpeg(args):
    subprocess.run(['ffmpeg', '-v', 'error', '-y', *args], check=True)


def wandle(eintrag, ziel):
    quelle, datei, db, *rest = eintrag
    start, ende = (rest + [0.0, None])[:2] if rest else (0.0, None)
    eingang = finde(lade(quelle), datei)
    filter_ = f'highpass=f=40,loudnorm=I=-20:TP=-2:LRA=7,volume={db}dB'
    args = ['-i', str(eingang)]
    if ende:
        args += ['-ss', str(start), '-t', str(ende)]
        filter_ = f'highpass=f=40,loudnorm=I=-20:TP=-2:LRA=7,volume={db}dB,afade=t=out:st={ende - 0.15}:d=0.15'
    ffmpeg([*args, '-ac', '1', '-ar', '32000', '-af', filter_, '-c:a', 'libvorbis', '-q:a', '3', str(ziel)])


def baue_baumfall(ziel):
    """Baum fällt: Knarren, dann Aufschlag (passt zu renderer.baumFaellt: Knarren 0–1 s, Fall ab 1 s, Aufschlag ≈1,65 s)."""
    creak = finde(lade('rpg'), 'creak2.ogg')
    creak3 = finde(lade('rpg'), 'creak3.ogg')
    schlag = finde(lade('impact'), 'impactWood_heavy_002.ogg')
    dumpf = finde(lade('impact'), 'impactSoft_heavy_003.ogg')
    ffmpeg([
        '-i', str(creak), '-i', str(creak3), '-i', str(schlag), '-i', str(dumpf),
        '-filter_complex',
        '[0]adelay=0,volume=0.9[a];[1]adelay=550,volume=0.8[b];[2]adelay=1600,volume=1.6[c];[3]adelay=1650,volume=1.3[d];'
        '[a][b][c][d]amix=inputs=4:normalize=0,alimiter=limit=0.9[m]',
        '-map', '[m]', '-ac', '1', '-ar', '32000', '-c:a', 'libvorbis', '-q:a', '3', str(ziel),
    ])


def main():
    if not shutil.which('ffmpeg'):
        raise SystemExit('ffmpeg fehlt')
    if ZIEL.exists():
        shutil.rmtree(ZIEL)
    ZIEL.mkdir(parents=True)
    CACHE.mkdir(parents=True, exist_ok=True)
    manifest = {}
    for name, varianten in SAMPLES.items():
        dateien = []
        for i, eintrag in enumerate(varianten):
            datei = f'{name}_{i}.ogg'
            wandle(eintrag, ZIEL / datei)
            dateien.append(datei)
        manifest[name] = dateien
    baue_baumfall(ZIEL / 'baum_faellt_0.ogg')
    manifest['baum_faellt'] = ['baum_faellt_0.ogg']
    (ZIEL / 'samples.json').write_text(json.dumps(manifest, indent=1), encoding='utf-8')
    zeilen = ['# Sound-Lizenzen', '', 'Alle Geräusche sind CC0 (gemeinfrei). Bearbeitet (gekürzt, normalisiert) mit werkzeuge/assets/baue_sounds.py.', '',
              '| Paket | Urheber | Lizenz | Verwendet für |', '|---|---|---|---|']
    zeilen += [f'| [{p}]({u}) | {a} | {l} | {z} |' for p, a, l, u, z in LIZENZEN]
    (ZIEL / 'LIZENZEN.md').write_text('\n'.join(zeilen) + '\n', encoding='utf-8')
    gesamt = sum(p.stat().st_size for p in ZIEL.glob('*.ogg'))
    print(f'{sum(len(v) for v in manifest.values())} Samples, {gesamt / 1024:.0f} KB → {ZIEL.relative_to(WURZEL)}')


if __name__ == '__main__':
    main()
