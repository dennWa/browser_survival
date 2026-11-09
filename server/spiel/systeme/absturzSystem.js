import { erzeugeZombie } from '../entitaeten/zombie.js';
import { LOOT_TABELLEN } from '../konfiguration/lootTabellen.js';
import { GEGENSTAENDE } from '../konfiguration/gegenstaende.js';
import { KISTE_PLAETZE } from '../../../gemeinsam/konstanten.js';
import { waehleZombieVariante } from '../entitaeten/zombie.js';

/**
 * Runde 47: Heli-Absturz. Der SpielServer lässt alle ~K absturz.intervall Sekunden in einer zufälligen (geladenen, nicht friedlichen)
 * Zone einen Helikopter abstürzen: Bauwerk `heliwrack` (brennt & raucht im Client) + `absturzkiste` (Versorgungskiste mit Loot
 * aus LOOT_TABELLEN.absturz, für alle zu öffnen) + K absturz.zombies Zombies drumherum (`absturz: true`).
 * Nach K absturz.dauer Sekunden (Echtzeit, Feld `bis` = Date.now()-Zeitstempel – überlebt Neustarts) wird alles weggeräumt.
 * Ereignis `absturz` { x, y } → Client: Knall + Kamerawackeln; Funkgeräte bekommen einen Mayday mit Zone + Himmelsrichtung.
 */
export const ABSTURZ_TYPEN = Object.freeze(['heliwrack', 'absturzkiste']);

/** Freien Platz für Wrack (+ Kiste daneben) suchen: draußen, begehbar, nicht am Rand/Übergang/Flaggen-Gebiet, nicht direkt auf Spielern. */
export function waehleAbsturzOrt(spielWelt) {
  const welt = spielWelt.welt;
  const g = welt.kachelGroesse;
  const z = spielWelt.zufall;
  const spieler = [...spielWelt.alleVomTyp('spieler')];
  const uebergaenge = spielWelt.karte.daten.uebergaenge ?? [];
  const flaggen = [...(spielWelt.territorium?.flaggen?.values() ?? [])];
  const frei = (tx, ty) =>
    tx > 1 && ty > 1 && tx < welt.breite - 2 && ty < welt.hoehe - 2 && !welt.istBlockiert(tx, ty) && !welt.istWasser?.((tx + 0.5) * g, (ty + 0.5) * g) && !welt.istInnen((tx + 0.5) * g, (ty + 0.5) * g) && welt.bauwerkeAn(tx, ty).length === 0;
  for (let versuch = 0; versuch < 400; versuch++) {
    const tx = z.ganzzahl(6, welt.breite - 7);
    const ty = z.ganzzahl(6, welt.hoehe - 7);
    let ok = true;
    for (let dy = -1; dy <= 1 && ok; dy++) for (let dx = -1; dx <= 3 && ok; dx++) ok = frei(tx + dx, ty + dy);
    if (!ok) continue;
    const x = (tx + 0.5) * g;
    const y = (ty + 0.5) * g;
    if (uebergaenge.some((u) => x > u.px.x0 - 6 * g && x < u.px.x1 + 6 * g && y > u.px.y0 - 6 * g && y < u.px.y1 + 6 * g)) continue;
    if (flaggen.some((f) => Math.hypot(f.tx - tx, f.ty - ty) <= (f.radius ?? 8) + 4)) continue;
    if (spieler.some((s) => Math.hypot(s.x - x, s.y - y) < 10 * g)) continue;
    return { tx, ty, x, y };
  }
  return null;
}

/** Inhalt der Versorgungskiste: `anzahl` Würfe aus LOOT_TABELLEN.absturz (Schusswaffen halb geladen + Munition dazu). */
export function absturzLoot(spielWelt, anzahl) {
  const z = spielWelt.zufall;
  const inhalt = new Array(KISTE_PLAETZE).fill(null);
  let platz = 0;
  const lege = (e) => {
    if (platz < inhalt.length) inhalt[platz++] = e;
  };
  for (let i = 0; i < anzahl; i++) {
    const { id: defId } = z.gewichteteAuswahl(LOOT_TABELLEN.absturz);
    const def = GEGENSTAENDE[defId];
    if (!def) continue;
    const spanne = def.mengeBeimFund;
    if (def.kategorie === 'fernkampf') {
      lege({ defId, menge: 1, magazin: Math.ceil((def.magazin ?? 0) / 2) });
      const m = GEGENSTAENDE[def.munition];
      if (m) lege({ defId: def.munition, menge: Math.min(m.stapelbar ?? 30, z.ganzzahl(...(m.mengeBeimFund ?? [6, 12])) * 2) });
    } else lege({ defId, menge: spanne ? z.ganzzahl(spanne[0], spanne[1]) : 1 });
  }
  return inhalt;
}

