import { KACHELN } from './kacheln.js';
import { RESSOURCEN_OBJEKTE } from './ressourcen.js';

/**
 * Laufzeit-Abbild einer Karte: Kachelabfragen und Kollision.
 * Wird auf dem Server (autoritativ) und im Client (Vorhersage + Darstellung) aus denselben
 * Kartendaten erzeugt – deshalb liefern beide identische Ergebnisse.
 *
 * Kartendaten-Format (vom Server beim Login geschickt):
 *   { id, name, breite, hoehe, kachelGroesse, kacheln: string[], raeume: [{ id, name, x, y }],
 *     objekte: [{ typ, x, y, b, h, blockiert?, ebene?, drehung? }] }   (Objekte in Kachelkoordinaten)
 *
 * Türen: Jede Gruppe nebeneinanderliegender 'T'-Kacheln ist EINE Tür (Doppeltür = 2 Kacheln). Die Liste
 * `tueren` wird aus den Kacheln berechnet – Server und Client bekommen dieselben IDs. Geschlossene Türen
 * blockieren Bewegung, Sicht und Schüsse. Standard: alle offen; den Zustand setzt der Server (setzeTuer).
 *
 * Ressourcen: Bäume und Steine (RESSOURCEN_OBJEKTE) sind abbaubar → `ressourcen` mit fester ID (Reihenfolge
 * in `objekte`). Abgebaute Knoten (`abgebaut`) sind weg, bis sie nachwachsen; Steine blockieren nur, solange sie da sind.
 */
export class Welt {
  constructor(kartenDaten) {
    this.id = kartenDaten.id;
    this.name = kartenDaten.name;
    this.breite = kartenDaten.breite;
    this.hoehe = kartenDaten.hoehe;
    this.kachelGroesse = kartenDaten.kachelGroesse;
    this.zeilen = kartenDaten.kacheln;
    this.raeume = kartenDaten.raeume ?? [];
    this.objekte = kartenDaten.objekte ?? [];
    /** Kachelindizes (ty * breite + tx), die durch Möbel blockiert sind */
    this.moebelBlockiert = berechneMoebelKollision(this.objekte, this.breite);
    /** [{ id, kacheln: [{ tx, ty }], senkrecht, x, y }]  senkrecht = Tür in einer Nord-Süd-Wand; x/y = Mitte (Weltpixel) */
    this.tueren = findeTueren(this);
    this.tuerAnKachel = new Map(); // Kachelindex → Tür-ID
    for (const tuer of this.tueren) for (const { tx, ty } of tuer.kacheln) this.tuerAnKachel.set(ty * this.breite + tx, tuer.id);
    this.geschlosseneTueren = new Set();
    /** [{ id, typ, art, werkzeug, x, y, radius, objekt }]  x/y = Mitte in Weltpixeln */
    this.ressourcen = findeRessourcen(this);
    this.ressourceAnKachel = new Map(); // Kachelindex → Ressourcen-ID (nur blockierende, z. B. Steine)
    for (const r of this.ressourcen) {
      if (!RESSOURCEN_OBJEKTE[r.typ].blockiert) continue;
      for (const index of bedeckteKacheln(r.objekt, this.breite)) this.ressourceAnKachel.set(index, r.id);
    }
    this.abgebaut = new Set();
    this.ressourcenVersion = 0; // steigt bei jeder Änderung (Renderer muss nur dann neu zeichnen)
  }

  istRessourceDa(id) {
    return !this.abgebaut.has(id);
  }

  setzeRessource(id, da) {
    if (da) this.abgebaut.delete(id);
    else this.abgebaut.add(id);
    this.ressourcenVersion++;
  }

  /** Nächster vorhandener Knoten, dessen Rand höchstens `reichweite` px entfernt ist – oder null. */
  naechsteRessource(x, y, reichweite) {
    let beste = null;
    let bestAbstand = reichweite;
    for (const r of this.ressourcen) {
      if (this.abgebaut.has(r.id)) continue;
      const abstand = Math.hypot(r.x - x, r.y - y) - r.radius;
      if (abstand <= bestAbstand) {
        beste = r;
        bestAbstand = abstand;
      }
    }
    return beste;
  }

  /** Zustand aus einer Liste abgebauter IDs übernehmen (Client: Nachricht vom Server). */
  uebernimmAbgebaute(ids) {
    this.abgebaut = new Set(ids);
    this.ressourcenVersion++;
  }

