import { KACHELN } from './kacheln.js';
import { RESSOURCEN_OBJEKTE } from './ressourcen.js';
import { blockiertBauwerk, ebeneVon, sichtBlockiertBauwerk } from './bauwerke.js';
import { hoeheAn } from './gelaende.js';
import { bedeckteKacheln, huelle } from './drehung.js';

/** Kollisionsradius (px) eines Baumstamms bzw. Lampenmasts für Fahrzeuge – nur der Stamm, nicht die Krone */
const STAMM_RADIUS = 7;
const LATERNEN_RADIUS = 4;

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
    /** Eigene Objekttypen mit 3D-Modell: { typId: { glbDatei | glb, hoehe3d? } } (nur Anzeige) */
    this.typen = kartenDaten.typen ?? {};
    /** Übergänge in andere Zonen: [{ x, y, b, h, ziel, ankunft, name, px: { x0, y0, x1, y1 } }] (Kacheln + Pixel) */
    this.uebergaenge = kartenDaten.uebergaenge ?? [];
    /** Bemalung des Bodens aus dem Map-Editor (nur Optik): { '#rrggbb': [[x, y, b, h], …] } oder null */
    this.bemalung = kartenDaten.bemalung ?? null;
    /** Gelände-Höhen (Meter je Kachel) aus dem Map-Editor oder null (flach) – Darstellung + Ego-Zielen; Klippen sind 'hang'-Objekte */
    this.hoehen = Array.isArray(kartenDaten.hoehen) && kartenDaten.hoehen.length === this.breite * this.hoehe ? kartenDaten.hoehen : null;
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
    /** Straßenlaternen (Objekt `licht` mit `mast`): [{ id, x, y, radius, objekt }] – Fahrzeuge können sie ab UMFAHR_MIN_KMH umfahren (laternenUmgefahren) */
    this.laternen = findeLaternen(this);
    this.laternenUmgefahren = new Set();
    /** Kachelindex → stehende Hindernisse, die ein Auto bei Tempo umfährt (Bäume + Laternen): [{ typ, id, x, y, radius }] – nur Fußabdruck des Stamms/Masts */
    this.umfahrbarAnKachel = baueUmfahrbare(this);
    this.ressourcenVersion = 0; // steigt bei jeder Änderung (Renderer muss nur dann neu zeichnen)
    /** Von Spielern gebaute Dinge (gemeinsam/welt/bauwerke.js): id → Bauwerk */
    this.bauwerke = new Map();
    /** Kachelindex → { objekt?, boden?, wand?, tuer?, dach? } (Bauwerk-IDs je Ebene, siehe EBENEN in bauwerke.js) */
    this.ebenenAnKachel = new Map();
    this.bauwerkeVersion = 0;
    /** Server: (id, vorhanden) bei jedem Setzen/Entfernen – daraus entstehen die BAUWERKE_AENDERUNG-Pakete (Delta statt ganzer Liste) */
    this.beiBauwerkAenderung = null;
    /** Fahrzeuge blockieren die Kacheln unter sich (gemeinsam/physik/fahrzeug.js → fahrzeugKacheln) */
    this.fahrzeugAnKachel = new Map(); // Kachelindex → Fahrzeug-ID
    this.fahrzeugKachelListe = new Map(); // Fahrzeug-ID → [Kachelindizes]
  }

  // --- Fahrzeuge --------------------------------------------------------------

  /** Belegte Kacheln eines Fahrzeugs setzen (alte werden freigegeben). */
  setzeFahrzeugKacheln(id, kacheln) {
    this.entferneFahrzeugKacheln(id);
    const liste = kacheln.map(({ tx, ty }) => ty * this.breite + tx);
    for (const index of liste) this.fahrzeugAnKachel.set(index, id);
    this.fahrzeugKachelListe.set(id, liste);
  }

  entferneFahrzeugKacheln(id) {
    for (const index of this.fahrzeugKachelListe.get(id) ?? []) if (this.fahrzeugAnKachel.get(index) === id) this.fahrzeugAnKachel.delete(index);
    this.fahrzeugKachelListe.delete(id);
  }

  // --- Bauwerke -------------------------------------------------------------

  #belege(b) {
    const index = b.ty * this.breite + b.tx;
    let ebenen = this.ebenenAnKachel.get(index);
    if (!ebenen) this.ebenenAnKachel.set(index, (ebenen = {}));
    ebenen[ebeneVon(b.typ)] = b.id;
  }

  #raeume(b) {
    const index = b.ty * this.breite + b.tx;
    const ebenen = this.ebenenAnKachel.get(index);
    if (!ebenen) return;
    const ebene = ebeneVon(b.typ);
    if (ebenen[ebene] === b.id) delete ebenen[ebene];
    if (Object.keys(ebenen).length === 0) this.ebenenAnKachel.delete(index);
  }

  /** Neues oder geändertes Bauwerk eintragen. */
  setzeBauwerk(b) {
    const alt = this.bauwerke.get(b.id);
    if (alt) this.#raeume(alt);
    this.bauwerke.set(b.id, b);
    this.#belege(b);
    this.bauwerkeVersion++;
    this.beiBauwerkAenderung?.(b.id, true);
  }

  entferneBauwerk(id) {
    const b = this.bauwerke.get(id);
    if (!b) return;
    this.#raeume(b);
    this.bauwerke.delete(id);
    this.bauwerkeVersion++;
    this.beiBauwerkAenderung?.(id, false);
  }

  /** Client: komplette Liste vom Server übernehmen. */
  uebernimmBauwerke(liste) {
    this.bauwerke.clear();
    this.ebenenAnKachel.clear();
    for (const b of liste) {
      this.bauwerke.set(b.id, b);
      this.#belege(b);
    }
    this.bauwerkeVersion++;
  }

  /** Client: nur die Änderungen (BAUWERKE_AENDERUNG) einarbeiten – ganze Basen wären sonst bei jedem Hammerschlag ein großes Paket. */
  wendeBauwerkAenderungAn(gesetzt, entfernt) {
    for (const id of entfernt) this.entferneBauwerk(id);
    for (const b of gesetzt) this.setzeBauwerk(b);
  }

  /** Bauwerk dieser Ebene (Standard 'objekt') auf der Kachel – oder null. */
  bauwerkBei(tx, ty, ebene = 'objekt') {
    const id = this.ebenenAnKachel.get(ty * this.breite + tx)?.[ebene];
    return id === undefined ? null : (this.bauwerke.get(id) ?? null);
  }

  /** Alle Bauwerke auf der Kachel (jede Ebene). */
  bauwerkeAn(tx, ty) {
    const ebenen = this.ebenenAnKachel.get(ty * this.breite + tx);
    return ebenen ? Object.values(ebenen).map((id) => this.bauwerke.get(id)).filter(Boolean) : [];
  }

  /** Nächstes Bauwerk (Kachelmitte ≤ reichweite px), auf das `passt` zutrifft – oder null. */
  naechstesBauwerk(x, y, reichweite, passt = () => true) {
    const g = this.kachelGroesse;
    let bestes = null;
    let bestAbstand = reichweite;
    for (const b of this.bauwerke.values()) {
      if (!passt(b)) continue;
      const abstand = Math.hypot((b.tx + 0.5) * g - x, (b.ty + 0.5) * g - y);
      if (abstand > bestAbstand) continue;
      bestAbstand = abstand;
      bestes = b;
    }
    return bestes;
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

  istLaterneDa(id) {
    return !this.laternenUmgefahren.has(id);
  }

  setzeLaterne(id, steht) {
    if (steht) this.laternenUmgefahren.delete(id);
    else this.laternenUmgefahren.add(id);
    this.ressourcenVersion++;
  }

  /** Laternen-Zustand aus einer ID-Liste übernehmen (Client). */
  uebernimmLaternen(ids) {
    this.laternenUmgefahren = new Set(ids);
    this.ressourcenVersion++;
  }

  /** Stehende umfahrbare Hindernisse (Baumstamm, Lampenmast), die den Kreis (cx, cy, r) berühren. */
  umfahrbareImKreis(cx, cy, r) {
    if (this.umfahrbarAnKachel.size === 0) return [];
    const g = this.kachelGroesse;
    let treffer = null;
    for (let ty = Math.floor((cy - r) / g) - 1; ty <= Math.floor((cy + r) / g) + 1; ty++) {
      for (let tx = Math.floor((cx - r) / g) - 1; tx <= Math.floor((cx + r) / g) + 1; tx++) {
        const liste = this.umfahrbarAnKachel.get(ty * this.breite + tx);
        if (!liste) continue;
        for (const h of liste) {
          if ((h.typ === 'baum' ? this.abgebaut.has(h.id) : this.laternenUmgefahren.has(h.id)) || Math.hypot(h.x - cx, h.y - cy) > h.radius + r) continue;
          (treffer ??= []).push(h);
        }
      }
    }
    return treffer ?? [];
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
      const r = huelle(o); // frei gedreht: achsparallele Hülle (welt/drehung.js)
      const nx = Math.max(r.x0 * g, Math.min(x, r.x1 * g));
      const ny = Math.max(r.y0 * g, Math.min(y, r.y1 * g));
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

  /** Steht dieser Weltpunkt (px) in einem Gebäude? (Innenraumboden, siehe KACHELN.innen – Türschwellen zählen nicht; oder unter einem selbstgebauten Dach) */
  istInnen(x, y) {
    const tx = Math.floor(x / this.kachelGroesse);
    const ty = Math.floor(y / this.kachelGroesse);
    const zeichen = this.kachelAn(tx, ty);
    if (zeichen !== null && KACHELN[zeichen]?.innen === true) return true;
    // Selbstgebautes Haus: ein Dach über der Kachel zählt als "drinnen"
    return this.ebenenAnKachel.size > 0 && this.ebenenAnKachel.get(ty * this.breite + tx)?.dach !== undefined;
  }

  /**
   * Außerhalb der Karte gilt alles als blockiert (unsichtbare Grenze).
   * @param ignoriereFahrzeug  Fahrzeug-ID, deren eigene Kacheln nicht zählen (das Auto stößt nicht an sich selbst)
   */
  /** Geländehöhe in Weltpixeln (1 m = 1 Kachel = kachelGroesse) an einer Pixelposition – 0 ohne Gelände */
  hoeheBei(x, y) {
    if (!this.hoehen) return 0;
    return hoeheAn(this.hoehen, this.breite, this.hoehe, x / this.kachelGroesse, y / this.kachelGroesse) * this.kachelGroesse;
  }

  istBlockiert(tx, ty, ignoriereFahrzeug = null) {
    const zeichen = this.kachelAn(tx, ty);
    if (zeichen === null) return true;
    if (this.moebelBlockiert.has(ty * this.breite + tx)) return true;
    if (this.fahrzeugAnKachel.size > 0) {
      const fz = this.fahrzeugAnKachel.get(ty * this.breite + tx);
      if (fz !== undefined && fz !== ignoriereFahrzeug) return true;
    }
    if (this.istGeschlosseneTuer(tx, ty)) return true;
    if (this.ebenenAnKachel.size > 0) {
      const e = this.ebenenAnKachel.get(ty * this.breite + tx);
      if (e !== undefined) {
        // Nur diese drei Ebenen können blockieren (Boden & Dach nie)
        if (e.objekt !== undefined && blockiertBauwerk(this.bauwerke.get(e.objekt))) return true;
        if (e.wand !== undefined && blockiertBauwerk(this.bauwerke.get(e.wand))) return true;
        if (e.tuer !== undefined && blockiertBauwerk(this.bauwerke.get(e.tuer))) return true;
      }
    }
    if (this.ressourceAnKachel.size > 0) {
      const id = this.ressourceAnKachel.get(ty * this.breite + tx);
      if (id !== undefined && !this.abgebaut.has(id)) return true;
    }
    return KACHELN[zeichen]?.blockiert ?? true;
  }

  /** Wie istBlockiert, aber nur die Karte selbst (Kachel, Möbel, Bäume/Steine, Türen) – ohne Spielerbauten. Für Flagge, Boden und Dach. */
  istKartenBlockiert(tx, ty) {
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
    if (this.ebenenAnKachel.size > 0) {
      const e = this.ebenenAnKachel.get(ty * this.breite + tx);
      if (e !== undefined) {
        if (e.wand !== undefined && sichtBlockiertBauwerk(this.bauwerke.get(e.wand))) return true;
        if (e.tuer !== undefined && sichtBlockiertBauwerk(this.bauwerke.get(e.tuer))) return true;
      }
    }
    const kachel = KACHELN[zeichen];
    return kachel ? kachel.blockiert && !kachel.sichtFrei : true;
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

/**
 * Ein Möbelstück blockiert jede Kachel, deren Mittelpunkt innerhalb seines Rechtecks liegt – frei gedreht (Rest-Winkel ≠ 0,
 * Map-Editor 5.5) innerhalb des gedrehten Rechtecks (welt/drehung.js). Ressourcen zählen extra.
 */
export function berechneMoebelKollision(objekte, breite) {
  const blockiert = new Set();
  for (const o of objekte) {
    if (!o.blockiert || RESSOURCEN_OBJEKTE[o.typ]) continue;
    for (const index of bedeckteKacheln(o, breite)) blockiert.add(index);
  }
  return blockiert;
}


function findeRessourcen(welt) {
  const g = welt.kachelGroesse;
  const liste = [];
  for (const o of welt.objekte) {
    const def = RESSOURCEN_OBJEKTE[o.typ];
    if (!def) continue;
    const gross = o.groesse === 'gross';
    liste.push({ id: liste.length, typ: o.typ, art: def.art, werkzeug: def.werkzeug, groesse: o.groesse ?? 'klein', x: (o.x + o.b / 2) * g, y: (o.y + o.h / 2) * g, radius: gross ? def.radius * 1.2 : def.radius, objekt: o });
  }
  return liste;
}

function findeLaternen(welt) {
  const g = welt.kachelGroesse;
  const liste = [];
  for (const o of welt.objekte) {
    if (o.typ !== 'licht' || !o.mast) continue;
    liste.push({ id: liste.length, x: (o.x + 0.5) * g, y: (o.y + 0.5) * g, radius: LATERNEN_RADIUS, objekt: o });
  }
  return liste;
}

/** Baumstämme (Ressourcen Baum) und Lampenmasten nach Kachel sortiert, für die Fahrzeug-Kollision */
function baueUmfahrbare(welt) {
  const karte = new Map();
  const g = welt.kachelGroesse;
  const trage = (h) => {
    const index = Math.floor(h.y / g) * welt.breite + Math.floor(h.x / g);
    if (!karte.has(index)) karte.set(index, []);
    karte.get(index).push(h);
  };
  for (const r of welt.ressourcen) if (r.art === 'holz') trage({ typ: 'baum', id: r.id, x: r.x, y: r.y, radius: r.groesse === 'gross' ? STAMM_RADIUS * 1.25 : STAMM_RADIUS });
  for (const l of welt.laternen) trage({ typ: 'laterne', id: l.id, x: l.x, y: l.y, radius: l.radius });
  return karte;
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
