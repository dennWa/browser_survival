import { ausschnitt, ausschnittText, bereichText } from './ausschnitt.js';
import { katalog, objektInfo } from './katalog.js';
import { leseKiAntwort } from './kiImport.js';
import { kopie } from './karte.js';

/**
 * KI-Helfer (Gemini): Anfrage bauen, senden, Antwort lesen – umgebungsfrei (fetch wird übergeben, kein DOM).
 * Die UI (ui/geminiUi.js) hält Schlüssel + Chat. Der Schlüssel geht NUR an generativelanguage.googleapis.com.
 * Kontext je Frage: Zonen-Überblick + (markierter Bereich als Ausschnitt | Auswahl) – wird NICHT im Verlauf gespeichert,
 * damit alte Kartenstände den Chat nicht aufblähen. Änderungen kommen als Aktionsliste (siehe kiImport.js) und laufen
 * über dieselbe Vorschau wie der KI-Import – die KI ändert NIE direkt die Karte.
 */
export const GEMINI_BASIS = 'https://generativelanguage.googleapis.com/v1beta/models';
export const STANDARD_MODELL = 'gemini-2.5-flash';
export const BEKANNTE_MODELLE = ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-2.5-flash-lite'];
/** größter Bereich (Kacheln), der als Raster mitgeschickt wird */
export const MAX_KACHELN = 2500;

export const SYSTEM_TEXT = [
  'Du bist der Helfer im Map-Editor des Browser-Survival-Spiels (Top-Down-Zombie-Survival, 1 Kachel = 1 m).',
  'Du hilfst beim Gestalten von Zonen: Layout, Dekoration, Spawns/Loot-Verteilung, Farben und Texturen. Antworte auf Deutsch, kurz und konkret, gern mit einem Augenzwinkern.',
  'Du siehst nur den mitgelieferten Kontext (Zonen-Überblick, markierter Bereich, ausgewählte Objekte). Rate nicht, was du nicht siehst – frag nach oder bitte darum, einen Bereich zu markieren.',
  'Wenn der Nutzer etwas geändert haben will, erkläre kurz, was du tust, und hänge GENAU EINEN ```json-Block mit der Aktionsliste an (erste Aktion: die "bereich"-Aktion aus dem Kontext).',
  'Nutze nur Objekttypen aus "objektTypen", nur Kachelzeichen aus der Legende, nur Koordinaten INNERHALB des Bereichs. Ohne Bereich im Kontext keine Aktionen, sondern Tipps.',
  'Bei reinen Fragen oder Ideen: nur Text, kein JSON. Die Änderungen werden vom Nutzer in einer Vorschau geprüft – du musst nichts "bestätigen".',
].join('\n');

/** Rahmen um ausgewählte Objekte/Bauwerke (+Rand), auf die Zone begrenzt – oder null */
export function auswahlBereich(karte, auswahl, rand = 1) {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const { s, wert } of auswahl) {
    if (s === 'objekte') {
      x0 = Math.min(x0, Math.floor(wert.x));
      y0 = Math.min(y0, Math.floor(wert.y));
      x1 = Math.max(x1, Math.ceil(wert.x + wert.b) - 1);
      y1 = Math.max(y1, Math.ceil(wert.y + wert.h) - 1);
    } else if (s === 'bauwerke') {
      x0 = Math.min(x0, wert.tx);
      y0 = Math.min(y0, wert.ty);
      x1 = Math.max(x1, wert.tx);
      y1 = Math.max(y1, wert.ty);
    }
  }
  if (!Number.isFinite(x0)) return null;
  return { x: Math.max(0, x0 - rand), y: Math.max(0, y0 - rand), b: Math.min(karte.breite - 1, x1 + rand) - Math.max(0, x0 - rand) + 1, h: Math.min(karte.hoehe - 1, y1 + rand) - Math.max(0, y0 - rand) + 1 };
}

