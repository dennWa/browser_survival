import { KARTEN } from '../server/spiel/karten/kartenLader.js';
import { LOOT_TABELLEN } from '../server/spiel/konfiguration/lootTabellen.js';
import { ausDefinition, ladeDatei, entwurfJson, exportJson, LIESMICH_TEXT } from './kern/format.js';
import { neueZone, groesseAendern, ZONEN_ID_MUSTER } from './kern/zone.js';
import { kopiere, loescheOps, einfuegeOps, dreheVorlage } from './kern/auswahl.js';
import { katalog } from './kern/katalog.js';
import { markerSchluessel, ID_SAMMLUNGEN, kopie } from './kern/karte.js';
import { validiere, hatFehler } from './kern/validierung.js';
import { veroeffentlichung } from './kern/veroeffentlichen.js';
import { pruefeMarker } from './kern/platzierung.js';
import { AKTIONEN_ANLEITUNG } from './kern/ausschnitt.js';
import { verschiebeOps, Werkzeuge } from './ui/werkzeuge.js';
import { EditorSpeicher, herunterladen, dateiWaehlen } from './ui/speicher.js';
import { Zustand } from './ui/zustand.js';
import { Zeichner2D } from './ui/zeichner2d.js';
import { Bauleiste } from './ui/bauleiste.js';
import { Panel } from './ui/panel.js';
import { dialog, formular, bestaetigen, esc, istDialogOffen } from './ui/dialoge.js';
import { erweiterungen } from './ui/erweiterungen.js';

/**
 * Einstieg des Map-Editors (editor/index.html). Läuft ohne Server, ohne Account – nur im Browser.
 * Verdrahtet: Zustand (Projekt/Zonen/Verlauf) · Zeichner2D · Werkzeuge · Bauleiste · Panel · Dialoge · Speicher.
 * Spielcode wird nur GELESEN (KARTEN als Vorlagen, Lader, Registries). Geschrieben wird nur lokal (IndexedDB) bzw. per Download.
 */
const speicher = new EditorSpeicher();
const zustand = new Zustand(speicher);
const leinwand = document.getElementById('leinwand2d');
const zeichner = new Zeichner2D(leinwand, zustand);
zeichner.ladeAtlas();

const statusKoord = document.getElementById('status-koord');
const statusInfo = document.getElementById('status-info');
const statusPruefung = document.getElementById('status-pruefung');
const statusMeldung = document.getElementById('status-meldung');
const speicherStatus = document.getElementById('speicher-status');
const zoneWahl = document.getElementById('zone-wahl');

