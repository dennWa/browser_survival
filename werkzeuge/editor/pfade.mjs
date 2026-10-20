/**
 * Pfadprüfung des lokalen Editor-Servers (Phase 10.1) – reine Funktionen ohne Node-Importe (Tests: tests/lokalerServer.test.js).
 * Der Editor darf NUR in diesen Ordnern schreiben/löschen; alles andere (Spielcode, Konten, Werkzeuge) bleibt tabu.
 * Pfade sind immer relativ zur Projektwurzel mit `/` (z. B. `client/musik/stadtrand/regen.ogg`).
 */
const AUDIO = ['ogg', 'mp3', 'wav', 'm4a', 'webm', 'opus', 'flac'];

/**
 * Freigegebene Ordner → { endungen, tiefe (Unterordner unterhalb des Ordners), geschuetzt (nie schreibbar) }.
 * Generierte Dateien (Indexe, README) schreibt nur der Server selbst (`geschuetzt`).
 */
export const SCHREIB_ORDNER = Object.freeze({
  'client/audio/eigene/': { endungen: [...AUDIO, 'json'], tiefe: 0, geschuetzt: ['eigene.json', 'README.md', 'README.vorlage.md'] },
  'client/audio/karten/': { endungen: AUDIO, tiefe: 1, geschuetzt: [] },
  'client/musik/': { endungen: [...AUDIO, 'json'], tiefe: 1, geschuetzt: ['musik.json', 'README.md'] },
  'client/assets/eigene/': { endungen: ['glb', 'md'], tiefe: 0, geschuetzt: [] },
  'server/spiel/karten/': { endungen: ['js'], tiefe: 0, geschuetzt: ['kartenLader.js', 'lootZonen.js', 'zonenEinstellungen.js'] },
});

/** Ein Pfad-Teil: Buchstaben (auch Umlaute), Ziffern, _ - . ( ) und Leerzeichen; nicht mit Punkt/Leerzeichen beginnend/endend. */
const TEIL = /^[\p{L}\p{N}_(][\p{L}\p{N}_ .()\-]*$/u;
const MAX_LAENGE = 200;

/**
 * Prüft einen Schreib-/Lösch-Pfad. @returns { ok: true, pfad, ordner, datei } | { ok: false, grund }
 * Abgelehnt: kein String, zu lang, Steuerzeichen, Backslash, absolut/Laufwerk, `.`/`..`/leere Teile, fremder Ordner,
 * zu tief verschachtelt, falsche Endung, geschützte Datei.
 */
export function pruefeSchreibPfad(pfad) {
  const nein = (grund) => ({ ok: false, grund });
  if (typeof pfad !== 'string' || !pfad) return nein('Pfad fehlt');
  if (pfad.length > MAX_LAENGE) return nein('Pfad zu lang');
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(pfad)) return nein('Steuerzeichen im Pfad');
  if (pfad.includes('\\')) return nein('Backslash im Pfad (nur / erlaubt)');
  if (pfad.startsWith('/') || /^[a-z]+:/i.test(pfad) || pfad.includes(':')) return nein('Absolute Pfade/Laufwerke sind nicht erlaubt');
  const teile = pfad.split('/');
  for (const t of teile) {
    if (!t || t === '.' || t === '..') return nein('Ungültiger Pfad-Teil (leer, . oder ..)');
    if (!TEIL.test(t) || /[ .]$/.test(t)) return nein(`Ungültiger Name „${t}“`);
  }
  const ordner = Object.keys(SCHREIB_ORDNER).find((o) => pfad.startsWith(o));
  if (!ordner) return nein('Ordner nicht freigegeben');
  const regel = SCHREIB_ORDNER[ordner];
  const rest = pfad.slice(ordner.length).split('/');
  if (rest.length - 1 > regel.tiefe) return nein('Zu tief verschachtelt');
  const datei = rest.at(-1);
  const endung = /\.([a-z0-9]+)$/i.exec(datei)?.[1]?.toLowerCase();
  if (!endung || !regel.endungen.includes(endung)) return nein(`Dateityp nicht erlaubt (hier: ${regel.endungen.join(', ')})`);
  if (rest.length === 1 && regel.geschuetzt.includes(datei)) return nein(`${datei} wird automatisch erzeugt bzw. ist geschützt`);
  return { ok: true, pfad, ordner, datei };
}

/** Darf der Ordner aufgelistet werden? (gleiche Ordner wie zum Schreiben, mit oder ohne abschließendes /) */
export function pruefeListenOrdner(ordner) {
  if (typeof ordner !== 'string') return null;
  const o = ordner.endsWith('/') ? ordner : `${ordner}/`;
  if (o.includes('..') || o.includes('\\')) return null;
  const basis = Object.keys(SCHREIB_ORDNER).find((x) => o.startsWith(x));
  if (!basis) return null;
  const rest = o.slice(basis.length).split('/').filter(Boolean);
  if (rest.length > SCHREIB_ORDNER[basis].tiefe || rest.some((t) => !TEIL.test(t))) return null;
  return o;
}

/** Host-Kopf einer Anfrage nur localhost/127.0.0.1/[::1] (Schutz gegen DNS-Rebinding). */
export function istLokalerHost(host) {
  return typeof host === 'string' && /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i.test(host);
}

/** Origin-Kopf (falls vorhanden) muss auf denselben lokalen Host zeigen (keine fremde Webseite darf schreiben). */
export function istErlaubterUrsprung(origin, host) {
  if (origin === undefined || origin === null || origin === '') return true;
  try {
    const u = new URL(origin);
    return (u.protocol === 'http:' || u.protocol === 'https:') && istLokalerHost(u.host) && u.host.toLowerCase() === String(host).toLowerCase();
  } catch {
    return false;
  }
}

/** Welcher Index muss nach einer Änderung an `pfad` neu gebaut werden? 'sounds' | 'musik' | null */
export function indexFuer(pfad) {
  if (pfad.startsWith('client/audio/eigene/')) return 'sounds';
  if (pfad.startsWith('client/musik/')) return 'musik';
  return null;
}
