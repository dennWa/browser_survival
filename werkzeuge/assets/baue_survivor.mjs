/**
 * Survivor-Spielfigur bauen:   npm run assets:survivor
 *   1. Texturen zeichnen (Python + Pillow)          → client/assets/3d/skins/survivor{Mann,Frau}.webp
 *   2. Modell + Skelett + Animationen in Blender    → client/assets/3d/survivor.glb
 * Blender wird gesucht in: Umgebungsvariable BLENDER, C:\Program Files\Blender Foundation\Blender *\blender.exe, PATH.
 * Vorschau-Bilder:  npm run assets:survivor -- --vorschau ordner [--posen "joggen:0,6;hacken:0,9,13"] [--ohne-export]
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SKRIPTE = path.join(WURZEL, 'werkzeuge/assets/survivor');

function findeBlender() {
  if (process.env.BLENDER && existsSync(process.env.BLENDER)) return process.env.BLENDER;
  for (const wurzel of ['C:/Program Files/Blender Foundation', 'C:/Program Files (x86)/Blender Foundation']) {
    if (!existsSync(wurzel)) continue;
    const ordner = readdirSync(wurzel).filter((n) => n.startsWith('Blender')).sort().reverse();
    for (const n of ordner) {
      const exe = path.join(wurzel, n, 'blender.exe');
      if (existsSync(exe)) return exe;
    }
  }
  return 'blender';
}

function lauf(befehl, args) {
  const r = spawnSync(befehl, args, { stdio: 'inherit', cwd: WURZEL });
  if (r.status !== 0) {
    console.error(`Fehlgeschlagen: ${befehl} ${args.join(' ')}`);
    process.exit(r.status ?? 1);
  }
}

const extra = process.argv.slice(2);
lauf(process.platform === 'win32' ? 'python' : 'python3', [path.join(SKRIPTE, 'survivor_textur.py')]);
lauf(findeBlender(), ['-b', '-P', path.join(SKRIPTE, 'survivor_bauen.py'), '--', ...extra]);
