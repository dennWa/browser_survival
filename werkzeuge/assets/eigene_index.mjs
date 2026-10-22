// Verzeichnis der .glb-Dateien in client/assets/eigene/ → index.json (Editor-Dialog „Spielordner-Modelle“).
// Aufruf: npm run eigene:index  (nach dem Ablegen neuer Modelle; danach npm run eigene:vorschau für Bilder + Maße)
// Bereits ermittelte `masse` (npm run eigene:vorschau) bleiben erhalten.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ordner = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'client', 'assets', 'eigene');
const schoen = (d) => d.replace(/\.glb$/i, '').replace(/-/g, ' ').replace(/\b\p{L}/gu, (c) => c.toUpperCase());
const indexDatei = path.join(ordner, 'index.json');
const alt = new Map((fs.existsSync(indexDatei) ? JSON.parse(fs.readFileSync(indexDatei, 'utf8')) : []).map((e) => [e.datei, e.masse]));
const liste = fs
  .readdirSync(ordner)
  .filter((d) => d.toLowerCase().endsWith('.glb'))
  .sort((a, b) => a.localeCompare(b, 'de'))
  .map((datei) => ({ datei, name: schoen(datei), groesse: fs.statSync(path.join(ordner, datei)).size, ...(alt.get(datei) ? { masse: alt.get(datei) } : {}) }));
fs.writeFileSync(indexDatei, JSON.stringify(liste));
console.log(`index.json: ${liste.length} Modelle`);
