/**
 * Externe Modell-Quellen (Editor 2.0, Schritt 3.5) – umgebungsfrei, `fetch` injizierbar (Tests ohne Netz:
 * tests/editorBibliothek.test.js). Jede Quelle ist ein Adapter { id, name, seite(text), suche(text, opt), lade(eintrag, opt) }.
 * Ergebnis-Einträge einheitlich: { id, titel, urheber, lizenz, vorschau, download, quelle, dreiecke, kategorie, tags[], animiert }.
 * Nur CC0/CC-BY kommen durch (Projektregel 6 – Urheber/Lizenz/Quelle wandern mit in die Bibliothek und nach LIZENZEN.md).
 * ⚠ API-Schlüssel nur aus localStorage des Browsers (ui/modelleUi.js), nie in Entwurf/Backup/Export.
 */
export const ERLAUBTE_LIZENZ = /^(CC0|CC-BY( [\d.]+)?)$/i;

/** "CC0 1.0" → "CC0", "CC-BY 3.0" bleibt, "Creative Commons Attribution" → "CC-BY" */
export function lizenzKurz(text) {
  const t = String(text ?? '').trim();
  if (/^cc0|public domain/i.test(t)) return 'CC0';
  const by = t.match(/^cc[- ]?by(?![- ]?(sa|nc|nd))[- ]?([\d.]+)?/i);
  if (by) return `CC-BY${by[2] ? ` ${by[2]}` : ''}`;
  if (/^creative commons attribution(?! ?(share|non))/i.test(t)) return 'CC-BY';
  return t;
}

/** Fehlertext für die UI; `cors` = Browser durfte nicht direkt laden → Rückfall: Link + Datei-Import */
export class QuellenFehler extends Error {
  constructor(text, { cors = false, status = 0 } = {}) {
    super(text);
    this.cors = cors;
    this.status = status;
  }
}

async function holen(fetchFn, url, optionen = {}) {
  let antwort;
  try {
    antwort = await fetchFn(url, optionen);
  } catch (e) {
    // fetch wirft TypeError bei Netz- und CORS-Problemen (der Browser verrät nicht, welches)
    throw new QuellenFehler(`Keine Verbindung (${e.message ?? e}) – vermutlich blockiert der Browser den direkten Zugriff (CORS)`, { cors: true });
  }
  if (antwort.status === 401 || antwort.status === 403) throw new QuellenFehler('API-Schlüssel fehlt oder ist ungültig', { status: antwort.status });
  if (antwort.status === 429) throw new QuellenFehler('Zu viele Anfragen – kurz warten', { status: 429 });
  if (!antwort.ok) throw new QuellenFehler(`Fehler ${antwort.status} von der Quelle`, { status: antwort.status });
  return antwort;
}

const feld = (o, ...namen) => namen.map((n) => o?.[n]).find((w) => w !== undefined && w !== null);

/** Poly Pizza (poly.pizza): kostenlose Low-Poly-Modelle, API-Schlüssel kostenlos unter poly.pizza/settings/api */
export const POLY_PIZZA = {
  id: 'polypizza',
  name: 'Poly Pizza',
  schluesselSeite: 'https://poly.pizza/settings/api',
  seite: (text) => `https://poly.pizza/search/${encodeURIComponent(text)}`,
  /** Ein Roh-Ergebnis der API → einheitlicher Eintrag (oder null, wenn Lizenz nicht passt / kein Download) */
  normal(r) {
    const id = String(feld(r, 'ID', 'Id', 'id') ?? '');
    const lizenz = lizenzKurz(feld(r, 'Licence', 'License', 'licence', 'license'));
    const download = feld(r, 'Download', 'download');
    if (!id || !download || !ERLAUBTE_LIZENZ.test(lizenz)) return null;
    const ersteller = feld(r, 'Creator', 'creator');
    return {
      id,
      titel: String(feld(r, 'Title', 'title', 'Name') ?? id).slice(0, 120),
      urheber: String(feld(ersteller, 'Username', 'username', 'Name') ?? feld(r, 'Author', 'Attribution') ?? '').slice(0, 120),
      lizenz,
      vorschau: feld(r, 'Thumbnail', 'thumbnail') ?? null,
      download: String(download),
      quelle: `https://poly.pizza/m/${encodeURIComponent(id)}`,
      dreiecke: Number(feld(r, 'Tri Count', 'TriCount', 'triCount')) || 0,
      kategorie: String(feld(r, 'Category', 'category') ?? ''),
      tags: Array.isArray(r.Tags ?? r.tags) ? (r.Tags ?? r.tags).map(String).slice(0, 10) : [],
      animiert: !!feld(r, 'Animated', 'animated'),
    };
  },
  async suche(text, { schluessel, fetch: fetchFn = globalThis.fetch, seite = 0, anzahl = 32 } = {}) {
    if (!schluessel) throw new QuellenFehler('Bitte zuerst einen (kostenlosen) Poly-Pizza-API-Schlüssel eintragen');
    const url = `https://api.poly.pizza/v1.1/search/${encodeURIComponent(String(text).trim() || 'tree')}?Limit=${anzahl}&Page=${seite}`;
    const j = await (await holen(fetchFn, url, { headers: { 'x-auth-token': schluessel } })).json();
    const roh = Array.isArray(j?.results) ? j.results : Array.isArray(j) ? j : [];
    const liste = roh.map((r) => this.normal(r)).filter(Boolean);
    return { liste, gesamt: Number(j?.total) || liste.length, ausgefiltert: roh.length - liste.length };
  },
  async lade(eintrag, { fetch: fetchFn = globalThis.fetch } = {}) {
    if (!/^https:\/\/([a-z0-9-]+\.)*poly\.pizza\//.test(eintrag.download)) throw new QuellenFehler('Unerwartete Download-Adresse');
    return new Uint8Array(await (await holen(fetchFn, eintrag.download)).arrayBuffer());
  },
};

export const QUELLEN = [POLY_PIZZA];
