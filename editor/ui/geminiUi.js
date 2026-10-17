import { baueKontext, baueAnfrage, frageGemini, findeAktionen, ohneJsonBloecke, STANDARD_MODELL, BEKANNTE_MODELLE } from '../kern/gemini.js';
import { bereichText } from '../kern/ausschnitt.js';
import { dialog, esc } from './dialoge.js';

/**
 * KI-Helfer (Gemini) als Chat im Panel-Reiter „🤖 Helfer“.
 * - Schlüssel + Modell: localStorage `browserSurvival.editorGemini` (nur dieser Browser; fällt bei gesperrtem Speicher auf den Arbeitsspeicher zurück).
 * - Jede Frage bekommt frischen Kontext (Markierung/Auswahl/Zone, siehe kern/gemini.js); der Chatverlauf speichert nur Fragen + Antworten.
 * - Änderungsvorschläge (```json-Aktionsliste) landen NIE direkt in der Karte: Knopf „Prüfen“ → gleiche Vorschau wie 🤖 KI-Import.
 * Das DOM des Chats wird einmal gebaut und bei jedem Reiterwechsel nur wieder eingehängt (Panel zeichnet sonst bei Kartenänderung neu).
 */
const SPEICHER = 'browserSurvival.editorGemini';
const VORSCHLAEGE = [
  ['👀 Was siehst du hier?', 'Beschreibe kurz, was du im Kontext siehst, und nenne 3 Dinge, die du verbessern würdest.'],
  ['🎨 Texturen vorschlagen', 'Schlag passende Farben und Muster für die Objekte im Kontext vor und gib sie als typtextur-Aktionen aus.'],
  ['🌲 Dekorieren', 'Dekoriere den Bereich stimmig mit vorhandenen Objekttypen – nicht zu voll, Wege frei lassen.'],
  ['🧟 Spawns prüfen', 'Wirkt die Verteilung von Zombie-Spawns und Loot-Punkten hier sinnvoll? Was würdest du ändern?'],
];

