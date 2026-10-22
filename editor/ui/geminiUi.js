import { ladeSpielordner } from '../kern/spielordner.js';
import { frageGemini, ohneJsonBloecke, markierungTeile, aussenRechteck, STANDARD_MODELL, BEKANNTE_MODELLE } from '../kern/gemini.js';
import { kiAnfrage, kiErgebnis } from '../kern/kiPipeline.js';
import { bereichText } from '../kern/ausschnitt.js';
import { dialog, esc } from './dialoge.js';

/**
 * KI-Helfer (Gemini) als Chat in der eigenen, einklappbaren KI-Seitenleiste (Menü KI → KI-Helfer, Strg+J).
 * - Schlüssel + Modell: localStorage `browserSurvival.editorGemini` (nur dieser Browser; fällt bei gesperrtem Speicher auf den Arbeitsspeicher zurück).
 * - Jede Frage bekommt frischen Kontext (Markierung/Auswahl/Zone, siehe kern/gemini.js); der Chatverlauf speichert nur Fragen + Antworten.
 * - Änderungsvorschläge (```json-Aktionsliste) landen NIE direkt in der Karte: Knopf „Prüfen“ → gleiche Vorschau wie 🤖 KI-Import.
 * Das DOM des Chats wird einmal gebaut und bei jedem Reiterwechsel nur wieder eingehängt (Panel zeichnet sonst bei Kartenänderung neu).
 * 9.1: läuft über kern/kiPipeline.js (Kontext-Baukasten ohne ganze Karte, strukturierte JSON-Antworten, Vorschau → 1 Undo-Schritt);
 * „👁 Das wird gesendet“ zeigt vor dem Senden genau, welche Teile (und den vollen Text) an Google gehen.
 * Runde 18 (7.1/7.2): kein Größenlimit (nur Hinweis `gross`); „⬚ Bereich für die KI markieren“ = Werkzeug `kiMarkieren`
 * (aktionen.kiMarkieren → zustand.kiBereich, darf über die Zone ragen, Vorrang vor dem ⬚-Rahmen, gilt nur in seiner Zone);
 * ragt sie hinaus → Knöpfe „⤢ Zone bis dorthin vergrößern“ (aktionen.kiZoneErweitern) / „➕ Neue Zone dort“ (kiNeueZoneDort).
 */
const SPEICHER = 'browserSurvival.editorGemini';
const VORSCHLAEGE = [
  ['👀 Was siehst du hier?', 'Beschreibe kurz, was du im Kontext siehst, und nenne 3 Dinge, die du verbessern würdest.'],
  ['🎨 Texturen vorschlagen', 'Schlag passende Farben und Muster für die Objekte im Kontext vor und gib sie als typtextur-Aktionen aus.'],
  ['🌲 Dekorieren', 'Dekoriere den Bereich stimmig mit vorhandenen Objekttypen – nicht zu voll, Wege frei lassen.'],
  ['🧟 Spawns prüfen', 'Wirkt die Verteilung von Zombie-Spawns und Loot-Punkten hier sinnvoll? Was würdest du ändern?'],
];

