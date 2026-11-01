import { verarbeiteKarte } from '../../server/spiel/karten/kartenLader.js';
import { Welt } from '../../gemeinsam/welt/welt.js';
import { GEGENSTAENDE } from '../../server/spiel/konfiguration/gegenstaende.js';
import { LOOT_TABELLEN } from '../../server/spiel/konfiguration/lootTabellen.js';
import { erstelleKonfiguration } from '../../server/spiel/konfiguration/spielKonfiguration.js';
import { pruefeZonenEinstellungen } from '../../server/spiel/karten/zonenEinstellungen.js';
import { alsRechtecke } from '../../editor/kern/raster.js';
import { ausSchluessel } from '../../editor/kern/karte.js';

/**
 * Analysen des Studios (Phase 1.14) – umgebungsfrei, nutzen den echten Spiel-Lader + Welt (gleiche Regeln wie das Spiel):
 *   laufweg(definition)      Was ist vom Spieler-Start (und von allen Ankunftspunkten) zu Fuß erreichbar? Unerreichbare Loot-/
 *                            Spawn-Punkte, Übergänge, Spawnpunkte und eingesperrte Flächen (→ rote Markierungen)
 *   balance(definition)      Versorgung je Stunde (Essen, Trinken, Medizin, Waffen, Munition, Material …), Zombies, Tiere,
 *                            Gefahr & Versorgung je 1000 begehbare Kacheln – zum Vergleich der Zonen
 * Tests: tests/studio.test.js.
 */

/** Walkability wie im Spiel; Startpunkte = Spieler-Start + Ankünfte */
export function laufweg(definition) {
  const geladen = verarbeiteKarte(definition);
  const welt = new Welt(geladen.daten);
  const g = welt.kachelGroesse;
  const B = welt.breite;
  const H = welt.hoehe;
  const besucht = new Uint8Array(B * H);
  const stapel = [];
  for (const p of [...geladen.spielerStarts, ...Object.values(geladen.ankuenfte)]) stapel.push([Math.floor(p.x / g), Math.floor(p.y / g)]);
  while (stapel.length) {
    const [x, y] = stapel.pop();
    if (x < 0 || y < 0 || x >= B || y >= H) continue;
    const i = y * B + x;
    if (besucht[i] || welt.istBlockiert(x, y)) continue;
    besucht[i] = 1;
    stapel.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
  }
  const befunde = [];
  const erreicht = (x, y) => besucht[Math.floor(y) * B + Math.floor(x)] === 1;
  for (const p of geladen.lootPunkte) {
    const x = Math.floor(p.x / g);
    const y = Math.floor(p.y / g);
    if (!erreicht(x, y) && !welt.istBlockiert(x, y)) befunde.push({ art: p.spawnPunkt ? 'spawnpunkt' : p.lootZone ? 'lootzone' : 'loot', text: p.spawnPunkt ? `Spawnpunkt (${p.spawnPunkt.inhalt}) nicht erreichbar` : p.lootZone ? `Loot-Zone „${p.lootZone.name}“: Punkt nicht erreichbar` : `Loot-Punkt (Raum ${p.raum}) nicht erreichbar`, x, y });
  }
  for (const u of welt.uebergaenge) {
    let ok = false;
    for (let y = u.y; y < u.y + u.h && !ok; y++) for (let x = u.x; x < u.x + u.b && !ok; x++) ok = erreicht(x, y);
    if (!ok) befunde.push({ art: 'uebergang', text: `Übergang → ${u.ziel} nicht erreichbar`, x: u.x, y: u.y });
  }
  // Eingesperrte Flächen: begehbar, aber nicht erreicht (je zusammenhängender Fläche ≥ 2 Kacheln)
  const gesehen = new Uint8Array(B * H);
  const markierungen = [];
  let eingesperrt = 0;
  for (let i = 0; i < B * H; i++) {
    if (gesehen[i] || besucht[i] || welt.istBlockiert(i % B, Math.floor(i / B))) continue;
    const flaeche = [];
    const offen = [i];
    gesehen[i] = 1;
    while (offen.length) {
      const j = offen.pop();
      flaeche.push({ x: j % B, y: Math.floor(j / B) });
      for (const n of [j + 1, j - 1, j + B, j - B]) {
        if (n < 0 || n >= B * H || gesehen[n] || besucht[n]) continue;
        if (Math.abs((n % B) - (j % B)) > 1) continue;
        if (welt.istBlockiert(n % B, Math.floor(n / B))) continue;
        gesehen[n] = 1;
        offen.push(n);
      }
    }
    if (flaeche.length < 2) continue;
    eingesperrt += flaeche.length;
    if (befunde.filter((b) => b.art === 'flaeche').length < 30) befunde.push({ art: 'flaeche', text: `Eingesperrte Fläche (${flaeche.length} Kacheln) – fehlt eine Tür?`, x: flaeche[0].x, y: flaeche[0].y });
    for (const r of alsRechtecke(flaeche)) markierungen.push({ ...r, art: 'weg' });
  }
  let begehbar = 0;
  let erreichtZahl = 0;
  for (let i = 0; i < B * H; i++) {
    if (welt.istBlockiert(i % B, Math.floor(i / B))) continue;
    begehbar++;
    if (besucht[i]) erreichtZahl++;
  }
  for (const b of befunde) if (b.art !== 'flaeche') markierungen.push({ x: b.x, y: b.y, b: 1, h: 1, art: 'weg' });
  return { befunde, markierungen, begehbar, erreicht: erreichtZahl, anteil: begehbar ? erreichtZahl / begehbar : 1, eingesperrt };
}

