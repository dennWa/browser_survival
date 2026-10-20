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
 * Editor 2.0, 9.1: NIE die ganze Karte (früher: Zonen ≤ 2500 Kacheln ganz, Fehler B6) – nur Markierung/Auswahl + Statistik;
 * `teile` sagt, was gesendet wird (UI „Das wird gesendet“); strukturierte Antworten (`json: true` → responseMimeType
 * application/json, Form { antwort, aktionen }); frageGemini prüft, dass der Schlüssel NIE im Body steht.
 */
export const GEMINI_BASIS = 'https://generativelanguage.googleapis.com/v1beta/models';
export const STANDARD_MODELL = 'gemini-2.5-flash';
export const BEKANNTE_MODELLE = ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-2.5-flash-lite'];
/** größter Bereich (Kacheln), der als Raster mitgeschickt wird */
export const MAX_KACHELN = 2500;

export const JSON_TEXT = [
  'Antworte IMMER als JSON-Objekt: {"antwort": "<dein Text auf Deutsch>", "aktionen": [ … ]}.',
  '"aktionen" ist die Aktionsliste (erste Aktion: die "bereich"-Aktion aus dem Kontext) – bei reinen Fragen/Ideen eine leere Liste.',
].join('\n');

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

/** Statistik der Zone (Kontext-Baustein, 9.1): Zählungen, Räume, Loot-Zonen, gesetzte Zonen-Werte – keine Kacheln */
export function zonenStatistik(karte, { prefabs = [] } = {}) {
  const zaehler = {};
  for (const o of karte.s('objekte').values()) zaehler[o.typ] = (zaehler[o.typ] ?? 0) + 1;
  const marker = { start: 0, zombie: 0, loot: 0 };
  for (const m of karte.s('marker').values()) marker[m.art] = (marker[m.art] ?? 0) + 1;
  const zeilen = [
    `Objekte in der Zone: ${Object.entries(zaehler).map(([t, n]) => `${n}× ${t}`).join(', ') || 'keine'}.`,
    `Marker: ${marker.start} Start, ${marker.zombie} Zombie-Spawns, ${marker.loot} Loot-Punkte · ${karte.s('bauwerke').size} Bauwerke · ${karte.s('uebergaenge').size} Übergänge.`,
    `Räume: ${[...karte.s('raeume')].map(([k, r]) => `${k}=${r.name} (${r.lootTabelle})`).join(', ') || 'keine'}.`,
    `Loot-Zonen: ${[...karte.s('lootZonen')].map(([id, z]) => `id ${id} „${z.name}“ ${z.b}×${z.h} bei ${z.x}|${z.y}`).join(', ') || 'keine'}.`,
    `Zonen-Werte gesetzt: ${JSON.stringify(karte.wert('einstellungen') ?? {})}${karte.wert('musik') ? ` · musik=${karte.wert('musik')}` : ''}.`,
    `Typ-Texturen gesetzt: ${[...karte.s('texturen')].map(([t, v]) => `${t}=${JSON.stringify(v)}`).join(', ') || 'keine'}.`,
    `objektTypen: ${typListe(karte)}`,
  ];
  if (prefabs.length) zeilen.push(`prefabs: ${prefabs.map((p) => `${p.name} ${p.vorlage.b}×${p.vorlage.h}`).join(', ')}`);
  return zeilen.join('\n');
}

/**
 * Kontext für eine Frage (Kontext-Baukasten 9.1): Kopf + Statistik (immer, ohne Kacheln) + Ausschnitt NUR der Markierung bzw.
 * um die Auswahl (nie die ganze Zone) + gewählte Objekte.
 * @returns { text, teile: [{ titel, zeichen }], bereich: {x0,x1,y0,y1}|null, quelle: 'markierung'|'auswahl'|'keiner', beschreibung, zuGross }
 */
export function baueKontext(karte, { rechteck = null, auswahl = [], mitBereich = true, mitAuswahl = true, prefabs = [] } = {}) {
  const teile = [];
  const kopf = `# Kontext – Zone „${karte.name}“ (${karte.id}), ${karte.breite} × ${karte.hoehe} Kacheln`;
  const statistik = zonenStatistik(karte, { prefabs });
  teile.push({ titel: 'Zonen-Statistik (ohne Kacheln)', zeichen: statistik.length });
  const zeilen = [kopf, statistik];

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
    beschreibung = `${quelle === 'markierung' ? 'Markierung' : 'um die Auswahl'}: ${bereichText(bereich)}`;
    const t = ausschnittText(a);
    teile.push({ titel: `Ausschnitt ${bereichText(bereich)} (${r.b} × ${r.h} Kacheln)`, zeichen: t.length });
    zeilen.push('', t);
  } else if (zuGross) zeilen.push('', `(Der Bereich ist größer als ${MAX_KACHELN} Kacheln – nicht mitgeschickt. Der Nutzer soll einen kleineren Bereich markieren, wenn du Änderungen vorschlagen sollst.)`);
  else zeilen.push('', '(Kein Bereich markiert – nur Rat geben; erlaubt sind dann nur zonenweite Aktionen: wert, name zone/raum, raum, typtextur.)');

  if (objekte.length) {
    zeilen.push('', '## Aktuell ausgewählt (der Nutzer meint vermutlich diese)');
    for (const e of objekte.slice(0, 40)) {
      const w = kopie(e.wert);
      zeilen.push(e.s === 'objekte' ? `- Objekt id ${e.k}: ${objektInfo(w.typ, karte).name} ${JSON.stringify(w)}` : `- Bauwerk id ${e.k}: ${JSON.stringify(w)}`);
    }
    if (objekte.length > 40) zeilen.push(`- … und ${objekte.length - 40} weitere`);
    teile.push({ titel: `${Math.min(40, objekte.length)} ausgewählte Objekte`, zeichen: 0 });
  }
  const text = zeilen.join('\n');
  return { text, teile, bereich, quelle, beschreibung, zuGross, objekte: objekte.length, zeichen: text.length };
}

