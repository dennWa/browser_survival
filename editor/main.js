import { markerSchluessel } from './kern/karte.js';
import { validiere } from './kern/validierung.js';
import { pruefeMarker } from './kern/platzierung.js';
import { kopiere, dreheVorlage } from './kern/auswahl.js';
import { kachelInfo, objektInfo } from './kern/katalog.js';
import { innenRaster } from './kern/innen.js';
import { Werkzeuge } from './ui/werkzeuge.js';
import { EditorSpeicher } from './ui/speicher.js';
import { Zustand } from './ui/zustand.js';
import { Zeichner2D } from './ui/zeichner2d.js';
import { Befehle, kuerzelText } from './ui/befehle.js';
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
import { testUi } from './ui/testUi.js';
import { eigeneUi } from './ui/eigeneUi.js';
import { Bibliothek } from './ui/bibliothek.js';
import { modelleUi } from './ui/modelleUi.js';
import { Ansicht3D, webglVerfuegbar } from './ui/ansicht3d.js';
import { dialog, esc, istDialogOffen } from './ui/dialoge.js';

/**
 * Einstieg des Map-Editors (editor/index.html). Läuft ohne Server, ohne Account – nur im Browser.
 * Aufbau (Editor 2.0): Zustand (Projekt/Zonen/Verlauf/Ebenen) · Zeichner2D + Werkzeuge · Befehlsregister (ui/befehle.js,
 * alle Befehle in ui/befehlsliste.js) → Menüleiste, Schnellleiste, Werkzeugleiste, Kontextmenü, Tastatur ·
 * Seitenleisten links (Assets, Modelle, Prefabs, Zonen, Räume) / rechts (Inspektor, Ebenen, Prüfung) / KI-Helfer · Optionsleiste.
 * Spielcode wird nur GELESEN. Geschrieben wird nur lokal (IndexedDB) bzw. per Download.
 */
const speicher = new EditorSpeicher();
const zustand = new Zustand(speicher);
const bibliothek = new Bibliothek(speicher, zustand); // 3D-Modelle des Projekts (Phase 3)
zustand.bibliothek = bibliothek;
const leinwand = document.getElementById('leinwand2d');
const zeichner = new Zeichner2D(leinwand, zustand);
zeichner.ladeAtlas();

const befehle = new Befehle({ beiNichtVerfuegbar: (b) => zustand.meldung(`„${b.name}“ geht gerade nicht${b.grund ? ` – ${b.grund}` : ''}`, 'fehler') });
/** Teile, die Aktionen/Befehle später brauchen (werden unten befüllt) */
const teile = { befehle, zustand, zeichner };
const aktionen = erstelleAktionen({ zustand, zeichner, leinwand, teile });
const werkzeuge = new Werkzeuge({ leinwand, zeichner, zustand, aktionen });

// --- Seitenleisten & Layout ---------------------------------------------------------------
const links = new Seitenleiste({ wurzel: document.getElementById('links'), zustand });
const rechts = new Seitenleiste({ wurzel: document.getElementById('rechts'), zustand });
const kiLeiste = new Seitenleiste({ wurzel: document.getElementById('ki'), zustand });
const layout = new Layout({ leisten: { links, rechts, ki: kiLeiste }, beiAenderung: () => befehle.melde() });
const assets = new AssetBrowser({ zustand, leiste: links, aktionen, bibliothek });
modelleUi({ zustand, panel: links, aktionen, layout, bibliothek });
const insp = inspektor({ zustand, leiste: rechts, aktionen, befehle });
ebenenUi({ zustand, leiste: rechts });
pruefungUi({ zustand, leiste: rechts, aktionen });
const datei = dateiAktionen({ zustand, zeichner, werkzeuge, aktionen, rechts, bibliothek });
Object.assign(teile, { werkzeuge, assets, inspektor: insp, layout, links, rechts, datei, aktionen, schalteAnsicht, zeigeHilfe, kontextmenue });