// --- Aktionen (von Bauleiste, Panel, Werkzeugen, Tasten) --------------------------------
const aktionen = {
  aktion: (name, ...args) => sonderAktionen[name]?.(...args),
  befehl: (name) => befehle[name]?.(),
  werkzeug(id) {
    if (id === 'drehen') return werkzeuge.drehe();
    if (id.startsWith('malen:')) {
      zustand.malModus = id.slice(6);
      if (zustand.eintrag?.art !== 'kachel') zustand.eintrag = katalog().find((e) => e.id === 'kachel:,');
      zustand.setzeWerkzeug('malen');
    } else zustand.setzeWerkzeug(id);
    zeichner.zonenGriffe = zustand.werkzeug === 'zone';
    leinwand.style.cursor = { hand: 'grab', pipette: 'copy' }[zustand.werkzeug] ?? 'crosshair';
    zeichner.anfordern();
  },
  pinselGroesse(d) {
    zustand.pinselGroesse = Math.max(1, Math.min(15, zustand.pinselGroesse + d));
    zustand.melde('werkzeug');
  },
  neuZeichnen: () => {
    berechneInnen();
    zeichner.anfordern();
  },
  springeZu(x, y) {
    if (zustand.ansicht === '3d') schalteAnsicht();
    zeichner.springeZu(x, y);
    zeichner.vorschau = { rechtecke: [{ x, y, b: 1, h: 1 }], gueltig: false };
    setTimeout(() => {
      zeichner.vorschau = null;
      zeichner.anfordern();
    }, 1500);
  },
  kopieren() {
    const r = auswahlBereich();
    if (!r) return zustand.meldung('Erst einen Bereich markieren (⬚ ins Leere ziehen)', 'fehler');
    zustand.zwischenablage = kopiere(zustand.karte, r);
    zustand.meldung(`📋 ${r.b} × ${r.h} kopiert – Strg+V fügt an der Maus ein`, 'ok');
  },
  ausschneiden() {
    const r = auswahlBereich();
    if (!r) return;
    aktionen.kopieren();
    zustand.ausfuehren('Ausschneiden', loescheOps(zustand.karte, r));
    zustand.leereAuswahl();
  },
  loeschen() {
    const r = zustand.auswahlRechteck;
    if (r) zustand.ausfuehren('Bereich leeren', loescheOps(zustand.karte, r));
    zustand.leereAuswahl();
  },
  /** Vorlage (Zwischenablage oder Prefab) an die Maus hängen – Klick setzt, R dreht, Esc bricht ab */
  einfuegen(vorlage = zustand.zwischenablage) {
    if (!vorlage || !zustand.karte) return zustand.meldung('Zwischenablage leer', 'fehler');
    zustand.einfuegeVorlage = vorlage;
    zustand.eintrag = null;
    aktionen.werkzeug('einfuegen');
    zustand.meldung(`${vorlage.name ?? 'Einfügen'}: Klick setzt (Umschalt = mehrfach), R dreht, Esc bricht ab`);
  },
  einfuegenBei(vorlage, x, y, mehrfach = false) {
    const { ops, weggelassen, neueIds } = einfuegeOps(zustand.karte, vorlage, x, y);
    zustand.ausfuehren(vorlage.name ? `Prefab „${vorlage.name}“` : 'Einfügen', ops);
    if (!mehrfach) {
      aktionen.werkzeug('auswahl');
      zustand.auswahlRechteck = { x, y, b: vorlage.b, h: vorlage.h };
      zustand.waehle(Object.entries(neueIds).flatMap(([s, ids]) => ids.map((k) => ({ s, k }))));
    }
    if (weggelassen) zustand.meldung(`${weggelassen} Teile lagen außerhalb der Zone (oder kein Raum frei) und wurden weggelassen`, 'fehler');
  },
  duplizieren() {
    const gew = zustand.gewaehlte();
    if (!gew.length) return;
    const ops = [];
    let id = zustand.karte.naechsteId;
    const neu = [];
    for (const { s, wert } of gew) {
      if (!ID_SAMMLUNGEN.includes(s)) continue;
      const kopieWert = s === 'bauwerke' ? { ...wert, tx: Math.min(wert.tx + 1, zustand.karte.breite - 1) } : { ...wert, x: wert.x + 1, y: wert.y + 1 };
      ops.push({ s, k: id, neu: kopieWert });
      neu.push({ s, k: id++ });
    }
    zustand.ausfuehren('Duplizieren', ops);
    zustand.waehle(neu);
  },
  drehen: () => werkzeuge.drehe(),
  auswahlLoeschen() {
    const ops = zustand.gewaehlte().map(({ s, k }) => ({ s, k, neu: null }));
    if (!ops.length) return aktionen.loeschen();
    zustand.ausfuehren(`${ops.length} gelöscht`, ops);
    zustand.leereAuswahl();
  },
  zoneUmbenennen: async (id) => {
    if (!ZONEN_ID_MUSTER.test(id)) return zustand.meldung('ID: nur a–z, 0–9, _', 'fehler');
    if (zustand.zonen.has(id)) return zustand.meldung(`Zone „${id}“ gibt es schon im Projekt`, 'fehler');
    await zustand.benenneZoneUm(zustand.aktivId, id);
  },
  groesseDialog: async () => {
    const k = zustand.karte;
    const w = await formular('Zonengröße ändern', [
      { name: 'links', label: 'Links +/−', typ: 'zahl', wert: 0, schritt: 1 },
      { name: 'oben', label: 'Oben +/−', typ: 'zahl', wert: 0, schritt: 1 },
      { name: 'rechts', label: 'Rechts +/−', typ: 'zahl', wert: 0, schritt: 1 },
      { name: 'unten', label: 'Unten +/−', typ: 'zahl', wert: 0, schritt: 1 },
    ], { text: `Aktuell ${k.breite} × ${k.hoehe}. Positiv = Rand wächst (Rasen), negativ = Rand wird abgeschnitten.` });
    if (w) aktionen.zoneGroesse(w);
  },
  async zoneGroesse(rand) {
    let erg;
    try {
      erg = groesseAendern(zustand.karte, rand);
    } catch (e) {
      return zustand.meldung(e.message, 'fehler');
    }
    if (erg.abgeschnitten.length) {
      const ok = await bestaetigen('Beim Verkleinern geht etwas verloren', `<p>Diese ${erg.abgeschnitten.length} Teile liegen außerhalb der neuen Zone (${erg.breite} × ${erg.hoehe}) und werden entfernt:</p><ul>${erg.abgeschnitten.slice(0, 40).map((a) => `<li>${esc(a.text)}</li>`).join('')}${erg.abgeschnitten.length > 40 ? '<li>…</li>' : ''}</ul><p>Rückgängig (Strg+Z) bleibt möglich.</p>`, { ok: 'Trotzdem verkleinern', gefahr: true });
      if (!ok) return;
    }
    zustand.ausfuehren(`Größe ${erg.breite} × ${erg.hoehe}`, erg.ops);
    zustand.auswahl.clear();
    zustand.meldung(`Zone ist jetzt ${erg.breite} × ${erg.hoehe}`, 'ok');
    zeichner.anfordern();
  },
  async neueZone(r) {
    const w = await formular('Neue Zone', [
      { name: 'name', label: 'Name', typ: 'text', wert: 'Neue Zone', pflicht: true },
      { name: 'id', label: 'ID', typ: 'text', wert: freieId('neue_zone'), pflicht: true, hilfe: 'a–z, 0–9, _' },
      { name: 'breite', label: 'Breite', typ: 'zahl', wert: r?.b ?? 40, min: 4, max: 400, schritt: 1, pflicht: true },
      { name: 'hoehe', label: 'Höhe', typ: 'zahl', wert: r?.h ?? 30, min: 4, max: 400, schritt: 1, pflicht: true },
    ], { text: 'Die Fläche wird mit Rasen gefüllt – sonst nichts.', okText: 'Anlegen', pruefe: (v) => (!ZONEN_ID_MUSTER.test(v.id) ? 'ID: nur a–z, 0–9, _' : zustand.zonen.has(v.id) ? 'ID schon vergeben' : null) });
    if (!w) return;
    zustand.fuegeZoneHinzu(neueZone(w));
    zeichner.einpassen();
    zustand.meldung(`Zone „${w.name}“ angelegt (${w.breite} × ${w.hoehe}) – als Nächstes: Spieler-Start setzen (Spawns)`, 'ok');
  },
  async ankunftAnlegen(x, y) {
    const w = await formular('Ankunftspunkt', [{ name: 'name', label: 'Name', typ: 'text', wert: freierAnkunftsname(x, y), pflicht: true, hilfe: 'darauf zeigen Übergänge anderer Zonen (z. B. nord, sued)' }], { pruefe: (v) => (!/^[a-z0-9_]+$/i.test(v.name) ? 'nur Buchstaben, Ziffern, _' : zustand.karte.s('ankuenfte').has(v.name) ? 'Name schon vergeben' : null) });
    if (!w) return;
    zustand.ausfuehren('Ankunft setzen', [{ s: 'ankuenfte', k: w.name, neu: { x, y } }]);
    zustand.waehle([{ s: 'ankuenfte', k: w.name }]);
  },
  async uebergangAnlegen(r) {
    const k = zustand.karte;
    const zonen = [...zustand.zonen.keys()].filter((id) => id !== k.id);
    const w = await formular('Übergang', [
      { name: 'ziel', label: 'Zielzone', typ: zonen.length ? 'auswahl' : 'text', wert: zonen[0] ?? '', optionen: zonen.map((id) => [id, `${zustand.zonen.get(id).karte.name} (${id})`]), pflicht: true },
      { name: 'ankunft', label: 'Ankunft dort', typ: 'text', wert: richtungsName(r, k, true), pflicht: true, hilfe: 'Name des Ankunftspunkts in der Zielzone (wird bei Bedarf angelegt)' },
      { name: 'name', label: 'Schildtext', typ: 'text', wert: '' },
    ]);
    if (!w) return;
    const id = k.naechsteId;
    zustand.ausfuehren('Übergang setzen', [{ s: 'uebergaenge', k: id, neu: { ...r, ziel: w.ziel, ankunft: w.ankunft, name: w.name || `${zustand.zonen.get(w.ziel)?.karte.name ?? w.ziel}` } }]);
    zustand.waehle([{ s: 'uebergaenge', k: id }]);
    const ziel = zustand.zonen.get(w.ziel)?.karte;
    if (ziel && !ziel.s('ankuenfte').has(w.ankunft)) zustand.meldung(`Zielzone „${w.ziel}“ hat noch keine Ankunft „${w.ankunft}“ – Panel: „Ankunft in der Zielzone setzen“`, 'fehler');
  },
  ankunftInZiel(u) {
    if (!zustand.zonen.has(u.ziel)) return zustand.meldung(`Zone „${u.ziel}“ ist nicht im Projekt – erst öffnen`, 'fehler');
    zustand.aktiviere(u.ziel);
    zustand.eintrag = katalog().find((e) => e.id === 'marker:ankunft');
    zustand.setzeWerkzeug('platzieren');
    zeichner.einpassen();
    zustand.meldung(`Zone „${u.ziel}“: Ankunftspunkt „${u.ankunft}“ setzen (Klick) – nicht in einen Übergang`);
  },
  raumFlaecheAnlegen: async (rechtecke) => {
    const raum = await waehleRaum('Raum markieren');
    if (!raum) return;
    let id = zustand.karte.naechsteId;
    zustand.ausfuehren(`Raum ${raum} markiert`, rechtecke.map((r) => ({ s: 'raumFlaechen', k: id++, neu: { raum, ...r } })));
  },
  raumWaehlen: async () => {
    const raum = await waehleRaum('Loot-Punkt: Raum wählen');
    if (raum) {
      zustand.lootRaum = raum;
      zustand.meldung(`Loot-Punkte gehören jetzt zu Raum ${raum} – nochmal klicken`);
    }
  },
  /** Katalog-Eintrag per ID wählen (mit Zusatzfeldern, z. B. Raum) */
  waehleKatalog(id, extra = {}) {
    const e = katalog().find((x) => x.id === id);
    if (!e) return;
    bauleiste.zeigeKategorie(e.kategorie);
    bauleiste.waehle({ ...e, ...extra });
  },
  waehleEintrag({ typ, zeichen }) {
    const e = katalog().find((x) => (typ ? x.art === 'objekt' && x.typ === typ : x.art === 'kachel' && x.zeichen === zeichen));
    if (e) {
      bauleiste.zeigeKategorie(e.kategorie);
      bauleiste.waehle(e);
    }
  },
  beiHover(x, y) {
    const k = zustand.karte;
    if (!k) return;
    const drin = k.imFeld(x, y);
    statusKoord.textContent = drin ? `x ${x} · y ${y}` : `(${x}|${y}) außerhalb`;
    statusInfo.textContent = drin ? `${k.kachelAn(x, y)}${k.markerAn(x, y) ? ` · ${k.markerAn(x, y).art}` : ''}${k.hoeheAn(x, y) ? ` · Höhe ${k.hoeheAn(x, y)}` : ''}` : '';
    panel.hover = { x, y };
  },
};

