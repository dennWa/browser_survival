import { markerSchluessel } from './kern/karte.js';
import { validiere } from './kern/validierung.js';
import { pruefeMarker } from './kern/platzierung.js';
import { kopiere, dreheVorlage } from './kern/auswahl.js';
import { kachelInfo, objektInfo } from './kern/katalog.js';
import { innenRaster } from './kern/innen.js';
import { istGrosseZone } from './kern/zone.js';
import { Werkzeuge } from './ui/werkzeuge.js';
import { TouchBauen } from './ui/touchBauen.js';
import { EditorSpeicher } from './ui/speicher.js';
import { Zustand } from './ui/zustand.js';
import { Zeichner2D } from './ui/zeichner2d.js';
import { Befehle, kuerzelText, istTextEingabe } from './ui/befehle.js';
import { hilfeUi } from './ui/hilfeUi.js';
import { meldeBefehleAn, menues, SCHNELLLEISTE, WERKZEUGLEISTE, kontextEintraege } from './ui/befehlsliste.js';
import { Menueleiste, oeffneListe, listeOffen } from './ui/menue.js';
import { Seitenleiste } from './ui/seitenleiste.js';
import { Layout } from './ui/layout.js';
import { AssetBrowser } from './ui/assetBrowser.js';
import { Optionsleiste } from './ui/optionsleiste.js';
import { inspektor } from './ui/inspektor.js';
import { ebenenUi } from './ui/ebenenUi.js';
import { pruefungUi, zaehlerText } from './ui/pruefungUi.js';
import { erstelleAktionen } from './ui/aktionen.js';
import { dateiAktionen } from './ui/dateiAktionen.js';
import { prefabUi } from './ui/prefabUi.js';
import { raeumeUi } from './ui/raeumeUi.js';
import { zonenUi } from './ui/zonenUi.js';
import { kiUi } from './ui/kiUi.js';
import { geminiUi } from './ui/geminiUi.js';
import { kiAufgabenUi } from './ui/kiAufgaben.js';
import { testUi } from './ui/testUi.js';
import { eigeneUi } from './ui/eigeneUi.js';
import { Bibliothek, AUDIO } from './ui/bibliothek.js';
import { modelleUi } from './ui/modelleUi.js';
import { audioUi } from './ui/audioUi.js';
import { audioZentraleUi } from './ui/audioZentrale.js';
import { zonenManagerUi } from './ui/zonenManagerUi.js';
import { versionenUi } from './ui/versionenUi.js';
import { lootUi } from './ui/lootUi.js';
import { Ansicht3D, webglVerfuegbar } from './ui/ansicht3d.js';
import { dialog, esc, istDialogOffen } from './ui/dialoge.js';
import { pruefeLokalenServer, LOKAL_HINWEIS } from './ui/lokalerServer.js';

/**
 * Einstieg des Map-Editors (editor/index.html). Läuft ohne Server, ohne Account – nur im Browser.
 * Aufbau (Editor 2.0): Zustand (Projekt/Zonen/Verlauf/Ebenen) · Zeichner2D + Werkzeuge · Befehlsregister (ui/befehle.js,
 * alle Befehle in ui/befehlsliste.js) → Menüleiste, Schnellleiste, Werkzeugleiste, Kontextmenü, Tastatur ·
 * Seitenleisten links (Assets, Modelle, Audio, Prefabs, Zonen, Räume) / rechts (Inspektor, Ebenen, Prüfung, Bereiche, Versionen 7.5) / KI-Helfer · Optionsleiste.
 * Touch-Bauen (7.6): ui/touchBauen.js hängt sich in die Werkzeuge; Handy-Leiste #handy-leiste (≤ 900 px).
 * Finger-Tipp ohne Klick (Chrome nach einem Wisch): `fingerTipp` reicht nach 300 ms button.click() nach.
 * Spielcode wird nur GELESEN. Geschrieben wird nur lokal (IndexedDB) bzw. per Download.
 */
