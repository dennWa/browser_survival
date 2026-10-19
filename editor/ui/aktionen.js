import { LOOT_TABELLEN } from '../../server/spiel/konfiguration/lootTabellen.js';
import { kopiere, loescheOps, einfuegeOps } from '../kern/auswahl.js';
import { verschiebeOps, dupliziereOps } from '../kern/bearbeiten.js';
import { groesseAendern, neueZone, ZONEN_ID_MUSTER } from '../kern/zone.js';
import { katalog } from '../kern/katalog.js';
import { formular, bestaetigen, esc } from './dialoge.js';

/**
 * Editor-Aktionen (aus main.js herausgelöst, Editor 2.0 Schritt 1.2): Werkzeug wählen, Auswahl bearbeiten (kopieren,
 * einfügen, duplizieren, drehen, verschieben, löschen), Zone anlegen/umbenennen/Größe, Übergänge, Ankünfte, Räume.
 * Die Befehle (ui/befehlsliste.js) und Module (Prefabs, KI, Eigene …) rufen diese Funktionen; Module hängen eigene
 * Aktionen direkt an dasselbe Objekt (z. B. aktionen.prefabSpeichern, aktionen.kiImport).
 * `teile` wird nach dem Aufbau befüllt: { werkzeuge, assets, inspektor, befehle, kontextmenue, schalteAnsicht }.
 */