/** Anfrage-Body für generateContent: verlauf = [{rolle:'nutzer'|'helfer', text}] ohne die neue Frage */
export function baueAnfrage({ verlauf = [], frage, kontext, temperatur = 0.7, json = false, system = SYSTEM_TEXT }) {
  const contents = verlauf.map((n) => ({ role: n.rolle === 'helfer' ? 'model' : 'user', parts: [{ text: n.text }] }));
  contents.push({ role: 'user', parts: [{ text: `${kontext ? `${kontext}\n\n---\n` : ''}Frage des Nutzers:\n${frage}` }] });
  const generationConfig = { temperature: temperatur };
  if (json) generationConfig.responseMimeType = 'application/json';
  return { systemInstruction: { parts: [{ text: json ? `${system}\n${JSON_TEXT}` : system }] }, contents, generationConfig };
}

/** Strukturierte Antwort { antwort, aktionen } lesen – sonst null (dann alter Weg: Text + ```json-Block) */
export function leseStrukturiert(text) {
  try {
    const o = JSON.parse(String(text).trim().replace(/^```(?:json)?\s*|```$/g, ''));
    if (o && typeof o === 'object' && !Array.isArray(o) && (typeof o.antwort === 'string' || Array.isArray(o.aktionen))) return { antwort: String(o.antwort ?? ''), aktionen: Array.isArray(o.aktionen) ? o.aktionen : [] };
  } catch {
    /* kein reines JSON */
  }
  return null;
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
  const body = JSON.stringify(anfrage);
  // 9.1: Der Schlüssel gehört NUR in den Header – steht er (z. B. durch einen Fehler im Kontext) im Body, wird nichts gesendet
  if (schluessel.trim().length >= 8 && body.includes(schluessel.trim())) throw new Error('Sicherheitsstopp: der API-Schlüssel stünde in der Anfrage – nichts gesendet.');
  let antwort;
  try {
    antwort = await fetchFn(`${GEMINI_BASIS}/${modell}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': schluessel.trim() },
      body,
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

/** Bildmodell für „Textur aus Text“ (Werkstatt 5.4) – nicht jeder Schlüssel/Tarif darf es benutzen */
export const BILD_MODELL = 'gemini-2.5-flash-image';

/**
 * Bild erzeugen (Werkstatt 5.4). Gleiche Fehlertexte wie frageGemini. @returns { daten: Data-URL, text } – wirft, wenn kein Bild kam
 */
export async function frageGeminiBild({ schluessel, modell = BILD_MODELL, prompt, signal = undefined, fetchFn = globalThis.fetch }) {
  if (!schluessel?.trim()) throw new Error('Kein API-Schlüssel hinterlegt (⚙ im Helfer-Reiter).');
  if (!/^[\w.\-]+$/.test(modell)) throw new Error('Ungültiger Modellname');
  let antwort;
  try {
    antwort = await fetchFn(`${GEMINI_BASIS}/${modell}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': schluessel.trim() },
      body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig: { responseModalities: ['TEXT', 'IMAGE'] } }),
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
    /* unten */
  }
  if (!antwort.ok) throw new Error(fehlerText(antwort.status, json));
  const teile = json?.candidates?.[0]?.content?.parts ?? [];
  const bild = teile.find((p) => p.inlineData?.data && /^image\/(png|jpeg|webp)$/.test(p.inlineData.mimeType ?? ''));
  if (!bild) throw new Error(`Kein Bild in der Antwort – Modell „${modell}“ kann evtl. keine Bilder (unter ⚙ ein Bildmodell wählen).`);
  return { daten: `data:${bild.inlineData.mimeType};base64,${bild.inlineData.data}`, text: teile.map((p) => p.text ?? '').join('').trim() };
}

/**
 * Aktionsliste aus der Antwort? → { aktionen: n } oder null.
 * Nimmt den ```json-Block; ohne verwertbare Aktionen (reiner Text) null.
 */
export function findeAktionen(text, karte) {
  const s = leseStrukturiert(text);
  if (s) {
    const aktionen = s.aktionen.filter((a) => a && typeof a === 'object');
    return aktionen.some((a) => String(a.aktion ?? '').toLowerCase() !== 'bereich') ? { anzahl: aktionen.filter((a) => String(a.aktion ?? '').toLowerCase() !== 'bereich').length, json: JSON.stringify(aktionen) } : null;
  }
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
export const ohneJsonBloecke = (text) => leseStrukturiert(text)?.antwort ?? text.replace(/```(?:json)?\s*[\s\S]*?```/gi, '').replace(/\n{3,}/g, '\n\n').trim();
