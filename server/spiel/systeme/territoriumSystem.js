import { Territorium, pruefeFlaggenPlatz } from '../../../gemeinsam/basisbau/territorium.js';
import { hatRecht } from '../../../gemeinsam/basisbau/rechte.js';

/**
 * Territorium (Server): Basis-Flaggen setzen/entfernen, Radius, Gebiets-Abfragen, Speichern/Laden.
 * Die Daten halten die Zone (spielWelt.territorium, Klasse Territorium) – dieses Modul ist die Logik drumherum.
 *
 * Regeln (siehe auch gemeinsam/basisbau/territorium.js → pruefeFlaggenPlatz):
 *   - jeder Spieler hat höchstens EINE Flagge (über alle Zonen: spieler.flaggeKarte merkt die Zone, wird im Spielstand gespeichert)
 *   - die Flagge verschwindet nach dem Setzen – übrig bleibt der Baukreis (nur dem Besitzer als roter Ring gezeigt)
 *   - Radius: konfiguration.basisbau.radiusKacheln + radiusZuschlag() – der Haken für spätere Skillpunkte
 */

/** Haken für Erweiterungen (Skills, Upgrades): zusätzliche Kacheln Radius für diesen Spieler. */
export function radiusZuschlag(/* spieler, konfiguration */) {
  return 0;
}

export function radiusFuer(spieler, konfiguration) {
  return konfiguration.basisbau.radiusKacheln + radiusZuschlag(spieler, konfiguration);
}

export function erzeugeTerritorium() {
  return new Territorium();
}

/** Optionen für pruefeFlaggenPlatz aus der Konfiguration. */
export function flaggenOptionen(konfiguration) {
  return { freiraum: konfiguration.basisbau.flaggeFreiraum, mindestAbstand: konfiguration.basisbau.flaggeMindestAbstand };
}

/**
 * Basis-Flagge für `spieler` auf Kachel (tx, ty) setzen. Die Reichweiten-/Hammer-Prüfung macht der Aufrufer (basisbauSystem).
 * @returns {boolean} gesetzt?
 */
export function setzeFlagge(spielWelt, spieler, tx, ty) {
  const t = spielWelt.territorium;
  const karte = spielWelt.karte.daten.id;
  // Flagge in einer ANDEREN Zone → keine zweite. (Steht im Spielstand, aber hier nicht mehr in der Welt: gilt als verloren.)
  if (spieler.flaggeKarte && spieler.flaggeKarte !== karte) {
    spielWelt.melde(spieler.id, 'Du hast schon eine Basis-Flagge in einer anderen Zone');
    return false;
  }
  if (spieler.flaggeKarte === karte && !t.von(spieler.name)) spieler.flaggeKarte = null;
  const platz = pruefeFlaggenPlatz(spielWelt.welt, t, tx, ty, spieler.name, flaggenOptionen(spielWelt.konfiguration));
  if (!platz.ok) {
    spielWelt.melde(spieler.id, platz.grund);
    return false;
  }
  t.setze({ besitzer: spieler.name, tx, ty, radius: radiusFuer(spieler, spielWelt.konfiguration), mitglieder: {} });
  spieler.flaggeKarte = karte;
  const g = spielWelt.welt.kachelGroesse;
  spielWelt.ereignis({ typ: 'gebaut', bauwerk: 'flagge', x: (tx + 0.5) * g, y: (ty + 0.5) * g, von: spieler.id });
  spielWelt.melde(spieler.id, `Basis gegründet – du darfst im Umkreis von ${t.von(spieler.name).radius} m bauen`);
  return true;
}

/**
 * Flagge eines Spielers zurücknehmen (Admin-Befehl FLAGGE_ENTFERNEN, später evtl. Spieler-Funktion). Bauteile bleiben stehen.
 * Setzt auch den Vermerk "Flagge in Zone X" zurück (z. B. wenn die Welt-Datei der Zone verloren ging).
 * @returns true, wenn in dieser Zone eine Flagge stand
 */
