// Verzeichnis der .glb-Dateien in client/assets/eigene/ → index.json (Editor-Dialog „Spielordner-Modelle“).
// Aufruf: npm run eigene:index  (nach dem Ablegen neuer Modelle; danach npm run eigene:vorschau für Bilder + Maße)
// Bereits ermittelte `masse` (npm run eigene:vorschau) bleiben erhalten.
// Runde 19: `kategorie` (Baukasten-Bereich) + `zielHoehe` (realistische Standardhöhe, m) aus eigene_kategorien.mjs.
import fs from 'node:fs';
import { HOEHEN, kategorieVon } from './eigene_kategorien.mjs';
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
  .map((datei) => {
    const stem = datei.replace(/\.glb$/i, '').toLowerCase();
    const masse = alt.get(datei);
    const zielHoehe = HOEHEN[stem] ?? masse?.hoehe;
    return { datei, name: schoen(datei), groesse: fs.statSync(path.join(ordner, datei)).size, kategorie: kategorieVon(stem), ...(masse ? { masse } : {}), ...(zielHoehe ? { zielHoehe } : {}) };
  });
fs.writeFileSync(indexDatei, JSON.stringify(liste));
console.log(`index.json: ${liste.length} Modelle`);