const speicher = new EditorSpeicher();
const zustand = new Zustand(speicher);
const bibliothek = new Bibliothek(speicher, zustand); // 3D-Modelle des Projekts (Phase 3)
zustand.bibliothek = bibliothek;
const audioBibliothek = new Bibliothek(speicher, zustand, AUDIO); // Klänge des Projekts (Phase 4)
zustand.audioBibliothek = audioBibliothek;
const leinwand = document.getElementById('leinwand2d');
const zeichner = new Zeichner2D(leinwand, zustand);
zeichner.ladeAtlas();

const KUERZEL_SPEICHER = 'browserSurvival.editorKuerzel'; // eigene Tastenkürzel (7.1), in der Backup-Whitelist
const befehle = new Befehle({
  beiNichtVerfuegbar: (b) => zustand.meldung(`„${b.name}“ geht gerade nicht${b.grund ? ` – ${b.grund}` : ''}`, 'fehler'),
  speicher: {
    lies: () => {
      try {
        return JSON.parse(localStorage.getItem(KUERZEL_SPEICHER) ?? 'null');
      } catch {
        return null;
      }
    },
    schreibe: (o) => {
      try {
        if (Object.keys(o).length) localStorage.setItem(KUERZEL_SPEICHER, JSON.stringify(o));
        else localStorage.removeItem(KUERZEL_SPEICHER);
      } catch {
        /* gesperrter Speicher → gilt nur bis zum Neuladen */
      }
    },
  },
});
const { zeigeHilfe, zeigePalette } = hilfeUi({ befehle, zustand });
/** Teile, die Aktionen/Befehle später brauchen (werden unten befüllt) */
const teile = { befehle, zustand, zeichner };
const aktionen = erstelleAktionen({ zustand, zeichner, leinwand, teile });
const werkzeuge = new Werkzeuge({ leinwand, zeichner, zustand, aktionen });
const touch = new TouchBauen({ werkzeuge, zeichner, zustand, aktionen, flaeche: document.getElementById('flaeche') }); // 7.6

// --- Seitenleisten & Layout ---------------------------------------------------------------
const links = new Seitenleiste({ wurzel: document.getElementById('links'), zustand });
const rechts = new Seitenleiste({ wurzel: document.getElementById('rechts'), zustand });
const kiLeiste = new Seitenleiste({ wurzel: document.getElementById('ki'), zustand });
const layout = new Layout({ leisten: { links, rechts, ki: kiLeiste }, beiAenderung: () => befehle.melde() });
const assets = new AssetBrowser({ zustand, leiste: links, aktionen, bibliothek, audioBibliothek });
modelleUi({ zustand, panel: links, aktionen, layout, bibliothek });
audioUi({ zustand, panel: links, aktionen, layout, audioBibliothek });
audioZentraleUi({ zustand, aktionen }); // Phase 10: 🎵 Audio-Zentrale (alle Spiel-Sounds & Musik)
const insp = inspektor({ zustand, leiste: rechts, aktionen, befehle });
ebenenUi({ zustand, leiste: rechts });
pruefungUi({ zustand, leiste: rechts, aktionen, zeichner });
zonenManagerUi({ zustand, leiste: rechts, zeichner, aktionen });
versionenUi({ zustand, leiste: rechts, zeichner, aktionen });
lootUi({ zustand, aktionen });
const datei = dateiAktionen({ zustand, zeichner, werkzeuge, aktionen, rechts, bibliothek, audioBibliothek });
// 7.4: Assets/Prefabs aus der Bibliothek auf die Karte ziehen
aktionen.kartenPunkt = (e) => werkzeuge.kartenPunkt(e);
aktionen.platziereBei = (e) => werkzeuge.platziereBei(e);
leinwand.addEventListener('dragover', (e) => e.dataTransfer.types.includes('application/x-editor-asset') && e.preventDefault());
leinwand.addEventListener('drop', (e) => {
  const id = e.dataTransfer.getData('application/x-editor-asset');
  if (!id) return;
  e.preventDefault();
  assets.ablegen(id, e);
});
Object.assign(teile, { werkzeuge, touch, assets, inspektor: insp, layout, links, rechts, datei, aktionen, schalteAnsicht, zeigeHilfe, zeigePalette, kontextmenue });

