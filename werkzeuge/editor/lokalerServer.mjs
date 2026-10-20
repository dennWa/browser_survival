#!/usr/bin/env node
/**
 * Lokaler Editor-Server (Phase 10.1): `npm run editor:lokal [-- --port 8090]`
 * Läuft NUR auf 127.0.0.1, liefert Spiel + Editor aus (http://localhost:8090/editor/) und erlaubt dem Editor, Dateien in
 * freigegebenen Ordnern zu schreiben/löschen (Liste + Regeln: pfade.mjs SCHREIB_ORDNER). Nach jeder Änderung werden die
 * Indexe neu gebaut (eigene.json/README bzw. musik.json, wie `npm run sounds` / `npm run musik:index`).
 *
 * API (nur mit Kopf `X-Editor: 1`, Host/Origin = localhost – fremde Webseiten können nicht schreiben):
 *   GET    /api/editor/status                      → { ok, version, ordner[] }
 *   GET    /api/editor/liste?ordner=client/musik/  → { dateien: [{ pfad, groesse, geaendert }] } (rekursiv, freigegebene Ordner)
 *   PUT    /api/editor/datei?pfad=…   (Body = Bytes) → { ok, pfad, groesse, index? }
 *   DELETE /api/editor/datei?pfad=…                → { ok, pfad, index? }
 * Der Spielserver (server/node/) wird hierfür NICHT gebraucht: Spiel läuft im Lokal-Modus (Server im Tab).
 */
import { createServer } from 'node:http';
import { mkdir, readFile, readdir, stat, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SCHREIB_ORDNER, pruefeSchreibPfad, pruefeListenOrdner, istLokalerHost, istErlaubterUrsprung, indexFuer } from './pfade.mjs';
import { schreibeSoundIndex, schreibeMusikIndex } from '../audio/indexBauen.mjs';

export const API_VERSION = 1;
const MAX_GROESSE = 60 * 1024 * 1024; // 60 MB je Datei (lange Musik als WAV)
/** Ausgelieferte Ordner (wie server/node/statischerServer.js) – server/node + server/daten (Konten!) nie */
const AUSGELIEFERT = ['client', 'gemeinsam', 'server/spiel', 'editor'];
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.md': 'text/markdown; charset=utf-8', '.txt': 'text/plain; charset=utf-8', '.png': 'image/png', '.webp': 'image/webp',
  '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.glb': 'model/gltf-binary', '.ogg': 'audio/ogg', '.opus': 'audio/ogg',
  '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.m4a': 'audio/mp4', '.flac': 'audio/flac', '.webm': 'audio/webm',
};

const json = (antwort, code, daten) => antwort.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }).end(JSON.stringify(daten));

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

