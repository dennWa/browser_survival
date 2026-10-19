import { ladeDatei } from './format.js';
import { leseBibliotheksExport, leseAudioExport } from './bibliothek.js';

/**
 * Komplett-Backup des Editors (Editor 2.0, Schritt 1.6) – umgebungsfrei, getestet in tests/editorBearbeiten.test.js.
 * Eine Datei mit ALLEN Entwürfen (inkl. Verlauf), eigenen Prefabs, Projekt-Infos (Weltanordnung, aktive Zone) und den
 * Editor-Einstellungen aus der Whitelist (Ebenen, Layout, Favoriten). ⚠ Der Gemini-Schlüssel (und alles andere außerhalb
 * der Whitelist) kommt NIE ins Backup.
 *   { format: 'browser-survival-editor-backup', formatVersion: 1, erstellt, entwuerfe: [{ id, entwurf }], prefabs: { name: vorlage },
 *     meta: { layout, aktiv }, einstellungen: { schluessel: wert }, bibliothek: [{ …Meta, daten: Data-URL }] }
 * `bibliothek` (Phase 3) = 3D-Modelle, `audio` (Phase 4) = Klang-Dateien der Projekt-Bibliothek (kern/bibliothek.js);
 * ältere Backups haben sie nicht.
 */
export const BACKUP_FORMAT = 'browser-survival-editor-backup';
export const BACKUP_VERSION = 1;
/** localStorage-Schlüssel, die ins Backup dürfen (nichts Geheimes!) */
export const EINSTELLUNGEN_WHITELIST = Object.freeze(['browserSurvival.editorEbenen', 'browserSurvival.editorLayout', 'browserSurvival.editorAssets']);

export function baueBackup({ entwuerfe = [], prefabs = {}, meta = {}, einstellungen = {}, bibliothek = [], audio = [], erstellt = new Date().toISOString() }) {
  const erlaubt = Object.fromEntries(Object.entries(einstellungen).filter(([k]) => EINSTELLUNGEN_WHITELIST.includes(k)));
  return {
    format: BACKUP_FORMAT,
    formatVersion: BACKUP_VERSION,
    erstellt,
    entwuerfe: entwuerfe.map(({ id, entwurf }) => ({ id, entwurf })),
    prefabs,
    meta: { layout: meta.layout ?? {}, aktiv: meta.aktiv ?? null },
    einstellungen: erlaubt,
    bibliothek,
    audio,
  };
}

/**
 * Backup lesen und prüfen. Wirft nur, wenn die Datei gar kein Backup ist; einzelne kaputte Entwürfe landen in `fehlerhaft`.
 * @returns { erstellt, entwuerfe: [{ id, karte, verlauf, warnungen }], fehlerhaft: [{ id, grund }], prefabs, meta, einstellungen, bibliothek: [{ id, bytes, meta }] }
 */
export function leseBackup(eingabe) {
  let j = eingabe;
  if (typeof j === 'string') {
    try {
      j = JSON.parse(j);
    } catch (e) {
      throw new Error(`Keine JSON-Datei (${e.message})`);
    }
  }
  if (!j || j.format !== BACKUP_FORMAT) throw new Error('Das ist kein Editor-Backup (format fehlt) – Einzel-Entwürfe bitte über Datei → Öffnen laden');
  if (!(j.formatVersion <= BACKUP_VERSION)) throw new Error(`Backup-Version ${j.formatVersion} ist neuer als dieser Editor (${BACKUP_VERSION})`);
  const entwuerfe = [];
  const fehlerhaft = [];
  for (const e of Array.isArray(j.entwuerfe) ? j.entwuerfe : []) {
    try {
      const { karte, verlauf, warnungen } = ladeDatei(e.entwurf);
      entwuerfe.push({ id: karte.id, karte, verlauf, warnungen });
    } catch (fehler) {
      fehlerhaft.push({ id: String(e?.id ?? '?'), grund: fehler.message });
    }
  }
  const prefabs = {};
  for (const [name, v] of Object.entries(j.prefabs && typeof j.prefabs === 'object' ? j.prefabs : {})) if (v && Array.isArray(v.zellen) && v.b > 0 && v.h > 0) prefabs[name] = v;
  const einstellungen = Object.fromEntries(Object.entries(j.einstellungen && typeof j.einstellungen === 'object' ? j.einstellungen : {}).filter(([k]) => EINSTELLUNGEN_WHITELIST.includes(k)));
  const layout = j.meta?.layout && typeof j.meta.layout === 'object' ? j.meta.layout : {};
  return { erstellt: j.erstellt ?? null, entwuerfe, fehlerhaft, prefabs, meta: { layout, aktiv: typeof j.meta?.aktiv === 'string' ? j.meta.aktiv : null }, einstellungen, bibliothek: leseBibliotheksExport(j.bibliothek), audio: leseAudioExport(j.audio) };
}

/** Dateiname mit Zeitstempel: editor-backup-2026-10-19-1432.json */
export function backupDateiname(datum = new Date()) {
  const z = (n) => String(n).padStart(2, '0');
  return `editor-backup-${datum.getFullYear()}-${z(datum.getMonth() + 1)}-${z(datum.getDate())}-${z(datum.getHours())}${z(datum.getMinutes())}.json`;
}

/** Bytes lesbar (1,2 MB) */
export function groesseText(bytes) {
  if (!Number.isFinite(bytes)) return '?';
  const einheiten = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  let w = bytes;
  while (w >= 1024 && i < einheiten.length - 1) {
    w /= 1024;
    i++;
  }
  return `${w.toFixed(i && w < 10 ? 1 : 0).replace('.', ',')} ${einheiten[i]}`;
}
