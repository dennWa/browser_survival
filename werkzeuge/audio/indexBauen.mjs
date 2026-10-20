/**
 * Indexe der Audio-Ordner bauen (Phase 10.1) – gemeinsam für `npm run sounds`, `npm run musik:index` und den lokalen
 * Editor-Server (werkzeuge/editor/lokalerServer.mjs, nach jeder Änderung).
 *   schreibeSoundIndex(wurzel)  client/audio/eigene/ → eigene.json + README.md (aus README.vorlage.md)
 *   schreibeMusikIndex(wurzel)  client/musik/<ordner>/ (+ einstellungen.json) → musik.json
 * `wurzel` = Projektwurzel. Rückgabe: { index, warnungen }.
 */
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { baueIndex, ereignisTabelle } from '../../client/audio/eigeneSounds.js';
import { baueMusikIndex } from '../../client/audio/musikIndex.js';

function liesJson(datei, warnungen) {
  if (!existsSync(datei)) return {};
  try {
    return JSON.parse(readFileSync(datei, 'utf8'));
  } catch (e) {
    warnungen.push(`${path.basename(datei)} ist kein gültiges JSON (${e.message}) – ignoriert`);
    return {};
  }
}

export function schreibeSoundIndex(wurzel) {
  const ordner = path.join(wurzel, 'client/audio/eigene');
  const vorab = [];
  const lautstaerke = path.join(ordner, 'lautstaerke.txt');
  const dateien = existsSync(ordner) ? readdirSync(ordner) : [];
  const { index, warnungen } = baueIndex(dateien, existsSync(lautstaerke) ? readFileSync(lautstaerke, 'utf8') : '', liesJson(path.join(ordner, 'einstellungen.json'), vorab));
  writeFileSync(path.join(ordner, 'eigene.json'), `${JSON.stringify(index, null, 2)}\n`);
  const vorlage = path.join(ordner, 'README.vorlage.md');
  if (existsSync(vorlage)) writeFileSync(path.join(ordner, 'README.md'), readFileSync(vorlage, 'utf8').replace('{{EREIGNISSE}}', ereignisTabelle()));
  return { index, warnungen: [...vorab, ...warnungen], dateien };
}

export function schreibeMusikIndex(wurzel) {
  const basis = path.join(wurzel, 'client/musik');
  const warnungen = [];
  const ordner = {};
  for (const eintrag of existsSync(basis) ? readdirSync(basis).sort() : []) {
    const pfad = path.join(basis, eintrag);
    if (statSync(pfad).isDirectory()) ordner[eintrag] = readdirSync(pfad);
  }
  const index = baueMusikIndex(ordner, liesJson(path.join(basis, 'einstellungen.json'), warnungen));
  writeFileSync(path.join(basis, 'musik.json'), `${JSON.stringify(index, null, 2)}\n`);
  return { index, warnungen };
}