  istTuerOffen(id) {
    return !this.geschlosseneTueren.has(id);
  }

  setzeTuer(id, offen) {
    if (offen) this.geschlosseneTueren.delete(id);
    else this.geschlosseneTueren.add(id);
  }

  /** Tür-ID an dieser Kachel oder undefined. */
  tuerBei(tx, ty) {
    return this.tuerAnKachel.get(ty * this.breite + tx);
  }

  /** Nächste Tür, deren Kante höchstens `reichweite` px von (x, y) entfernt ist – oder null. */
  naechsteTuer(x, y, reichweite) {
    const g = this.kachelGroesse;
    let beste = null;
    let bestAbstand = reichweite;
    for (const tuer of this.tueren) {
      for (const { tx, ty } of tuer.kacheln) {
        const nx = Math.max(tx * g, Math.min(x, (tx + 1) * g));
        const ny = Math.max(ty * g, Math.min(y, (ty + 1) * g));
        const abstand = Math.hypot(x - nx, y - ny);
        if (abstand <= bestAbstand) {
          beste = tuer;
          bestAbstand = abstand;
        }
      }
    }
    return beste;
  }

  /**
   * Nächstes Kartenobjekt, für das `passt(objekt)` gilt und dessen Rand höchstens `reichweite` px entfernt ist.
   * @returns { objekt, x, y } (x/y = Mitte in Weltpixeln) oder null
   */
  naechstesObjekt(x, y, reichweite, passt) {
    const g = this.kachelGroesse;
    let bestes = null;
    let bestAbstand = reichweite;
    for (const o of this.objekte) {
      if (!passt(o)) continue;
      const nx = Math.max(o.x * g, Math.min(x, (o.x + o.b) * g));
      const ny = Math.max(o.y * g, Math.min(y, (o.y + o.h) * g));
      const abstand = Math.hypot(x - nx, y - ny);
      if (abstand > bestAbstand) continue;
      bestAbstand = abstand;
      bestes = { objekt: o, x: (o.x + o.b / 2) * g, y: (o.y + o.h / 2) * g };
    }
    return bestes;
  }

  /** IDs aller offenen Türen (für Netzwerk & Tests). */
  offeneTueren() {
    return this.tueren.filter((t) => this.istTuerOffen(t.id)).map((t) => t.id);
  }

  /** Zustand aus einer Liste offener Tür-IDs übernehmen (Client: Nachricht vom Server). */
  uebernimmOffeneTueren(offen) {
    const menge = new Set(offen);
    for (const t of this.tueren) this.setzeTuer(t.id, menge.has(t.id));
  }

  /** Liegt hier eine geschlossene Tür? */
  istGeschlosseneTuer(tx, ty) {
    if (this.geschlosseneTueren.size === 0) return false;
    const id = this.tuerAnKachel.get(ty * this.breite + tx);
    return id !== undefined && this.geschlosseneTueren.has(id);
  }

  get pixelBreite() {
    return this.breite * this.kachelGroesse;
  }

  get pixelHoehe() {
    return this.hoehe * this.kachelGroesse;
  }

  /** Zeichen der Kachel an Kachelkoordinate (tx, ty) oder null außerhalb der Karte. */
  kachelAn(tx, ty) {
    if (tx < 0 || ty < 0 || tx >= this.breite || ty >= this.hoehe) return null;
    return this.zeilen[ty][tx];
  }

  /** Steht dieser Weltpunkt (px) in einem Gebäude? (Innenraumboden, siehe KACHELN.innen – Türschwellen zählen nicht) */
  istInnen(x, y) {
    const zeichen = this.kachelAn(Math.floor(x / this.kachelGroesse), Math.floor(y / this.kachelGroesse));
    return zeichen !== null && KACHELN[zeichen]?.innen === true;
  }

  /** Außerhalb der Karte gilt alles als blockiert (unsichtbare Grenze). */
  istBlockiert(tx, ty) {
    const zeichen = this.kachelAn(tx, ty);
    if (zeichen === null) return true;
    if (this.moebelBlockiert.has(ty * this.breite + tx)) return true;
    if (this.istGeschlosseneTuer(tx, ty)) return true;
    if (this.ressourceAnKachel.size > 0) {
      const id = this.ressourceAnKachel.get(ty * this.breite + tx);
      if (id !== undefined && !this.abgebaut.has(id)) return true;
    }
    return KACHELN[zeichen]?.blockiert ?? true;
  }