export function geminiUi({ zustand, panel, aktionen, sonderAktionen, auswahlBereich, pruefeText }) {
  const speicher = ladeEinstellungen();
  const verlauf = []; // { rolle, text }
  let laeuft = null; // AbortController

  const wurzel = document.createElement('div');
  wurzel.className = 'helfer';
  wurzel.innerHTML = `
    <div class="helfer-kopf"><span class="helfer-status leise"></span><button data-a="einst" title="API-Schlüssel &amp; Modell">⚙</button><button data-a="neu" title="Neues Gespräch">🗑</button></div>
    <div class="helfer-kontext leise"></div>
    <div class="helfer-optionen leise"><label><input type="checkbox" name="bereich" checked> Bereich/Zone mitschicken</label><label><input type="checkbox" name="auswahl" checked> Auswahl mitschicken</label></div>
    <div class="helfer-vorschlaege"></div>
    <div class="helfer-chat" aria-live="polite"></div>
    <div class="helfer-eingabe"><textarea rows="3" placeholder="Was schwebt dir vor? (Strg+Enter sendet)"></textarea><div class="knopfreihe"><button data-a="senden" class="akzent">Senden</button><button data-a="stopp" hidden>Abbrechen</button></div></div>`;
  const el = (s) => wurzel.querySelector(s);
  const chat = el('.helfer-chat');
  const eingabe = el('textarea');

  const vorschlaege = el('.helfer-vorschlaege');
  for (const [titel, text] of VORSCHLAEGE) {
    const b = Object.assign(document.createElement('button'), { textContent: titel, type: 'button' });
    b.addEventListener('click', () => {
      eingabe.value = text;
      eingabe.focus();
    });
    vorschlaege.append(b);
  }

  const kontextOptionen = () => ({ mitBereich: el('[name=bereich]').checked, mitAuswahl: el('[name=auswahl]').checked });
  const holeKontext = () => baueKontext(zustand.karte, { rechteck: auswahlBereich(), auswahl: ausgewaehlteElemente(), ...kontextOptionen() });

  function zeigeKontext() {
    if (!zustand.karte) return (el('.helfer-kontext').textContent = 'Keine Zone geöffnet.');
    const k = holeKontext();
    el('.helfer-kontext').textContent = `Die KI sieht: ${k.beschreibung}${k.objekte ? ` · ${k.objekte} ausgewählt` : ''} · ~${Math.round(k.zeichen / 1000)}k Zeichen${k.zuGross ? ' · ⚠ Bereich zu groß, bitte kleiner markieren (⬚)' : ''}`;
  }
  function zeigeStatus() {
    el('.helfer-status').textContent = speicher.schluessel ? `Gemini · ${speicher.modell}` : 'Kein API-Schlüssel – ⚙ anklicken';
  }
  function ausgewaehlteElemente() {
    // Fallback, falls zustand keine Helferfunktion hat: Auswahl-Map → Elemente
    return [...zustand.auswahl.values()].map(({ s, k }) => ({ s, k, wert: zustand.karte.s(s).get(k) })).filter((e) => e.wert);
  }

  function nachricht(rolle, text, extra = {}) {
    const n = document.createElement('div');
    n.className = `helfer-nachricht ${rolle}`;
    const anzeige = rolle === 'helfer' ? ohneJsonBloecke(text) : text;
    n.innerHTML = `<div class="text">${esc(anzeige).replace(/\n/g, '<br>')}</div>`;
    if (extra.aktionen) {
      const b = Object.assign(document.createElement('button'), { textContent: `🔍 ${extra.aktionen.anzahl} Änderungen prüfen`, className: 'akzent', type: 'button' });
      b.addEventListener('click', () => {
        if (!extra.bereich) return zustand.meldung('Ohne Bereich kann ich nichts prüfen – erst einen Bereich markieren (⬚), dann nochmal fragen', 'fehler');
        pruefeText(extra.aktionen.json, extra.bereich, '🤖 Helfer');
      });
      n.append(b);
    }
    if (extra.hinweis) n.insertAdjacentHTML('beforeend', `<div class="leise">${esc(extra.hinweis)}</div>`);
    chat.append(n);
    chat.scrollTop = chat.scrollHeight;
    return n;
  }

  async function senden() {
    const frage = eingabe.value.trim();
    if (!frage || laeuft) return;
    if (!zustand.karte) return zustand.meldung('Erst eine Zone öffnen', 'fehler');
    if (!speicher.schluessel) return einstellungen();
    const kontext = holeKontext();
    nachricht('nutzer', frage, { hinweis: kontext.beschreibung });
    eingabe.value = '';
    const wartet = nachricht('helfer', '…denke nach…');
    laeuft = new AbortController();
    el('[data-a=senden]').hidden = true;
    el('[data-a=stopp]').hidden = false;
    try {
      const anfrage = baueAnfrage({ verlauf, frage, kontext: kontext.text });
      const { text, abgeschnitten } = await frageGemini({ schluessel: speicher.schluessel, modell: speicher.modell, anfrage, signal: laeuft.signal });
      verlauf.push({ rolle: 'nutzer', text: frage }, { rolle: 'helfer', text });
      wartet.remove();
      nachricht('helfer', text, { aktionen: findeAktionen(text, zustand.karte), bereich: kontext.bereich, hinweis: abgeschnitten ? 'Antwort wurde abgeschnitten – frag nach einem kleineren Schritt.' : null });
    } catch (e) {
      wartet.remove();
      nachricht('fehler', `⚠ ${e.message}`);
      eingabe.value = frage;
    } finally {
      laeuft = null;
      el('[data-a=senden]').hidden = false;
      el('[data-a=stopp]').hidden = true;
    }
  }

  async function einstellungen() {
    const w = await dialog({
      titel: '⚙ Gemini-Helfer',
      html: `<p class="leise">Schlüssel kostenlos bei <b>aistudio.google.com/apikey</b>. Er bleibt in <b>diesem Browser</b> (localStorage), landet in keinem Entwurf/Export und geht nur an <code>generativelanguage.googleapis.com</code>. Auf fremden Rechnern nach der Sitzung löschen.</p>
        <label class="feld"><span>API-Schlüssel</span><input name="schluessel" type="password" autocomplete="off" value="${esc(speicher.schluessel)}" placeholder="AIza…"></label>
        <label class="feld"><span>Modell</span><input name="modell" list="gemini-modelle" value="${esc(speicher.modell)}"></label>
        <datalist id="gemini-modelle">${BEKANNTE_MODELLE.map((m) => `<option value="${m}">`).join('')}</datalist>`,
      knoepfe: [{ text: 'Abbrechen', wert: null }, { text: 'Schlüssel löschen', art: 'gefahr', wert: 'loeschen' }, { text: 'Speichern', art: 'akzent', wert: (b) => ({ schluessel: b.querySelector('[name=schluessel]').value.trim(), modell: b.querySelector('[name=modell]').value.trim() }) }],
    });
    if (w === 'loeschen') Object.assign(speicher, { schluessel: '' });
    else if (w) Object.assign(speicher, { schluessel: w.schluessel, modell: /^[\w.\-]+$/.test(w.modell) ? w.modell : STANDARD_MODELL });
    else return;
    sichere(speicher);
    zeigeStatus();
  }

  wurzel.addEventListener('click', (e) => {
    const a = e.target.closest('[data-a]')?.dataset.a;
    if (a === 'einst') einstellungen();
    else if (a === 'senden') senden();
    else if (a === 'stopp') laeuft?.abort();
    else if (a === 'neu') {
      verlauf.length = 0;
      chat.innerHTML = '';
    }
  });
  eingabe.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      senden();
    }
    e.stopPropagation(); // Editor-Tastenkürzel (Werkzeuge) nicht beim Tippen auslösen
  });
  wurzel.addEventListener('change', zeigeKontext);
  for (const ev of ['auswahl', 'zone', 'karte']) zustand.bei(ev, () => panel.aktiv === '🤖 Helfer' && zeigeKontext());

  panel.reiter.set('🤖 Helfer', () => {
    panel.el.replaceChildren(wurzel);
    zeigeStatus();
    zeigeKontext();
  });
  sonderAktionen.helfer = () => panel.zeige('🤖 Helfer');
}

function ladeEinstellungen() {
  const standard = { schluessel: '', modell: STANDARD_MODELL };
  try {
    return { ...standard, ...JSON.parse(localStorage.getItem(SPEICHER) ?? '{}') };
  } catch {
    return standard;
  }
}
function sichere(e) {
  try {
    localStorage.setItem(SPEICHER, JSON.stringify(e));
  } catch {
    /* gesperrter Speicher: gilt nur für diese Sitzung */
  }
}
