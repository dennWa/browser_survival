import { baueKontext, baueAnfrage, leseStrukturiert, findeAktionen, ohneJsonBloecke, SYSTEM_TEXT } from './gemini.js';
import { leseKiAntwort, pruefeAenderungen } from './kiImport.js';

/**
 * KI-Pipeline (Editor 2.0, Schritt 9.1) – EIN Weg für alle Karten-KI-Funktionen (Helfer, Text zu Karte, Lückenfinder,
 * Fehler erklären, Loot-Balance, Zonen-Themen, Beschriftung):
 *   1. kiAnfrage   Kontext-Baukasten je Aufgabe (nur Markierung/Auswahl/Statistik/Zusatz-Bausteine, nie die ganze Karte,
 *                  nie der Schlüssel) → { anfrage, kontext, gesendet } – `gesendet` = Liste für „Das wird gesendet“
 *   2. (UI sendet über gemini.frageGemini – ui/kiAufgaben.js bzw. ui/geminiUi.js)
 *   3. kiErgebnis  Antwort → { antwort, vorschlag: { gelesen, vorschau } | null, fehler } – Vorschau über kiImport.pruefeAenderungen
 *   4. Übernehmen  in der UI: vorschau.ops als EIN zustand.ausfuehren (= 1 Undo-Schritt), nie direkt
 * KI_AUFGABEN: je Aufgabe Bausteine (bereich/auswahl/statistik), JSON-Antwort, eigener Systemtext-Zusatz.
 * `extra` = zusätzliche Kontext-Bausteine [{ titel, text }] (Befunde, Fehler, Loot-Daten …), erscheinen auch in `gesendet`.
 */
export const KI_AUFGABEN = Object.freeze({
  helfer: { name: 'KI-Helfer (Chat)', bereich: true, auswahl: true, statistik: true, json: true },
  textZuKarte: {
    name: 'Text zu Karte',
    bereich: true,
    auswahl: false,
    json: true,
    zusatz: 'Aufgabe: Baue im markierten Bereich, was der Nutzer beschreibt. Nutze Prefabs (aus "prefabs") als große Bausteine (Aktion prefab), ergänze Wege (kachel/linie), Natur und Objekte (setze), Spawns/Loot (marker, lootzone). Bleib streng im Bereich, Prefabs dürfen sich nicht überlappen.',
  },
  luecken: {
    name: 'Lückenfinder',
    bereich: true,
    auswahl: false,
    json: true,
    zusatz: 'Aufgabe: Unten stehen lokal berechnete Befunde (Lücken im Leveldesign). Erkläre sie kurz und nach Wichtigkeit sortiert (antwort als nummerierte Liste) und schlage Korrekturen als Aktionen vor – nur im mitgeschickten Bereich bzw. zonenweit.',
  },
  fehler: {
    name: 'Fehler erklären',
    bereich: true,
    auswahl: false,
    json: true,
    zusatz: 'Aufgabe: Erkläre den unten genannten Prüfungsfehler in EINEM verständlichen Satz (antwort) und schlage eine Korrektur als Aktionsliste vor – nur im mitgeschickten Ausschnitt um den Fehler.',
  },
  lootBalance: {
    name: 'Loot-Balance',
    bereich: false,
    auswahl: false,
    json: true,
    zusatz: 'Aufgabe: Vergleiche Loot (Räume, Loot-Punkte, Loot-Zonen, Zonen-Werte loot.*) mit der Schwierigkeit (Zombie-Spawns, zombie.dichte, Horde, Nacht-Tempo). Antworte mit einer kurzen Tabelle in "antwort" (Markdown) und Vorschlagswerten als Aktionen: wert (loot.*, zombie.*) und raum (spawnChance/respawnZeit). Keine Aktionen mit Ort.',
  },
  thema: {
    name: 'Zonen-Thema',
    bereich: false,
    auswahl: false,
    json: true,
    zusatz: 'Aufgabe: Gib der ganzen Zone das gewünschte Thema – gebündelt: Bodentöne (Aktion bodenton je Kachelzeichen), Typ-Texturen (typtextur), Wetter (wert wetter.*) und Musik-Ordner (wert musik). Keine Aktionen mit Ort.',
  },
  beschriftung: {
    name: 'Beschriftung',
    bereich: false,
    auswahl: false,
    json: true,
    zusatz: 'Aufgabe: Schlage stimmige, kurze deutsche Namen vor (Aktion name) für die unten gelisteten unbenannten Dinge. Keine anderen Aktionen.',
  },
});