const werkzeuge = new Werkzeuge({ leinwand, zeichner, zustand, aktionen });
const bauleiste = new Bauleiste({ zustand, aktionen });
const panel = new Panel({ zustand, aktionen });

/** Weitere Funktionen der späteren Phasen (Zonen, Prefabs, KI, Test, 3D …) hängen sich hier ein */
const sonderAktionen = {
  neuerRaum: () => neuerRaum(),
  zonenEinstellungen: () => panel.zeige('Zone'),
};
const erw = erweiterungen({ zustand, zeichner, panel, aktionen, sonderAktionen, werkzeuge, bauleiste, auswahlBereich: () => auswahlBereich(), projektZonen: () => projektZonen(), schalteAnsicht: () => schalteAnsicht() });

function auswahlBereich() {
  if (zustand.auswahlRechteck) return zustand.auswahlRechteck;
  const gew = zustand.gewaehlte();
  if (!gew.length) return null;
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const { s, k, wert } of gew) {
    const [x, y, b, h] = s === 'marker' ? [...k.split(',').map(Number), 1, 1] : s === 'bauwerke' ? [wert.tx, wert.ty, 1, 1] : [wert.x, wert.y, wert.b ?? 1, wert.h ?? 1];
    x0 = Math.min(x0, Math.floor(x));
    y0 = Math.min(y0, Math.floor(y));
    x1 = Math.max(x1, Math.ceil(x + b));
    y1 = Math.max(y1, Math.ceil(y + h));
  }
  return { x: x0, y: y0, b: x1 - x0, h: y1 - y0 };
}

