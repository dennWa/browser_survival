// Verzeichnis der .glb-Dateien in client/assets/eigene/ → index.json (Editor-Dialog „Spielordner-Modelle“).
// Aufruf: npm run eigene:index  (nach dem Ablegen neuer Modelle)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ordner = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'client', 'assets', 'eigene');
const schoen = (d) => d.replace(/\.glb$/i, '').replace(/-/g, ' ').replace(/\b\p{L}/gu, (c) => c.toUpperCase());
const liste = fs
  .readdirSync(ordner)
  .filter((d) => d.toLowerCase().endsWith('.glb'))
  .sort((a, b) => a.localeCompare(b, 'de'))
  .map((datei) => ({ datei, name: schoen(datei), groesse: fs.statSync(path.join(ordner, datei)).size }));
fs.writeFileSync(path.join(ordner, 'index.json'), JSON.stringify(liste));
console.log(`index.json: ${liste.length} Modelle`);