// --- Module der Phasen 6–11 ---------------------------------------------------------------
prefabUi({ zustand, panel: links, aktionen, layout });
zonenUi({ zustand, panel: links, aktionen, befehle, layout, zeichner, projektZonen: datei.projektZonen });
raeumeUi({ zustand, panel: links, aktionen, zeigeInspektor: () => layout.zeigeReiter('rechts', 'Inspektor') });
const ki = kiUi({ zustand, panel: rechts, aktionen, layout, zeichner });
geminiUi({ zustand, panel: kiLeiste, aktionen, pruefeText: ki.pruefeText });
const test = testUi({ zustand, aktionen, layout, projektZonen: datei.projektZonen });
eigeneUi({ zustand, aktionen });
if (webglVerfuegbar()) {
  try {
    teile.ansicht3d = new Ansicht3D(document.getElementById('leinwand3d'), zustand, { zeichner2d: zeichner });
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

/** Knopfleiste aus Befehls-IDs (Schnellleiste oben, Werkzeugleiste links) */
function baueLeiste(element, ids, mitText) {
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
    knopf.innerHTML = `${esc(b.symbol ?? '')}${mitText && b.kurz ? `<span class="text"> ${esc(b.kurz)}</span>` : ''}`;
    if (id === 'zone.testen' || id === 'datei.veroeffentlichen') knopf.classList.add('akzent');
    element.append(knopf);
  }
}
baueLeiste(document.getElementById('schnell'), SCHNELLLEISTE, true);
baueLeiste(document.getElementById('werkzeuge'), WERKZEUGLEISTE, false);
// Knöpfe mit data-befehl in Leisten und auf der Fläche führen ihren Befehl aus (Seitenleisten/Optionsleiste binden selbst)
document.body.addEventListener('click', (e) => {
  const k = e.target.closest('button[data-befehl]');
  if (k && !k.closest('.menue-liste, #optionen, .seitenleiste')) befehle.fuehreAus(k.dataset.befehl);
});
/** Aktiv/verfügbar-Zustand aller Befehlsknöpfe nachziehen */
function aktualisiereKnoepfe() {
  for (const k of document.querySelectorAll('#schnell [data-befehl], #werkzeuge [data-befehl], #zoom-knoepfe [data-befehl]')) {
    k.classList.toggle('aktiv', befehle.aktiv(k.dataset.befehl));
    k.disabled = !befehle.verfuegbar(k.dataset.befehl);
  }
}
for (const ev of ['werkzeug', 'zone', 'karte', 'auswahl', 'ansicht', 'eintrag']) zustand.bei(ev, aktualisiereKnoepfe);
befehle.bei(aktualisiereKnoepfe);

function kontextmenue(x, y, ziel) {
  oeffneListe({ x, y }, kontextEintraege(teile, ziel), befehle);
}

// --- Tastatur (alles über das Befehlsregister) ----------------------------------------------
window.addEventListener('keydown', (e) => {
  if (istDialogOffen() || listeOffen()) return;
  const aktiv = document.activeElement;
  const inEingabe = /INPUT|TEXTAREA|SELECT/.test(aktiv?.tagName) || !!aktiv?.isContentEditable;
  // Tab nur auf der Karte als Fokus-Modus – sonst normale Tastatur-Navigation
  if (e.key === 'Tab' && aktiv && aktiv !== document.body && aktiv !== leinwand) return;
  befehle.behandleTaste(e, { inEingabe });
});

// --- 2D/3D ----------------------------------------------------------------------------------
function schalteAnsicht() {
  if (!teile.ansicht3d) return zustand.meldung('3D-Ansicht nicht verfügbar (WebGL?)', 'fehler');
  zustand.ansicht = zustand.ansicht === '2d' ? '3d' : '2d';
  document.getElementById('leinwand3d').hidden = zustand.ansicht !== '3d';
  leinwand.hidden = zustand.ansicht === '3d';
  zustand.melde('ansicht');
}

// --- Hilfe: alle Befehle mit Kürzeln, durchsuchbar --------------------------------------------
function zeigeHilfe() {
  const gruppen = new Map();
  for (const b of befehle.liste.values()) {
    if (!gruppen.has(b.gruppe)) gruppen.set(b.gruppe, []);
    gruppen.get(b.gruppe).push(b);
  }
  const html = `<input type="search" class="hilfe-suche" placeholder="Befehl oder Taste suchen …" style="width:100%">
    <div class="hilfe-raster">${[...gruppen].map(([g, liste]) => `<section><h4>${esc(g)}</h4>${liste.map((b) => `<div class="hilfe-zeile" data-text="${esc(`${b.name} ${b.kuerzel.join(' ')} ${g}`.toLowerCase())}">${b.kuerzel.map((k) => `<kbd>${esc(kuerzelText(k))}</kbd>`).join(' ') || '<span class="leise">–</span>'} ${esc(b.symbol ?? '')} ${esc(b.name)}</div>`).join('')}</section>`).join('')}</div>
    <p class="leise">Maus: Rad = Zoom (Umschalt = seitwärts) · Trackpad: 2 Finger = schwenken, Pinch = Zoom · Rechts-Ziehen = schwenken · Rechtsklick = Kontextmenü · Alt+Klick = Pipette · Alt beim Ziehen = fein (0,1). Touch: Ansehen, Schwenken, Zoomen überall; Bauen ist für Maus & Tastatur gebaut.</p>`;
  dialog({
    titel: '⌨ Tastenkürzel & Befehle',
    html,
    beiOeffnen: (b) => {
      const suche = b.querySelector('.hilfe-suche');
      suche.addEventListener('input', () => {
        const q = suche.value.trim().toLowerCase();
        b.querySelectorAll('.hilfe-zeile').forEach((z) => (z.hidden = !!q && !z.dataset.text.includes(q)));
        b.querySelectorAll('.hilfe-raster section').forEach((s) => (s.hidden = ![...s.querySelectorAll('.hilfe-zeile')].some((z) => !z.hidden)));
      });
    },
  });
}

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
function planePruefung() {
  clearTimeout(pruefTimer);
  pruefTimer = setTimeout(() => {
    if (!zustand.karte) return;
    zustand.validierung = validiere(zustand.karte, { zonen: datei.projektZonen() });
    const { f, w } = zaehlerText(zustand.validierung);
    statusPruefung.textContent = f || w ? `⛔ ${f} Fehler · ⚠ ${w} Warnungen` : '✓ Karte gültig';
    zustand.melde('pruefung');
  }, 350);
}
statusPruefung.addEventListener('click', () => layout.zeigeReiter('rechts', 'Prüfung'));
zustand.bei('karte', planePruefung);

/** Innen/Außen wie das Spiel (Welt.istInnen) – für die Anzeige */
function berechneInnen() {
  zeichner.innen = zustand.karte && zustand.sichtbar('innen') ? innenRaster(zustand.karte) : null;
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
  await bibliothek.lade(); // vor den Entwürfen: Typen verweisen auf Modelle
  const n = await zustand.ladeAlle();
  zustand.melde('zone');
  for (const l of [links, rechts, kiLeiste]) l.zeichne();
  aktionen.werkzeug('auswahl');
  optionen.zeichne();
  if (n) {
    zeichner.einpassen();
    zustand.meldung(`${n} Entwurf/Entwürfe geladen`, 'ok');
  } else zustand.meldung('Willkommen! Datei → Neue Zone (Rechteck aufziehen) oder Öffnen (Zone aus dem Spiel als Vorlage)');
  test.nachStart(); // Rückkehr aus dem Test im Spiel
  window.addEventListener('beforeunload', (e) => {
    zustand.speichereAlle();
    // Noch nicht gespeichert (z. B. Fehler)? Browser fragt nach
    if (zustand.hatUngespeichertes && zustand.speicherZustand.art === 'fehler') e.preventDefault();
  });
}
starten();

// Für Konsole & automatische Tests
window.mapEditor = { zustand, bibliothek, zeichner, aktionen, befehle, werkzeuge, layout, links, rechts, assets, datei, oeffneDatei: datei.oeffneDatei, oeffneSpielzone: datei.oeffneSpielzone, markerSchluessel, pruefeMarker, kopiere, dreheVorlage };