/**
 * Helikopter stürzt in dieser Zone ab. @returns { tx, ty, x, y } oder null (kein Platz)
 * @param jetzt  Echtzeit in ms (Date.now) – `bis` steht am Bauwerk (Weltstand)
 */
export function lasseAbstuerzen(spielWelt, jetzt, ort = waehleAbsturzOrt(spielWelt)) {
  if (!ort) return null;
  const k = spielWelt.konfiguration.absturz;
  const bis = jetzt + k.dauer * 1000;
  const welt = spielWelt.welt;
  const wrack = { id: spielWelt.neueBauwerkId(), typ: 'heliwrack', tx: ort.tx, ty: ort.ty, besitzer: '', bis, drehung: spielWelt.zufall.zahl() < 0.5 ? 0 : 1 };
  welt.setzeBauwerk(wrack);
  const kiste = { id: spielWelt.neueBauwerkId(), typ: 'absturzkiste', tx: ort.tx + 2, ty: ort.ty, besitzer: '', bis, inhalt: absturzLoot(spielWelt, k.lootWuerfe) };
  welt.setzeBauwerk(kiste);
  // Zombies stehen schon drumherum (Kreis, 3–6 Kacheln)
  const g = welt.kachelGroesse;
  for (let i = 0; i < k.zombies; i++) {
    for (let versuch = 0; versuch < 20; versuch++) {
      const w = spielWelt.zufall.zahl() * Math.PI * 2;
      const r = (3 + spielWelt.zufall.zahl() * 3) * g;
      const x = ort.x + Math.cos(w) * r;
      const y = ort.y + Math.sin(w) * r;
      if (welt.istBlockiert(Math.floor(x / g), Math.floor(y / g))) continue;
      const variante = waehleZombieVariante(spielWelt.zufall, spielWelt.konfiguration, spielWelt.tag ?? 1);
      const zombie = erzeugeZombie({ id: spielWelt.neueId(), x, y, konfiguration: spielWelt.konfiguration, variante });
      zombie.absturz = bis;
      spielWelt.hinzufuegen(zombie);
      break;
    }
  }
  spielWelt.ereignis({ typ: 'absturz', x: ort.x, y: ort.y });
  return ort;
}

/** Abgelaufene Absturzstellen (Wrack, Kiste, übrige Zombies) wegräumen. @returns Anzahl entfernter Bauwerke */
export function raeumeAbsturzAuf(spielWelt, jetzt) {
  let weg = 0;
  for (const b of [...spielWelt.welt.bauwerke.values()]) {
    if (!ABSTURZ_TYPEN.includes(b.typ) || (b.bis ?? 0) > jetzt) continue;
    for (const s of spielWelt.alleVomTyp('spieler')) if (s.offeneKiste === b.id) s.offeneKiste = null;
    spielWelt.welt.entferneBauwerk(b.id);
    weg++;
  }
  for (const z of [...spielWelt.alleVomTyp('zombie')]) if (z.absturz && z.absturz <= jetzt && !z.zielId) spielWelt.entfernen(z.id);
  return weg;
}

/** Himmelsrichtung eines Punkts in der Zone (für den Mayday-Funkspruch): „im Nordosten“, „in der Mitte“ … */
export function himmelsrichtung(spielWelt, x, y) {
  const g = spielWelt.welt.kachelGroesse;
  const fx = x / (spielWelt.welt.breite * g);
  const fy = y / (spielWelt.welt.hoehe * g);
  const ns = fy < 0.36 ? 'Nord' : fy > 0.64 ? 'Süd' : '';
  const ow = fx < 0.36 ? 'west' : fx > 0.64 ? 'ost' : '';
  if (!ns && !ow) return 'in der Mitte';
  if (!ns) return `im ${ow === 'west' ? 'Westen' : 'Osten'}`;
  return `im ${ns}${ow ? ow : 'en'}`.replace('Südost', 'Südosten').replace('Südwest', 'Südwesten').replace('Nordost', 'Nordosten').replace('Nordwest', 'Nordwesten');
}