export function erstelleAktionen({ zustand, zeichner, leinwand, teile }) {
  const aktionen = {
    werkzeug(id) {
      if (id === 'drehen') return teile.werkzeuge.drehe();
      if (id.startsWith('malen:')) {
        zustand.malModus = id.slice(6);
        if (zustand.eintrag?.art !== 'kachel') zustand.setzeEintrag(katalog().find((e) => e.id === 'kachel:,'));
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
    springeZu(x, y) {
      if (zustand.ansicht === '3d') teile.schalteAnsicht();
      zeichner.springeZu(x, y);
      zeichner.vorschau = { rechtecke: [{ x, y, b: 1, h: 1 }], gueltig: false };
      setTimeout(() => {
        zeichner.vorschau = null;
        zeichner.anfordern();
      }, 1500);
    },

    // --- Auswahl ------------------------------------------------------------------
    /** Markierter Bereich oder Rahmen um die Auswahl (Kacheln) – oder null */
    auswahlBereich() {
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
    },
    alles() {
      const k = zustand.karte;
      if (!k) return;
      zustand.auswahlRechteck = { x: 0, y: 0, b: k.breite, h: k.hoehe };
      zustand.waehle([]);
      zustand.meldung(`Ganze Zone markiert (${k.breite} × ${k.hoehe}) – Strg+C kopiert, Entf leert`);
    },
    kopieren() {
      const r = aktionen.auswahlBereich();
      if (!r) return zustand.meldung('Erst einen Bereich markieren (⬚ ins Leere ziehen)', 'fehler');
      zustand.zwischenablage = kopiere(zustand.karte, r);
      zustand.meldung(`📋 ${r.b} × ${r.h} kopiert – Strg+V fügt an der Maus ein`, 'ok');
    },
    ausschneiden() {
      const r = aktionen.auswahlBereich();
      if (!r) return zustand.meldung('Erst einen Bereich markieren (⬚ ins Leere ziehen)', 'fehler');
      aktionen.kopieren();
      zustand.ausfuehren('Ausschneiden', loescheOps(zustand.karte, r));
      zustand.leereAuswahl();
    },
    /** Markierten Bereich leeren (Kacheln → Rasen, Elemente weg) */
    loeschen() {
      const r = zustand.auswahlRechteck;
      if (r) zustand.ausfuehren('Bereich leeren', loescheOps(zustand.karte, r));
      zustand.leereAuswahl();
    },
    /** Vorlage (Zwischenablage oder Prefab) an die Maus hängen – Klick setzt, R dreht, Esc bricht ab */
    einfuegen(vorlage = zustand.zwischenablage) {
      if (!vorlage || !zustand.karte) return zustand.meldung('Zwischenablage leer', 'fehler');
      if (zustand.ansicht === '3d') teile.schalteAnsicht();
      zustand.einfuegeVorlage = vorlage;
      zustand.setzeEintrag(null);
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
      if (!gew.length) return zustand.meldung('Nichts ausgewählt – erst anklicken (⬚)', 'fehler');
      const { ops, neueAuswahl, uebersprungen } = dupliziereOps(zustand.karte, gew);
      if (ops.length) {
        zustand.ausfuehren(`Duplizieren (${neueAuswahl.length})`, ops);
        zustand.waehle(neueAuswahl);
      }
      if (uebersprungen) zustand.meldung(`${uebersprungen} Element(e) nicht dupliziert (kein freier Platz daneben)`, 'fehler');
    },
    drehen: () => teile.werkzeuge.drehe(),
    /** Gewähltes löschen – ohne Auswahl den markierten Bereich leeren */
    auswahlLoeschen() {
      const ops = zustand.gewaehlte().map(({ s, k }) => ({ s, k, neu: null }));
      if (!ops.length) return aktionen.loeschen();
      zustand.ausfuehren(`${ops.length} gelöscht`, ops);
      zustand.leereAuswahl();
    },
    /** Pfeiltasten: Auswahl verschieben (Umschalt = 5), ohne Auswahl die Ansicht schwenken */
    verschieben(dx, dy) {
      const gew = zustand.gewaehlte();
      if (!gew.length || !zustand.karte) return zeichner.schwenken(-dx * zeichner.zoom, -dy * zeichner.zoom);
      const erg = verschiebeOps(zustand.karte, gew, dx, dy);
      if (!erg.ops) return zustand.meldung(erg.grund, 'fehler');
      zustand.ausfuehren('Verschieben', erg.ops);
      zustand.waehle(erg.neueAuswahl);
    },
    abbrechen() {
      teile.werkzeuge.abbrechen();
      zustand.leereAuswahl();
      if (zustand.werkzeug === 'platzieren' || zustand.werkzeug === 'einfuegen') aktionen.werkzeug('auswahl');
    },

    // --- Zone -------------------------------------------------------------------
    zoneUmbenennen: async (id) => {
      if (!ZONEN_ID_MUSTER.test(id)) return zustand.meldung('ID: nur a–z, 0–9, _', 'fehler');
      if (zustand.zonen.has(id)) return zustand.meldung(`Zone „${id}“ gibt es schon im Projekt`, 'fehler');
      await zustand.benenneZoneUm(zustand.aktivId, id);
    },
    groesseDialog: async () => {
      const k = zustand.karte;
      if (!k) return;
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
      ], { text: 'Die Fläche wird mit Rasen gefüllt – sonst nichts.', okText: 'Anlegen', pruefe: (v) => (!ZONEN_ID_MUSTER.test(v.id) ? 'ID: nur a–z, 0–9, _' : zustand.zonen.has(v.id) ? 'ID schon vergeben' : !(v.breite >= 4 && v.hoehe >= 4 && v.breite <= 400 && v.hoehe <= 400) ? 'Größe: 4 bis 400' : null) });
      if (!w) return;
      zustand.fuegeZoneHinzu(neueZone(w));
      zeichner.einpassen();
      zustand.meldung(`Zone „${w.name}“ angelegt (${w.breite} × ${w.hoehe}) – als Nächstes: Spieler-Start setzen (Gameplay → Spawns)`, 'ok');
    },
    /** Zonen-Werte im Inspektor zeigen (z. B. bereich 'wetter') */
    zonenEinstellungen: (bereich = null) => teile.inspektor.zeigeZonenWerte(bereich),

    // --- Übergänge, Ankünfte, Räume ------------------------------------------------
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
      if (ziel && !ziel.s('ankuenfte').has(w.ankunft)) zustand.meldung(`Zielzone „${w.ziel}“ hat noch keine Ankunft „${w.ankunft}“ – Inspektor: „Ankunft in der Zielzone setzen“`, 'fehler');
    },
    ankunftInZiel(u) {
      if (!zustand.zonen.has(u.ziel)) return zustand.meldung(`Zone „${u.ziel}“ ist nicht im Projekt – erst öffnen`, 'fehler');
      zustand.aktiviere(u.ziel);
      teile.assets.waehleId('marker:ankunft');
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
    neuerRaum: () => neuerRaum(),

    // --- Katalog -----------------------------------------------------------------
    /** Katalog-Eintrag per ID wählen (mit Zusatzfeldern, z. B. Raum) */
    waehleKatalog: (id, extra = {}) => teile.assets.waehleId(id, extra),
    /** Pipette: Eintrag zu Objekttyp oder Kachelzeichen wählen */
    waehleEintrag({ typ, zeichen }) {
      const e = katalog().find((x) => (typ ? x.art === 'objekt' && x.typ === typ : x.art === 'kachel' && x.zeichen === zeichen)) ?? (typ ? { id: `eigen:${typ}` } : null);
      if (e) teile.assets.waehleId(e.id);
    },
    kontextmenue: (x, y, ziel) => teile.kontextmenue(x, y, ziel),
  };

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

  return aktionen;
}
