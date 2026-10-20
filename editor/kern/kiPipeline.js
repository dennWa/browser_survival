import { baueKontext, baueAnfrage, leseStrukturiert, findeAktionen, ohneJsonBloecke } from './gemini.js';
import { leseKiAntwort, pruefeAenderungen } from './kiImport.js';

/**
 * KI-Pipeline (Editor 2.0, Schritt 9.1) – EIN Weg für alle Karten-KI-Funktionen (Helfer jetzt, 9.2–9.7 später):
 *   1. kiAnfrage   Kontext-Baukasten je Aufgabe (nur Markierung/Auswahl/Statistik, nie die ganze Karte, nie der Schlüssel)
 *                  → { anfrage, kontext, gesendet } – `gesendet` = Liste für die Anzeige „Das wird gesendet“
 *   2. (UI sendet über gemini.frageGemini)
 *   3. kiErgebnis  Antwort → { antwort, vorschlag: { gelesen, vorschau } | null, fehler } – Vorschau über kiImport.pruefeAenderungen
 *                  (simuliert auf einer Kopie, ungültige Aktionen werden gemeldet)
 *   4. Übernehmen  in der UI: vorschau.ops als EIN zustand.ausfuehren (= 1 Undo-Schritt), nie direkt
 * KI_AUFGABEN beschreibt je Aufgabe, welche Bausteine sie bekommt (bereich/auswahl/statistik).
 */
export const KI_AUFGABEN = Object.freeze({
  helfer: { name: 'KI-Helfer (Chat)', bereich: true, auswahl: true, statistik: true, json: true },
});

export function kiAnfrage({ aufgabe = 'helfer', karte, frage, verlauf = [], rechteck = null, auswahl = [], mitBereich = true, mitAuswahl = true, prefabs = [] }) {
  const a = KI_AUFGABEN[aufgabe];
  if (!a) throw new Error(`Unbekannte KI-Aufgabe „${aufgabe}“`);
  const kontext = baueKontext(karte, { rechteck, auswahl, mitBereich: a.bereich && mitBereich, mitAuswahl: a.auswahl && mitAuswahl, prefabs });
  const anfrage = baueAnfrage({ verlauf, frage, kontext: kontext.text, json: a.json });
  return { anfrage, kontext, gesendet: gesendetListe(kontext, frage, verlauf) };
}

/** Was geht an Google? (für die Anzeige vor dem Senden) */
export function gesendetListe(kontext, frage, verlauf = []) {
  return [
    ...kontext.teile.map((t) => `${t.titel}${t.zeichen ? ` (~${Math.max(1, Math.round(t.zeichen / 100) / 10)}k Zeichen)` : ''}`),
    `Deine Frage (${String(frage ?? '').length} Zeichen)`,
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

export { leseStrukturiert };
