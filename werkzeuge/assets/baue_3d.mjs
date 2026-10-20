/**
 * 3D-Figuren – Build-Schritt (nach baue_assets.py ausführen):   npm run assets:3d
 *
 *   1. Animationen aus den Kenney-FBX-Dateien ziehen → client/assets/3d/animationen.json
 *      (die FBX-Dateien enthalten jeweils das ganze Modell; wir brauchen nur die Bewegungsdaten)
 *   2. Three.js + benötigte Addons verkleinert nach client/vendor/three/ kopieren
 *      (kein CDN nötig – das Spiel läuft auch offline / im LAN)
 *
 *   3. Natur-Modelle (Gras, später Pflanzen/Bäume): werkzeuge/assets/quellen/natur/*.glb → client/assets/3d/natur/ + natur.json
 *      (Index mit Höhe/Dreiecken je Modell; Streuung auf der Karte: client/darstellung/naturKonfiguration.js)
 *
 * Braucht die Entwicklungsabhängigkeiten aus package.json (npm install).
 * `npm run assets:3d -- --nur-vendor` überspringt Schritt 1 (ohne heruntergeladene Quellpakete, z. B. nur neue Addons).
 */
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, existsSync, readdirSync } from 'node:fs';
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

const NUR_VENDOR = process.argv.includes('--nur-vendor');
if (!NUR_VENDOR && !existsSync(QUELLE)) {
  console.error('Quelle fehlt – zuerst werkzeuge/assets/baue_assets.py ausführen (oder --nur-vendor).');
  process.exit(1);
}

// --- 1. Animationen ---------------------------------------------------------
if (!NUR_VENDOR) {
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
}

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
// Addons (FBX-/GLTF-/OBJ-Lader, GLTF-Exporter für den Map-Editor-Import, SkeletonUtils, Orbit-/Transform-Steuerung und Aufkleber
// (DecalGeometry) für die Modell-Werkstatt des Editors, Nachbearbeitung (EffectComposer, GTAO, Bloom, OutputPass) und
// RoomEnvironment (Umgebungslicht für PBR/.glb) fürs Spiel) als ein Bündel; 'three' bleibt extern (kommt über die Import-Map)
await esbuild.build({
  // Direkte Dateipfade: 'three/addons/…' würde esbuild sonst wie 'three' als extern behandeln
  stdin: {
    contents: `export { FBXLoader } from ${JSON.stringify(path.join(threeOrdner, 'examples/jsm/loaders/FBXLoader.js'))};
               export { GLTFLoader } from ${JSON.stringify(path.join(threeOrdner, 'examples/jsm/loaders/GLTFLoader.js'))};
               export { OBJLoader } from ${JSON.stringify(path.join(threeOrdner, 'examples/jsm/loaders/OBJLoader.js'))};
               export { GLTFExporter } from ${JSON.stringify(path.join(threeOrdner, 'examples/jsm/exporters/GLTFExporter.js'))};
               export { OrbitControls } from ${JSON.stringify(path.join(threeOrdner, 'examples/jsm/controls/OrbitControls.js'))};
               export { DecalGeometry } from ${JSON.stringify(path.join(threeOrdner, 'examples/jsm/geometries/DecalGeometry.js'))};
               export { TransformControls } from ${JSON.stringify(path.join(threeOrdner, 'examples/jsm/controls/TransformControls.js'))};
               export { EffectComposer } from ${JSON.stringify(path.join(threeOrdner, 'examples/jsm/postprocessing/EffectComposer.js'))};
               export { Pass } from ${JSON.stringify(path.join(threeOrdner, 'examples/jsm/postprocessing/Pass.js'))};
               export { GTAOPass } from ${JSON.stringify(path.join(threeOrdner, 'examples/jsm/postprocessing/GTAOPass.js'))};
               export { UnrealBloomPass } from ${JSON.stringify(path.join(threeOrdner, 'examples/jsm/postprocessing/UnrealBloomPass.js'))};
               export { OutputPass } from ${JSON.stringify(path.join(threeOrdner, 'examples/jsm/postprocessing/OutputPass.js'))};
               export { RoomEnvironment } from ${JSON.stringify(path.join(threeOrdner, 'examples/jsm/environments/RoomEnvironment.js'))};
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

// --- 3. Natur-Modelle (Gras, Pflanzen …) ------------------------------------
{
  const quelle = path.join(WURZEL, 'werkzeuge/assets/quellen/natur');
  const ziel = path.join(ZIEL_3D, 'natur');
  if (existsSync(quelle)) {
    mkdirSync(ziel, { recursive: true });
    const arten = {};
    for (const datei of readdirSync(quelle).filter((d) => d.endsWith('.glb')).sort()) {
      copyFileSync(path.join(quelle, datei), path.join(ziel, datei));
      const info = leseGlbInfo(readFileSync(path.join(quelle, datei)));
      arten[datei.replace(/\.glb$/, '')] = { datei, ...info };
    }
    writeFileSync(path.join(ziel, 'natur.json'), JSON.stringify({ arten }, null, 1) + '\n');
    console.log(`  assets/3d/natur/ (${Object.keys(arten).length} Modelle + natur.json)`);
  }
}

/** Höhe (Modell-Einheiten, y-Ausdehnung), Fußabdruck-Radius und Dreiecke aus dem JSON-Teil einer .glb */
function leseGlbInfo(puffer) {
  const json = JSON.parse(puffer.subarray(20, 20 + puffer.readUInt32LE(12)).toString('utf8'));
  const zugriffe = json.accessors ?? [];
  let dreiecke = 0;
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const mesh of json.meshes ?? []) {
    for (const p of mesh.primitives) {
      dreiecke += (p.indices !== undefined ? zugriffe[p.indices].count : zugriffe[p.attributes.POSITION].count) / 3;
      const pos = zugriffe[p.attributes.POSITION];
      for (let i = 0; i < 3; i++) {
        min[i] = Math.min(min[i], pos.min[i]);
        max[i] = Math.max(max[i], pos.max[i]);
      }
    }
  }
  return { hoehe: +(max[1] - Math.min(0, min[1])).toFixed(3), radius: +Math.max(max[0] - min[0], max[2] - min[2]).toFixed(3) / 2, dreiecke };
}

function findeDatei(ordner, name) {
  const kandidaten = [path.join(ordner, 'Animations', name), path.join(ordner, name)];
  const treffer = kandidaten.find(existsSync);
  if (!treffer) throw new Error(`${name} nicht gefunden in ${ordner}`);
  return treffer;
}