export function kiAnfrage({ aufgabe = 'helfer', karte, frage, verlauf = [], rechteck = null, auswahl = [], mitBereich = true, mitAuswahl = true, prefabs = [], extra = [] }) {
  const a = KI_AUFGABEN[aufgabe];
  if (!a) throw new Error(`Unbekannte KI-Aufgabe „${aufgabe}“`);
  const kontext = baueKontext(karte, { rechteck, auswahl, mitBereich: a.bereich && mitBereich, mitAuswahl: a.auswahl && mitAuswahl, prefabs });
  for (const b of extra) {
    kontext.text += `\n\n## ${b.titel}\n${b.text}`;
    kontext.teile.push({ titel: b.titel, zeichen: b.text.length });
  }
  kontext.zeichen = kontext.text.length;
  const system = a.zusatz ? `${SYSTEM_TEXT}\n${a.zusatz}` : SYSTEM_TEXT;
  const anfrage = baueAnfrage({ verlauf, frage, kontext: kontext.text, json: a.json, system });
  return { anfrage, kontext, gesendet: gesendetListe(kontext, frage, verlauf) };
}

/** Was geht an Google? (für die Anzeige vor dem Senden) */
export function gesendetListe(kontext, frage, verlauf = []) {
  return [
    ...kontext.teile.map((t) => `${t.titel}${t.zeichen ? ` (~${Math.max(0.1, Math.round(t.zeichen / 100) / 10)}k Zeichen)` : ''}`),
    `Deine Frage/Aufgabe (${String(frage ?? '').length} Zeichen)`,
    verlauf.length ? `Bisheriger Chat: ${verlauf.length} Nachrichten (nur Text, keine alten Kartenstände)` : 'Kein bisheriger Chat',
    'Nicht gesendet: ganze Karte, API-Schlüssel (nur im Header), andere Zonen, Bibliothek/Dateien',
  ];
}

/** Antwort der KI → Text + (optional) geprüfte Vorschau der Aktionen */
export function kiErgebnis(karte, text, { bereich = null, prefabs = [] } = {}) {
  const antwort = ohneJsonBloecke(text);
  const gefunden = findeAktionen(text, karte);
  if (!gefunden) return { antwort, vorschlag: null, fehler: null };
  try {
    const gelesen = leseKiAntwort(gefunden.json, karte);
    const vorschau = pruefeAenderungen(karte, gelesen, { bereich, prefabs });
    return { antwort, vorschlag: { gelesen, vorschau, json: gefunden.json, anzahl: gefunden.anzahl }, fehler: null };
  } catch (e) {
    return { antwort, vorschlag: { json: gefunden.json, anzahl: gefunden.anzahl }, fehler: e.message };
  }
}

/** Rechteck {x,y,b,h} um Kacheln (+rand), auf die Zone begrenzt und höchstens `max` Kacheln groß – sonst null (7.1: Standard ohne Grenze) */
export function rahmenUm(karte, punkte, { rand = 3, max = Infinity } = {}) {
  const p = punkte.filter((q) => Number.isFinite(q?.x) && Number.isFinite(q?.y));
  if (!p.length) return null;
  const x0 = Math.max(0, Math.min(...p.map((q) => q.x)) - rand);
  const y0 = Math.max(0, Math.min(...p.map((q) => q.y)) - rand);
  const x1 = Math.min(karte.breite - 1, Math.max(...p.map((q) => q.x)) + rand);
  const y1 = Math.min(karte.hoehe - 1, Math.max(...p.map((q) => q.y)) + rand);
  const r = { x: x0, y: y0, b: x1 - x0 + 1, h: y1 - y0 + 1 };
  return r.b * r.h <= max ? r : null;
}

export { leseStrukturiert };