// --- Module der Phasen 6–11 ---------------------------------------------------------------
// „🗺 Projekt“ = ein Reiter mit Unter-Reitern Zonen · Räume · Prefabs (Phase 10.7)
zonenUi({ zustand, panel: links, aktionen, befehle, layout, zeichner, projektZonen: datei.projektZonen });
raeumeUi({ zustand, panel: links, aktionen, zeigeInspektor: () => layout.zeigeReiter('rechts', 'Inspektor') });
prefabUi({ zustand, panel: links, aktionen, layout });
const ki = kiUi({ zustand, panel: rechts, aktionen, layout, zeichner });
geminiUi({ zustand, panel: kiLeiste, aktionen, pruefeText: ki.pruefeText });
kiAufgabenUi({ zustand, aktionen, zeichner, pruefeText: ki.pruefeText, layout }); // Phase 9: Text zu Karte, Lückenfinder, Fehler erklären …
const test = testUi({ zustand, aktionen, layout, projektZonen: datei.projektZonen });
eigeneUi({ zustand, aktionen });
if (webglVerfuegbar()) {
  try {
    teile.ansicht3d = new Ansicht3D(document.getElementById('leinwand3d'), zustand, { zeichner2d: zeichner });
    // 6.6: in 3D mappen – gleiche Platzier-Regeln/Prüfung wie 2D, Kontextmenü wie 2D
    teile.ansicht3d.beiPlatzieren = (wx, wy, umschalt) => werkzeuge.platziereAn(wx, wy, umschalt);
    teile.ansicht3d.beiVorschau = (wx, wy) => werkzeuge.vorschauAn(wx, wy);
    teile.ansicht3d.beiKontext = (x, y, ziel) => kontextmenue(x, y, ziel);
    zustand.bei('ansicht', () => {
      // 3D → 2D: Blickpunkt mitnehmen (Auswahl ist ohnehin gemeinsam)
      if (zustand.ansicht === '2d') {
        zeichner.kamera = { x: teile.ansicht3d.blick.x, y: teile.ansicht3d.blick.z };
        zeichner.anfordern();
      }
    });
  } catch (e) {
    console.warn('[Editor] 3D nicht verfügbar:', e);
  }
}

// --- Befehle, Menüs, Leisten --------------------------------------------------------------
meldeBefehleAn(befehle, teile);
new Menueleiste(document.getElementById('menue'), befehle, menues(teile));
const optionen = new Optionsleiste({ element: document.getElementById('optionen'), zustand, aktionen, befehle });

