#!/usr/bin/env node
/**
 * Erzeugt client/musik/musik.json aus den Unterordnern von client/musik/ (ein Ordner pro Zone + "alle" + "hauptmenue")
 * und client/musik/einstellungen.json (Reihenfolge/Zufall, schreibt die Audio-Zentrale).
 *   npm run musik:index
 * Danach committen (die Datei und die Musikdateien). Siehe client/musik/README.md.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { musikOrdner } from '../../client/audio/musikIndex.js';
import { schreibeMusikIndex } from '../audio/indexBauen.mjs';

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const { index, warnungen } = schreibeMusikIndex(WURZEL);
for (const ordner of musikOrdner(index)) console.log(`  ${ordner}/: ${index[ordner].length} Stück(e)`);
for (const w of warnungen) console.warn(`  ⚠ ${w}`);
console.log('client/musik/musik.json geschrieben');
