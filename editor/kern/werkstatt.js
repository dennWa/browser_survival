import { ersetzOps, masseAusGroesse } from './bibliothek.js';

/**
 * Modell-Werkstatt (Editor 2.0, Schritt 5.1) – umgebungsfreie Logik (getestet in tests/werkstatt.test.js).
 * Die Werkstatt (ui/werkstatt.js) bearbeitet eine KOPIE des Modells; Speichern legt eine neue Bibliotheks-Version an
 * (neue Inhalts-ID, Feld `basis` = ID des Originals, `version` = laufende Nummer). Das Original bleibt unverändert.
 *   WerkstattVerlauf   – Undo/Redo der Werkstatt (Schnappschüsse als einfache Objekte, unabhängig vom Karten-Verlauf)
 *   versionsName       – „Kiste“ → „Kiste v2“ (nächste freie Nummer)
 *   neueVersionMeta    – Metadaten der neuen Version (Lizenz/Urheber/Quelle/Ordner/Tags wandern mit)
 *   bodenVersatz       – Verschiebung, damit das Modell auf y = 0 steht; drehpunktVersatz zusätzlich mittig (x/z)
 *   versionOps         – Typen einer Karte auf die neue Version umstellen (optional Größe aus den neuen Maßen)
 */
export const VERLAUF_MAX = 100;

export class WerkstattVerlauf {
  constructor(max = VERLAUF_MAX) {
    this.max = max;
    this.zurueck = [];
    this.vor = [];
  }

  /** Zustand VOR einer Änderung merken (Wiederholen-Liste verfällt) */
  merke(stand) {
    this.zurueck.push(kopie(stand));
    if (this.zurueck.length > this.max) this.zurueck.shift();
    this.vor = [];
  }

  /** @returns Stand, der wiederhergestellt werden soll (oder null) */
  rueckgaengig(aktuell) {
    if (!this.zurueck.length) return null;
    this.vor.push(kopie(aktuell));
    return this.zurueck.pop();
  }

  wiederholen(aktuell) {
    if (!this.vor.length) return null;
    this.zurueck.push(kopie(aktuell));
    return this.vor.pop();
  }

  get kannZurueck() {
    return this.zurueck.length > 0;
  }

  get kannVor() {
    return this.vor.length > 0;
  }

  /** Gibt es ungespeicherte Änderungen (irgendein Schritt zurück möglich)? */
  get geaendert() {
    return this.zurueck.length > 0;
  }
}

const kopie = (x) => JSON.parse(JSON.stringify(x));

/** Grundname ohne „ v3“ */
export const grundName = (name) => String(name ?? '').replace(/\s+v\d+$/i, '').trim() || 'Modell';

/** Nächster freier Versionsname: „Kiste“ + vorhandene [„Kiste“, „Kiste v2“] → { name: „Kiste v3“, version: 3 } */
export function versionsName(name, vorhandene = []) {
  const basis = grundName(name);
  const muster = new RegExp(`^${basis.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:\\s+v(\\d+))?$`, 'i');
  let hoechste = 1;
  for (const n of vorhandene) {
    const t = muster.exec(String(n).trim());
    if (t) hoechste = Math.max(hoechste, Number(t[1] ?? 1));
  }
  return { name: `${basis} v${hoechste + 1}`, version: hoechste + 1 };
}

/**
 * Metadaten der neuen Version. alt = Meta des Originals; neu = { groesse {x,y,z} (m) | masse, dreiecke, animationen, vorschau }.
 * `basis` zeigt immer auf das allererste Original (Versionen einer Familie lassen sich so finden).
 */
export function neueVersionMeta(alt, neu, vorhandeneNamen = []) {
  const { name, version } = versionsName(alt.name, vorhandeneNamen);
  return {
    name,
    version,
    basis: alt.basis || alt.id,
    kategorie: alt.kategorie,
    ordner: alt.ordner,
    tags: [...(alt.tags ?? [])],
    lizenz: alt.lizenz,
    urheber: alt.urheber,
    quelle: alt.quelle,
    masse: neu.masse ?? (neu.groesse ? masseAusGroesse(neu.groesse) : alt.masse),
    dreiecke: neu.dreiecke ?? alt.dreiecke,
    animationen: neu.animationen ?? alt.animationen,
    vorschau: neu.vorschau ?? alt.vorschau,
  };
}

/** Verschiebung (y), damit die Unterkante bei 0 liegt. box = { min {x,y,z}, max {x,y,z} } in Weltkoordinaten */
export const bodenVersatz = (box) => ({ x: 0, y: rund(-box.min.y), z: 0 });

/** Verschiebung, damit der Drehpunkt (Ursprung) unten in der Mitte des Modells liegt */
export const drehpunktVersatz = (box) => ({ x: rund(-(box.min.x + box.max.x) / 2), y: rund(-box.min.y), z: rund(-(box.min.z + box.max.z) / 2) });

const rund = (w) => Math.round(w * 1e5) / 1e5 || 0;

/**
 * Typen einer Karte, die auf altId zeigen, auf die neue Version umstellen (Objekte bleiben stehen).
 * mitGroesse = true → Fußabdruck/Höhe der Typen aus den neuen Maßen (b, h, hoehe3d).
 */
export function versionOps(karte, altId, neuMeta, { mitGroesse = false } = {}) {
  const ops = ersetzOps(karte, altId, neuMeta);
  if (mitGroesse) for (const o of ops) Object.assign(o.neu, { b: neuMeta.masse.b, h: neuMeta.masse.h, hoehe3d: neuMeta.masse.hoehe });
  return ops;
}