/** Objekttypen kompakt: "baum=Baum 2×2" */
function typListe(karte) {
  const eintraege = new Map();
  for (const e of katalog()) if (e.art === 'objekt' && !eintraege.has(e.typ)) eintraege.set(e.typ, `${e.typ}=${e.name} ${e.b}×${e.h}`);
  for (const [id, t] of karte.s('typen')) eintraege.set(id, `${id}=${t.name ?? id} ${t.b}×${t.h} (eigen)`);
  return [...eintraege.values()].join(', ');
}

/**
 * Kontext für eine Frage.
 * @returns { text, bereich: {x0,x1,y0,y1}|null, quelle: 'markierung'|'auswahl'|'zone'|'keiner', beschreibung, zu_gross }
 */
export function baueKontext(karte, { rechteck = null, auswahl = [], mitBereich = true, mitAuswahl = true } = {}) {
  const zeilen = [`# Kontext – Zone „${karte.name}“ (${karte.id}), ${karte.breite} × ${karte.hoehe} Kacheln`];
  const zaehler = {};
  for (const o of karte.s('objekte').values()) zaehler[o.typ] = (zaehler[o.typ] ?? 0) + 1;
  zeilen.push(`Objekte in der Zone: ${Object.entries(zaehler).map(([t, n]) => `${n}× ${t}`).join(', ') || 'keine'}.`);
  zeilen.push(`Typ-Texturen gesetzt: ${[...karte.s('texturen')].map(([t, v]) => `${t}=${JSON.stringify(v)}`).join(', ') || 'keine'}.`);
  zeilen.push(`objektTypen: ${typListe(karte)}`);

  const objekte = mitAuswahl ? auswahl.filter((e) => e.s === 'objekte' || e.s === 'bauwerke') : [];
  let r = null;
  let quelle = 'keiner';
  let zuGross = false;
  if (mitBereich && rechteck) {
    r = rechteck;
    quelle = 'markierung';
  } else if (objekte.length) {
    r = auswahlBereich(karte, objekte);
    quelle = 'auswahl';
  } else if (mitBereich && karte.breite * karte.hoehe <= MAX_KACHELN) {
    r = { x: 0, y: 0, b: karte.breite, h: karte.hoehe };
    quelle = 'zone';
  }
  if (r && r.b * r.h > MAX_KACHELN) {
    zuGross = true;
    r = null;
    quelle = 'keiner';
  }
  let bereich = null;
  let beschreibung = 'kein Bereich';
  if (r) {
    const a = ausschnitt(karte, r);
    bereich = { x0: a.bereich.x0, x1: a.bereich.x1, y0: a.bereich.y0, y1: a.bereich.y1 };
    beschreibung = `${quelle === 'markierung' ? 'Markierung' : quelle === 'auswahl' ? 'um die Auswahl' : 'ganze Zone'}: ${bereichText(bereich)}`;
    zeilen.push('', ausschnittText(a));
  } else if (zuGross) zeilen.push('', `(Der Bereich ist größer als ${MAX_KACHELN} Kacheln – nicht mitgeschickt. Der Nutzer soll einen kleineren Bereich markieren, wenn du Änderungen vorschlagen sollst.)`);
  else zeilen.push('', '(Kein Bereich markiert – nur Rat geben, keine Aktionen.)');

  if (objekte.length) {
    zeilen.push('', '## Aktuell ausgewählt (der Nutzer meint vermutlich diese)');
    for (const e of objekte.slice(0, 40)) {
      const w = kopie(e.wert);
      zeilen.push(e.s === 'objekte' ? `- Objekt id ${e.k}: ${objektInfo(w.typ, karte).name} ${JSON.stringify(w)}` : `- Bauwerk id ${e.k}: ${JSON.stringify(w)}`);
    }
    if (objekte.length > 40) zeilen.push(`- … und ${objekte.length - 40} weitere`);
  }
  const text = zeilen.join('\n');
  return { text, bereich, quelle, beschreibung, zuGross, objekte: objekte.length, zeichen: text.length };
}

