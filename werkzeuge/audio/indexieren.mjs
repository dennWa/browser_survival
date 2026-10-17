#!/usr/bin/env node
/**
 * Erzeugt client/audio/eigene/eigene.json (Index) und client/audio/eigene/README.md (Ereignisliste)
 * aus den Dateien in client/audio/eigene/ + lautstaerke.txt.
 *   npm run sounds
 * Danach committen. Siehe client/audio/eigene/README.md.
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { baueIndex, ereignisTabelle, ENDUNGEN } from '../../client/audio/eigeneSounds.js';

const ORDNER = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../client/audio/eigene');
const lautstaerkePfad = path.join(ORDNER, 'lautstaerke.txt');
const dateien = readdirSync(ORDNER);
const { index, warnungen } = baueIndex(dateien, existsSync(lautstaerkePfad) ? readFileSync(lautstaerkePfad, 'utf8') : '');

for (const [name, e] of Object.entries(index)) {
  console.log(`  ${name}: ${e.dateien.length} Datei(en), Lautstärke ${Math.round(e.lautstaerke * 100)}`);
}
if (!Object.keys(index).length) console.log('  (noch keine eigenen Sounds – Dateien in client/audio/eigene/ legen)');
for (const w of warnungen) console.warn(`  ⚠ ${w}`);
const ignoriert = dateien.filter((d) => /\.[a-z0-9]+$/i.test(d) && !/\.(md|txt|json)$/i.test(d) && !new RegExp(`\\.(${ENDUNGEN.join('|')})$`, 'i').test(d));
for (const d of ignoriert) console.warn(`  ⚠ ${d}: Dateityp nicht unterstützt (erlaubt: ${ENDUNGEN.join(', ')})`);

writeFileSync(path.join(ORDNER, 'eigene.json'), `${JSON.stringify(index, null, 2)}\n`);
const vorlage = readFileSync(path.join(ORDNER, 'README.vorlage.md'), 'utf8');
writeFileSync(path.join(ORDNER, 'README.md'), vorlage.replace('{{EREIGNISSE}}', ereignisTabelle()));
console.log('eigene.json + README.md geschrieben');
