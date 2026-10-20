import { TICK_DAUER_MS } from '../../gemeinsam/konstanten.js';

/**
 * Debug-Testlauf (Map-Editor 2.0, Schritt 8.1) – reine Lese-Helfer über eine laufende SpielWelt, ohne DOM/Node.
 * Benutzt NUR der Editor-Test (`client/?editorTest=1`, Lokal-Server im selben Tab, client/debug/debugLauf.js) – nie online.
 * Ändert keinen Spielzustand.
 *   ZEITLUPE / tickDauerBei  Zeitlupe = weniger Ticks pro echter Sekunde (jeder Tick bleibt gleich → gleiche Simulation)
 *   SCHRITTE                 Schritt-für-Schritt: 1 oder 10 Ticks
 *   debugSchnappschuss       Zombies (Ziel, A*-Pfad, Wanderziel, Bemerk-/Verlier-/Hörradius), Spawnpunkte mit
 *                            Respawn-Timern, Loot-Punkte (belegt / Nachschub in s), Übergänge, Klänge – alles in Pixeln
 *   naechsterZombie          Klick-Treffer · zombieInfo  Zeilen für die Info-Karte
 */
export const ZEITLUPE = Object.freeze([0.1, 0.25, 0.5, 1]);
export const SCHRITTE = Object.freeze([1, 10]);

/** Tick-Dauer (ms) bei Zeitlupen-Faktor (0,1 … 1); ungültig → normal */
export function tickDauerBei(faktor) {
  const f = Number(faktor);
  if (!Number.isFinite(f) || f <= 0) return TICK_DAUER_MS;
  return TICK_DAUER_MS / Math.min(1, Math.max(0.1, f));
}

/** Bemerk-Radius wie zombieSystem.waehleZiel (Nacht: Licht an/aus) */
function bemerkRadius(spielWelt, k, lichtAn) {
  if (!spielWelt.istNacht) return k.aggroRadius;
  return k.aggroRadius * (lichtAn ? k.nachtLichtFaktor : k.dunkelFaktor);
}

/**
 * Alles, was die Overlays zeigen. `spielerId` = eigener Spieler (für den Bemerk-Radius bei Nacht).
 * Koordinaten in Pixeln (Weltkoordinaten des Spiels).
 */