function freieId(basis) {
  let id = basis;
  for (let n = 2; zustand.zonen.has(id); n++) id = `${basis}_${n}`;
  return id;
}

function richtungsName(r, k, gegenueber = false) {
  const seite = r.y === 0 ? 'nord' : r.y + r.h === k.hoehe ? 'sued' : r.x === 0 ? 'west' : 'ost';
  return gegenueber ? { nord: 'sued', sued: 'nord', west: 'ost', ost: 'west' }[seite] : seite;
}

function freierAnkunftsname(x, y) {
  const k = zustand.karte;
  const seite = y < k.hoehe / 4 ? 'nord' : y > (k.hoehe * 3) / 4 ? 'sued' : x < k.breite / 2 ? 'west' : 'ost';
  let n = seite;
  for (let i = 2; k.s('ankuenfte').has(n); i++) n = `${seite}${i}`;
  return n;
}

async function waehleRaum(titel) {
  const k = zustand.karte;
  const raeume = [...k.s('raeume')];
  if (!raeume.length) return neuerRaum();
  const w = await formular(titel, [{ name: 'raum', label: 'Raum', typ: 'auswahl', wert: zustand.lootRaum ?? raeume[0][0], optionen: [...raeume.map(([b, r]) => [b, `${b}: ${r.name} (${r.lootTabelle})`]), ['+', '➕ Neuer Raum …']] }]);
  if (!w) return null;
  return w.raum === '+' ? neuerRaum() : w.raum;
}

async function neuerRaum() {
  const k = zustand.karte;
  if (!k) return null;
  const frei = 'abcdefghijklmnopqrstuvwxyz'.split('').filter((b) => !k.s('raeume').has(b));
  if (!frei.length) return zustand.meldung('Alle 26 Raum-Buchstaben (a–z) sind vergeben', 'fehler');
  const w = await formular('Neuer Raum', [
    { name: 'buchstabe', label: 'Buchstabe', typ: 'auswahl', wert: frei[0], optionen: frei.map((b) => [b, b]) },
    { name: 'name', label: 'Name', typ: 'text', wert: 'Raum', pflicht: true },
    { name: 'lootTabelle', label: 'Loot-Tabelle', typ: 'auswahl', wert: 'wohnung', optionen: Object.keys(LOOT_TABELLEN).map((t) => [t, t]) },
  ], { text: 'Ein Raum fasst Loot-Punkte (a–z im Raster) zusammen und bestimmt, was dort liegt.' });
  if (!w) return null;
  zustand.ausfuehren(`Raum ${w.buchstabe} anlegen`, [{ s: 'raeume', k: w.buchstabe, neu: { name: w.name, lootTabelle: w.lootTabelle } }]);
  zustand.lootRaum = w.buchstabe;
  return w.buchstabe;
}

