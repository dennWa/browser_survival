import { AKTIONEN, NACHRICHT } from '../../gemeinsam/protokoll.js';
import { BAUTEILE, blockGroesseFuer, fehlendesMaterial, kostenFuer, kostenText } from '../../gemeinsam/basisbau/teile.js';
import { darfAbreissen } from '../../gemeinsam/basisbau/rechte.js';
import { Territorium } from '../../gemeinsam/basisbau/territorium.js';
import { findeAbrissZiel, snappe } from '../../gemeinsam/basisbau/platzierung.js';
import { BAUWERKE, kachelInReichweite } from '../../gemeinsam/welt/bauwerke.js';
import { BAU_REICHWEITE_BASIS } from '../../gemeinsam/basisbau/teile.js';

/**
 * Bau-Modus (Client): BUILD-Knopf/Taste B → Hammer in die Hand, Bau-Menü auf, Hologramm folgt Maus bzw. Blickrichtung.
 * Hologramm grün = baubar, rot = blockiert/außerhalb des Gebiets/Material fehlt (dieselben Regeln wie der Server:
 * gemeinsam/basisbau/platzierung.js). Linksklick (Touch: rechter Stick ganz drücken oder ✓) baut, Rechtsklick löst die
 * Auswahl. Abreißen ist ein Werkzeug im Menü (Taste X): Markierung auf dem Bauteil unter dem Zeiger, Klick reißt es ab.
 *
 * Der Server entscheidet alles (AKTION bauen/abreissen) – hier nur Anzeige und Wünsche. Der rote Gebietsring ist rein
 * clientseitig: der Server schickt das Gebiet nur seinem Besitzer (SPIELER_DATEN.flagge), gezeigt wird er nur mit
 * Hammer in der Hand und per Taste V ein-/ausblendbar.
 */
const WIEDERHOL_MS = 140; // gehaltene Maustaste: so oft darf nachgebaut werden (nur auf einer neuen Kachel)
const TOUCH_ZIEL_ABSTAND = 56; // ohne Maus: Hologramm so weit vor der Figur

export class BauModus {
  /**
   * @param o.kontext  () → { daten (SPIELER_DATEN), lokal ({x,y,blick}), name, defs (Item-Definitionen), eigeneDaten }
   * @param o.senden   Nachricht an den Server
   * @param o.vorBeginn Rückruf, bevor der Modus startet (andere Platzier-Modi beenden)
   */
  constructor({ welt, renderer, eingabe, hud, sound, senden, kontext, vorBeginn = () => {} }) {
    Object.assign(this, { welt, renderer, eingabe, hud, sound });
    this.senden = senden;
    this.kontext = kontext;
    this.vorBeginn = vorBeginn;
    this.aktiv = false;
    this.auswahl = null; // Bauteil-ID | 'abriss' | null
    this.drehung = null; // null = automatisch, sonst 0/1 (Taste R)
    this.radiusSichtbar = true;
    this.territorium = new Territorium(); // enthält nur die eigene Flagge
    this.ziel = null; // letztes Prüfergebnis { tx, ty, ok, grund?, drehung, ... }
    this.vorherAusgeruestet = null;
    this.letzterBau = { schluessel: '', zeit: 0 };
    this.klickVorher = false;
    this.klickGesperrt = false; // nach dem Setzen der Flagge: gehaltene Maustaste baut nicht gleich weiter
    this.ringStand = '';
    this.hud.bauMenue.beiAktion((art, wert) => this.#menueAktion(art, wert));
  }

  get name() {
    const k = this.kontext();
    return k.eigeneDaten?.name ?? k.name;
  }

  hatFlagge() {
    return this.territorium.von(this.name) !== null;
  }

  // --- Modus an/aus ------------------------------------------------------------

  umschalten(an = !this.aktiv) {
    const { daten } = this.kontext();
    if (an === this.aktiv) return;
    if (!an) return this.#beenden();
    if (!daten || daten.tot) return;
    if (this.kontext().lokal.fahrzeug) return this.hud.meldung('Im Auto kannst du nicht bauen');
    const slot = this.#hammerSlot(daten);
    if (slot < 0) return this.hud.meldung('Du brauchst einen Hammer – im Inventar (I) unter „Bauen“ herstellen: 2 Holz + 2 Stein');
    this.vorBeginn();
    this.aktiv = true;
    this.auswahl = this.hatFlagge() ? null : 'flagge';
    this.hud.bauMenue.setzeKategorie(this.hatFlagge() ? 'Struktur' : 'Basis');
    this.drehung = null;
    this.vorherAusgeruestet = daten.ausgeruestet !== slot ? daten.ausgeruestet : null;
    if (daten.ausgeruestet !== slot) this.senden({ typ: NACHRICHT.AKTION, art: AKTIONEN.BENUTZEN, slot }); // Hammer in die Hand
    this.hud.inventar.zeige(false);
    this.hud.bauMenue.zeige(true);
    this.hud.markiereBauen(true);
    if (!this.hatFlagge()) this.hud.meldung('Setze zuerst deine Basis-Flagge – sie legt dein Baugebiet fest');
  }

  /**
   * Ein Schnellleisten-Platz wurde gewählt: eine andere Waffe/ein anderes Item beendet den Bau-Modus (ohne den Hammer zurückzutauschen).
   * @returns true, wenn die Wahl hier erledigt ist (Hammer ist schon in der Hand – kein Abrüsten per Toggle)
   */
  beiWaffenwahl(slot) {
    if (!this.aktiv) return false;
    const { daten } = this.kontext();
    if (daten?.inventar[slot]?.defId !== 'hammer') {
      this.#beenden(false);
      return false;
    }
    return daten.ausgeruestet === slot;
  }

  #beenden(waffeZurueck = true) {
    const { daten } = this.kontext();
    if (waffeZurueck && this.vorherAusgeruestet !== null && daten && daten.ausgeruestet === this.#hammerSlot(daten) && daten.inventar[this.vorherAusgeruestet]) {
      this.senden({ typ: NACHRICHT.AKTION, art: AKTIONEN.BENUTZEN, slot: this.vorherAusgeruestet }); // vorige Waffe wieder in die Hand
    }
    this.aktiv = false;
    this.auswahl = null;
    this.ziel = null;
    this.vorherAusgeruestet = null;
    this.hud.bauMenue.zeige(false);
    this.hud.markiereBauen(false);
    this.renderer.zeigeVorschau(null);
    this.renderer.zeigeGebietVorschau(null);
  }

