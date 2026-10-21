/**
 * Spielerfiguren bauen:   npm run assets:figuren   (Mann + Frau → client/assets/3d/figur_mann.glb, figur_frau.glb)
 * Blender headless (figuren_bauen.py): Quaternius-Quellen + „hacken“-Clip aus hacken_quelle.glb übertragen.
 * Blender wird gesucht in: Umgebungsvariable BLENDER, C:\Program Files\Blender Foundation\Blender *\blender.exe, PATH.
 * Weitere Argumente gehen an das Skript, z. B.  npm run assets:figuren -- --nur frau --vorschau ORDNER --bilder 0,6,9,13 --ohne-export
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ORDNER = path.dirname(fileURLToPath(import.meta.url));
const WURZEL = path.resolve(ORDNER, '../../..');

function findeBlender() {
  if (process.env.BLENDER && existsSync(process.env.BLENDER)) return process.env.BLENDER;
  for (const wurzel of ['C:/Program Files/Blender Foundation', 'C:/Program Files (x86)/Blender Foundation']) {
    if (!existsSync(wurzel)) continue;
    for (const n of readdirSync(wurzel).filter((x) => x.startsWith('Blender')).sort().reverse()) {
      const exe = path.join(wurzel, n, 'blender.exe');
      if (existsSync(exe)) return exe;
    }
  }
  return 'blender';
}

const r = spawnSync(findeBlender(), ['-b', '-P', path.join(ORDNER, 'figuren_bauen.py'), '--', ...process.argv.slice(2)], { stdio: 'inherit', cwd: WURZEL });
process.exit(r.status ?? 1);