// --- Kopfleiste ---------------------------------------------------------------------------
const befehle = {
  neu: async () => {
    const w = await dialog({
      titel: 'Neue Zone',
      html: '<p>Ziehe ein Rechteck auf der Fläche auf (die Zone wird mit Rasen gefüllt) – oder gib die Größe direkt ein.</p>',
      knoepfe: [{ text: 'Abbrechen', wert: null }, { text: 'Größe eingeben', wert: 'zahlen' }, { text: '▭ Rechteck aufziehen', wert: 'ziehen', art: 'akzent' }],
    });
    if (w === 'zahlen') aktionen.neueZone(null);
    if (w === 'ziehen') {
      werkzeuge.neuModus = true;
      zustand.meldung('Rechteck aufziehen (mindestens 4 × 4) – Esc bricht ab');
    }
  },
  oeffnen: async () => {
    const zonen = [...zustand.zonen.values()].map((e) => e.karte);
    const html = `<h4>Zone aus dem Spiel als Vorlage</h4><div class="knopfreihe">${Object.entries(KARTEN).map(([id, d]) => `<button data-spiel="${esc(id)}">🗺 ${esc(d.name)} (${esc(id)}, ${d.kacheln[0].length} × ${d.kacheln.length})</button>`).join('')}</div>
      <h4>Entwürfe in diesem Projekt (lokal gespeichert)</h4><div class="knopfreihe">${zonen.length ? zonen.map((k) => `<button data-entwurf="${esc(k.id)}">✎ ${esc(k.name)} (${esc(k.id)})</button>`).join('') : '<span class="leise">noch keine</span>'}</div>
      <h4>Datei</h4><div class="knopfreihe"><button data-datei="1">📂 Entwurf/Karte aus Datei (.json) …</button></div>`;
    const w = await dialog({
      titel: 'Öffnen',
      html,
      knoepfe: [{ text: 'Schließen', wert: null }],
      beiOeffnen: (b) => b.querySelectorAll('[data-spiel],[data-entwurf],[data-datei]').forEach((k) => k.addEventListener('click', () => import('./ui/dialoge.js').then((d) => d.schliesse({ ...k.dataset })))),
    });
    if (!w) return;
    if (w.entwurf) {
      zustand.aktiviere(w.entwurf);
      zeichner.einpassen();
    } else if (w.spiel) oeffneSpielzone(w.spiel);
    else if (w.datei) {
      const datei = await dateiWaehlen();
      if (datei) oeffneDatei(datei.text, datei.name);
    }
  },
  speichern: async () => {
    if (!zustand.karte) return;
    await zustand.speichereJetzt();
    herunterladen(`${zustand.karte.id}.entwurf.json`, JSON.stringify(entwurfJson(zustand.karte, zustand.verlauf)));
    zustand.meldung('💾 Entwurf gespeichert (lokal + Datei, mit Verlauf)', 'ok');
  },
  exportieren: () => exportDialog(),
  kiImport: () => sonderAktionen.kiImport?.() ?? zustand.meldung('KI-Import fehlt', 'fehler'),
  testen: () => sonderAktionen.testen?.() ?? zustand.meldung('Testen fehlt', 'fehler'),
  rueckgaengig: () => zustand.rueckgaengig(),
  wiederholen: () => zustand.wiederholen(),
  ansicht: () => schalteAnsicht(),
  hilfe: () => zeigeHilfe(),
};
document.querySelectorAll('#kopf [data-befehl]').forEach((b) => b.addEventListener('click', () => befehle[b.dataset.befehl]?.()));
document.querySelectorAll('#zoom-knoepfe [data-zoom]').forEach((b) =>
  b.addEventListener('click', () => {
    const f = Number(b.dataset.zoom);
    if (zustand.ansicht === '3d') return erw.ansicht3d?.zoomen(f || 0);
    if (f === 0) zeichner.einpassen();
    else zeichner.zoomen(f);
  }),
);
zoneWahl.addEventListener('change', () => {
  zustand.aktiviere(zoneWahl.value);
  zeichner.einpassen();
});

function schalteAnsicht() {
  if (!erw.ansicht3d) return zustand.meldung('3D-Ansicht nicht verfügbar (WebGL?)', 'fehler');
  zustand.ansicht = zustand.ansicht === '2d' ? '3d' : '2d';
  document.getElementById('ansicht-knopf').textContent = zustand.ansicht === '2d' ? '3D' : '2D';
  document.getElementById('leinwand3d').hidden = zustand.ansicht !== '3d';
  leinwand.hidden = zustand.ansicht === '3d';
  document.getElementById('werkzeuge').hidden = zustand.ansicht === '3d'; // Malen/Bauen nur in 2D
  zustand.melde('ansicht');
}

