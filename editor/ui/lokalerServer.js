/**
 * Verbindung zum lokalen Editor-Server (Phase 10.1, `npm run editor:lokal` → werkzeuge/editor/lokalerServer.mjs).
 * Läuft der Editor darüber (http://localhost:8090/editor/), darf er Dateien in freigegebenen Projektordnern schreiben/löschen.
 * Online (GitHub Pages) oder über den Spielserver gibt es die API nicht → `verbunden = false`, Speichern zeigt LOKAL_HINWEIS.
 *   pruefeLokalenServer() → { verbunden, ordner }   (einmal, Ergebnis gemerkt; `neu: true` fragt erneut)
 *   schreibeDatei(pfad, daten) · loescheDatei(pfad) · listeDateien(ordner) → werfen Error mit deutschem Text
 */
export const LOKAL_HINWEIS = 'Speichern ins Projekt geht nur auf deinem eigenen Rechner: Spiel/Editor über „Spiel starten.bat“ bzw. „npm start“ (oder „npm run editor:lokal“) starten und über http://localhost:… öffnen – nicht über GitHub Pages.';
const KOPF = { 'X-Editor': '1' };
let status = null;
let laufend = null; // gleichzeitige Aufrufe teilen sich EINE Anfrage (sonst bekam der zweite den Platzhalter „nicht verbunden“)

const api = (route, parameter = {}) => {
  const u = new URL(`/api/editor/${route}`, location.origin);
  for (const [k, v] of Object.entries(parameter)) u.searchParams.set(k, v);
  return u;
};

async function antwortLesen(r) {
  let daten = null;
  try {
    daten = await r.json();
  } catch {
    /* keine JSON-Antwort */
  }
  if (!r.ok || !daten?.ok) throw new Error(daten?.fehler ?? `Lokaler Server antwortet mit ${r.status}`);
  return daten;
}

export function pruefeLokalenServer({ neu = false } = {}) {
  if (status && !neu) return Promise.resolve(status);
  if (!laufend || neu) laufend = frageStatus().finally(() => (laufend = null));
  return laufend;
}

async function frageStatus() {
  const ergebnis = { verbunden: false, ordner: [] };
  if (!/^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname)) return (status = ergebnis);
  try {
    const steuerung = new AbortController();
    const t = setTimeout(() => steuerung.abort(), 4000);
    const r = await fetch(api('status'), { headers: KOPF, signal: steuerung.signal, cache: 'no-store' });
    clearTimeout(t);
    const d = await antwortLesen(r);
    return (status = { verbunden: true, ordner: d.ordner ?? [], version: d.version });
  } catch {
    return (status = ergebnis); // kein lokaler Editor-Server (z. B. Spielserver npm start)
  }
}

export function istVerbunden() {
  return !!status?.verbunden;
}

/** daten: Blob | ArrayBuffer | Uint8Array | string | Objekt (→ JSON) */
export async function schreibeDatei(pfad, daten) {
  if (!istVerbunden()) throw new Error(LOKAL_HINWEIS);
  const body = daten instanceof Blob || daten instanceof ArrayBuffer || ArrayBuffer.isView(daten) || typeof daten === 'string' ? daten : `${JSON.stringify(daten, null, 2)}\n`;
  return antwortLesen(await fetch(api('datei', { pfad }), { method: 'PUT', headers: KOPF, body }));
}

export async function loescheDatei(pfad) {
  if (!istVerbunden()) throw new Error(LOKAL_HINWEIS);
  return antwortLesen(await fetch(api('datei', { pfad }), { method: 'DELETE', headers: KOPF }));
}

/** → [{ pfad, groesse, geaendert }] (leer ohne Server) */
export async function listeDateien(ordner) {
  if (!istVerbunden()) return [];
  return (await antwortLesen(await fetch(api('liste', { ordner }), { headers: KOPF, cache: 'no-store' }))).dateien;
}
