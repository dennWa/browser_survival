#!/usr/bin/env node
/**
 * Erzeugt client/audio/eigene/eigene.json (Index) und client/audio/eigene/README.md (Ereignisliste)
 * aus den Dateien in client/audio/eigene/ + lautstaerke.txt + einstellungen.json (Audio-Zentrale).
 *   npm run sounds
 * Danach committen. Siehe client/audio/eigene/README.md. Der lokale Editor-Server baut den Index selbst (indexBauen.mjs).
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ENDUNGEN } from '../../client/audio/eigeneSounds.js';
import { schreibeSoundIndex } from './indexBauen.mjs';

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const { index, warnungen, dateien } = schreibeSoundIndex(WURZEL);

for (const [name, e] of Object.entries(index)) {
  console.log(`  ${name}: ${e.dateien.length} Datei(en), Lautstärke ${Math.round(e.lautstaerke * 100)}`);
}
if (!Object.keys(index).length) console.log('  (noch keine eigenen Sounds – Dateien in client/audio/eigene/ legen)');
for (const w of warnungen) console.warn(`  ⚠ ${w}`);
const ignoriert = dateien.filter((d) => /\.[a-z0-9]+$/i.test(d) && !/\.(md|txt|json)$/i.test(d) && !new RegExp(`\.(${ENDUNGEN.join('|')})$`, 'i').test(d));
for (const d of ignoriert) console.warn(`  ⚠ ${d}: Dateityp nicht unterstützt (erlaubt: ${ENDUNGEN.join(', ')})`);
console.log('eigene.json + README.md geschrieben');