export function debugSchnappschuss(spielWelt, { spielerId = null } = {}) {
  const k = spielWelt.konfiguration.zombie;
  const kg = spielWelt.welt?.kachelGroesse ?? spielWelt.karte.daten.kachelGroesse ?? 32;
  const ich = spielerId !== null ? spielWelt.holen(spielerId) : null;
  const zombies = [];
  const lebendJeSpawn = new Map();
  for (const z of spielWelt.alleVomTyp('zombie')) {
    if (z.spawnIndex !== null && z.spawnIndex !== undefined) lebendJeSpawn.set(z.spawnIndex, (lebendJeSpawn.get(z.spawnIndex) ?? 0) + 1);
    const ziel = z.zielId !== null ? spielWelt.holen(z.zielId) : null;
    zombies.push({
      id: z.id,
      x: z.x,
      y: z.y,
      variante: z.variante,
      zustand: z.zustand,
      leben: z.leben,
      maxLeben: z.maxLeben,
      ziel: ziel ? { id: ziel.id, x: ziel.x, y: ziel.y } : null,
      letztes: z.zielId !== null || z.pfad ? { x: z.letztesZielX, y: z.letztesZielY } : null,
      pfad: Array.isArray(z.pfad) ? z.pfad.map((p) => ({ x: p.x, y: p.y })) : null,
      wanderZiel: z.wanderZiel ? { x: z.wanderZiel.x, y: z.wanderZiel.y } : null,
      spawn: { x: z.spawnX, y: z.spawnY },
      nacht: !!z.nacht,
      gibAuf: z.gibAuf > 0 ? Math.round(z.gibAuf * 10) / 10 : 0,
    });
  }
  const respawnJeSpawn = new Map();
  for (const r of spielWelt.zombieRespawns ?? []) {
    const liste = respawnJeSpawn.get(r.spawnIndex) ?? [];
    liste.push(Math.max(0, Math.round(r.rest * 10) / 10));
    respawnJeSpawn.set(r.spawnIndex, liste);
  }
  // zombieSpawns kann Punkte doppelt enthalten (anzahl × dichte) → je Ort zusammenfassen
  const spawnOrte = new Map();
  (spielWelt.karte.zombieSpawns ?? []).forEach((s, i) => {
    const schl = `${s.x}|${s.y}`;
    const o = spawnOrte.get(schl) ?? { x: s.x, y: s.y, horde: !!s.horde, plaetze: 0, lebend: 0, respawns: [] };
    o.plaetze++;
    o.lebend += lebendJeSpawn.get(i) ?? 0;
    o.respawns.push(...(respawnJeSpawn.get(i) ?? []));
    spawnOrte.set(schl, o);
  });
  const spawns = [...spawnOrte.values()].map((o) => ({ ...o, respawns: o.respawns.sort((a, b) => a - b) }));
  const loot = (spielWelt.karte.lootPunkte ?? []).map((p, i) => {
    const z = spielWelt.lootZustand?.[i];
    const belegt = !!(z?.gegenstandId !== null && z?.gegenstandId !== undefined && spielWelt.holen(z.gegenstandId));
    return { x: p.x, y: p.y, belegt, rest: belegt ? 0 : Math.max(0, Math.round((z?.rest ?? 0) * 10) / 10), zone: p.lootZone ?? null, raum: p.raum ?? null };
  });
  const uebergaenge = (spielWelt.welt?.uebergaenge ?? []).map((u) => {
    const px = u.px ?? { x0: u.x * kg, y0: u.y * kg, x1: (u.x + u.b) * kg, y1: (u.y + u.h) * kg };
    return { x: px.x0, y: px.y0, b: px.x1 - px.x0, h: px.y1 - px.y0, ziel: u.ziel, name: u.name ?? u.ziel };
  });
  const klaenge = (spielWelt.karte.daten.klaenge ?? []).filter((c) => c.art !== 'global').map((c) => (c.art === 'punkt'
    ? { art: 'punkt', name: c.name ?? '', x: c.x * kg, y: c.y * kg, innen: c.innen * kg, aussen: c.aussen * kg }
    : { art: 'bereich', name: c.name ?? '', x: c.x * kg, y: c.y * kg, b: c.b * kg, h: c.h * kg, rand: (c.rand ?? 0) * kg }));
  return {
    tick: spielWelt.tick,
    nacht: !!spielWelt.istNacht,
    radien: { bemerk: bemerkRadius(spielWelt, k, !!ich?.lichtAn), verlier: k.verlierRadius, hoer: k.hoerRadius, wander: k.wanderRadius },
    zombies,
    spawns,
    loot,
    uebergaenge,
    klaenge,
  };
}

/** Zombie unter/nahe dem Punkt (px), sonst null */
export function naechsterZombie(schnappschuss, x, y, maxAbstand = 28) {
  let best = null;
  let bestD = maxAbstand;
  for (const z of schnappschuss.zombies) {
    const d = Math.hypot(z.x - x, z.y - y);
    if (d <= bestD) {
      best = z;
      bestD = d;
    }
  }
  return best;
}

const ZUSTAENDE = { ruhend: 'ruht/schlurft', verfolgend: 'verfolgt', angreifend: 'greift an' };

/** Zeilen für die Info-Karte eines Zombies */
export function zombieInfo(z, kachelGroesse = 32) {
  const kachel = (p) => `${Math.floor(p.x / kachelGroesse)}|${Math.floor(p.y / kachelGroesse)}`;
  const zeilen = [
    `🧟 Zombie #${z.id} · ${z.variante ?? 'normal'}${z.nacht ? ' · Horde' : ''}`,
    `Leben ${Math.round(z.leben ?? 0)}${z.maxLeben ? ` / ${z.maxLeben}` : ''} · ${ZUSTAENDE[z.zustand] ?? z.zustand}`,
    `Kachel ${kachel(z)} · Spawn ${kachel(z.spawn)}`,
  ];
  if (z.ziel) zeilen.push(`Ziel: Spieler #${z.ziel.id} (${Math.round(Math.hypot(z.ziel.x - z.x, z.ziel.y - z.y))} px)`);
  else if (z.letztes) zeilen.push(`Sucht bei ${kachel(z.letztes)}`);
  else if (z.wanderZiel) zeilen.push(`Wandert nach ${kachel(z.wanderZiel)}`);
  else zeilen.push('Kein Ziel');
  zeilen.push(z.pfad ? `A*-Pfad: ${z.pfad.length} Wegpunkte` : 'Kein A*-Pfad (läuft direkt oder steht)');
  if (z.gibAuf) zeilen.push(`Gibt auf: noch ${z.gibAuf} s`);
  return zeilen;
}