  /**
   * Blockiert diese Kachel Sicht und Schüsse? Wände, Fenster und geschlossene Türen – über Möbel kann man
   * hinwegsehen und -schießen. Außerhalb der Karte: ja.
   */
  istSichtBlockiert(tx, ty) {
    const zeichen = this.kachelAn(tx, ty);
    if (zeichen === null) return true;
    if (this.istGeschlosseneTuer(tx, ty)) return true;
    return KACHELN[zeichen]?.blockiert ?? true;
  }

  /** Prüft, ob ein Rechteck (Weltpixel) irgendeine blockierte Kachel berührt. */
  istBereichBlockiert(links, oben, rechts, unten) {
    const g = this.kachelGroesse;
    const tx0 = Math.floor(links / g);
    const tx1 = Math.floor(rechts / g);
    const ty0 = Math.floor(oben / g);
    const ty1 = Math.floor(unten / g);
    for (let ty = ty0; ty <= ty1; ty++) {
      for (let tx = tx0; tx <= tx1; tx++) {
        if (this.istBlockiert(tx, ty)) return true;
      }
    }
    return false;
  }
}

/** Ein Möbelstück blockiert jede Kachel, deren Mittelpunkt innerhalb seines Rechtecks liegt. Ressourcen zählen extra. */
export function berechneMoebelKollision(objekte, breite) {
  const blockiert = new Set();
  for (const o of objekte) {
    if (!o.blockiert || RESSOURCEN_OBJEKTE[o.typ]) continue;
    for (const index of bedeckteKacheln(o, breite)) blockiert.add(index);
  }
  return blockiert;
}

/** Kachelindizes, deren Mittelpunkt im Rechteck des Objekts liegt. */
function bedeckteKacheln(o, breite) {
  const ergebnis = [];
  for (let ty = Math.floor(o.y); ty < Math.ceil(o.y + o.h); ty++) {
    for (let tx = Math.floor(o.x); tx < Math.ceil(o.x + o.b); tx++) {
      const mx = tx + 0.5;
      const my = ty + 0.5;
      if (mx > o.x && mx < o.x + o.b && my > o.y && my < o.y + o.h) ergebnis.push(ty * breite + tx);
    }
  }
  return ergebnis;
}

function findeRessourcen(welt) {
  const g = welt.kachelGroesse;
  const liste = [];
  for (const o of welt.objekte) {
    const def = RESSOURCEN_OBJEKTE[o.typ];
    if (!def) continue;
    liste.push({ id: liste.length, typ: o.typ, art: def.art, werkzeug: def.werkzeug, x: (o.x + o.b / 2) * g, y: (o.y + o.h / 2) * g, radius: def.radius, objekt: o });
  }
  return liste;
}

/** Gruppen zusammenhängender Tür-Kacheln (waagerecht oder senkrecht nebeneinander) → Türen mit fester ID. */
function findeTueren(welt) {
  const g = welt.kachelGroesse;
  const istTuer = (tx, ty) => welt.kachelAn(tx, ty) === 'T';
  const gesehen = new Set();
  const tueren = [];
  for (let ty = 0; ty < welt.hoehe; ty++) {
    for (let tx = 0; tx < welt.breite; tx++) {
      if (!istTuer(tx, ty) || gesehen.has(ty * welt.breite + tx)) continue;
      // Richtung: geht die Tür nach rechts weiter → waagerechte Gruppe, sonst nach unten
      const waagerechteGruppe = istTuer(tx + 1, ty);
      const kacheln = [];
      for (let x = tx, y = ty; istTuer(x, y) && kacheln.length < 4; waagerechteGruppe ? x++ : y++) {
        kacheln.push({ tx: x, ty: y });
        gesehen.add(y * welt.breite + x);
      }
      // Liegt die Tür in einer Nord-Süd-Wand? (Wand/Fenster oben oder unten, Durchgang links-rechts)
      const ende = kacheln[kacheln.length - 1];
      const wandig = (x, y) => welt.kachelAn(x, y) === '#' || welt.kachelAn(x, y) === 'F';
      const senkrecht = kacheln.length > 1 ? !waagerechteGruppe : wandig(tx, ty - 1) || wandig(ende.tx, ende.ty + 1);
      tueren.push({
        id: tueren.length,
        kacheln,
        senkrecht,
        x: ((tx + ende.tx + 1) / 2) * g,
        y: ((ty + ende.ty + 1) / 2) * g,
      });
    }
  }
  return tueren;
}