export function entferneFlagge(spielWelt, spieler) {
  const hatte = spielWelt.territorium.von(spieler.name) !== null;
  spielWelt.territorium.entferne(spieler.name);
  spieler.flaggeKarte = null;
  return hatte;
}

/** Neuen Radius setzen (Skill-Upgrade) – wirkt sofort, auch auf schon gebaute Teile am Rand. */
export function setzeRadius(spielWelt, besitzer, radiusKacheln) {
  const f = spielWelt.territorium.von(besitzer);
  if (!f) return false;
  spielWelt.territorium.setze({ ...f, radius: radiusKacheln });
  return true;
}

/** Flagge, in deren Gebiet die Kachel liegt (oder null) – für Rechteprüfungen. */
export function gebietBei(spielWelt, tx, ty) {
  return spielWelt.territorium.gebietBei(tx, ty);
}

/**
 * Flagge, nach der sich die Rechte für ein bestehendes Bauteil richten: die des Bauteil-Besitzers, solange sie die Kachel noch abdeckt
 * (sonst könnte eine später daneben gesetzte fremde Flagge in der Überlappung Abriss-/Benutzungsrechte an fremden Bauten erben),
 * andernfalls das Gebiet der Kachel.
 */
export function flaggeFuerBauteil(spielWelt, b) {
  const t = spielWelt.territorium;
  const eigene = t.von(b.besitzer);
  return eigene && t.enthaelt(eigene, b.tx, b.ty) ? eigene : t.gebietBei(b.tx, b.ty);
}

/** Darf `name` auf dieser Kachel das Recht `recht` ausüben? (herrenloses Gebiet: nein) */
export function hatRechtBei(spielWelt, name, tx, ty, recht) {
  return hatRecht(gebietBei(spielWelt, tx, ty), name, recht);
}

/** Für den Client: eigenes Baugebiet (nur der Besitzer erfährt es) oder null. */
export function flaggeFuerClient(spielWelt, spieler) {
  const f = spielWelt.territorium.von(spieler.name);
  return f ? { tx: f.tx, ty: f.ty, radius: f.radius } : null;
}

// --- Speichern / Laden (Teil des Weltzustands, spielWelt.weltzustand) ----------------------------------------

export function territoriumSpeichern(territorium) {
  return [...territorium.flaggen.values()].map((f) => ({ besitzer: f.besitzer, tx: f.tx, ty: f.ty, radius: f.radius, mitglieder: f.mitglieder ?? {} }));
}

/** Flaggen aus einem (evtl. manipulierten) Weltstand übernehmen – nur gültige Werte. */
export function territoriumLaden(spielWelt, roh) {
  if (!Array.isArray(roh)) return;
  const welt = spielWelt.welt;
  for (const f of roh.slice(0, 1000)) {
    if (typeof f?.besitzer !== 'string' || !f.besitzer || f.besitzer.length > 20) continue;
    if (!Number.isInteger(f.tx) || !Number.isInteger(f.ty) || welt.kachelAn(f.tx, f.ty) === null) continue;
    const radius = Number.isFinite(f.radius) ? Math.min(60, Math.max(1, f.radius)) : spielWelt.konfiguration.basisbau.radiusKacheln;
    spielWelt.territorium.setze({ besitzer: f.besitzer, tx: f.tx, ty: f.ty, radius, mitglieder: pruefeMitglieder(f.mitglieder) });
  }
}

const RECHT_NAMEN = new Set(['bauen', 'abreissen', 'benutzen']);
function pruefeMitglieder(roh) {
  const ergebnis = {};
  if (!roh || typeof roh !== 'object') return ergebnis;
  for (const [name, rechte] of Object.entries(roh).slice(0, 64)) {
    if (name.length <= 20 && Array.isArray(rechte)) ergebnis[name] = rechte.filter((r) => RECHT_NAMEN.has(r));
  }
  return ergebnis;
}
