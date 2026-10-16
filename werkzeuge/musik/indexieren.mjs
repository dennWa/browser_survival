#!/usr/bin/env node
/**
 * Erzeugt client/musik/musik.json aus den Unterordnern von client/musik/ (ein Ordner pro Zone + "alle").
 *   npm run musik:index
 * Danach committen (die Datei und die Musikdateien). Siehe client/musik/README.md.
 */
import { readdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ORDNER = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../client/musik');
const ENDUNGEN = new Set(['.mp3', '.ogg', '.wav', '.m4a', '.flac', '.opus']);
const index = {};
for (const eintrag of readdirSync(ORDNER).sort()) {
  const pfad = path.join(ORDNER, eintrag);
  if (!statSync(pfad).isDirectory()) continue;
  const dateien = readdirSync(pfad).filter((d) => ENDUNGEN.has(path.extname(d).toLowerCase())).sort();
  index[eintrag] = dateien;
  console.log(`  ${eintrag}/: ${dateien.length} Stück(e)`);
}
writeFileSync(path.join(ORDNER, 'musik.json'), `${JSON.stringify(index, null, 2)}\n`);
console.log('client/musik/musik.json geschrieben');
