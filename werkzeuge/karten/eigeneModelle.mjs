import { mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync, existsSync } from 'node:fs';
import path from 'node:path';

const KOPF = 'data:model/gltf-binary;base64,';
const ORDNER = 'assets/eigene';
const LIZENZ_KOPF = ['# Eigene 3D-Modelle – Urheber & Lizenzen', '', 'Vom Editor hochgeladen; die Rechte liegen bei der hochladenden Person.', '', '| Datei | Typ | Urheber | Lizenz |', '|---|---|---|---|'];

/**
 * Eingebettete 3D-Modelle (typ.glb, Data-URL aus dem Editor) → Dateien unter <clientOrdner>/assets/eigene/<karte>_<typ>.glb.
 * Der Typ bekommt danach nur noch den Pfad (glbDatei). Keine Lizenzprüfung (Nutzer-Entscheidung), aber Urheber/Lizenz
 * werden in assets/eigene/LIZENZEN.md festgehalten – fehlt die Lizenz, steht das dort ausdrücklich.
 * Aufräumen (Editor 2.0, Schritt 3.3): Dateien `<karte>_*.glb`, die diese Karte nicht mehr benutzt (Modell im Editor
 * gelöscht/ersetzt), werden entfernt; LIZENZEN.md behält die Zeilen anderer Karten → `raeumeEigeneModelleAuf`.
 * @returns {string[]} angelegte Pfade, relativ zu client/
 */
export function schreibeEigeneModelle(definition, clientOrdner) {
  const dateien = [];
  const lizenzZeilen = [];
  for (const [id, t] of Object.entries(definition.typen ?? {})) {
    if (!t.glb) {
      // schon veröffentlicht (Zone erneut aus dem Spiel geöffnet): Datei bleibt, Lizenzzeile auch
      if (t.glbDatei?.startsWith(`${ORDNER}/${definition.id}_`)) lizenzZeilen.push(`| ${t.glbDatei} | ${t.name ?? id} | ${t.urheber || '–'} | ${t.lizenz || '**keine Angabe**'} |`);
      continue;
    }
    if (!/^[a-z0-9_]+$/.test(definition.id) || !/^[a-z0-9_]+$/.test(id)) throw new Error(`Modell „${id}“: Karten- und Typ-ID nur a–z, 0–9, _`);
    if (!t.glb.startsWith(KOPF)) throw new Error(`Modell „${id}“ ist keine .glb-Datei (binäres glTF)`);
    const relativ = `${ORDNER}/${definition.id}_${id}.glb`;
    const ziel = path.join(clientOrdner, relativ);
    mkdirSync(path.dirname(ziel), { recursive: true });
    writeFileSync(ziel, Buffer.from(t.glb.slice(KOPF.length), 'base64'));
    lizenzZeilen.push(`| ${relativ} | ${t.name ?? id} | ${t.urheber || '–'} | ${t.lizenz || '**keine Angabe**'} |`);
    delete t.glb;
    t.glbDatei = relativ;
    dateien.push(relativ);
  }
  schreibeLizenzen(clientOrdner, definition.id, lizenzZeilen);
  return dateien;
}

/** LIZENZEN.md: Zeilen dieser Karte ersetzen, die anderer Karten behalten; leer → Datei weg */
function schreibeLizenzen(clientOrdner, kartenId, neueZeilen) {
  const datei = path.join(clientOrdner, ORDNER, 'LIZENZEN.md');
  const alt = existsSync(datei) ? readFileSync(datei, 'utf-8').split('\n').filter((z) => z.startsWith(`| ${ORDNER}/`)) : [];
  const zeilen = [...alt.filter((z) => !z.startsWith(`| ${ORDNER}/${kartenId}_`)), ...neueZeilen].sort();
  if (zeilen.length) writeFileSync(datei, [...LIZENZ_KOPF, ...zeilen].join('\n') + '\n', 'utf-8');
  else if (existsSync(datei)) rmSync(datei);
}

/**
 * Verwaiste Modell-Dateien einer Karte löschen: alles `<karte>_*.glb` in assets/eigene/, worauf kein Typ der Definition
 * (glbDatei) mehr zeigt. Nach `schreibeEigeneModelle` aufrufen. @returns {string[]} gelöschte Pfade (relativ zu client/)
 */
export function raeumeEigeneModelleAuf(definition, clientOrdner) {
  const ordner = path.join(clientOrdner, ORDNER);
  if (!existsSync(ordner) || !/^[a-z0-9_]+$/.test(definition.id)) return [];
  const benutzt = new Set(Object.values(definition.typen ?? {}).map((t) => t.glbDatei).filter(Boolean));
  const weg = readdirSync(ordner)
    .filter((n) => n.startsWith(`${definition.id}_`) && n.endsWith('.glb'))
    .map((n) => `${ORDNER}/${n}`)
    .filter((rel) => !benutzt.has(rel));
  for (const rel of weg) rmSync(path.join(clientOrdner, rel));
  if (weg.length) {
    const lizenz = path.join(ordner, 'LIZENZEN.md');
    if (existsSync(lizenz)) {
      const zeilen = readFileSync(lizenz, 'utf-8').split('\n').filter((z) => z.startsWith(`| ${ORDNER}/`) && !weg.some((w) => z.startsWith(`| ${w} `)));
      if (zeilen.length) writeFileSync(lizenz, [...LIZENZ_KOPF, ...zeilen].join('\n') + '\n', 'utf-8');
      else rmSync(lizenz);
    }
  }
  return weg;
}