/** Knopfleiste aus Befehls-IDs (Schnellleiste oben, Werkzeugleiste links; `mitTaste` = Kürzel klein rechts daneben) */
function baueLeiste(element, ids, mitText, { mitTaste = false } = {}) {
  element.innerHTML = '';
  for (const id of ids) {
    if (id === '-') {
      element.append(Object.assign(document.createElement('div'), { className: 'trenner' }));
      continue;
    }
    const b = befehle.get(id);
    if (!b) continue;
    const knopf = document.createElement('button');
    knopf.type = 'button';
    knopf.dataset.befehl = id;
    knopf.title = `${b.name}${b.kuerzel[0] ? ` (${kuerzelText(b.kuerzel[0])})` : ''}`;
    knopf.innerHTML = `<span class="symbol">${esc(b.symbol ?? '')}</span>${mitText && b.kurz ? `<span class="text"> ${esc(b.kurz)}</span>` : ''}${mitTaste && b.kuerzel[0] ? `<kbd>${esc(kuerzelText(b.kuerzel[0]))}</kbd>` : ''}`;
    if (id === 'zone.testen' || id === 'datei.veroeffentlichen') knopf.classList.add('akzent');
    element.append(knopf);
  }
}
baueLeiste(document.getElementById('schnell'), SCHNELLLEISTE, true);
baueLeiste(document.getElementById('werkzeuge'), WERKZEUGLEISTE, true, { mitTaste: true });
// Knöpfe mit data-befehl in Leisten und auf der Fläche führen ihren Befehl aus (Seitenleisten/Optionsleiste binden selbst)
// Finger-Tipp ohne Klick nachreichen: direkt nach einem Wisch auf der Leinwand (Griff ziehen, Pinselstrich) verschluckt Chrome den
// Klick des nächsten Tipps (Rauchtest „Handy-Leiste ↶“, „Werkstatt am Handy“). Runter + hoch auf demselben Knopf, kaum bewegt
// und nach 300 ms kein Klick → knopf.click(). Kommt der echte Klick, passiert nichts zusätzlich.
const fingerTipp = { knopf: null, x: 0, y: 0 };
document.addEventListener('pointerdown', (e) => {
  fingerTipp.knopf = e.pointerType === 'touch' ? e.target.closest('button') : null;
  Object.assign(fingerTipp, { x: e.clientX, y: e.clientY });
}, true);
document.addEventListener('pointerup', (e) => {
  const k = fingerTipp.knopf;
  fingerTipp.knopf = null;
  if (e.pointerType !== 'touch' || !k || e.target.closest('button') !== k || Math.hypot(e.clientX - fingerTipp.x, e.clientY - fingerTipp.y) > 12) return;
  let geklickt = false;
  const merke = (ev) => ev.target.closest?.('button') === k && (geklickt = true);
  document.addEventListener('click', merke, true);
  setTimeout(() => {
    document.removeEventListener('click', merke, true);
    if (!geklickt && k.isConnected && !k.disabled) k.click();
  }, 300);
}, true);
document.body.addEventListener('click', (e) => {
  const k = e.target.closest('button[data-befehl]');
  // isConnected: hat der Knopf-eigene Handler (Inspektor, Menü …) die Leiste schon neu gezeichnet, hängt der Knopf nicht mehr
  // im Dokument – closest() fände dann seine Leiste nicht und der Befehl liefe doppelt (z. B. Duplizieren, Spiegeln)
  if (k && k.isConnected && !k.closest('.menue-liste, #optionen, .seitenleiste')) befehle.fuehreAus(k.dataset.befehl);
});
/** Aktiv/verfügbar-Zustand aller Befehlsknöpfe nachziehen */
function aktualisiereKnoepfe() {
  for (const k of document.querySelectorAll('#schnell [data-befehl], #werkzeuge [data-befehl], #zoom-knoepfe [data-befehl], #handy-leiste [data-befehl]')) {
    k.classList.toggle('aktiv', befehle.aktiv(k.dataset.befehl));
    k.disabled = !befehle.verfuegbar(k.dataset.befehl);
  }
}
for (const ev of ['werkzeug', 'zone', 'karte', 'auswahl', 'ansicht', 'eintrag']) zustand.bei(ev, aktualisiereKnoepfe);
// Ende eines Strichs/Griff-Zugs (Undo-Gruppe zu) meldet kein Ereignis → ↶/↷ danach nachziehen
for (const ev of ['pointerup', 'pointercancel']) leinwand.addEventListener(ev, () => setTimeout(aktualisiereKnoepfe));
befehle.bei(aktualisiereKnoepfe);

function kontextmenue(x, y, ziel) {
  oeffneListe({ x, y }, kontextEintraege(teile, ziel), befehle);
}
// Handy-Leiste (7.6): ⋯ = Kontextmenü der Auswahl (wie Rechtsklick/Langdruck)
document.getElementById('handy-mehr').addEventListener('click', (e) => {
  const r = e.currentTarget.getBoundingClientRect();
  kontextmenue(r.left, r.top - 4, { treffer: null });
});

