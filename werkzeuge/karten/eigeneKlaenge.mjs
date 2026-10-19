import { mkdirSync, writeFileSync, readdirSync, rmSync, existsSync } from 'node:fs';
import path from 'node:path';
import { assetId, dataUrlZuBytes, istAudio } from '../../editor/kern/bibliothek.js';

const ENDUNG = { 'audio/mpeg': 'mp3', 'audio/mp3': 'mp3', 'audio/wav': 'wav', 'audio/x-wav': 'wav', 'audio/wave': 'wav', 'audio/ogg': 'ogg', 'audio/mp4': 'm4a', 'audio/x-m4a': 'm4a', 'audio/aac': 'm4a', 'audio/flac': 'flac', 'audio/x-flac': 'flac', 'audio/webm': 'webm' };

/**
 * Klanglandschaft veröffentlichen (Editor 2.0, Schritt 4.5): eingebettete Klang-Dateien (klang.daten, Data-URL aus dem Editor)
 * → <clientOrdner>/audio/karten/<karte>/<audio-id>.<endung>. Gleiche Datei = eine Datei (mehrere Klänge teilen sie).
 * Der Klang behält danach nur den Pfad (`datei`). Dateien im Ordner der Karte, die kein Klang mehr benutzt, werden gelöscht.
 * Keine Lizenzprüfung (wie bei eigenen 3D-Modellen: die Rechte liegen bei der hochladenden Person).
 * @returns {{ dateien: string[], entfernt: string[] }} Pfade relativ zu client/
 */
export function schreibeKlaenge(definition, clientOrdner) {
  const dateien = new Set();
  const id = definition.id;
  if (!/^[a-z0-9_]{1,40}$/.test(id)) throw new Error('Karten-ID nur a–z, 0–9, _');
  for (const k of definition.klaenge ?? []) {
    if (k.daten) {
      const mime = k.daten.slice(5, k.daten.indexOf(';')).toLowerCase();
      const endung = ENDUNG[mime];
      if (!endung) throw new Error(`Klang „${k.name}“: Format ${mime} wird nicht unterstützt`);
      const bytes = dataUrlZuBytes(k.daten);
      if (!istAudio(bytes)) throw new Error(`Klang „${k.name}“ ist keine Audio-Datei`);
      const relativ = `audio/karten/${id}/${assetId(bytes, 'a')}.${endung}`;
      const ziel = path.join(clientOrdner, relativ);
      if (!dateien.has(relativ)) {
        mkdirSync(path.dirname(ziel), { recursive: true });
        writeFileSync(ziel, bytes);
      }
      dateien.add(relativ);
      k.datei = relativ;
      delete k.daten;
      delete k.audio;
    } else if (k.datei?.startsWith(`audio/karten/${id}/`)) dateien.add(k.datei);
  }
  const ordner = path.join(clientOrdner, 'audio/karten', id);
  const entfernt = existsSync(ordner)
    ? readdirSync(ordner)
        .map((n) => `audio/karten/${id}/${n}`)
        .filter((rel) => !dateien.has(rel))
    : [];
  for (const rel of entfernt) rmSync(path.join(clientOrdner, rel));
  if (existsSync(ordner) && !readdirSync(ordner).length) rmSync(ordner, { recursive: true });
  return { dateien: [...dateien], entfernt };
}
