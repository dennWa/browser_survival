/**
 * Editor-API (Phase 10.1): Schreib-/Lösch-/Listen-Zugriff auf freigegebene Projektordner (Regeln: pfade.mjs).
 * Wird vom lokalen Editor-Server (lokalerServer.mjs) UND vom normalen Spielserver (server/node/statischerServer.js, nur für
 * Anfragen vom eigenen Rechner) benutzt.
 *   behandleEditorApi(anfrage, antwort, url, { wurzel, nurLoopback }) → true, wenn /api/editor/… beantwortet wurde
 * ⚠ Schutz: Kopf `X-Editor: 1`, Host lokal, Origin = Host, bei `nurLoopback` zusätzlich Gegenstelle = 127.0.0.1/::1 und KEIN
 * X-Forwarded-*-Kopf (öffentlicher Server hinter Proxy → API bleibt aus; ein selbst gesetzter Host-Kopf reicht nie).
 */
import { mkdir, readdir, stat, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { SCHREIB_ORDNER, pruefeSchreibPfad, pruefeListenOrdner, istLokalerHost, istErlaubterUrsprung, indexFuer } from './pfade.mjs';
import { schreibeSoundIndex, schreibeMusikIndex } from '../audio/indexBauen.mjs';

export const API_VERSION = 1;
const MAX_GROESSE = 60 * 1024 * 1024; // 60 MB je Datei (lange Musik als WAV)
/** Ausgelieferte Ordner (wie server/node/statischerServer.js) – server/node + server/daten (Konten!) nie */
const AUSGELIEFERT = ['client', 'gemeinsam', 'server/spiel', 'editor'];
export const json = (antwort, code, daten) => antwort.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }).end(JSON.stringify(daten));

function liesKoerper(anfrage) {
  return new Promise((ok, fehler) => {
    const teile = [];
    let laenge = 0;
    anfrage.on('data', (t) => {
      laenge += t.length;
      if (laenge > MAX_GROESSE) {
        fehler(Object.assign(new Error(`Datei zu groß (max. ${MAX_GROESSE / 1024 / 1024} MB)`), { code: 413 }));
        anfrage.destroy();
      } else teile.push(t);
    });
    anfrage.on('end', () => ok(Buffer.concat(teile)));
    anfrage.on('error', fehler);
  });
}

/** Index nach einer Änderung neu bauen (Fehler landen in der Antwort, nicht im Absturz) */
function baueIndexFuer(wurzel, pfad) {
  const art = indexFuer(pfad);
  if (!art) return null;
  try {
    const { warnungen } = art === 'sounds' ? schreibeSoundIndex(wurzel) : schreibeMusikIndex(wurzel);
    return { art, warnungen };
  } catch (e) {
    return { art, fehler: e.message };
  }
}

async function liste(wurzel, ordner) {
  const aus = [];
  const gehe = async (rel) => {
    let eintraege;
    try {
      eintraege = await readdir(path.join(wurzel, rel), { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of eintraege) {
      if (e.name.startsWith('.')) continue;
      const p = `${rel}${e.name}`;
      if (e.isDirectory()) await gehe(`${p}/`);
      else {
        const s = await stat(path.join(wurzel, p));
        aus.push({ pfad: p, groesse: s.size, geaendert: Math.round(s.mtimeMs) });
      }
    }
  };
  await gehe(ordner);
  return aus;
}


/** Gegenstelle ist dieser Rechner selbst (und die Anfrage kam nicht über einen Proxy)? */
export function istLoopbackAnfrage(anfrage) {
  const h = anfrage.headers;
  if (h['x-forwarded-for'] || h['x-forwarded-host'] || h['forwarded'] || h['x-real-ip']) return false;
  return /^(127\.0\.0\.1|::1|::ffff:127\.0\.0\.1)$/.test(anfrage.socket?.remoteAddress ?? '');
}

export async function behandleEditorApi(anfrage, antwort, url, { wurzel, nurLoopback = false }) {
  if (!url.pathname.startsWith('/api/editor/')) return false;
  const host = anfrage.headers.host;
  if (!istLokalerHost(host) || (nurLoopback && !istLoopbackAnfrage(anfrage))) {
    json(antwort, 403, { ok: false, fehler: 'Nur auf dem eigenen Rechner erreichbar' });
    return true;
  }
  if (anfrage.headers['x-editor'] !== '1' || !istErlaubterUrsprung(anfrage.headers.origin, host)) {
    json(antwort, 403, { ok: false, fehler: 'Nicht erlaubt (fremder Ursprung)' });
    return true;
  }
  const absolut = (rel) => {
    const datei = path.resolve(wurzel, ...rel.split('/'));
    // doppelte Sicherung nach der Textprüfung: Ergebnis muss im freigegebenen Ordner liegen
    if (!Object.keys(SCHREIB_ORDNER).some((o) => datei.startsWith(path.resolve(wurzel, ...o.split('/').filter(Boolean)) + path.sep))) throw Object.assign(new Error('Pfad außerhalb'), { code: 400 });
    return datei;
  };
  try {
    const route = url.pathname.slice('/api/editor/'.length);
    if (route === 'status' && anfrage.method === 'GET') return json(antwort, 200, { ok: true, version: API_VERSION, ordner: Object.keys(SCHREIB_ORDNER) }), true;
    if (route === 'liste' && anfrage.method === 'GET') {
      const ordner = pruefeListenOrdner(url.searchParams.get('ordner'));
      if (!ordner) return json(antwort, 400, { ok: false, fehler: 'Ordner nicht freigegeben' }), true;
      return json(antwort, 200, { ok: true, dateien: await liste(wurzel, ordner) }), true;
    }
    if (route === 'datei' && (anfrage.method === 'PUT' || anfrage.method === 'DELETE')) {
      const p = pruefeSchreibPfad(url.searchParams.get('pfad'));
      if (!p.ok) return json(antwort, 400, { ok: false, fehler: p.grund }), true;
      const datei = absolut(p.pfad);
      if (anfrage.method === 'PUT') {
        const daten = await liesKoerper(anfrage);
        if (!daten.length) return json(antwort, 400, { ok: false, fehler: 'Leere Datei' }), true;
        if (p.datei.endsWith('.json')) JSON.parse(daten.toString('utf8')); // kaputtes JSON gar nicht erst ablegen
        await mkdir(path.dirname(datei), { recursive: true });
        await writeFile(datei, daten);
        console.log(`  ✎ ${p.pfad} (${Math.round(daten.length / 1024)} KB)`);
        return json(antwort, 200, { ok: true, pfad: p.pfad, groesse: daten.length, index: baueIndexFuer(wurzel, p.pfad) }), true;
      }
      try {
        await unlink(datei);
      } catch (e) {
        if (e.code !== 'ENOENT') throw e;
      }
      console.log(`  ✕ ${p.pfad}`);
      return json(antwort, 200, { ok: true, pfad: p.pfad, index: baueIndexFuer(wurzel, p.pfad) }), true;
    }
    return json(antwort, 404, { ok: false, fehler: 'Unbekannte Anfrage' }), true;
  } catch (e) {
    return json(antwort, e.code === 413 ? 413 : e instanceof SyntaxError ? 400 : e.code === 400 ? 400 : 500, { ok: false, fehler: e instanceof SyntaxError ? `Kein gültiges JSON: ${e.message}` : e.message }), true;
  }
}