// --- Tastatur (alles über das Befehlsregister) ----------------------------------------------
window.addEventListener('keydown', (e) => {
  if (istDialogOffen() || listeOffen()) return;
  const aktiv = document.activeElement;
  // 6.5: Text-/Zahlfelder, Textbereiche, contenteditable → Strg+C/V/X/A bleiben Browser-Standard (Häkchen/Knöpfe nicht)
  const inEingabe = istTextEingabe(aktiv);
  // markierter normaler Text (KI-Antwort, Hilfe, Listen) → Strg+C/X/A kopieren den Text statt Karten-Elemente
  const sel = window.getSelection?.();
  const textMarkiert = !!sel && !sel.isCollapsed && sel.toString().trim() !== '';
  // Tab nur auf der Karte als Fokus-Modus – sonst normale Tastatur-Navigation
  if (e.key === 'Tab' && aktiv && aktiv !== document.body && aktiv !== leinwand) return;
  befehle.behandleTaste(e, { inEingabe, textMarkiert });
});
// Klick auf die Karte hebt eine Text-Markierung auf (sonst bliebe Strg+C beim Text statt bei den gewählten Objekten)
for (const l of [leinwand, document.getElementById('leinwand3d')]) l?.addEventListener('pointerdown', () => window.getSelection?.()?.removeAllRanges?.());

aktionen.lokalerServer = async () => {
  const s = await pruefeLokalenServer({ neu: true });
  zustand.lokal = s;
  await dialog({
    titel: s.verbunden ? '🖥 Lokaler Editor-Server verbunden' : '🌐 Ohne lokalen Server',
    html: s.verbunden
      ? `<p>Der Editor darf in diese Projektordner schreiben und löschen:</p><ul class="liste">${s.ordner.map((o) => `<li><code>${esc(o)}</code></li>`).join('')}</ul><p class="leise">Indexe (eigene.json, musik.json) werden nach jeder Änderung neu gebaut. Danach committen und pushen.</p>`
      : `<p>${esc(LOKAL_HINWEIS)}</p><p class="leise">Ohne Server kannst du alles anhören und ausprobieren – gespeichert wird nichts im Projekt.</p>`,
  });
};

// --- 2D/3D ----------------------------------------------------------------------------------
function schalteAnsicht() {
  if (!teile.ansicht3d) return zustand.meldung('3D-Ansicht nicht verfügbar (WebGL?)', 'fehler');
  zustand.ansicht = zustand.ansicht === '2d' ? '3d' : '2d';
  document.getElementById('leinwand3d').hidden = zustand.ansicht !== '3d';
  leinwand.hidden = zustand.ansicht === '3d';
  zustand.melde('ansicht');
}

// --- Hilfe: alle Befehle mit Kürzeln, durchsuchbar --------------------------------------------

// --- Statusleiste, Prüfung, Zonenliste -------------------------------------------------------
const statusKoord = document.getElementById('status-koord');
const statusInfo = document.getElementById('status-info');
const statusAuswahl = document.getElementById('status-auswahl');
const statusPruefung = document.getElementById('status-pruefung');
const statusMeldung = document.getElementById('status-meldung');
const speicherStatus = document.getElementById('speicher-status');
const zoneWahl = document.getElementById('zone-wahl');

