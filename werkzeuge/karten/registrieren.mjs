/**
 * Neue Karte in KARTEN (server/spiel/karten/kartenLader.js) eintragen: Import-Zeile + Eintrag. Gemeinsam genutzt von
 * tiled.mjs (npm run karte:import) und editorImport.mjs (npm run karte:editor). Schon eingetragen → nichts tun.
 */
import { readFileSync, writeFileSync } from 'node:fs';

export function registriere(lader, id, log = console.log) {
  let text = readFileSync(lader, 'utf8');
  const name = id.toUpperCase();
  if (new RegExp(`\\b${id}: ${name}\\b`).test(text)) return false;
  const importe = [...text.matchAll(/^import \{ \w+ \} from '\.\/\w+\.js';$/gm)];
  const letzterImport = importe.at(-1);
  if (!letzterImport) throw new Error('kartenLader.js: Import-Zeilen nicht gefunden – bitte von Hand eintragen');
  const nachImport = letzterImport.index + letzterImport[0].length;
  text = `${text.slice(0, nachImport)}\nimport { ${name} } from './${id}.js';${text.slice(nachImport)}`;
  text = text.replace(/(export const KARTEN = Object\.freeze\(\{\n(?:  .*\n)*?)(\}\);)/, `$1  ${id}: ${name},\n$2`);
  writeFileSync(lader, text);
  log(`  ${id} in KARTEN eingetragen (server/spiel/karten/kartenLader.js)`);
  return true;
}
