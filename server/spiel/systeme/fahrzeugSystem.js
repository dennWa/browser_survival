import { EINSTIEG_ABSTAND, abstandZumFahrzeug, ausstiegsPunkt, fahrzeugKacheln } from '../../../gemeinsam/physik/fahrzeug.js';
import { fuegeSchadenZu } from './kampfSystem.js';

/**
 * Fahrzeuge: AKTION 'fahrzeug' = einsteigen (nächstes freies Auto in Reichweite) bzw. aussteigen.
 * Gefahren wird über die normalen Eingaben (gemeinsam/physik/bewegung.js → fahre), damit die Vorhersage passt.
 * Pro Tick: belegte Kacheln aktualisieren (Kollision für alle), Zombies anfahren, verwaiste Autos anhalten.
 */
const ANFAHR_MIN_TEMPO = 55; // px/s – langsamer schiebt das Auto Zombies nur
const ANFAHR_SCHADEN = 0.42; // Schaden pro px/s Tempo (Vollgas ≈ 140)

export function fahrzeugAktion(spielWelt, spieler) {
  if (spieler.fahrzeug) return aussteigen(spielWelt, spieler);
  const fz = naechstesFreiesFahrzeug(spielWelt, spieler.x, spieler.y);
  if (!fz) return;
  fz.fahrerId = spieler.id;
  fz.tempo = 0;
  spieler.fahrzeug = fz;
  spieler.arbeit = null;
  spieler.nachladenRest = 0;
  spielWelt.ereignis({ typ: 'fahrzeug', ein: true, x: fz.x, y: fz.y, von: spieler.id });
  spielWelt.melde(spieler.id, 'W/S = Gas/Bremse · A/D = lenken · E = aussteigen');
}

export function aussteigen(spielWelt, spieler, { erzwingen = false } = {}) {
  const fz = spieler.fahrzeug;
  if (!fz) return;
  const punkt = ausstiegsPunkt(fz, spielWelt.welt, spielWelt.konfiguration.spieler.radius);
  if (!punkt && !erzwingen) {
    spielWelt.melde(spieler.id, 'Hier ist kein Platz zum Aussteigen');
    return;
  }
  spieler.fahrzeug = null;
  fz.fahrerId = null;
  fz.tempo = 0;
  if (punkt) {
    spieler.x = punkt.x;
    spieler.y = punkt.y;
  }
  spielWelt.ereignis({ typ: 'fahrzeug', ein: false, x: fz.x, y: fz.y, von: spieler.id });
}

export function naechstesFreiesFahrzeug(spielWelt, x, y) {
  let bestes = null;
  let bestAbstand = Infinity;
  for (const fz of spielWelt.alleVomTyp('fahrzeug')) {
    if (fz.fahrerId !== null) continue;
    const abstand = abstandZumFahrzeug(fz, x, y);
    if (abstand <= EINSTIEG_ABSTAND && abstand < bestAbstand) {
      bestes = fz;
      bestAbstand = abstand;
    }
  }
  return bestes;
}

export function aktualisiereFahrzeuge(spielWelt, dt) {
  const g = spielWelt.welt.kachelGroesse;
  for (const fz of spielWelt.alleVomTyp('fahrzeug')) {
    // Fahrer weg (tot, ausgeloggt)? → Auto bleibt stehen
    if (fz.fahrerId !== null) {
      const fahrer = spielWelt.holen(fz.fahrerId);
      if (!fahrer || fahrer.tot || fahrer.fahrzeug !== fz) {
        fz.fahrerId = null;
        fz.tempo = 0;
      }
    }
    // Kollision für alle: belegte Kacheln nur neu setzen, wenn sie sich geändert haben
    const kacheln = fahrzeugKacheln(fz, g);
    const schluessel = kacheln.map((k) => k.ty * 10000 + k.tx).join(',');
    if (schluessel !== fz.letzteKacheln) {
      fz.letzteKacheln = schluessel;
      spielWelt.welt.setzeFahrzeugKacheln(fz.id, kacheln);
    }
    for (const [id, rest] of fz.treffer) {
      if (rest - dt <= 0) fz.treffer.delete(id);
      else fz.treffer.set(id, rest - dt);
    }
    if (Math.abs(fz.tempo) >= ANFAHR_MIN_TEMPO) fahreZombiesAn(spielWelt, fz);
  }
}

/** Zombies vor/unter dem Auto: Schaden je nach Tempo, wegschleudern, Auto bremst etwas. */
function fahreZombiesAn(spielWelt, fz) {
  const fahrer = fz.fahrerId !== null ? spielWelt.holen(fz.fahrerId) : null;
  for (const z of spielWelt.alleVomTyp('zombie')) {
    if (fz.treffer.has(z.id)) continue;
    if (abstandZumFahrzeug(fz, z.x, z.y) > z.radius + 2) continue;
    fz.treffer.set(z.id, 0.6);
    const schaden = Math.abs(fz.tempo) * ANFAHR_SCHADEN;
    spielWelt.ereignis({ typ: 'aufprall', x: z.x, y: z.y, tempo: Math.abs(fz.tempo) });
    fuegeSchadenZu(spielWelt, z, schaden, fahrer, fz.winkel + (fz.tempo < 0 ? Math.PI : 0));
    fz.tempo *= 0.8;
  }
}