aktionen.beiHover = (x, y) => {
  const k = zustand.karte;
  if (!k) return;
  const drin = k.imFeld(x, y);
  statusKoord.textContent = drin ? `x ${x} · y ${y}` : `(${x}|${y}) außerhalb`;
  if (!drin) {
    statusInfo.textContent = '';
    return;
  }
  const o = k.objektBei(x + 0.5, y + 0.5)?.[1];
  const m = k.markerAn(x, y);
  statusInfo.textContent = [kachelInfo(k.kachelAn(x, y)).name, k.hoeheAn(x, y) ? `Höhe ${k.hoeheAn(x, y)} m` : '', o ? objektInfo(o.typ, k).name : '', m ? { start: 'Spieler-Start', zombie: 'Zombie-Spawn', loot: `Loot ${m.raum}` }[m.art] : ''].filter(Boolean).join(' · ');
};
leinwand.addEventListener('pointerleave', () => {
  statusKoord.textContent = '–';
  statusInfo.textContent = '';
});
zustand.bei('auswahl', () => {
  const n = zustand.auswahl.size;
  const r = zustand.auswahlRechteck;
  statusAuswahl.textContent = n ? `${n} gewählt` : r ? `Bereich ${r.b} × ${r.h}` : '';
});

let meldungTimer = null;
zustand.bei('meldung', ({ text, art }) => {
  statusMeldung.textContent = text;
  statusMeldung.className = art;
  clearTimeout(meldungTimer);
  meldungTimer = setTimeout(() => (statusMeldung.textContent = ''), 7000);
});
// Autosave-Anzeige (Schritt 1.6): ● ungespeichert · ⟳ speichert · ✓ gespeichert hh:mm · ⚠ Fehler (Klick = erneut) · ⚠ flüchtig
zustand.bei('speicher', () => {
  const art = zustand.speicherZustand.art;
  speicherStatus.innerHTML = `<span class="punkt"></span><span class="text">${esc(zustand.speicherStatus)}</span>`;
  speicherStatus.className = `speicher-${art}`;
  speicherStatus.title = `Lokaler Speicher (${zustand.speicherOrt ?? speicher.art})${zustand.speicherZustand.fehler ? ` – ${zustand.speicherZustand.fehler}` : ''} · Klick: Speichern, Backup …`;
});
speicherStatus.addEventListener('click', () => {
  if (zustand.speicherZustand.art === 'fehler' || zustand.hatUngespeichertes) befehle.fuehreAus('datei.speichern');
  oeffneListe({ anker: speicherStatus }, ['datei.speichern', 'datei.herunterladen', '-', 'datei.backup', 'datei.wiederherstellen', 'datei.speicherplatz'], befehle);
});

let pruefTimer = null;
/** Prüfung jetzt (auch bei großen Zonen) – Statusleiste, Prüfungs-Reiter */
function pruefeJetzt() {
  if (!zustand.karte) return;
  zustand.validierung = validiere(zustand.karte, { zonen: datei.projektZonen() });
  zustand.validierungFuer = zustand.karte;
  const { f, w } = zaehlerText(zustand.validierung);
  statusPruefung.textContent = f || w ? `⛔ ${f} Fehler · ⚠ ${w} Warnungen` : '✓ Karte gültig';
  zustand.melde('pruefung');
}
function planePruefung() {
  clearTimeout(pruefTimer);
  // 6.4: große Zonen nicht bei jeder Änderung prüfen (echter Spiel-Lader über Millionen Kacheln) – Klick prüft
  if (istGrosseZone(zustand.karte)) {
    statusPruefung.textContent = '⏸ Prüfung (große Zone): klicken';
    if (zustand.validierungFuer !== zustand.karte) {
      zustand.validierung = []; // Liste der vorigen Zone nicht stehen lassen
      zustand.melde('pruefung');
    }
    return;
  }
  pruefTimer = setTimeout(pruefeJetzt, 350);
}
aktionen.pruefeJetzt = () => {
  zustand.meldung('⟳ Prüfe …');
  setTimeout(() => {
    pruefeJetzt();
    zustand.meldung('✓ Geprüft', 'ok');
  }, 30);
};
statusPruefung.addEventListener('click', () => {
  if (istGrosseZone(zustand.karte)) aktionen.pruefeJetzt();
  layout.zeigeReiter('rechts', 'Prüfung');
});
zustand.bei('karte', planePruefung);

