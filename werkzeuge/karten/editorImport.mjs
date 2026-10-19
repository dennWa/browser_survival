#!/usr/bin/env node
/**
 * Map-Editor → Spiel: veröffentlicht eine im Editor exportierte Karte (Karten-Export *.karte.json oder Entwurf *.entwurf.json)
 * als server/spiel/karten/<id>.js und trägt sie in KARTEN ein – wie `npm run karte:import` für Tiled.
 *
 *   npm run karte:editor -- downloads/meinezone.karte.json [--id neue_id]
 *
 * Danach: npm test (prüft Spawns, Loot, Übergänge, Erreichbarkeit) und committen.
 * 3D-Modelle/Klänge: Karten-Export bettet sie ein; eine Entwurf-Datei bringt sie in `bibliothek`/`audio` mit (Verweis per ID).
 * Klang-Dateien → client/audio/karten/<zone>/ (eigeneKlaenge.mjs), Modelle → client/assets/eigene/ (eigeneModelle.mjs).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ladeDatei, nachDefinition } from '../../editor/kern/format.js';
import { alsJsModul } from '../../editor/kern/veroeffentlichen.js';
import { validiere, hatFehler } from '../../editor/kern/validierung.js';
import { verarbeiteKarte } from '../../server/spiel/karten/kartenLader.js';
import { registriere } from './registrieren.mjs';
import { leseBibliotheksExport, setzeModellQuelle, bytesZuGlbUrl, leseAudioExport, setzeAudioQuelle, bytesZuAudioUrl } from '../../editor/kern/bibliothek.js';
import { schreibeEigeneModelle, raeumeEigeneModelleAuf } from './eigeneModelle.mjs';
import { schreibeKlaenge } from './eigeneKlaenge.mjs';

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const KARTEN_ORDNER = path.join(WURZEL, 'server/spiel/karten');
const [datei, ...rest] = process.argv.slice(2);
const i = rest.indexOf('--id');
const neueId = i >= 0 ? rest[i + 1] : null;

try {
  if (!datei) throw new Error('Benutzung: npm run karte:editor -- <datei.karte.json|datei.entwurf.json> [--id neue_id]');
  const roh = JSON.parse(readFileSync(datei, 'utf8'));
  // Entwurf-Datei: Modelle aus `bibliothek` → Typen mit `asset` bekommen beim Export ihr glb (kern/bibliothek.js)
  const modelle = new Map(leseBibliotheksExport(roh.bibliothek).map((e) => [e.id, bytesZuGlbUrl(e.bytes)]));
  setzeModellQuelle((id) => modelle.get(id) ?? null);
  const audios = new Map(leseAudioExport(roh.audio).map((e) => [e.id, bytesZuAudioUrl(e.bytes, e.meta.format)]));
  setzeAudioQuelle((id) => audios.get(id) ?? null);
  const { karte, warnungen } = ladeDatei(roh);
  if (neueId) karte.anwenden([{ s: 'wert', pfad: 'id', neu: neueId }]);
  for (const w of warnungen) console.log(`  ⚠ ${w}`);
  const probleme = validiere(karte, { mitErreichbarkeit: true });
  for (const p of probleme) console.log(`  ${p.schwere === 'fehler' ? '✗' : '⚠'} ${p.text}${p.x !== null ? ` (${p.x}|${p.y})` : ''}`);
  if (hatFehler(probleme)) throw new Error('Karte hat Fehler (siehe oben) – im Editor beheben');
  const definition = nachDefinition(karte);
  for (const d of schreibeEigeneModelle(definition, path.join(WURZEL, 'client'))) console.log(`  ✓ ${d} (eigenes 3D-Modell)`);
  for (const d of raeumeEigeneModelleAuf(definition, path.join(WURZEL, 'client'))) console.log(`  🗑 ${d} (nicht mehr benutzt – entfernt)`);
  const klaenge = schreibeKlaenge(definition, path.join(WURZEL, 'client'));
  for (const d of klaenge.dateien) console.log(`  ✓ ${d} (Klang)`);
  for (const d of klaenge.entfernt) console.log(`  🗑 ${d} (Klang nicht mehr benutzt – entfernt)`);
  verarbeiteKarte(definition); // wirft bei allem, was das Spiel nicht laden könnte
  const ziel = path.join(KARTEN_ORDNER, `${definition.id}.js`);
  writeFileSync(ziel, alsJsModul(definition));
  console.log(`✓ ${path.relative(WURZEL, ziel)} geschrieben (${karte.breite} × ${karte.hoehe}, ${definition.objekte.length} Objekte)`);
  registriere(path.join(KARTEN_ORDNER, 'kartenLader.js'), definition.id);
  console.log('  Jetzt: npm test – Übergänge in Nachbarzonen nicht vergessen (Rückweg!)');
} catch (fehler) {
  console.error(`✗ ${fehler.message}`);
  process.exitCode = 1;
}