async function oeffneSpielzone(id) {
  if (zustand.zonen.has(id) && !(await bestaetigen('Entwurf ersetzen?', `Im Projekt gibt es schon einen Entwurf „${esc(id)}“. Durch die Spielversion ersetzen? (Der alte Entwurf geht verloren – vorher 💾 speichern.)`, { ok: 'Ersetzen', gefahr: true }))) return;
  const { karte, warnungen } = ausDefinition(kopie(KARTEN[id]));
  zustand.fuegeZoneHinzu(karte);
  zeichner.einpassen();
  zustand.meldung(`„${karte.name}“ als Vorlage geöffnet – Änderungen landen im Entwurf, nicht im Spiel${warnungen.length ? ` (${warnungen.length} Hinweise)` : ''}`, 'ok');
}

async function oeffneDatei(text, name = '') {
  try {
    const { karte, verlauf, warnungen, art } = ladeDatei(text);
    if (zustand.zonen.has(karte.id) && !(await bestaetigen('Entwurf ersetzen?', `„${esc(karte.id)}“ ist schon im Projekt. Ersetzen?`, { ok: 'Ersetzen', gefahr: true }))) return;
    zustand.fuegeZoneHinzu(karte, verlauf);
    zeichner.einpassen();
    zustand.meldung(`${art === 'entwurf' ? 'Entwurf' : 'Karte'} „${karte.name}“ geöffnet${name ? ` (${name})` : ''}${warnungen.length ? ` – ${warnungen.join('; ')}` : ''}`, warnungen.length ? 'fehler' : 'ok');
  } catch (e) {
    zustand.meldung(`Datei nicht lesbar: ${e.message}`, 'fehler');
    dialog({ titel: 'Datei nicht lesbar', html: `<p>${esc(e.message)}</p>` });
  }
}

async function exportDialog() {
  const k = zustand.karte;
  if (!k) return;
  const w = await dialog({
    titel: `Export „${k.name}“`,
    html: `<div class="knopfreihe" style="flex-direction:column;align-items:stretch">
      <button data-w="json">📄 Ganze Karte als JSON (für KI/Menschen, mit Erklärung)</button>
      <button data-w="liesmich">📝 LIESMICH.txt (Feld-Erklärung für eine KI)</button>
      <button data-w="ausschnitt">🤖 Ausschnitt für KI (markierter Bereich)</button>
      <button data-w="veroeffentlichen" class="akzent">🚀 Veröffentlichen: ${esc(k.id)}.js für server/spiel/karten/</button>
      <button data-w="alle">🗂 Alle Zonen des Projekts als Entwürfe</button></div>
      <p class="leise">Veröffentlichen schreibt nichts ins Repo: die Dateien werden heruntergeladen. Ins Spiel kommen sie per <code>npm run karte:editor -- &lt;id&gt;.karte.json</code> oder von Hand (siehe Anleitung im nächsten Schritt).</p>`,
    knoepfe: [{ text: 'Schließen', wert: null }],
    beiOeffnen: (b) => b.querySelectorAll('[data-w]').forEach((x) => x.addEventListener('click', () => import('./ui/dialoge.js').then((d) => d.schliesse(x.dataset.w)))),
  });
  if (w === 'json') herunterladen(`${k.id}.karte.json`, JSON.stringify(exportJson(k), null, 1));
  if (w === 'liesmich') herunterladen('LIESMICH.txt', `${LIESMICH_TEXT.join('\n\n')}\n\nKI-Änderungen zurückgeben (Aktionsliste):\n${AKTIONEN_ANLEITUNG.map((z) => `  ${z}`).join('\n')}\n`, 'text/plain');
  if (w === 'ausschnitt') sonderAktionen.ausschnittExport?.();
  if (w === 'alle') for (const [id, e] of zustand.zonen) herunterladen(`${id}.entwurf.json`, JSON.stringify(entwurfJson(e.karte, e.verlauf)));
  if (w === 'veroeffentlichen') veroeffentlichen();
}

async function veroeffentlichen() {
  const k = zustand.karte;
  const probleme = validiere(k, { zonen: projektZonen() });
  if (hatFehler(probleme)) {
    panel.zeige('Prüfung');
    return dialog({ titel: 'Noch Fehler', html: `<p>Vor dem Veröffentlichen bitte diese Fehler beheben:</p><ul>${probleme.filter((p) => p.schwere === 'fehler').slice(0, 20).map((p) => `<li>${esc(p.text)}${p.x !== null ? ` (${p.x}|${p.y})` : ''}</li>`).join('')}</ul>` });
  }
  const v = veroeffentlichung(k);
  const neu = !KARTEN[k.id];
  const w = await dialog({
    titel: `Veröffentlichen: ${v.dateiname}`,
    html: `<p>Zwei Wege ins Spiel (der Editor selbst ändert nie Repo-Dateien):</p>
      <ol><li><b>Empfohlen:</b> <code>${esc(k.id)}.karte.json</code> herunterladen und im Repo <code>npm run karte:editor -- ${esc(k.id)}.karte.json</code> ausführen → schreibt <code>server/spiel/karten/${esc(v.dateiname)}</code>${neu ? ' und trägt die Zone in KARTEN ein' : ''}.</li>
      <li>Von Hand: <code>${esc(v.dateiname)}</code> nach <code>server/spiel/karten/</code> legen${neu ? `; in <code>kartenLader.js</code> ergänzen:<pre>${esc(v.importZeile)}\n…\nexport const KARTEN = Object.freeze({\n…\n${esc(v.kartenZeile)}\n});</pre>` : ' (Zone ist schon in KARTEN eingetragen).'}</li></ol>
      <p>Danach <code>npm test</code>. ${probleme.length ? `<br>⚠ ${probleme.length} Warnungen (siehe Prüfung).` : ''}</p>`,
    knoepfe: [{ text: 'Schließen', wert: null }, { text: `${v.dateiname} laden`, wert: 'js' }, { text: `${k.id}.karte.json laden`, wert: 'json', art: 'akzent' }],
  });
  if (w === 'js') herunterladen(v.dateiname, v.quelltext, 'text/javascript');
  if (w === 'json') herunterladen(`${k.id}.karte.json`, JSON.stringify(exportJson(k), null, 1));
}

