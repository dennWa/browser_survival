import { LOOT_TABELLEN } from '../../server/spiel/konfiguration/lootTabellen.js';
import { kopiere, kopiereElemente, loescheOps, einfuegeOps } from '../kern/auswahl.js';
import { verschiebeOps, dupliziereOps } from '../kern/bearbeiten.js';
import { ausrichtenOps, verteilenOps, spiegelnOps, rahmenVon } from '../kern/anordnen.js';
import { groesseAendern, neueZone, ZONEN_ID_MUSTER, MIN_GROESSE, MAX_GROESSE, groessenHinweis } from '../kern/zone.js';
import { verschiebeZone } from '../kern/weltLayout.js';
import { katalog } from '../kern/katalog.js';
import { formular, bestaetigen, dialog, esc } from './dialoge.js';

/** JS-Speichergrenze des Tabs (nur Chromium kennt sie) – für die Größen-Schätzung neuer Zonen */
const heapGrenze = () => globalThis.performance?.memory?.jsHeapSizeLimit ?? null;

/**
 * Editor-Aktionen (aus main.js herausgelöst, Editor 2.0 Schritt 1.2): Werkzeug wählen, Auswahl bearbeiten (kopieren,
 * einfügen, duplizieren, drehen, verschieben, löschen), Zone anlegen/umbenennen/Größe, Übergänge, Ankünfte, Räume.
 * Die Befehle (ui/befehlsliste.js) und Module (Prefabs, KI, Eigene …) rufen diese Funktionen; Module hängen eigene
 * Aktionen direkt an dasselbe Objekt (z. B. aktionen.prefabSpeichern, aktionen.kiImport).
 * `teile` wird nach dem Aufbau befüllt: { werkzeuge, assets, inspektor, befehle, kontextmenue, schalteAnsicht }.
 * Runde 18: kopieren/ausschneiden ohne ⬚-Rahmen = nur gewählte Elemente (6.5, kern/auswahl.kopiereElemente); neueZone wird
 * ANGEFÜGT (Weltlage ohne Überlappung), zoneLage, zoneGroesse lehnt Überlappung ab (6.4); Werkzeugwechsel leert das Maßband,
 * Esc → Auswahl (6.3); kiMarkieren/kiBereichFertig/kiMarkierungWeg/kiZoneErweitern/kiNeueZoneDort (7.2).
 */
