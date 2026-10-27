"""
Funkstimme „Jelke“ für das Tutorial erzeugen: liest FUNK aus server/spiel/tutorial/skript.js und spricht jede Zeile mit
Piper (Offline-TTS, MIT) und der deutschen Stimme „Thorsten“ (CC0) → client/audio/tutorial/<id>.ogg (Vorbis, mono).
Der Funk-Klang kommt erst im Spiel dazu (client/audio/funkstimme.js) – hier entsteht nur die saubere Stimme.

    python3 werkzeuge/audio/tutorial_stimme.py --piper /pfad/venv/bin/piper --modell /pfad/de_DE-thorsten-medium.onnx [--alle]

Ohne --alle werden nur geänderte/neue Zeilen erzeugt (Text-Prüfsumme in client/audio/tutorial/stimme.json).
Eigene Aufnahme statt TTS? Datei mit gleichem Namen ablegen und ihren Eintrag aus stimme.json löschen.
Braucht: node, ffmpeg (libvorbis), piper-tts (pip install piper-tts) + Modell von huggingface.co/rhasspy/piper-voices (de/de_DE/thorsten/medium).
"""
import argparse
import hashlib
import json
import subprocess
import tempfile
from pathlib import Path

WURZEL = Path(__file__).resolve().parents[2]
ZIEL = WURZEL / 'client' / 'audio' / 'tutorial'
INDEX = ZIEL / 'stimme.json'

arg = argparse.ArgumentParser()
arg.add_argument('--piper', required=True)
arg.add_argument('--modell', required=True)
arg.add_argument('--alle', action='store_true')
a = arg.parse_args()

funk = json.loads(subprocess.check_output(['node', '--input-type=module', '-e',
    "import { FUNK } from './server/spiel/tutorial/skript.js'; console.log(JSON.stringify(FUNK));"], cwd=WURZEL))
ZIEL.mkdir(parents=True, exist_ok=True)
stand = json.loads(INDEX.read_text(encoding='utf-8')) if INDEX.exists() else {}
neu = 0
for zid, text in funk.items():
    gesprochen = text.replace('[Rauschen]', '').replace('…', ',').strip()
    pruef = hashlib.sha1(gesprochen.encode()).hexdigest()[:12]
    datei = ZIEL / f'{zid}.ogg'
    if not a.alle and datei.exists() and stand.get(zid) == pruef:
        continue
    with tempfile.TemporaryDirectory() as tmp:
        wav = Path(tmp) / 'z.wav'
        subprocess.run([a.piper, '-m', a.modell, '-f', str(wav), '--length-scale', '1.12', '--noise-scale', '0.5', '--sentence-silence', '0.25'],
                       input=gesprochen.encode(), check=True, capture_output=True)
        subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', str(wav), '-af', 'loudnorm=I=-18:TP=-2,afade=t=in:d=0.02',
                        '-ac', '1', '-ar', '22050', '-c:a', 'libvorbis', '-q:a', '2', str(datei)], check=True)
    stand[zid] = pruef
    neu += 1
for alt in set(stand) - set(funk):
    stand.pop(alt)
    (ZIEL / f'{alt}.ogg').unlink(missing_ok=True)
INDEX.write_text(json.dumps(stand, indent=1, sort_keys=True) + '\n', encoding='utf-8')
print(f'{neu} Zeile(n) erzeugt, {len(funk)} insgesamt → {ZIEL}')