export function geminiUi({ zustand, panel, aktionen, pruefeText }) {
  // Spielordner-Katalog (Modelle + Maße) für Kontext und KI-Aktion „modell“; ohne Katalog (kein Spielserver) läuft alles wie bisher
  ladeSpielordner(new URL('../client/assets/eigene/', location.href)).catch(() => {});
  const auswahlBereich = () => aktionen.auswahlBereich();
  const speicher = ladeEinstellungen();
  const verlauf = []; // { rolle, text }
  let laeuft = null; // AbortController

  const wurzel = document.createElement('div');
  wurzel.className = 'helfer';
  wurzel.innerHTML = `
    <div class="helfer-kopf"><span class="helfer-status leise"></span><button data-a="einst" title="API-Schlüssel &amp; Modell">⚙</button><button data-a="neu" title="Neues Gespräch">🗑</button></div>
    <div class="helfer-kontext leise"><span></span> <button type="button" data-a="gesendet" title="Genau ansehen, was an Gemini geht">👁 Das wird gesendet</button></div>
    <div class="helfer-markierung knopfreihe"><button type="button" data-a="markieren" title="Rechteck auf der Karte aufziehen – darf auch neben der Zone liegen (Maus oder Finger)">⬚ Bereich für die KI markieren</button><button type="button" data-a="markierungWeg" title="KI-Markierung entfernen" hidden>✕ Markierung</button></div>
    <div class="helfer-aussen leise" hidden></div>
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
  const prefabs = () => aktionen.eigenePrefabs?.() ?? [];
  // 7.2: KI-Markierung aus dem Chat (darf über die Zone hinausragen) hat Vorrang vor dem ⬚-Rahmen der Auswahl
  const rechteck = () => aktionen.kiRechteck?.() ?? auswahlBereich();
  const bereite = (frage = '') => kiAnfrage({ karte: zustand.karte, frage, verlauf, rechteck: rechteck(), auswahl: ausgewaehlteElemente(), prefabs: prefabs(), ...kontextOptionen() });

  function zeigeKontext() {
    const ziel = el('.helfer-kontext span');
    el('[data-a=markierungWeg]').hidden = !zustand.kiBereich;
    const aussen = el('.helfer-aussen');
    aussen.hidden = true;
    if (!zustand.karte) return (ziel.textContent = 'Keine Zone geöffnet.');
    const k = bereite().kontext;
    // 7.1: kein Limit mehr – große Bereiche nur als Hinweis
    ziel.textContent = `Die KI sieht: Statistik + ${k.beschreibung}${k.objekte ? ` · ${k.objekte} ausgewählt` : ''} · ~${Math.round(k.zeichen / 1000)}k Zeichen${k.gross ? ' · ⚠ großer Bereich: dauert länger, kostet mehr' : ''}`;
    // 7.2: Markierung ragt aus der Zone → Zone dorthin vergrößern oder neue Zone daneben
    const m = k.markierung;
    if (m?.ragtHinaus && zustand.kiBereich) {
      aussen.hidden = false;
      const seiten = Object.entries(m.aussen).filter(([, v]) => v > 0).map(([s, v]) => `${v} ${s}`).join(', ');
      aussen.innerHTML = `${m.ganzAussen ? 'Markierung liegt <b>neben</b> der Zone' : `Markierung ragt <b>über die Zone</b> (${esc(seiten)})`} – die KI kann dort nur planen. <span class="knopfreihe">${m.ganzAussen ? '' : '<button type="button" data-a="erweitern" title="Zone bis zur Markierung vergrößern (Ränder wachsen, nichts geht verloren)">⤢ Zone bis dorthin vergrößern</button>'}<button type="button" data-a="neueZoneDort" title="Neue Zone an dieser Stelle der Weltanordnung (ohne Überlappung)">➕ Neue Zone dort</button></span>`;
    }
  }

  /** „Das wird gesendet“: Teile-Liste + der komplette Kontext-Text */
  function zeigeGesendet() {
    if (!zustand.karte) return;
    const { gesendet, kontext } = bereite(eingabe.value.trim());
    dialog({ titel: '👁 Das wird an Gemini gesendet', html: `<ul class="liste">${gesendet.map((t) => `<li>${esc(t)}</li>`).join('')}</ul><details><summary>Kompletter Kontext-Text (${kontext.zeichen} Zeichen)</summary><pre class="ki-gesendet">${esc(kontext.text)}</pre></details>` });
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
      b.addEventListener('click', () => pruefeText(extra.aktionen.json, extra.bereich)); // ohne Bereich nur zonenweite Aktionen (kiImport)
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
    const { anfrage, kontext } = bereite(frage);
    nachricht('nutzer', frage, { hinweis: kontext.beschreibung });
    eingabe.value = '';
    const wartet = nachricht('helfer', '…denke nach…');
    laeuft = new AbortController();
    el('[data-a=senden]').hidden = true;
    el('[data-a=stopp]').hidden = false;
    try {
      const { text, abgeschnitten } = await frageGemini({ schluessel: speicher.schluessel, modell: speicher.modell, anfrage, signal: laeuft.signal });
      const ergebnis = kiErgebnis(zustand.karte, text, { bereich: kontext.bereich, prefabs: prefabs() });
      verlauf.push({ rolle: 'nutzer', text: frage }, { rolle: 'helfer', text: ergebnis.antwort || text });
      wartet.remove();
      nachricht('helfer', ergebnis.antwort || text, { aktionen: ergebnis.vorschlag, bereich: kontext.bereich, hinweis: abgeschnitten ? 'Antwort wurde abgeschnitten – frag nach einem kleineren Schritt.' : ergebnis.fehler });
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
    else if (a === 'gesendet') zeigeGesendet();
    else if (a === 'senden') senden();
    else if (a === 'stopp') laeuft?.abort();
    else if (a === 'markieren') aktionen.kiMarkieren?.();
    else if (a === 'markierungWeg') aktionen.kiMarkierungWeg?.();
    else if (a === 'erweitern' || a === 'neueZoneDort') {
      const r = zustand.kiBereich;
      if (!r || !zustand.karte) return;
      const m = markierungTeile(zustand.karte, r);
      if (a === 'erweitern') aktionen.kiZoneErweitern?.(m.aussen);
      else aktionen.kiNeueZoneDort?.(aussenRechteck(zustand.karte, r, m));
    }
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
  // KI-Markierung gilt für die Zone, in der sie gezogen wurde
  zustand.bei('zone', () => {
    if (zustand.kiBereich) zustand.kiBereich = null;
  });
  // gebündelt: beim Aufziehen der KI-Markierung kommt jedes Zeigerereignis an (Ausschnitt bauen kostet bei großen Bereichen)
  let kontextTimer = 0;
  const planeKontext = () => {
    clearTimeout(kontextTimer);
    kontextTimer = setTimeout(() => !panel.wurzel.hidden && zeigeKontext(), 120);
  };
  for (const ev of ['auswahl', 'zone', 'karte', 'kiBereich']) zustand.bei(ev, planeKontext);

  panel.registriere('🤖 Helfer', () => {
    if (panel.el.firstChild !== wurzel) panel.el.replaceChildren(wurzel);
    zeigeStatus();
    zeigeKontext();
  }, { ereignisse: [], ohneKarte: true });
}

/** Schlüssel + Modell (auch für die Werkstatt-KI, ui/werkstattKi.js) */
export function ladeEinstellungen() {
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
