/**
 * Neue Karte in KARTEN (server/spiel/karten/kartenLader.js) eintragen: Import-Zeile + Eintrag. Gemeinsam genutzt von
 * tiled.mjs (npm run karte:import) und editorImport.mjs (npm run karte:editor). Schon eingetragen → nichts tun.
 */
import { readFileSync, writeFileSync } from 'node:fs';

export function registriere(lader, id, log = console.log) {
  let text = readFileSync(lader, 'utf8');
  const name = id.toUpperCase();
  if (new RegExp(`\\b${id}: ${name}\\b`).test(text)) return false;
  // Runde 41: Windows-Checkouts haben CRLF – Zeilenende übernehmen (vorher fand die Suche nichts → Zone blieb unregistriert)
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  const importe = [...text.matchAll(/^import \{ \w+ \} from '\.\/\w+\.js';(?=\r?$)/gm)];
  const letzterImport = importe.at(-1);
  if (!letzterImport) throw new Error('kartenLader.js: Import-Zeilen nicht gefunden – bitte von Hand eintragen');
  const nachImport = letzterImport.index + letzterImport[0].length;
  text = `${text.slice(0, nachImport)}${eol}import { ${name} } from './${id}.js';${text.slice(nachImport)}`;
  text = text.replace(/(export const KARTEN = Object\.freeze\(\{\r?\n(?: {2}.*\r?\n)*?)(\}\);)/, `$1  ${id}: ${name},${eol}$2`);
  writeFileSync(lader, text);
  log(`  ${id} in KARTEN eingetragen (server/spiel/karten/kartenLader.js)`);
  return true;
}