/** Innen/Außen wie das Spiel (Welt.istInnen) – für die Anzeige (große Zonen: aus, 6.4) */
function berechneInnen() {
  const gross = istGrosseZone(zustand.karte);
  zeichner.innen = zustand.karte && zustand.sichtbar('innen') && !gross ? innenRaster(zustand.karte) : null;
  zeichner.anfordern();
}
zustand.bei('karte', () => zustand.sichtbar('innen') && berechneInnen());
zustand.bei('ebenen', berechneInnen);

zustand.bei('zone', () => {
  zoneWahl.innerHTML = [...zustand.zonen.values()].map((e) => `<option value="${esc(e.karte.id)}"${e.karte.id === zustand.aktivId ? ' selected' : ''}>${esc(e.karte.name)} (${esc(e.karte.id)})</option>`).join('') || '<option value="">–</option>';
  document.getElementById('hinweis-leer').hidden = !!zustand.karte;
  document.title = zustand.karte ? `${zustand.karte.name} – Map-Editor` : 'Map-Editor – Browser Survival';
  planePruefung();
  berechneInnen();
});
zoneWahl.addEventListener('change', () => {
  if (!zoneWahl.value) return;
  zustand.aktiviere(zoneWahl.value);
  zeichner.einpassen();
});

// --- Start -----------------------------------------------------------------------------------
async function starten() {
  const art = await speicher.oeffnen();
  if (art === 'fluechtig') zustand.setzeSpeicher('fluechtig', speicher.fehler);
  // Browser bitten, die Entwürfe nicht bei Speichermangel zu löschen (stillschweigend; Status unter Datei → Speicherplatz)
  navigator.storage?.persist?.().catch(() => {});
  await bibliothek.lade(); // vor den Entwürfen: Typen verweisen auf Modelle, Klänge auf Audio
  await audioBibliothek.lade();
  const n = await zustand.ladeAlle();
  zustand.melde('zone');
  for (const l of [links, rechts, kiLeiste]) l.zeichne();
  aktionen.werkzeug('auswahl');
  optionen.zeichne();
  if (n) {
    zeichner.einpassen();
    zustand.meldung(`${n} Entwurf/Entwürfe geladen`, 'ok');
  } else zustand.meldung('Willkommen! Datei → Neue Zone (Rechteck aufziehen) oder Öffnen (Zone aus dem Spiel als Vorlage)');
  const zurueckZurAudio = new URLSearchParams(location.search).has('audio'); // Rückkehr aus dem Spiel (Audio-Zentrale ▶ Spiel starten)
  test.nachStart(); // Rückkehr aus dem Test im Spiel (räumt die Adresse auf)
  if (zurueckZurAudio) {
    history.replaceState(null, '', location.pathname);
    aktionen.audioZentrale?.(null, { zuletzt: true });
  }
  // Phase 10.1: lokaler Editor-Server (npm run editor:lokal) → darf in Projektordner schreiben
  pruefeLokalenServer().then((s) => {
    zustand.lokal = s;
    document.body.classList.toggle('lokal-verbunden', s.verbunden);
    if (s.verbunden) zustand.meldung('🖥 Lokaler Editor-Server verbunden – Audio/Musik werden direkt in die Projektordner gespeichert', 'ok');
    befehle.melde();
  });
  window.addEventListener('beforeunload', (e) => {
    zustand.speichereAlle();
    // Noch nicht gespeichert (z. B. Fehler)? Browser fragt nach
    if (zustand.hatUngespeichertes && zustand.speicherZustand.art === 'fehler') e.preventDefault();
  });
}
const bereit = starten();

// Für Konsole & automatische Tests (`bereit` = Start fertig: Entwürfe geladen, Werkzeug gesetzt)
window.mapEditor = { bereit, zustand, bibliothek, audioBibliothek, zeichner, teile, aktionen, befehle, werkzeuge, touch, layout, links, rechts, assets, datei, oeffneDatei: datei.oeffneDatei, oeffneSpielzone: datei.oeffneSpielzone, markerSchluessel, pruefeMarker, kopiere, dreheVorlage };
