#!/usr/bin/env node
/**
 * Runde 26: schreibt editor/KI_KARTEN_ANLEITUNG.md (Anleitung + Katalog für fremde KIs) aus den echten Registern.
 *   npm run ki:anleitung          neu schreiben
 *   npm run ki:anleitung -- --pruefen   nur prüfen (Exit 1, wenn veraltet)
 * Nach JEDEM neuen Modell/Sound/Item/Kacheltyp ausführen – tests/kiAnleitung.test.js prüft das.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { baueKiAnleitung } from '../../editor/kern/kiAnleitung.js';

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const ZIEL = path.join(WURZEL, 'editor/KI_KARTEN_ANLEITUNG.md');

export function erzeugeText() {
  const json = (p, standard) => {
    try {
      return JSON.parse(readFileSync(path.join(WURZEL, p), 'utf8'));
    } catch {
      return standard;
    }
  };
  return baueKiAnleitung({ eigeneModelle: json('client/assets/eigene/index.json', []), musik: json('client/musik/musik.json', {}) }) + '\n';
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const text = erzeugeText();
  if (process.argv.includes('--pruefen')) {
    const alt = (() => {
      try {
        return readFileSync(ZIEL, 'utf8');
      } catch {
        return '';
      }
    })();
    if (alt !== text) {
      console.error('KI_KARTEN_ANLEITUNG.md ist veraltet → npm run ki:anleitung');
      process.exit(1);
    }
    console.log('KI_KARTEN_ANLEITUNG.md aktuell');
  } else {
    writeFileSync(ZIEL, text);
    console.log(`geschrieben: ${path.relative(WURZEL, ZIEL)} (${Math.round(text.length / 1024)} KB)`);
  }
}