/** Zonen fürs Prüfen der Übergänge: alle Projekt-Zonen + Spielzonen, die nicht im Projekt sind */
export function projektZonen() {
  const m = new Map([...zustand.zonen].map(([id, e]) => [id, e.karte]));
  for (const [id, d] of Object.entries(KARTEN)) if (!m.has(id)) m.set(id, ausDefinitionGepuffert(id, d));
  return m;
}
const spielZonenPuffer = new Map();
function ausDefinitionGepuffert(id, d) {
  if (!spielZonenPuffer.has(id)) spielZonenPuffer.set(id, ausDefinition(d).karte);
  return spielZonenPuffer.get(id);
}

function zeigeHilfe() {
  const t = [
    ['V', 'Auswahl'], ['H / Leertaste', 'Schwenken'], ['B', 'Pinsel'], ['U', 'Rechteck (Umschalt: Rand)'], ['L', 'Linie / Mauer'], ['G', 'Füllen'], ['E', 'Radierer'], ['I', 'Pipette'], ['Z', 'Zone vergrößern/verkleinern'],
    ['R / Rechtsklick', 'Drehen 90°'], ['[ ]', 'Pinsel kleiner/größer'], ['Strg+Z / Strg+Y', 'Rückgängig / Wiederholen'], ['Strg+C / X / V', 'Kopieren / Ausschneiden / Einfügen'], ['Strg+D', 'Duplizieren'], ['Entf', 'Löschen'],
    ['Pfeiltasten', 'Auswahl verschieben (Umschalt: 5)'], ['Strg+S', 'Lokal speichern'], ['F', 'Ganze Zone zeigen'], ['+ / −', 'Zoom'], ['3', '2D/3D umschalten'], ['Esc', 'Abbrechen / Auswahl leeren'], ['?', 'Diese Hilfe'],
    ['Mausrad', 'Zoom (Umschalt: seitwärts)'], ['2 Finger', 'Schwenken + Zoomen (Touch)'], ['Alt beim Ziehen', 'Objekte fein (0,1) verschieben'],
  ];
  dialog({
    titel: 'Tastenkürzel',
    html: `<div class="hilfe-raster">${t.map(([k, b]) => `<div><kbd>${esc(k)}</kbd> ${esc(b)}</div>`).join('')}</div>
      <p class="leise">Touch: Ansehen, Schwenken und Zoomen gehen überall (2 Finger). Malen und Bauen gehen per Tippen, sind aber für Maus & Tastatur gebaut (bewusste Ausnahme, siehe editor/LIESMICH.md).</p>`,
  });
}