export function erstelleEditorServer({ wurzel }) {
  const ausgeliefert = AUSGELIEFERT.map((o) => path.join(wurzel, o) + path.sep);
  const absolut = (rel) => {
    const datei = path.resolve(wurzel, ...rel.split('/'));
    // doppelte Sicherung nach der Textprüfung: Ergebnis muss im freigegebenen Ordner liegen
    if (!Object.keys(SCHREIB_ORDNER).some((o) => datei.startsWith(path.resolve(wurzel, ...o.split('/').filter(Boolean)) + path.sep))) throw Object.assign(new Error('Pfad außerhalb'), { code: 400 });
    return datei;
  };

  return createServer(async (anfrage, antwort) => {
    let url;
    try {
      url = new URL(anfrage.url, 'http://localhost');
    } catch {
      return antwort.writeHead(400).end();
    }
    const host = anfrage.headers.host;
    if (!istLokalerHost(host)) return antwort.writeHead(403).end('Nur lokal erreichbar');

    if (url.pathname.startsWith('/api/editor/')) {
      if (anfrage.headers['x-editor'] !== '1' || !istErlaubterUrsprung(anfrage.headers.origin, host)) return json(antwort, 403, { ok: false, fehler: 'Nicht erlaubt (fremder Ursprung)' });
      try {
        const route = url.pathname.slice('/api/editor/'.length);
        if (route === 'status' && anfrage.method === 'GET') return json(antwort, 200, { ok: true, version: API_VERSION, ordner: Object.keys(SCHREIB_ORDNER) });
        if (route === 'liste' && anfrage.method === 'GET') {
          const ordner = pruefeListenOrdner(url.searchParams.get('ordner'));
          if (!ordner) return json(antwort, 400, { ok: false, fehler: 'Ordner nicht freigegeben' });
          return json(antwort, 200, { ok: true, dateien: await liste(wurzel, ordner) });
        }
        if (route === 'datei' && (anfrage.method === 'PUT' || anfrage.method === 'DELETE')) {
          const p = pruefeSchreibPfad(url.searchParams.get('pfad'));
          if (!p.ok) return json(antwort, 400, { ok: false, fehler: p.grund });
          const datei = absolut(p.pfad);
          if (anfrage.method === 'PUT') {
            const daten = await liesKoerper(anfrage);
            if (!daten.length) return json(antwort, 400, { ok: false, fehler: 'Leere Datei' });
            if (p.datei.endsWith('.json')) JSON.parse(daten.toString('utf8')); // kaputtes JSON gar nicht erst ablegen
            await mkdir(path.dirname(datei), { recursive: true });
            await writeFile(datei, daten);
            console.log(`  ✎ ${p.pfad} (${Math.round(daten.length / 1024)} KB)`);
            return json(antwort, 200, { ok: true, pfad: p.pfad, groesse: daten.length, index: baueIndexFuer(wurzel, p.pfad) });
          }
          try {
            await unlink(datei);
          } catch (e) {
            if (e.code !== 'ENOENT') throw e;
          }
          console.log(`  ✕ ${p.pfad}`);
          return json(antwort, 200, { ok: true, pfad: p.pfad, index: baueIndexFuer(wurzel, p.pfad) });
        }
        return json(antwort, 404, { ok: false, fehler: 'Unbekannte Anfrage' });
      } catch (e) {
        return json(antwort, e.code === 413 ? 413 : e instanceof SyntaxError ? 400 : e.code === 400 ? 400 : 500, { ok: false, fehler: e instanceof SyntaxError ? `Kein gültiges JSON: ${e.message}` : e.message });
      }
    }

    // Statische Dateien (nur lesen)
    if (anfrage.method !== 'GET' && anfrage.method !== 'HEAD') return antwort.writeHead(405).end();
    let pfadname;
    try {
      pfadname = decodeURIComponent(url.pathname);
    } catch {
      return antwort.writeHead(400).end();
    }
    if (pfadname === '/' || pfadname === '/index.html') return antwort.writeHead(302, { Location: '/editor/' }).end();
    if (pfadname.endsWith('/')) pfadname += 'index.html';
    const datei = path.normalize(path.join(wurzel, pfadname));
    if (!ausgeliefert.some((o) => datei.startsWith(o))) return antwort.writeHead(404).end('Nicht gefunden');
    try {
      const inhalt = await readFile(datei);
      antwort.writeHead(200, { 'Content-Type': MIME[path.extname(datei).toLowerCase()] ?? 'application/octet-stream', 'Content-Length': inhalt.length, 'Cache-Control': 'no-cache' });
      antwort.end(anfrage.method === 'HEAD' ? undefined : inhalt);
    } catch {
      antwort.writeHead(404).end('Nicht gefunden');
    }
  });
}

// Direkt gestartet (npm run editor:lokal)
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const argumente = process.argv.slice(2);
  const i = argumente.indexOf('--port');
  const port = Number(i >= 0 ? argumente[i + 1] : process.env.EDITOR_PORT) || 8090;
  const wurzel = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
  erstelleEditorServer({ wurzel }).listen(port, '127.0.0.1', () => {
    console.log(`Lokaler Editor-Server läuft: http://localhost:${port}/editor/  (Spiel: http://localhost:${port}/client/)`);
    console.log(`Schreibt nur in: ${Object.keys(SCHREIB_ORDNER).join(', ')}`);
    console.log('Beenden mit Strg+C. Änderungen danach committen und pushen.');
  });
}
