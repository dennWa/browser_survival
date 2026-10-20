import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { behandleEditorApi } from '../../werkzeuge/editor/api.mjs';

/**
 * Minimaler HTTP-Server für die Spieldateien (kein Express nötig).
 * Ausgeliefert werden NUR die freigegebenen Ordner – server/node und server/daten (Accounts!) nie.
 */
const FREIGEGEBEN = ['client', 'gemeinsam', 'server/spiel', 'editor']; // editor/ = Map-Editor (nur Browser-Dateien, schreibt nichts)

const MIME_TYPEN = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ogg': 'audio/ogg',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.m4a': 'audio/mp4',
  '.flac': 'audio/flac',
  '.opus': 'audio/ogg',
  '.ico': 'image/x-icon',
};

/**
 * Editor-API (Map-Editor speichert Audio/Musik direkt ins Projekt): nur für Anfragen vom EIGENEN Rechner (Gegenstelle
 * 127.0.0.1, kein Proxy-Kopf, Host localhost) – auf einem öffentlichen Server (Render …) antwortet sie nie. Abschalten: EDITOR_API=0.
 */
const EDITOR_API = process.env.EDITOR_API !== '0';

export function erstelleStatischenServer(wurzel) {
  const erlaubteOrdner = FREIGEGEBEN.map((ordner) => path.join(wurzel, ordner) + path.sep);

  return createServer(async (anfrage, antwort) => {
    if (EDITOR_API && anfrage.url?.startsWith('/api/editor/')) {
      if (await behandleEditorApi(anfrage, antwort, new URL(anfrage.url, 'http://localhost'), { wurzel, nurLoopback: true })) return;
    }
    if (anfrage.method !== 'GET' && anfrage.method !== 'HEAD') {
      antwort.writeHead(405).end();
      return;
    }
    let pfadname;
    try {
      pfadname = decodeURIComponent(new URL(anfrage.url, 'http://localhost').pathname);
    } catch {
      antwort.writeHead(400).end();
      return;
    }
    if (pfadname === '/' || pfadname === '/index.html') {
      antwort.writeHead(302, { Location: '/client/' }).end();
      return;
    }
    if (pfadname.endsWith('/')) pfadname += 'index.html';

    const datei = path.normalize(path.join(wurzel, pfadname));
    if (!erlaubteOrdner.some((ordner) => datei.startsWith(ordner))) {
      antwort.writeHead(404).end('Nicht gefunden');
      return;
    }
    try {
      const inhalt = await readFile(datei);
      antwort.writeHead(200, {
        'Content-Type': MIME_TYPEN[path.extname(datei)] ?? 'application/octet-stream',
        'Cache-Control': 'no-cache',
      });
      antwort.end(anfrage.method === 'HEAD' ? undefined : inhalt);
    } catch {
      antwort.writeHead(404).end('Nicht gefunden');
    }
  });
}