export function erstelleAktionen({ zustand, zeichner, leinwand, teile }) {
  const aktionen = {
    werkzeug(id) {
      if (id === 'drehen') return teile.werkzeuge.drehe();
      // 6.3: Maßband gehört zum Werkzeug „Messen“ – beim Wechsel weg (sonst klebte die Gummi-Linie an der Maus)
      if (id !== 'messen') teile.werkzeuge?.massbandLeeren();
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
    /**
     * Strg+C (6.5): markierter Bereich (⬚ Rahmen) → Bereich mit Boden + allem darin; nur angeklickte Elemente (ohne Rahmen)
     * → genau diese Elemente, ohne Boden (Vorlage `nurElemente`, Einfügen stempelt nichts weg).
     */
    kopieren() {
      const gew = zustand.gewaehlte();
      if (!zustand.auswahlRechteck && gew.length) {
        const v = kopiereElemente(zustand.karte, gew);
        if (!v) return zustand.meldung('Diese Auswahl lässt sich nicht kopieren (Übergänge/Ankünfte: duplizieren oder neu setzen)', 'fehler');
        zustand.zwischenablage = v;
        const n = gew.length - v.uebersprungen;
        return zustand.meldung(`📋 ${n} Element${n === 1 ? '' : 'e'} kopiert${v.uebersprungen ? ` (${v.uebersprungen} übersprungen: Übergang/Ankunft)` : ''} – Strg+V hängt sie an die Maus, Klick setzt`, 'ok');
      }
      const r = aktionen.auswahlBereich();
      if (!r) return zustand.meldung('Erst etwas wählen oder einen Bereich markieren (⬚ ins Leere ziehen)', 'fehler');
      zustand.zwischenablage = kopiere(zustand.karte, r);
      zustand.meldung(`📋 ${r.b} × ${r.h} kopiert – Strg+V fügt an der Maus ein`, 'ok');
    },
    ausschneiden() {
      const gew = zustand.gewaehlte();
      if (!zustand.auswahlRechteck && gew.length) {
        aktionen.kopieren();
        const ops = gew.filter((g) => g.s !== 'uebergaenge' && g.s !== 'ankuenfte').map(({ s, k }) => ({ s, k, neu: null }));
        if (ops.length) zustand.ausfuehren(`Ausschneiden (${ops.length})`, ops);
        return zustand.leereAuswahl();
      }
      const r = aktionen.auswahlBereich();
      if (!r) return zustand.meldung('Erst etwas wählen oder einen Bereich markieren (⬚ ins Leere ziehen)', 'fehler');
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
      zustand.ausfuehren(vorlage.name ? `Prefab „${vorlage.name}“` : vorlage.nurElemente ? 'Einfügen (Elemente)' : 'Einfügen', ops);
      if (!mehrfach) {
        aktionen.werkzeug('auswahl');
        // Einzel-Elemente: kein Rahmen (sonst kopierte das nächste Strg+C den ganzen Bereich mit Boden)
        zustand.auswahlRechteck = vorlage.nurElemente ? null : { x, y, b: vorlage.b, h: vorlage.h };
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
    /** Mehrfachauswahl anordnen (7.2): art 'ausrichten' (links/rechts/oben/unten/mitteH/mitteV), 'verteilen' (h/v), 'spiegeln' (h/v) */
    anordnen(art, wie) {
      const k = zustand.karte;
      const gew = zustand.gewaehlte();
      // Spiegeln: das markierte Rechteck (mit seinen Kacheln) zählt nur, wenn die gewählten Elemente darin liegen
      const r = zustand.auswahlRechteck;
      const imRechteck = r && gew.every((e) => {
        const b = rahmenVon(e.s, e.k, e.wert);
        return !b || (b.x >= r.x && b.y >= r.y && b.x + b.b <= r.x + r.b && b.y + b.h <= r.y + r.h);
      });
      const erg = art === 'ausrichten' ? ausrichtenOps(k, gew, wie) : art === 'verteilen' ? verteilenOps(k, gew, wie) : spiegelnOps(k, gew, wie, imRechteck ? r : null);
      if (erg.grund) return zustand.meldung(erg.grund, 'fehler');
      const name = { ausrichten: 'Ausrichten', verteilen: 'Verteilen', spiegeln: 'Spiegeln' }[art];
      if (erg.ops.length) zustand.ausfuehren(`${name} (${wie})`, erg.ops);
      if (erg.neueAuswahl.length) zustand.waehle(erg.neueAuswahl);
    },
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
    /** Esc: laufende Aktion abbrechen; Platzieren/Einfügen/Messen/KI-Markieren → zurück zur Auswahl (6.3) */
    abbrechen() {
      teile.werkzeuge.abbrechen();
      teile.ansicht3d?.verwerfeGeist?.();
      zustand.leereAuswahl();
      if (['platzieren', 'einfuegen', 'messen', 'kiMarkieren'].includes(zustand.werkzeug)) aktionen.werkzeug('auswahl');
    },

    // --- 7.2: Bereich für die KI markieren (aus dem 🤖 Helfer, auch über die Zone hinaus) -------------
    /** aktuelle KI-Markierung (Zonen-Koordinaten, darf außerhalb liegen) oder null */
    kiRechteck: () => zustand.kiBereich ?? null,
    kiMarkieren() {
      if (!zustand.karte) return zustand.meldung('Erst eine Zone öffnen', 'fehler');
      if (zustand.ansicht === '3d') teile.schalteAnsicht();
      aktionen.werkzeug('kiMarkieren');
      // Handy: Schublade zu, damit die Karte frei ist (kommt nach dem Aufziehen wieder)
      if (globalThis.matchMedia?.('(max-width: 900px)').matches) teile.layout?.verstecke('ki');
      zustand.meldung('🤖 Rechteck aufziehen (Maus/Finger) – darf auch neben der Zone liegen · Esc bricht ab');
    },
    kiBereichFertig(r) {
      aktionen.werkzeug('auswahl');
      if (!r || r.b < 1 || r.h < 1) return;
      teile.layout?.zeige('ki');
      const k = zustand.karte;
      const draussen = r.x < 0 || r.y < 0 || r.x + r.b > k.breite || r.y + r.h > k.hoehe;
      zustand.meldung(`🤖 KI-Bereich ${r.b} × ${r.h} markiert${draussen ? ' – ragt über die Zone (KI plant dort, bauen erst nach „Zone vergrößern“/„Neue Zone“)' : ''} – jetzt im Helfer fragen`, 'ok');
    },
    kiMarkierungWeg() {
      if (!zustand.kiBereich) return;
      zustand.kiBereich = null;
      zustand.melde('kiBereich');
      zeichner.anfordern();
    },
    /** Zone bis zur KI-Markierung vergrößern (Ränder links/oben verschieben die Koordinaten → Markierung zieht mit) */
    async kiZoneErweitern(rand) {
      const k = zustand.karte;
      const r = zustand.kiBereich;
      if (!k || !r) return;
      const vorher = { b: k.breite, h: k.hoehe };
      await aktionen.zoneGroesse(rand);
      if (k.breite === vorher.b && k.hoehe === vorher.h) return; // abgebrochen/abgelehnt
      zustand.kiBereich = { ...r, x: r.x + (rand.links ?? 0), y: r.y + (rand.oben ?? 0) };
      zustand.melde('kiBereich');
      zeichner.anfordern();
    },
    /** Neue Zone an der Stelle der KI-Markierung (Weltanordnung, ohne Überlappung) – danach gilt die ganze neue Zone */
    async kiNeueZoneDort(r) {
      const vorher = zustand.aktivId;
      await aktionen.neueZone(r);
      if (zustand.aktivId === vorher || !zustand.karte) return;
      zustand.kiBereich = { x: 0, y: 0, b: zustand.karte.breite, h: zustand.karte.hoehe };
      zustand.melde('kiBereich');
      teile.layout?.zeige('ki');
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
      const k = zustand.karte;
      const neuB = k.breite + (rand.links ?? 0) + (rand.rechts ?? 0);
      const neuH = k.hoehe + (rand.oben ?? 0) + (rand.unten ?? 0);
      // 6.4: sehr große Zonen erst nach Rückfrage (und nie mehr, als der Browser sicher schafft)
      const hinweis = neuB * neuH > k.breite * k.hoehe ? groessenHinweis(neuB, neuH, { heapGrenze: heapGrenze() }) : null;
      if (hinweis?.stufe === 'zuviel') return dialog({ titel: '⚠ Zu groß für diesen Browser', html: `<p>${esc(hinweis.text)}</p>` });
      if (hinweis?.stufe === 'sehr' && !(await bestaetigen('Sehr große Zone', `<p>${esc(hinweis.text)}</p>`, { ok: 'Trotzdem vergrößern' }))) return;
      try {
        erg = groesseAendern(k, rand);
      } catch (e) {
        return zustand.meldung(e.message, 'fehler');
      }
      // Überlappt die vergrößerte Zone Nachbarn in der Weltanordnung? → geht nicht (6.4: Zonen überlappen nie)
      const p = zustand.layout[k.id];
      const ueber = p ? zustand.zonenKonflikte(k.id, { pos: { x: p.x - (rand.links ?? 0), y: p.y - (rand.oben ?? 0) }, b: neuB, h: neuH }) : [];
      if (ueber.length) return dialog({ titel: '⛔ Zonen würden überlappen', html: `<p>Mit ${neuB} × ${neuH} überdeckt die Zone in der Weltanordnung: <b>${ueber.map((id) => esc(zustand.zonen.get(id)?.karte.name ?? id)).join(', ')}</b>. Zonen dürfen sich nicht überlappen (Kante an Kante geht).</p><p class="leise">Erst verschieben – Zone-Werkzeug (Z, in die Zone fassen und ziehen) oder Zone → „Lage eingeben…“ – oder zur anderen Seite wachsen lassen.</p>` });
      if (erg.abgeschnitten.length) {
        const ok = await bestaetigen('Beim Verkleinern geht etwas verloren', `<p>Diese ${erg.abgeschnitten.length} Teile liegen außerhalb der neuen Zone (${erg.breite} × ${erg.hoehe}) und werden entfernt:</p><ul>${erg.abgeschnitten.slice(0, 40).map((a) => `<li>${esc(a.text)}</li>`).join('')}${erg.abgeschnitten.length > 40 ? '<li>…</li>' : ''}</ul><p>Rückgängig (Strg+Z) bleibt möglich.</p>`, { ok: 'Trotzdem verkleinern', gefahr: true });
        if (!ok) return;
      }
      zustand.ausfuehren(`Größe ${erg.breite} × ${erg.hoehe}`, erg.ops);
      zustand.auswahl.clear();
      zustand.meldung(`Zone ist jetzt ${erg.breite} × ${erg.hoehe}`, 'ok');
      zeichner.anfordern();
    },
    /**
     * Neue Zone (6.4): wird ANGEFÜGT (vorhandene Zonen bleiben im Projekt). r = aufgezogenes Rechteck in Koordinaten der
     * aktiven Zone → Weltlage daraus; ohne r (Größe eingegeben) direkt neben die aktive Zone, nie überlappend.
     * Größe 4 … MAX_GROESSE (10 000) je Seite; ab SEHR_GROSS_KACHELN Rückfrage, über der Speicher-Schätzung Abbruch.
     */
    async neueZone(r) {
      const w = await formular('Neue Zone', [
        { name: 'name', label: 'Name', typ: 'text', wert: 'Neue Zone', pflicht: true },
        { name: 'id', label: 'ID', typ: 'text', wert: freieId('neue_zone'), pflicht: true, hilfe: 'a–z, 0–9, _' },
        { name: 'breite', label: 'Breite', typ: 'zahl', wert: r?.b ?? 40, min: MIN_GROESSE, max: MAX_GROESSE, schritt: 1, pflicht: true },
        { name: 'hoehe', label: 'Höhe', typ: 'zahl', wert: r?.h ?? 30, min: MIN_GROESSE, max: MAX_GROESSE, schritt: 1, pflicht: true },
      ], { text: `Die Fläche wird mit Rasen gefüllt – sonst nichts. ${zustand.karte ? `Sie kommt <b>zusätzlich</b> ins Projekt, ${r ? 'an die aufgezogene Stelle' : `direkt neben „${esc(zustand.karte.name)}“`} (Weltanordnung, ohne Überlappung).` : ''} Größe ${MIN_GROESSE} bis ${MAX_GROESSE.toLocaleString('de-DE')} je Seite.`, okText: 'Anlegen', pruefe: (v) => (!ZONEN_ID_MUSTER.test(v.id) ? 'ID: nur a–z, 0–9, _' : zustand.zonen.has(v.id) ? 'ID schon vergeben' : !(Number.isInteger(v.breite) && Number.isInteger(v.hoehe) && v.breite >= MIN_GROESSE && v.hoehe >= MIN_GROESSE && v.breite <= MAX_GROESSE && v.hoehe <= MAX_GROESSE) ? `Größe: ganze Zahlen ${MIN_GROESSE} bis ${MAX_GROESSE}` : null) });
      if (!w) return;
      const hinweis = groessenHinweis(w.breite, w.hoehe, { heapGrenze: heapGrenze() });
      if (hinweis?.stufe === 'zuviel') return dialog({ titel: '⚠ Zu groß für diesen Browser', html: `<p>${esc(hinweis.text)}</p>` });
      if (hinweis?.stufe === 'sehr' && !(await bestaetigen('Sehr große Zone', `<p>${esc(hinweis.text)}</p>`, { ok: 'Trotzdem anlegen' }))) return;
      const basis = zustand.karte ? zustand.layout[zustand.aktivId] : null;
      const position = r && basis && Number.isFinite(r.x) ? { x: basis.x + r.x, y: basis.y + r.y } : null;
      // nur bei großen Zonen: Meldung erst zeichnen lassen, bevor das große Raster entsteht (kleine bleiben synchron –
      // Rauchtest/Skripte lesen die neue Zone direkt nach dem Klick)
      if (hinweis) {
        zustand.meldung('⟳ Zone wird angelegt …');
        await new Promise((f) => setTimeout(f, 30));
      }
      const davor = zustand.aktivId;
      zustand.fuegeZoneHinzu(neueZone(w), undefined, { position });
      zeichner.einpassenMit(davor && davor !== w.id ? [davor] : []); // alte Zone bleibt neben der neuen im Bild
      const lage = zustand.layout[w.id];
      zustand.meldung(`Zone „${w.name}“ angelegt (${w.breite} × ${w.hoehe}, Weltlage ${lage?.x}|${lage?.y}) – die anderen Zonen bleiben im Projekt (🗺 Zonen). Nächstes: Spieler-Start setzen${hinweis ? ` · ${hinweis.stufe === 'gross' ? 'große Zone: Prüfung auf Knopfdruck' : 'sehr groß'}` : ''}`, 'ok');
    },
    /** Lage der aktiven (oder genannten) Zone in der Weltanordnung per Eingabe (6.4) – Überlappung wird abgelehnt */
    async zoneLage(id = zustand.aktivId) {
      const k = zustand.zonen.get(id)?.karte;
      if (!k) return;
      const p = zustand.layout[id] ?? { x: 0, y: 0 };
      const andere = [...zustand.zonen.keys()].filter((z) => z !== id && zustand.layout[z]).map((z) => `${esc(zustand.zonen.get(z).karte.name)}: x ${zustand.layout[z].x}, y ${zustand.layout[z].y} (${zustand.zonen.get(z).karte.breite} × ${zustand.zonen.get(z).karte.hoehe})`);
      const w = await formular(`✥ Lage von „${k.name}“`, [
        { name: 'x', label: 'Welt-x (links)', typ: 'zahl', wert: p.x, schritt: 1, pflicht: true },
        { name: 'y', label: 'Welt-y (oben)', typ: 'zahl', wert: p.y, schritt: 1, pflicht: true },
      ], { text: `Linke obere Ecke in Welt-Kacheln (Zone ${k.breite} × ${k.hoehe}). Kante an Kante = Nachbarn (Übergänge vorschlagen), überlappen geht nicht.${andere.length ? `<br>${andere.join('<br>')}` : ''}`, okText: 'Verschieben', pruefe: (v) => {
        const erg = verschiebeZone(zustand.layout, new Map([...zustand.zonen].map(([z, e]) => [z, e.karte])), id, v);
        return erg.ok ? null : `Geht nicht: ${erg.grund}`;
      } });
      if (!w) return;
      const erg = zustand.setzeZonenLage(id, w);
      if (erg.ok) zustand.meldung(`✥ „${k.name}“ liegt jetzt bei ${w.x}|${w.y}`, 'ok');
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
