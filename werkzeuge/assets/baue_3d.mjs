/**
 * 3D-Figuren – Build-Schritt (nach baue_assets.py ausführen):   npm run assets:3d
 *
 *   1. Animationen aus den Kenney-FBX-Dateien ziehen → client/assets/3d/animationen.json
 *      (die FBX-Dateien enthalten jeweils das ganze Modell; wir brauchen nur die Bewegungsdaten)
 *   2. Three.js + benötigte Addons verkleinert nach client/vendor/three/ kopieren
 *      (kein CDN nötig – das Spiel läuft auch offline / im LAN)
 *
 * Braucht die Entwicklungsabhängigkeiten aus package.json (npm install).
 */
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import * as esbuild from 'esbuild';

// Mini-Attrappe fürs DOM: der FBX-Lader legt evtl. Bild-Elemente an – für Animationen unnötig
globalThis.document ??= { createElementNS: () => ({ addEventListener() {}, removeEventListener() {}, style: {} }) };
globalThis.self ??= globalThis;
const THREE = await import('three');
const { FBXLoader } = await import('three/addons/loaders/FBXLoader.js');

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const QUELLE = path.join(WURZEL, 'werkzeuge/assets/.cache/kenney_ac3');
const ZIEL_3D = path.join(WURZEL, 'client/assets/3d');
const ZIEL_VENDOR = path.join(WURZEL, 'client/vendor/three');
const ANIMATIONEN = { stehen: 'idle', rennen: 'run' };

if (!existsSync(QUELLE)) {
  console.error('Quelle fehlt – zuerst werkzeuge/assets/baue_assets.py ausführen.');
  process.exit(1);
}

// --- 1. Animationen ---------------------------------------------------------
const lader = new FBXLoader();
const clips = {};
for (const [name, datei] of Object.entries(ANIMATIONEN)) {
  const roh = readFileSync(findeDatei(QUELLE, `${datei}.fbx`));
  const gruppe = lader.parse(roh.buffer.slice(roh.byteOffset, roh.byteOffset + roh.byteLength), '');
  // Manche Dateien enthalten zusätzlich eine 1-Frame-"Pose" → den längsten Clip nehmen
  const clip = gruppe.animations.reduce((a, b) => (b.duration > a.duration ? b : a));
  clip.name = name;
  // Skalierungs-Spuren sind bei diesem Modell konstant → weglassen; Werte runden spart viel Platz
  clip.tracks = clip.tracks.filter((t) => !t.name.endsWith('.scale'));
  clip.optimize();
  const json = THREE.AnimationClip.toJSON(clip);
  for (const spur of json.tracks) {
    spur.times = spur.times.map((v) => Math.round(v * 1000) / 1000);
    spur.values = spur.values.map((v) => Math.round(v * 10000) / 10000);
  }
  clips[name] = json;
  console.log(`  Animation ${name}: ${clip.duration.toFixed(2)} s, ${json.tracks.length} Spuren`);
}
mkdirSync(ZIEL_3D, { recursive: true });
writeFileSync(path.join(ZIEL_3D, 'animationen.json'), JSON.stringify(clips));
console.log(`  → client/assets/3d/animationen.json (${(JSON.stringify(clips).length / 1024).toFixed(0)} KB)`);

// --- 2. Three.js bereitstellen ----------------------------------------------
const require = createRequire(import.meta.url);
const threeOrdner = path.resolve(path.dirname(require.resolve('three')), '..'); // three/build/three.cjs → three/
const threeVersion = JSON.parse(readFileSync(path.join(threeOrdner, 'package.json'), 'utf8')).version;
mkdirSync(ZIEL_VENDOR, { recursive: true });
for (const datei of ['three.module.js', 'three.core.js']) {
  const code = readFileSync(path.join(threeOrdner, 'build', datei), 'utf8');
  const { code: klein } = await esbuild.transform(code, { minify: true, format: 'esm', legalComments: 'inline' });
  writeFileSync(path.join(ZIEL_VENDOR, datei), klein);
  console.log(`  vendor/three/${datei}: ${(klein.length / 1024).toFixed(0)} KB`);
}
// Addons (FBX-Lader, SkeletonUtils) als ein Bündel; 'three' bleibt extern (kommt über die Import-Map)
await esbuild.build({
  // Direkte Dateipfade: 'three/addons/…' würde esbuild sonst wie 'three' als extern behandeln
  stdin: {
    contents: `export { FBXLoader } from ${JSON.stringify(path.join(threeOrdner, 'examples/jsm/loaders/FBXLoader.js'))};
               export * as SkeletonUtils from ${JSON.stringify(path.join(threeOrdner, 'examples/jsm/utils/SkeletonUtils.js'))};`,
    resolveDir: WURZEL,
  },
  bundle: true,
  format: 'esm',
  minify: true,
  external: ['three'],
  outfile: path.join(ZIEL_VENDOR, 'addons.js'),
  logLevel: 'warning',
});
copyFileSync(path.join(threeOrdner, 'LICENSE'), path.join(ZIEL_VENDOR, 'LICENSE'));
console.log(`  vendor/three/addons.js + LICENSE (three.js ${threeVersion}, MIT)`);

function findeDatei(ordner, name) {
  const kandidaten = [path.join(ordner, 'Animations', name), path.join(ordner, name)];
  const treffer = kandidaten.find(existsSync);
  if (!treffer) throw new Error(`${name} nicht gefunden in ${ordner}`);
  return treffer;
}