  /** Sitzung endet / Zone wechselt. */
  stoppen() {
    if (this.aktiv) this.#beenden(false);
    this.renderer.zeigeGebiet(null);
    this.ringStand = '';
  }

  // --- Auswahl & Werkzeuge --------------------------------------------------------

  waehle(id) {
    const hatFlagge = this.hatFlagge();
    if (id === 'abriss') {
      if (!hatFlagge) return this.hud.meldung('Ohne Basis gibt es nichts abzureißen');
      this.auswahl = this.auswahl === 'abriss' ? null : 'abriss';
    } else {
      const teil = BAUTEILE[id];
      if (!teil) return;
      if (teil.art === 'flagge' && hatFlagge) return this.hud.meldung('Du hast schon eine Basis-Flagge');
      if (teil.art !== 'flagge' && !hatFlagge) {
        this.auswahl = 'flagge';
        return this.hud.meldung('Setze zuerst deine Basis-Flagge');
      }
      this.auswahl = this.auswahl === id ? null : id;
    }
    this.drehung = null;
  }

  abrissModus() {
    if (this.aktiv) this.waehle('abriss');
  }

  drehen() {
    if (!this.aktiv || !this.auswahl || this.auswahl === 'abriss' || !BAUTEILE[this.auswahl]?.ausrichtung) return;
    this.drehung = 1 - (this.ziel?.drehung ?? this.drehung ?? 0);
  }

  radiusUmschalten() {
    if (!this.hatFlagge()) return this.hud.meldung('Du hast noch kein Baugebiet');
    this.radiusSichtbar = !this.radiusSichtbar;
    this.hud.meldung(this.radiusSichtbar ? 'Baugebiet sichtbar' : 'Baugebiet ausgeblendet');
  }

  /** Rechtsklick: Auswahl lösen. @returns true, wenn etwas gelöst wurde */
  abbrechen() {
    if (!this.aktiv || !this.auswahl) return false;
    this.auswahl = null;
    this.drehung = null;
    return true;
  }

