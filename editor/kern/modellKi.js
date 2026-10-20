import { KATEGORIEN } from './katalog.js';

/**
 * Modell → Metadaten (Editor 2.0, Schritt 9.8) – rein, kein DOM. UI: Knopf „🤖 Vorschlag“ im Modell-Dialog (ui/modelleUi.js).
 * Gesendet wird NUR: Name, lokal gemessene Maße (b × h × Höhe), Dreiecke, Animationsnamen und (optional) das Vorschaubild –
 * nie die Modelldatei, nie der Schlüssel (frageGemini prüft das).
 *   baueModellAnfrage(meta, {mitBild}) → Gemini-Body (JSON-Antwort erzwungen, Bild als inlineData)
 *   leseModellVorschlag(text) → { name, kategorie, ordner, tags, b, h, hoehe, ebene, blockiert } – alles geprüft/begrenzt,
 *                                Unbekanntes fällt weg (fehlende Felder = undefined → Formular behält seinen Wert)
 */
export const MODELL_EBENEN = Object.freeze({ moebel: 'Möbel (blockiert, am Boden)', oben: 'Oben (Krone/Dach, läuft man drunter)', boden: 'Boden (flach, begehbar)' });

export function modellGesendet(meta, { mitBild = true } = {}) {
  return [`Name „${meta.name}“`, `Maße ${meta.masse?.b} × ${meta.masse?.h} × ${meta.masse?.hoehe} m`, `${meta.dreiecke ?? 0} Dreiecke`, meta.animationen?.length ? `Animationen: ${meta.animationen.join(', ')}` : 'keine Animationen', mitBild && meta.vorschau ? 'Vorschaubild (klein, PNG/JPEG)' : 'kein Bild'];
}

export function baueModellAnfrage(meta, { mitBild = true } = {}) {
  const text = [
    'Du hilfst im Map-Editor eines Top-Down-Zombie-Survival-Spiels (1 Kachel = 1 m). Ein 3D-Modell wurde hochgeladen.',
    `Lokal gemessen: ${modellGesendet(meta, { mitBild }).join(' · ')}.`,
    `Schlage Metadaten vor. Antworte NUR als JSON: {"name": "kurzer deutscher Name", "kategorie": eine aus ${JSON.stringify(KATEGORIEN)}, "ordner": "z. B. Wald/Bäume", "tags": ["max. 6 kurze Tags"], "b": Breite in Kacheln, "h": Tiefe in Kacheln, "hoehe": Höhe in m, "ebene": eine aus ${JSON.stringify(Object.keys(MODELL_EBENEN))}, "blockiert": true/false}.`,
    'b/h = Grundfläche fürs Spiel (Kollisionsbox) – meist die gemessenen Maße, bei sehr kleinen Deko-Teilen kleiner/nicht blockierend. Bäume: ebene "oben".',
  ].join('\n');
  const parts = [{ text }];
  const bild = mitBild && typeof meta.vorschau === 'string' ? meta.vorschau.match(/^data:(image\/(?:png|jpeg|webp));base64,(.+)$/) : null;
  if (bild) parts.push({ inlineData: { mimeType: bild[1], data: bild[2] } });
  return { contents: [{ role: 'user', parts }], generationConfig: { temperature: 0.4, responseMimeType: 'application/json' } };
}

const zahl = (v, min, max) => (Number.isFinite(Number(v)) ? Math.round(Math.min(max, Math.max(min, Number(v))) * 100) / 100 : undefined);
const kurz = (v, n) => (typeof v === 'string' && v.trim() && !/[<>"\\]/.test(v) ? v.trim().slice(0, n) : undefined);

export function leseModellVorschlag(text) {
  let o;
  try {
    o = JSON.parse(String(text).trim().replace(/^```(?:json)?\s*|```$/g, ''));
  } catch {
    throw new Error('Die KI hat kein gültiges JSON geschickt – nochmal versuchen.');
  }
  if (!o || typeof o !== 'object' || Array.isArray(o)) throw new Error('Unerwartete Antwort der KI.');
  const ordner = kurz(o.ordner, 60);
  return {
    name: kurz(o.name, 60),
    kategorie: KATEGORIEN.includes(o.kategorie) ? o.kategorie : undefined,
    ordner: ordner && !ordner.split('/').some((t) => t === '..' || t === '.') ? ordner.replace(/^\/+|\/+$/g, '') : undefined,
    tags: Array.isArray(o.tags) ? o.tags.map((t) => kurz(t, 24)?.toLowerCase().replace(/^#/, '')).filter(Boolean).slice(0, 6) : undefined,
    b: zahl(o.b, 0.1, 20),
    h: zahl(o.h, 0.1, 20),
    hoehe: zahl(o.hoehe, 0.05, 30),
    ebene: Object.hasOwn(MODELL_EBENEN, o.ebene) ? o.ebene : undefined,
    blockiert: typeof o.blockiert === 'boolean' ? o.blockiert : undefined,
  };
}
