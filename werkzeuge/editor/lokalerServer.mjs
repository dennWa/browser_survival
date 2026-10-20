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
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SCHREIB_ORDNER, istLokalerHost } from './pfade.mjs';
import { behandleEditorApi } from './api.mjs';

export { API_VERSION } from './api.mjs';
/** Ausgelieferte Ordner (wie server/node/statischerServer.js) – server/node + server/daten (Konten!) nie */
const AUSGELIEFERT = ['client', 'gemeinsam', 'server/spiel', 'editor'];
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.md': 'text/markdown; charset=utf-8', '.txt': 'text/plain; charset=utf-8', '.png': 'image/png', '.webp': 'image/webp',
  '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.glb': 'model/gltf-binary', '.ogg': 'audio/ogg', '.opus': 'audio/ogg',
  '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.m4a': 'audio/mp4', '.flac': 'audio/flac', '.webm': 'audio/webm',
};

export function erstelleEditorServer({ wurzel }) {
  const ausgeliefert = AUSGELIEFERT.map((o) => path.join(wurzel, o) + path.sep);

  return createServer(async (anfrage, antwort) => {
    let url;
    try {
      url = new URL(anfrage.url, 'http://localhost');
    } catch {
      return antwort.writeHead(400).end();
    }
    if (!istLokalerHost(anfrage.headers.host)) return antwort.writeHead(403).end('Nur lokal erreichbar');
    if (await behandleEditorApi(anfrage, antwort, url, { wurzel })) return;
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