/** Anfrage-Body für generateContent: verlauf = [{rolle:'nutzer'|'helfer', text}] ohne die neue Frage */
export function baueAnfrage({ verlauf = [], frage, kontext, temperatur = 0.7 }) {
  const contents = verlauf.map((n) => ({ role: n.rolle === 'helfer' ? 'model' : 'user', parts: [{ text: n.text }] }));
  contents.push({ role: 'user', parts: [{ text: `${kontext ? `${kontext}\n\n---\n` : ''}Frage des Nutzers:\n${frage}` }] });
  return { systemInstruction: { parts: [{ text: SYSTEM_TEXT }] }, contents, generationConfig: { temperature: temperatur } };
}

/** Antwort-JSON → Text; wirft verständliche Fehler (blockiert, leer, abgeschnitten wird nur gemeldet) */
export function leseGeminiAntwort(json) {
  if (json?.promptFeedback?.blockReason) throw new Error(`Gemini hat die Anfrage abgelehnt (${json.promptFeedback.blockReason}).`);
  const k = json?.candidates?.[0];
  const text = (k?.content?.parts ?? []).map((p) => p.text ?? '').join('').trim();
  if (!text) throw new Error(`Gemini hat nichts geantwortet${k?.finishReason ? ` (${k.finishReason})` : ''}.`);
  return { text, abgeschnitten: k?.finishReason === 'MAX_TOKENS' };
}

export function fehlerText(status, body) {
  const meldung = body?.error?.message ?? '';
  if (status === 400 && /API key/i.test(meldung)) return 'Der API-Schlüssel wurde abgelehnt (ungültig?). Unter ⚙ prüfen.';
  if (status === 400) return `Anfrage ungültig: ${meldung || 'unbekannt'}`;
  if (status === 401 || status === 403) return `Kein Zugriff (${status}): Schlüssel falsch, für die Gemini-API nicht freigeschaltet oder Region gesperrt. ${meldung}`.trim();
  if (status === 404) return `Modell nicht gefunden – unter ⚙ ein anderes wählen. ${meldung}`.trim();
  if (status === 429) return 'Zu viele Anfragen oder Tageslimit erreicht (429). Kurz warten oder anderes Modell wählen.';
  if (status >= 500) return `Gemini hat gerade Probleme (${status}). Gleich nochmal versuchen.`;
  return `Fehler ${status}: ${meldung}`;
}

/** Sendet eine Anfrage. @returns { text, abgeschnitten } */
export async function frageGemini({ schluessel, modell = STANDARD_MODELL, anfrage, signal = undefined, fetchFn = globalThis.fetch }) {
  if (!schluessel?.trim()) throw new Error('Kein API-Schlüssel hinterlegt (⚙ im Helfer-Reiter).');
  if (!/^[\w.\-]+$/.test(modell)) throw new Error('Ungültiger Modellname');
  let antwort;
  try {
    antwort = await fetchFn(`${GEMINI_BASIS}/${modell}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': schluessel.trim() },
      body: JSON.stringify(anfrage),
      signal,
    });
  } catch (e) {
    if (e?.name === 'AbortError') throw new Error('Abgebrochen.');
    throw new Error('Keine Verbindung zu Gemini (Internet/Adblocker?).');
  }
  let json = null;
  try {
    json = await antwort.json();
  } catch {
    /* kein JSON → unten Fehlertext nach Status */
  }
  if (!antwort.ok) throw new Error(fehlerText(antwort.status, json));
  return leseGeminiAntwort(json);
}

/**
 * Aktionsliste aus der Antwort? → { aktionen: n } oder null.
 * Nimmt den ```json-Block; ohne verwertbare Aktionen (reiner Text) null.
 */
export function findeAktionen(text, karte) {
  const bloecke = [...text.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)].map((m) => m[1]);
  for (const b of bloecke.reverse()) {
    try {
      const g = leseKiAntwort(b, karte);
      if (g.aktionen.length) return { anzahl: g.aktionen.length, json: b.trim() };
    } catch {
      /* nächster Block */
    }
  }
  return null;
}

/** Text ohne die JSON-Blöcke (die zeigt die UI als Knopf) */
export const ohneJsonBloecke = (text) => text.replace(/```(?:json)?\s*[\s\S]*?```/gi, '').replace(/\n{3,}/g, '\n\n').trim();