  #menueAktion(art, wert) {
    switch (art) {
      case 'waehle':
        return this.waehle(wert);
      case 'abriss':
        return this.waehle('abriss');
      case 'drehen':
        return this.drehen();
      case 'radius':
        return this.radiusUmschalten();
      case 'bauen':
        return this.bestaetige();
      case 'schliessen':
        return this.umschalten(false);
    }
  }

  // --- Bauen -------------------------------------------------------------------------

  /** Klick / ✓: das Hologramm bauen bzw. die Markierung abreißen. */
  bestaetige() {
    if (!this.aktiv || !this.auswahl) return;
    const z = this.ziel;
    if (!z) return;
    if (!z.ok) {
      this.sound?.spiele('leer', { tonhoehe: 0.7 });
      if (z.grund) this.hud.meldung(z.grund);
      return;
    }
    this.letzterBau = { schluessel: `${z.tx},${z.ty}`, zeit: performance.now() };
    if (this.auswahl === 'abriss') this.senden({ typ: NACHRICHT.AKTION, art: AKTIONEN.ABREISSEN, tx: z.tx, ty: z.ty, ebene: z.ebene });
    else this.senden({ typ: NACHRICHT.AKTION, art: AKTIONEN.BAUEN, teil: this.auswahl, tx: z.tx, ty: z.ty, drehung: this.drehung });
  }

  /**
   * Pro festem Tick: Klicks auswerten. Linksklick baut, gehaltene Taste baut weiter, aber nur auf einer NEUEN Kachel
   * (sonst gäbe es lauter "steht schon etwas"-Meldungen).
   * @returns true, wenn der Klick verbraucht wurde (kein Angriff!)
   */
  takt(klick) {
    if (!this.aktiv) return false;
    const neuerKlick = klick && !this.klickVorher;
    this.klickVorher = klick;
    if (!klick) this.klickGesperrt = false;
    if (klick && !this.klickGesperrt) {
      const z = this.ziel;
      const neueKachel = z && `${z.tx},${z.ty}` !== this.letzterBau.schluessel;
      if (neuerKlick || (z?.ok && neueKachel && performance.now() - this.letzterBau.zeit > WIEDERHOL_MS)) this.bestaetige();
    }
    return true;
  }

  // --- Anzeige pro Frame ------------------------------------------------------------

  beiSpielerDaten(daten) {
    const hatteFlagge = this.hatFlagge();
    this.territorium.setzeNurEigene(daten.flagge ? { besitzer: this.name, tx: daten.flagge.tx, ty: daten.flagge.ty, radius: daten.flagge.radius, mitglieder: {} } : null);
    if (this.aktiv && daten.tot) this.umschalten(false);
    // Flagge steht → gleich zu den Bauteilen weiter (Boden vorgewählt)
    if (this.aktiv && !hatteFlagge && this.hatFlagge()) {
      this.hud.bauMenue.setzeKategorie('Struktur');
      if (this.auswahl === 'flagge') this.auswahl = 'holzboden';
      this.klickGesperrt = this.klickVorher;
    }
  }

  /** Jeden Frame: Ziel prüfen, Hologramm + Ringe + Menü aktualisieren. */
  aktualisiere() {
    const { daten, lokal, defs } = this.kontext();
    if (!daten) return;
    const hammer = this.#hammerInHand(daten);
    // Gebiets-Ring: nur mit Hammer in der Hand und wenn nicht ausgeblendet (V)
    const flagge = daten.flagge;
    const ringStand = flagge && hammer && this.radiusSichtbar ? `${flagge.tx},${flagge.ty},${flagge.radius}` : '';
    if (ringStand !== this.ringStand) {
      this.ringStand = ringStand;
      this.renderer.zeigeGebiet(ringStand ? flagge : null);
    }
    if (!this.aktiv) return;

    this.ziel = hammer ? this.#pruefeZiel(daten, lokal) : null;
    const z = this.ziel;
    if (!this.auswahl || !z || (this.auswahl === 'abriss' && !z.ziel)) {
      this.renderer.zeigeVorschau(null);
      this.renderer.zeigeGebietVorschau(null);
    } else if (this.auswahl === 'abriss') {
      this.renderer.zeigeVorschau({ typ: 'abriss', tx: z.tx, ty: z.ty, ok: z.ok, ziel: z.ziel });
    } else {
      this.renderer.zeigeVorschau({ typ: this.auswahl, tx: z.tx, ty: z.ty, ok: z.ok, drehung: z.drehung, groesse: blockGroesseFuer(this.auswahl, daten.bauBlock ?? 1) });
      this.renderer.zeigeGebietVorschau(this.auswahl === 'flagge' ? { tx: z.tx, ty: z.ty, radius: daten.bauRadius ?? 15, ok: z.ok } : null);
    }
    this.hud.bauMenue.aktualisiere({
      auswahl: this.auswahl,
      hatFlagge: this.hatFlagge(),
      inventar: daten.inventar,
      itemName: (defId) => defs[defId]?.name ?? defId,
      radiusAn: this.radiusSichtbar,
      statusText: this.#statusText(daten, hammer, z),
      istTouch: this.eingabe.touch.istTouchGeraet,
      blockGroesse: daten.bauBlock ?? 1,
    });
  }

  #statusText(daten, hammer, z) {
    if (!hammer) return '⚠ Hammer nicht in der Hand';
    if (!this.auswahl) return daten.flagge ? `Baugebiet: ${daten.flagge.radius} m um deine Flagge` : 'Wähle die Basis-Flagge';
    if (z && !z.ok && z.grund) return `✕ ${z.grund}`;
    if (this.auswahl === 'abriss') return z?.ziel ? `Abreißen: ${BAUWERKE[z.ziel].name}` : 'Zeige auf ein eigenes Bauteil';
    const teil = BAUTEILE[this.auswahl];
    return `${teil.name} · ${kostenText(kostenFuer(this.auswahl, daten.bauBlock ?? 1), (id) => this.kontext().defs[id]?.name ?? id)}`;
  }

  #zielpunkt(lokal) {
    const maus = this.eingabe.mausBenutzt && this.eingabe.mausZeit >= this.eingabe.touch.letzteBenutzung;
    const punkt = maus ? this.renderer.kamera.bildschirmZuBoden(this.eingabe.mausX, this.eingabe.mausY) : null;
    return punkt ?? { x: lokal.x + Math.cos(lokal.blick) * TOUCH_ZIEL_ABSTAND, y: lokal.y + Math.sin(lokal.blick) * TOUCH_ZIEL_ABSTAND };
  }

  /** Kachel unter dem Zeiger prüfen – gleiche Regeln wie der Server, plus Material und "Da stehst du selbst". */
  #pruefeZiel(daten, lokal) {
    if (!this.auswahl) return null;
    const welt = this.welt;
    const g = welt.kachelGroesse;
    const punkt = this.#zielpunkt(lokal);
    const name = this.name;

    if (this.auswahl === 'abriss') {
      const tx = Math.floor(punkt.x / g);
      const ty = Math.floor(punkt.y / g);
      const b = findeAbrissZiel(welt, tx, ty);
      if (!b) return { tx, ty, ok: false, ziel: null };
      const flaggeDort = this.territorium.gebietBei(tx, ty);
      if (b.besitzer && !darfAbreissen(b, name, flaggeDort)) return { tx, ty, ok: false, ziel: b.typ, ebene: undefined, grund: `Gehört ${b.besitzer}` };
      if (!kachelInReichweite(welt, lokal.x, lokal.y, tx, ty, BAU_REICHWEITE_BASIS)) return { tx, ty, ok: false, ziel: b.typ, grund: 'Zu weit weg' };
      return { tx, ty, ok: true, ziel: b.typ };
    }

    const kontext = { territorium: this.territorium, name, spieler: { x: lokal.x, y: lokal.y }, blockGroesse: daten.bauBlock ?? 1 };
    const ergebnis = snappe(welt, this.auswahl, punkt.x, punkt.y, kontext, this.drehung);
    if (ergebnis.ok) {
      const teil = BAUTEILE[this.auswahl];
      const fehlt = fehlendesMaterial(daten.inventar, kostenFuer(this.auswahl, daten.bauBlock ?? 1));
      if (fehlt.length > 0) {
        ergebnis.ok = false;
        ergebnis.grund = `Es fehlt: ${fehlt.map((f) => `${f.fehlt}× ${this.kontext().defs[f.defId]?.name ?? f.defId}`).join(', ')}`;
      } else if (teil.art === 'bauwerk' && BAUWERKE[this.auswahl].blockiert) {
        const r = 12;
        const n = blockGroesseFuer(this.auswahl, daten.bauBlock ?? 1);
        const { tx, ty } = ergebnis;
        if (lokal.x + r > tx * g && lokal.x - r < (tx + n) * g && lokal.y + r > ty * g && lokal.y - r < (ty + n) * g) {
          ergebnis.ok = false;
          ergebnis.grund = 'Da stehst du selbst';
        }
      }
    }
    return ergebnis;
  }

  #hammerSlot(daten) {
    return daten.inventar.findIndex((e) => e?.defId === 'hammer');
  }

  #hammerInHand(daten) {
    return daten.ausgeruestet !== null && daten.inventar[daten.ausgeruestet]?.defId === 'hammer';
  }
}
