/**
 * Verbindung zum lokalen Editor-Server (Phase 10.1, `npm run editor:lokal` → werkzeuge/editor/lokalerServer.mjs).
 * Läuft der Editor darüber (http://localhost:8090/editor/), darf er Dateien in freigegebenen Projektordnern schreiben/löschen.
 * Online (GitHub Pages) oder über den Spielserver gibt es die API nicht → `verbunden = false`, Speichern zeigt LOKAL_HINWEIS.
 *   pruefeLokalenServer() → { verbunden, ordner }   (einmal, Ergebnis gemerkt; `neu: true` fragt erneut)
 *   schreibeDatei(pfad, daten) · loescheDatei(pfad) · listeDateien(ordner) → werfen Error mit deutschem Text
 */
export const LOKAL_HINWEIS = 'Speichern in den Projektordner geht nur lokal: Editor lokal starten mit „npm run editor:lokal“ und http://localhost:8090/editor/ öffnen.';
const KOPF = { 'X-Editor': '1' };
let status = null;

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

export async function pruefeLokalenServer({ neu = false } = {}) {
  if (status && !neu) return status;
  status = { verbunden: false, ordner: [] };
  if (!/^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname)) return status;
  try {
    const steuerung = new AbortController();
    const t = setTimeout(() => steuerung.abort(), 1500);
    const r = await fetch(api('status'), { headers: KOPF, signal: steuerung.signal, cache: 'no-store' });
    clearTimeout(t);
    const d = await antwortLesen(r);
    status = { verbunden: true, ordner: d.ordner ?? [], version: d.version };
  } catch {
    /* kein lokaler Editor-Server (z. B. Spielserver npm start) */
  }
  return status;
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
