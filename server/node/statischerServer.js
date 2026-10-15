import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

/**
 * Minimaler HTTP-Server für die Spieldateien (kein Express nötig).
 * Ausgeliefert werden NUR die freigegebenen Ordner – server/node und server/daten (Accounts!) nie.
 */
const FREIGEGEBEN = ['client', 'gemeinsam', 'server/spiel'];

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
  '.ico': 'image/x-icon',
};

export function erstelleStatischenServer(wurzel) {
  const erlaubteOrdner = FREIGEGEBEN.map((ordner) => path.join(wurzel, ordner) + path.sep);

  return createServer(async (anfrage, antwort) => {
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