/** Item → Bereich für die Balance */
export function bereichVon(id) {
  const k = GEGENSTAENDE[id]?.kategorie ?? 'sonstiges';
  if (k === 'nahrung') return GEGENSTAENDE[id].durstwert > (GEGENSTAENDE[id].naehrwert ?? 0) ? 'trinken' : 'essen';
  if (k === 'getraenk' || k === 'trinken') return 'trinken';
  if (k === 'medizin') return 'medizin';
  if (k === 'nahkampf' || k === 'fernkampf' || k === 'wurf') return 'waffen';
  if (k === 'munition') return 'munition';
  if (k === 'material' || k === 'ressource' || k === 'werkzeug') return 'material';
  return 'sonstiges';
}
export const BEREICHE = ['essen', 'trinken', 'medizin', 'waffen', 'munition', 'material', 'sonstiges'];

function verteilung(tabelle) {
  const t = LOOT_TABELLEN[tabelle] ?? [];
  const summe = t.reduce((s, e) => s + e.gewicht, 0) || 1;
  return t.map((e) => [e.id, e.gewicht / summe]);
}

/**
 * Balance einer Zone. Annahme: Ein Loot-Punkt wird geplündert, sobald etwas liegt → Nachschub je Stunde = Chance × 3600/Respawn.
 * @returns { start: {bereich: n}, jeStunde: {bereich: n}, zombies, horde, tiere, begehbar, gefahr, versorgung }
 */
export function balance(definition) {
  const geladen = verarbeiteKarte(definition);
  const welt = new Welt(geladen.daten);
  const k = erstelleKonfiguration();
  const zone = pruefeZonenEinstellungen(definition.einstellungen) ?? {};
  const chanceStd = zone.loot?.spawnChance ?? k.loot.spawnChance;
  const respawnStd = zone.loot?.respawnZeit ?? k.loot.respawnZeit;
  const start = Object.fromEntries(BEREICHE.map((b) => [b, 0]));
  const jeStunde = Object.fromEntries(BEREICHE.map((b) => [b, 0]));
  const addiere = (verteilt, chance, respawn) => {
    for (const [id, p] of verteilt) {
      const b = bereichVon(id);
      start[b] += chance * p;
      jeStunde[b] += chance * p * (3600 / Math.max(30, respawn));
    }
  };
  for (const p of geladen.lootPunkte) {
    const respawn = p.respawnZeit ?? respawnStd;
    if (p.spawnPunkt) {
      const sp = p.spawnPunkt;
      addiere(sp.inhalt.startsWith('tabelle:') ? verteilung(sp.inhalt.slice(8)) : [[sp.inhalt, 1]], sp.chance / 100, respawn);
    } else if (p.lootZone) {
      const z = p.lootZone;
      if (z.modus === 'chance') for (const e of z.eintraege) addiere([[e.id, 1]], e.chance / 100, respawn);
      else {
        const summe = z.eintraege.reduce((s, e) => s + (e.gewicht ?? 1), 0) || 1;
        addiere(z.eintraege.map((e) => [e.id, (e.gewicht ?? 1) / summe]), z.spawnChance ?? chanceStd, respawn);
      }
    } else addiere(verteilung(p.lootTabelle), p.spawnChance ?? chanceStd, respawn);
  }
  let begehbar = 0;
  for (let y = 0; y < welt.hoehe; y++) for (let x = 0; x < welt.breite; x++) if (!welt.istBlockiert(x, y)) begehbar++;
  const zombies = geladen.zombieSpawns.length;
  const horde = geladen.zombieSpawns.filter((z) => z.horde).length;
  const tiere = geladen.tierBereiche.reduce((s, t) => s + t.anzahl, 0);
  const tausend = Math.max(1, begehbar / 1000);
  const rund = (o) => Object.fromEntries(Object.entries(o).map(([a, b]) => [a, Math.round(b * 10) / 10]));
  return {
    start: rund(start),
    jeStunde: rund(jeStunde),
    zombies,
    horde,
    tiere,
    begehbar,
    lootPunkte: geladen.lootPunkte.length,
    gefahr: Math.round((zombies / tausend) * 10) / 10,
    versorgung: Math.round(((jeStunde.essen + jeStunde.trinken) / tausend) * 10) / 10,
  };
}

/** Heatmap-Gitter (Float32Array, 0..1) aus editor/kern/lootZonenEditor.js lootDichte */
export function heatmapGitter(karte, dichte) {
  const gitter = new Float32Array(karte.breite * karte.hoehe);
  const max = dichte.max || 1;
  for (const [schl, w] of dichte.zellen) {
    const [x, y] = ausSchluessel(schl);
    gitter[y * karte.breite + x] = Math.min(1, w / max);
  }
  // Spawnpunkte zusätzlich (lootDichte kennt sie nicht): Chance als Fleck
  for (const p of karte.s('spawnpunkte').values()) {
    for (let dy = -2; dy <= 2; dy++)
      for (let dx = -2; dx <= 2; dx++) {
        const x = Math.floor(p.x) + dx;
        const y = Math.floor(p.y) + dy;
        if (!karte.imFeld(x, y)) continue;
        const i = y * karte.breite + x;
        gitter[i] = Math.min(1, gitter[i] + (p.chance / 100) * (1 - Math.hypot(dx, dy) / 3) * 0.6);
      }
  }
  return gitter;
}
