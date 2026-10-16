#!/usr/bin/env node
/**
 * Karten mit Tiled (kostenloser Karten-Editor, https://www.mapeditor.org) bearbeiten:
 *
 *   npm run karte:export -- waldweg          → werkzeuge/karten/tiled/waldweg.tmj (+ kacheln.png fürs Tileset)
 *   … in Tiled öffnen, malen, speichern (Format: JSON .tmj, Kachelebenen als CSV) …
 *   npm run karte:import -- werkzeuge/karten/tiled/waldweg.tmj [--id neue_zone] [--name "Anzeigename"]
 *                                           → server/spiel/karten/<id>.js (+ Eintrag in KARTEN, falls neu)
 *
 * Neue Zone von Grund auf: eine vorhandene exportieren, in Tiled "Speichern unter", Karten-Eigenschaft id ändern,
 * Übergänge (Klasse "uebergang") + Ankünfte (Klasse "ankunft") setzen, importieren – und in der Nachbarzone
 * einen Übergang zurück anlegen. Regeln der Ebenen/Klassen: werkzeuge/karten/tiledKarte.mjs.
 * Danach: npm test (prüft Karten, Übergänge, Erreichbarkeit).
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ausTiled, nachTiled, alsJsModul, TILESET_FARBEN } from './tiledKarte.mjs';

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const KARTEN_ORDNER = path.join(WURZEL, 'server/spiel/karten');
const LADER = path.join(KARTEN_ORDNER, 'kartenLader.js');
const GENERIERT = { stadtrand: 'werkzeuge/karten/stadtrand.py', waldweg: 'werkzeuge/karten/waldweg.py' };

const [befehl, ziel, ...rest] = process.argv.slice(2);
const option = (name) => {
  const i = rest.indexOf(`--${name}`);
  return i >= 0 ? rest[i + 1] : undefined;
};

try {
  if (befehl === 'export' && ziel) await exportieren(ziel, rest[0] && !rest[0].startsWith('--') ? rest[0] : path.join(WURZEL, 'werkzeuge/karten/tiled'));
  else if (befehl === 'import' && ziel) await importieren(ziel, { id: option('id'), name: option('name') });
  else {
    console.log('Benutzung:\n  node werkzeuge/karten/tiled.mjs export <kartenId> [ordner]\n  node werkzeuge/karten/tiled.mjs import <datei.tmj> [--id x] [--name "y"]');
    process.exitCode = 1;
  }
} catch (fehler) {
  console.error(`✗ ${fehler.message}`);
  process.exitCode = 1;
}

async function exportieren(id, ordner) {
  const { KARTEN } = await import('../../server/spiel/karten/kartenLader.js');
  const definition = KARTEN[id];
  if (!definition) throw new Error(`Unbekannte Karte "${id}" (vorhanden: ${Object.keys(KARTEN).join(', ')})`);
  mkdirSync(ordner, { recursive: true });
  const bild = path.join(ordner, 'kacheln.png');
  writeFileSync(bild, tilesetPng(32));
  const datei = path.join(ordner, `${id}.tmj`);
  writeFileSync(datei, JSON.stringify(nachTiled(definition), null, 1));
  console.log(`✓ ${path.relative(WURZEL, datei)} (+ kacheln.png) – in Tiled öffnen, bearbeiten, dann importieren`);
}

async function importieren(datei, optionen) {
  const tmj = JSON.parse(readFileSync(datei, 'utf8'));
  const definition = ausTiled(tmj, optionen);
  const { verarbeiteKarte } = await import('../../server/spiel/karten/kartenLader.js');
  verarbeiteKarte(definition); // wirft bei Fehlern (fehlender Start, unbekannte Zeichen, Übergänge …)
  const ziel = path.join(KARTEN_ORDNER, `${definition.id}.js`);
  writeFileSync(ziel, alsJsModul(definition, { quelle: `Tiled (${path.basename(datei)})` }));
  console.log(`✓ ${path.relative(WURZEL, ziel)} geschrieben (${definition.kacheln[0].length} × ${definition.kacheln.length}, ${definition.objekte.length} Objekte)`);
  if (GENERIERT[definition.id]) console.log(`  Hinweis: diese Karte erzeugt sonst ${GENERIERT[definition.id]} – das Skript nicht mehr laufen lassen (würde überschreiben)`);
  registriere(definition.id);
  console.log('  Jetzt: npm test');
}

/** Neue Karte in KARTEN (kartenLader.js) eintragen – Import + Eintrag. */
function registriere(id) {
  let text = readFileSync(LADER, 'utf8');
  const name = id.toUpperCase();
  if (new RegExp(`\\b${id}: ${name}\\b`).test(text)) return;
  const importe = [...text.matchAll(/^import \{ \w+ \} from '\.\/\w+\.js';$/gm)];
  const letzterImport = importe.at(-1);
  if (!letzterImport) throw new Error('kartenLader.js: Import-Zeilen nicht gefunden – bitte von Hand eintragen');
  const nachImport = letzterImport.index + letzterImport[0].length;
  text = `${text.slice(0, nachImport)}\nimport { ${name} } from './${id}.js';${text.slice(nachImport)}`;
  text = text.replace(/(export const KARTEN = Object\.freeze\(\{\n(?:  .*\n)*?)(\}\);)/, `$1  ${id}: ${name},\n$2`);
  writeFileSync(LADER, text);
  console.log(`  ${id} in KARTEN eingetragen (server/spiel/karten/kartenLader.js)`);
}

/** Tileset-Bild: eine Reihe 32×32-Farbkacheln (Reihenfolge wie TILESET_FARBEN), als PNG ohne Abhängigkeiten. */
function tilesetPng(k) {
  const farben = Object.values(TILESET_FARBEN);
  const breite = k * farben.length;
  const roh = Buffer.alloc((breite * 3 + 1) * k);
  for (let y = 0; y < k; y++) {
    roh[y * (breite * 3 + 1)] = 0; // Filter: keiner
    for (let x = 0; x < breite; x++) {
      const [r, g, b] = farben[Math.floor(x / k)];
      const rand = x % k === 0 || y === 0 || x % k === k - 1 || y === k - 1;
      const f = rand ? 0.7 : 1;
      roh.set([r * f, g * f, b * f].map(Math.round), y * (breite * 3 + 1) + 1 + x * 3);
    }
  }
  const kopf = Buffer.alloc(13);
  kopf.writeUInt32BE(breite, 0);
  kopf.writeUInt32BE(k, 4);
  kopf.set([8, 2, 0, 0, 0], 8); // 8 Bit, RGB
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), block('IHDR', kopf), block('IDAT', deflateSync(roh)), block('IEND', Buffer.alloc(0))]);
}

function block(typ, daten) {
  const laenge = Buffer.alloc(4);
  laenge.writeUInt32BE(daten.length);
  const inhalt = Buffer.concat([Buffer.from(typ, 'ascii'), daten]);
  const pruef = Buffer.alloc(4);
  pruef.writeUInt32BE(crc32(inhalt));
  return Buffer.concat([laenge, inhalt, pruef]);
}

function crc32(daten) {
  let c = ~0;
  for (const byte of daten) {
    c ^= byte;
    for (let i = 0; i < 8; i++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