// --- Tastatur -------------------------------------------------------------------------------
const TASTEN = { v: 'auswahl', h: 'hand', b: 'malen:pinsel', u: 'malen:rechteck', l: 'malen:linie', g: 'malen:fuellen', e: 'radierer', i: 'pipette', z: 'zone' };
window.addEventListener('keydown', (e) => {
  if (istDialogOffen() || /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName)) return;
  const strg = e.ctrlKey || e.metaKey;
  const t = e.key.toLowerCase();
  if (strg && t === 'z' && !e.shiftKey) befehle.rueckgaengig();
  else if (strg && (t === 'y' || (t === 'z' && e.shiftKey))) befehle.wiederholen();
  else if (strg && t === 'c') aktionen.kopieren();
  else if (strg && t === 'x') aktionen.ausschneiden();
  else if (strg && t === 'v') aktionen.einfuegen();
  else if (strg && t === 'd') aktionen.duplizieren();
  else if (strg && t === 's') {
    zustand.speichereJetzt();
    zustand.meldung('Lokal gespeichert', 'ok');
  } else if (strg) return;
  else if (t === 'delete' || t === 'backspace') aktionen.auswahlLoeschen();
  else if (t === 'escape') {
    werkzeuge.abbrechen();
    zustand.leereAuswahl();
    if (zustand.werkzeug === 'platzieren' || zustand.werkzeug === 'einfuegen') aktionen.werkzeug('auswahl');
  } else if (t === 'r') werkzeuge.drehe();
  else if (t === '[') aktionen.pinselGroesse(-1);
  else if (t === ']') aktionen.pinselGroesse(1);
  else if (t === 'f') zustand.ansicht === '3d' ? erw.ansicht3d?.zoomen(0) : zeichner.einpassen();
  else if (t === '+' || t === '=') zeichner.zoomen(1.25);
  else if (t === '-') zeichner.zoomen(0.8);
  else if (t === '3') schalteAnsicht();
  else if (t === '?') zeigeHilfe();
  else if (t.startsWith('arrow')) {
    const n = e.shiftKey ? 5 : 1;
    const [dx, dy] = { arrowleft: [-n, 0], arrowright: [n, 0], arrowup: [0, -n], arrowdown: [0, n] }[t];
    const gew = zustand.gewaehlte();
    if (gew.length && zustand.karte) {
      const erg = verschiebeOps(zustand.karte, gew, dx, dy);
      if (erg) {
        zustand.ausfuehren('Verschieben', erg.ops);
        zustand.waehle(erg.neueAuswahl);
      }
    } else zeichner.schwenken(-dx * zeichner.zoom, -dy * zeichner.zoom);
  } else if (TASTEN[t]) aktionen.werkzeug(TASTEN[t]);
  else return;
  e.preventDefault();
});

// --- Status, Validierung, Zonenliste --------------------------------------------------------
let meldungTimer = null;
zustand.bei('meldung', ({ text, art }) => {
  statusMeldung.textContent = text;
  statusMeldung.className = art;
  clearTimeout(meldungTimer);
  meldungTimer = setTimeout(() => (statusMeldung.textContent = ''), 7000);
});
zustand.bei('speicher', () => {
  speicherStatus.textContent = zustand.speicherStatus;
  speicherStatus.classList.toggle('warnung', speicher.art === 'fluechtig');
});

let pruefTimer = null;
function planePruefung() {
  clearTimeout(pruefTimer);
  pruefTimer = setTimeout(() => {
    if (!zustand.karte) return;
    zustand.validierung = validiere(zustand.karte, { zonen: projektZonen() });
    const f = zustand.validierung.filter((e) => e.schwere === 'fehler').length;
    const w = zustand.validierung.length - f;
    statusPruefung.textContent = f || w ? `⛔ ${f} Fehler · ⚠ ${w} Warnungen` : '✓ Karte gültig';
    zustand.melde('pruefung');
    if (panel.aktiv === 'Prüfung' || !panel.elReiter.children.length) panel.zeichne();
    else panel.elReiter.querySelector('button:nth-child(3)') && (panel.elReiter.children[2].textContent = `Prüfung${f || w ? ` (${f ? `⛔${f}` : ''}${w ? ` ⚠${w}` : ''})` : ' ✓'}`);
  }, 350);
}
statusPruefung.addEventListener('click', () => panel.zeige('Prüfung'));
zustand.bei('karte', planePruefung);

/** Innen/Außen wie das Spiel (Welt.istInnen) – für die Anzeige */
function berechneInnen() {
  zeichner.innen = erw.innenRaster?.() ?? null;
}
zustand.bei('karte', () => zustand.overlays.innen && berechneInnen());

zustand.bei('zone', () => {
  zoneWahl.innerHTML = [...zustand.zonen.values()].map((e) => `<option value="${esc(e.karte.id)}"${e.karte.id === zustand.aktivId ? ' selected' : ''}>${esc(e.karte.name)} (${esc(e.karte.id)})</option>`).join('') || '<option>–</option>';
  document.getElementById('hinweis-leer').hidden = !!zustand.karte;
  document.title = zustand.karte ? `${zustand.karte.name} – Map-Editor` : 'Map-Editor – Browser Survival';
  planePruefung();
  berechneInnen();
});

// --- Start -----------------------------------------------------------------------------------
async function starten() {
  const art = await speicher.oeffnen();
  if (art === 'fluechtig') {
    zustand.speicherStatus = '⚠ Kein lokaler Speicher – bitte 💾 als Datei speichern';
    zustand.melde('speicher');
  }
  const n = await zustand.ladeAlle();
  zustand.melde('zone');
  panel.zeichne();
  aktionen.werkzeug('auswahl');
  if (n) {
    zeichner.einpassen();
    zustand.meldung(`${n} Entwurf/Entwürfe geladen`, 'ok');
  } else zustand.meldung('Willkommen! ➕ Neu (Rechteck aufziehen) oder 📂 Öffnen (Zone aus dem Spiel als Vorlage)');
  // Rückkehr aus dem Test im Spiel
  erw.nachStart?.();
  window.addEventListener('beforeunload', () => zustand.speichereJetzt());
}
starten();

// Für Konsole & automatische Tests
window.mapEditor = { zustand, zeichner, aktionen, befehle, werkzeuge, oeffneDatei, oeffneSpielzone, markerSchluessel, pruefeMarker, kopiere, dreheVorlage };
