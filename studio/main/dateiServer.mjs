/**
 * Kleiner statischer Server NUR auf 127.0.0.1 (Hauptprozess). Liefert das Studio (studio/ aus dem App-Ordner) und die
 * Spieldateien (client, gemeinsam, server/spiel, editor aus dem Spielordner). Gleicher Ursprung für Studio-Fenster und
 * Test-Fenster → der Testlauf teilt sich IndexedDB mit dem Spiel (client/ui/editorTestSpeicher.js).
 * Schreiben gibt es hier nicht – das läuft per IPC über projekt.mjs.
 */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.md': 'text/markdown; charset=utf-8', '.txt': 'text/plain; charset=utf-8', '.png': 'image/png', '.webp': 'image/webp',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.glb': 'model/gltf-binary', '.fbx': 'application/octet-stream', '.ogg': 'audio/ogg', '.opus': 'audio/ogg',
  '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.m4a': 'audio/mp4', '.flac': 'audio/flac', '.webm': 'audio/webm', '.woff2': 'font/woff2',
};
const SPIEL_ORDNER = ['client', 'gemeinsam', 'server/spiel', 'editor'];

/** @param appWurzel Ordner mit studio/ · @param spielWurzel() aktueller Spielordner (kann sich ändern) */
export function erstelleDateiServer({ appWurzel, spielWurzel }) {
  return createServer(async (anfrage, antwort) => {
    if (!/^(127\.0\.0\.1|localhost)(:\d+)?$/.test(anfrage.headers.host ?? '')) return antwort.writeHead(403).end();
    if (anfrage.method !== 'GET' && anfrage.method !== 'HEAD') return antwort.writeHead(405).end();
    let pfadname;
    try {
      pfadname = decodeURIComponent(new URL(anfrage.url, 'http://localhost').pathname);
    } catch {
      return antwort.writeHead(400).end();
    }
    if (pfadname === '/') return antwort.writeHead(302, { Location: '/studio/' }).end();
    if (pfadname.endsWith('/')) pfadname += 'index.html';
    const basis = pfadname.startsWith('/studio/') ? appWurzel : spielWurzel();
    const erlaubt = pfadname.startsWith('/studio/') ? [path.join(appWurzel, 'studio') + path.sep] : SPIEL_ORDNER.map((o) => path.join(basis, o) + path.sep);
    const datei = path.normalize(path.join(basis, pfadname));
    if (!erlaubt.some((o) => datei.startsWith(o))) return antwort.writeHead(404).end('Nicht gefunden');
    try {
      const inhalt = await readFile(datei);
      antwort.writeHead(200, { 'Content-Type': MIME[path.extname(datei).toLowerCase()] ?? 'application/octet-stream', 'Content-Length': inhalt.length, 'Cache-Control': 'no-cache' });
      antwort.end(anfrage.method === 'HEAD' ? undefined : inhalt);
    } catch {
      antwort.writeHead(404).end('Nicht gefunden');
    }
  });
}
