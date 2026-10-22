// Vorschaubilder (PNG, 128 px) für alle .glb in client/assets/eigene/ → client/assets/eigene/vorschau/<name>.png
// und natürliche Maße (`masse` {b,h,hoehe} in m) je Modell in index.json (Katalog für KI/Editor: editor/kern/spielordner.js).
// Rendert im headless Chromium mit derselben Funktion wie der Editor-Upload (editor/ui/modellImport.js vorschauBild).
// Aufruf: npm run eigene:vorschau [-- --alle]   (ohne --alle nur fehlende Bilder)
import { spawn, execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const wurzel = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const ordner = path.join(wurzel, 'client', 'assets', 'eigene');
const ziel = path.join(ordner, 'vorschau');
const alle = process.argv.includes('--alle');
const port = 8097;
const require = createRequire(import.meta.url);
let pw;
try {
  pw = require('playwright');
} catch {
  pw = require(path.join(execSync('npm root -g').toString().trim(), 'playwright'));
}
fs.mkdirSync(ziel, { recursive: true });
const indexDatei = path.join(ordner, 'index.json');
const index = fs.existsSync(indexDatei) ? JSON.parse(fs.readFileSync(indexDatei, 'utf8')) : [];
const masseVon = new Map(index.map((e) => [e.datei, e.masse]));
const offen = fs.readdirSync(ordner).filter((d) => d.toLowerCase().endsWith('.glb') && (alle || !masseVon.get(d) || !fs.existsSync(path.join(ziel, d.replace(/\.glb$/i, '.png')))));
if (!offen.length) process.exit(console.log('Alle Vorschaubilder vorhanden.'));

const server = spawn(process.execPath, ['server/node/start.js', '--gast'], { cwd: wurzel, env: { ...process.env, PORT: String(port) }, stdio: 'ignore' });
try {
  for (let i = 0; i < 50; i++) {
    try { if ((await fetch(`http://localhost:${port}/editor/`)).ok) break; } catch {}
    await new Promise((f) => setTimeout(f, 200));
  }
  const browser = await pw.chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const seite = await browser.newPage();
  await seite.goto(`http://localhost:${port}/editor/`);
  let fertig = 0;
  for (const datei of offen) {
    const url = `/client/assets/eigene/${encodeURIComponent(datei)}`;
    const bild = await seite.evaluate(async (u) => {
      const { GLTFLoader } = await import('/client/vendor/three/addons.js');
      const { vorschauBild, messeModell } = await import('/editor/ui/modellImport.js');
      const { masseAusGroesse } = await import('/editor/kern/bibliothek.js');
      const szene = (await new GLTFLoader().parseAsync(await (await fetch(u)).arrayBuffer(), '')).scene;
      const g = messeModell(szene);
      return { bild: vorschauBild(szene, 128), masse: masseAusGroesse(g) };
    }, url).catch((e) => (console.warn(`${datei}: ${e.message.split('\n')[0]}`), null));
    if (!bild) continue;
    masseVon.set(datei, bild.masse);
    if (bild.bild) fs.writeFileSync(path.join(ziel, datei.replace(/\.glb$/i, '.png')), Buffer.from(bild.bild.split(',')[1], 'base64'));
    if (++fertig % 50 === 0) console.log(`${fertig}/${offen.length}`);
  }
  await browser.close();
  for (const e of index) if (masseVon.get(e.datei)) e.masse = masseVon.get(e.datei);
  fs.writeFileSync(indexDatei, JSON.stringify(index));
  console.log(`Vorschaubilder: ${fertig}/${offen.length} neu`);
} finally {
  server.kill();
}
