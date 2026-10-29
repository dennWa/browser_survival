import { AKTIONEN } from '../../../gemeinsam/protokoll.js';
import { AUFHEB_REICHWEITE } from '../../../gemeinsam/konstanten.js';
import { findePfad } from '../../../gemeinsam/physik/pfadfindung.js';
import { sichtlinieFrei } from '../../../gemeinsam/physik/strahl.js';
import { GEGENSTAENDE } from '../konfiguration/gegenstaende.js';
import { pruefeAussehen } from '../../../gemeinsam/spieler/aussehen.js';

/**
 * Bots (Runde 23, zum Testen): Spieler-Entitäten ohne Verbindung (`spieler.bot`), die sich wie Menschen verhalten –
 * herumlaufen (A*-Wege, Pausen, umschauen), Items aufsammeln, essen/trinken/heilen bei Bedarf, Zombies mit Pistole auf
 * Abstand bekämpfen (Reaktionszeit, Streuung beim Zielen, nachladen; ohne Munition Nahkampfwaffe), bei wenig Leben fliehen.
 * Sie benutzen exakt denselben Eingabeweg wie echte Spieler (eingabePuffer/aktionsPuffer) – keine Sonderphysik, kein Wallhack
 * (Zombies nur mit freier Sichtlinie). Nicht gespeichert, keine Zonenwechsel, zählen nicht beim Schlafen mit.
 * Anzahl je Zone: konfiguration.bots.proKarte (Zone legt sie an); Admin: Bot setzen/entfernen per Klick (adminSystem).
 */
const NAMEN = ['Anna', 'Ben', 'Clara', 'David', 'Emil', 'Frieda', 'Greta', 'Hugo', 'Ida', 'Jonas', 'Karla', 'Lenny'];
const SICHT = 430; // px, so weit „sieht“ ein Bot Zombies
const WAHRNEHMUNG_TAKT = 0.2; // s
const LOOT_RADIUS = 420;
const SCHUSS_ABSTAND = { min: 130, max: 330 };

/** Bot in die Zone setzen (an einem Startpunkt oder an x/y). @returns Spieler-Entität */
export function spawneBot(spielWelt, { x = null, y = null } = {}) {
  const vergeben = new Set([...spielWelt.alleVomTyp('spieler')].map((s) => s.name));
  const frei = NAMEN.filter((n) => !vergeben.has(`Bot ${n}`));
  const name = `Bot ${frei.length ? frei[spielWelt.zufall.ganzzahl(0, frei.length - 1)] : spielWelt.neueId()}`;
  const bot = spielWelt.spielerBetrittWelt(name);
  if (x !== null && y !== null) {
    bot.x = x;
    bot.y = y;
  }
  bot.bot = { seq: 0, wahrnehmung: 0, ziel: null, pfad: null, pfadZiel: null, neuplan: 0, pause: 1 + spielWelt.zufall.zahl() * 2, zielId: null, reaktion: 0, blickZiel: bot.blick, steckt: 0, letztePos: { x: bot.x, y: bot.y }, aktionWarte: 0, schauen: 0 };
  bot.aussehen = pruefeAussehen({ koerper: spielWelt.zufall.zahl() < 0.5 ? 'frau' : 'mann' });
  return bot;
}

/** Bots einer Zone (lebend oder tot). */
export function botsDerZone(spielWelt) {
  return [...spielWelt.alleVomTyp('spieler')].filter((s) => s.bot);
}

export function entferneBot(spielWelt, bot) {
  if (bot?.bot) spielWelt.entfernen(bot.id);
}

/** Pro Tick (vor den Spieler-Eingaben): jeder Bot schiebt genau eine Eingabe und ggf. eine Aktion in seine Puffer. */
export function aktualisiereBots(spielWelt, dt) {
  for (const bot of spielWelt.alleVomTyp('spieler')) {
    if (!bot.bot || bot.tot) continue;
    denke(spielWelt, bot, dt);
  }
}

function denke(spielWelt, bot, dt) {
  const b = bot.bot;
  const z = spielWelt.zufall;
  b.aktionWarte = Math.max(0, b.aktionWarte - dt);
  b.wahrnehmung -= dt;
  if (b.wahrnehmung <= 0) {
    b.wahrnehmung = WAHRNEHMUNG_TAKT;
    nimmWahr(spielWelt, bot);
  }
  versorge(spielWelt, bot);
  let richtung = { x: 0, y: 0 };
  let angriff = false;
  let sprint = false;
  const zombie = b.zielId ? spielWelt.holen(b.zielId) : null;
  if (zombie && !zombie.tot) {
    const dx = zombie.x - bot.x;
    const dy = zombie.y - bot.y;
    const abstand = Math.hypot(dx, dy);
    const winkel = Math.atan2(dy, dx);
    const fernkampf = waehleWaffe(spielWelt, bot);
    const fliehen = bot.leben < 30 && !hat(bot, (d) => d.kategorie === 'medizin');
    b.blickZiel = winkel + b.streuung;
    if (fliehen) {
      richtung = { x: -dx / abstand, y: -dy / abstand };
      sprint = true;
    } else if (fernkampf) {
      if (abstand < SCHUSS_ABSTAND.min) richtung = { x: -dx / abstand, y: -dy / abstand }; // zurückweichen
      else if (abstand > SCHUSS_ABSTAND.max) richtung = { x: dx / abstand, y: dy / abstand };
      angriff = b.reaktion <= 0 && abstand < 520;
    } else {
      if (abstand > 46) richtung = { x: dx / abstand, y: dy / abstand };
      angriff = b.reaktion <= 0 && abstand < 72;
    }
    b.reaktion -= dt;
  } else {
    b.zielId = null;
    richtung = folgeZiel(spielWelt, bot, dt);
  }
  // Blick weich nachdrehen (Menschen reißen den Kopf nicht in einem Tick herum)
  let diff = ((b.blickZiel - bot.blick + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
  const max = 9 * dt;
  diff = Math.max(-max, Math.min(max, diff));
  const blick = bot.blick + diff;
  bot.eingabePuffer.push({ seq: ++b.seq, x: richtung.x, y: richtung.y, blick, angriff: angriff && Math.abs(diff) < 0.25, sprint });
  // Festgefahren? → neues Ziel
  const weg = Math.hypot(bot.x - b.letztePos.x, bot.y - b.letztePos.y);
  if ((richtung.x || richtung.y) && weg < 0.4) b.steckt += dt;
  else b.steckt = Math.max(0, b.steckt - dt);
  b.letztePos = { x: bot.x, y: bot.y };
  if (b.steckt > 1.2) {
    b.steckt = 0;
    b.ziel = null;
    b.pfad = null;
    b.pause = 0.3 + z.zahl();
  }
}

/** Zombies mit freier Sicht im Umkreis → nächster wird Ziel (mit Reaktionszeit & etwas Ungenauigkeit beim Zielen). */
function nimmWahr(spielWelt, bot) {
  const b = bot.bot;
  let bester = null;
  let bestAbstand = SICHT;
  for (const zombie of spielWelt.alleVomTyp('zombie')) {
    if (zombie.tot) continue;
    const abstand = Math.hypot(zombie.x - bot.x, zombie.y - bot.y);
    if (abstand >= bestAbstand) continue;
    if (!sichtlinieFrei(spielWelt.welt, bot.x, bot.y, zombie.x, zombie.y)) continue;
    bester = zombie;
    bestAbstand = abstand;
  }
  const z = spielWelt.zufall;
  if (bester && bester.id !== b.zielId) {
    b.zielId = bester.id;
    b.reaktion = 0.3 + z.zahl() * 0.35; // Schreck-/Reaktionszeit
    b.pfad = null;
  }
  if (!bester) b.zielId = null;
  b.streuung = (z.zahl() * 2 - 1) * 0.07; // zittrige Hand
}

/** Essen, Trinken, Heilen, Nachladen – nur wenn gerade nichts anderes wartet. */
function versorge(spielWelt, bot) {
  const b = bot.bot;
  if (b.aktionWarte > 0) return;
  const slotVon = (pruefe) => bot.inventar.findIndex((e) => e && pruefe(GEGENSTAENDE[e.defId] ?? {}));
  let slot = -1;
  if (bot.leben < bot.maxLeben * 0.5) slot = slotVon((d) => d.kategorie === 'medizin');
  if (slot < 0 && bot.durst < 35) slot = slotVon((d) => d.kategorie === 'getraenk' || d.durstwert > 0);
  if (slot < 0 && bot.hunger < 35) slot = slotVon((d) => d.kategorie === 'nahrung');
  if (slot >= 0) {
    bot.aktionsPuffer.push({ art: AKTIONEN.KONSUMIEREN, slot });
    b.aktionWarte = 1.5;
  }
}

function hat(bot, pruefe) {
  return bot.inventar.some((e) => e && pruefe(GEGENSTAENDE[e.defId] ?? {}));
}

/** Pistole/Schrotflinte mit Munition in die Hand, sonst die beste Nahkampfwaffe. @returns true = Fernkampf */
function waehleWaffe(spielWelt, bot) {
  const b = bot.bot;
  const munitionFuer = (def) => bot.inventar.some((e) => e?.defId === def.munition && e.menge > 0);
  let wahl = -1;
  let fern = false;
  bot.inventar.forEach((e, i) => {
    const def = e && GEGENSTAENDE[e.defId];
    if (def?.kategorie === 'fernkampf' && ((e.magazin ?? 0) > 0 || munitionFuer(def)) && !fern) {
      wahl = i;
      fern = true;
    }
  });
  if (!fern) {
    let besterSchaden = 0;
    bot.inventar.forEach((e, i) => {
      const def = e && GEGENSTAENDE[e.defId];
      if (def?.kategorie === 'nahkampf' && def.ausruestung !== 'hacke' && (def.schaden ?? 0) > besterSchaden) {
        besterSchaden = def.schaden;
        wahl = i;
      }
    });
  }
  if (wahl >= 0 && bot.ausgeruestet !== wahl && b.aktionWarte <= 0) {
    bot.aktionsPuffer.push({ art: AKTIONEN.BENUTZEN, slot: wahl }); // benutzen = ausrüsten (umschalten nur, wenn noch nicht in der Hand)
    b.aktionWarte = 0.6;
  }
  return fern;
}

/** Ohne Gefahr: Item in der Nähe holen, sonst gemütlich herumlaufen (mit Pausen und Umschauen). */
function folgeZiel(spielWelt, bot, dt) {
  const b = bot.bot;
  const z = spielWelt.zufall;
  if (b.pause > 0) {
    b.pause -= dt;
    b.schauen -= dt;
    if (b.schauen <= 0) {
      b.schauen = 0.8 + z.zahl() * 1.5;
      b.blickZiel = bot.blick + (z.zahl() * 2 - 1) * 1.6; // umschauen
    }
    return { x: 0, y: 0 };
  }
  // Loot in der Nähe? (nur wenn Platz im Inventar)
  if (!b.ziel || b.ziel.art !== 'item') {
    const item = naechstesItem(spielWelt, bot);
    if (item) {
      b.ziel = { art: 'item', id: item.id, x: item.x, y: item.y };
      b.pfad = null;
    }
  }
  if (b.ziel?.art === 'item') {
    const item = spielWelt.holen(b.ziel.id);
    if (!item) b.ziel = null;
    else if (Math.hypot(item.x - bot.x, item.y - bot.y) < AUFHEB_REICHWEITE - 6) {
      if (b.aktionWarte <= 0) {
        bot.aktionsPuffer.push({ art: AKTIONEN.AUFHEBEN, slot: null });
        b.aktionWarte = 0.5;
        b.ziel = null;
        b.pause = 0.4 + z.zahl() * 0.8;
      }
      return { x: 0, y: 0 };
    }
  }
  if (!b.ziel) {
    b.ziel = zufallsZiel(spielWelt, bot);
    b.pfad = null;
    if (!b.ziel) {
      b.pause = 1;
      return { x: 0, y: 0 };
    }
  }
  if (!b.pfad) {
    b.pfad = findePfad(spielWelt.welt, bot.x, bot.y, b.ziel.x, b.ziel.y, { maxKnoten: 4000, tuerKosten: 2 });
    if (!b.pfad) {
      b.ziel = null;
      b.pause = 0.5;
      return { x: 0, y: 0 };
    }
  }
  while (b.pfad.length && Math.hypot(b.pfad[0].x - bot.x, b.pfad[0].y - bot.y) < 10) b.pfad.shift();
  const naechster = b.pfad[0] ?? b.ziel;
  const dx = naechster.x - bot.x;
  const dy = naechster.y - bot.y;
  const l = Math.hypot(dx, dy);
  if (!b.pfad.length && l < 12) {
    // angekommen
    b.ziel = null;
    b.pfad = null;
    b.pause = 1 + z.zahl() * 3.5;
    return { x: 0, y: 0 };
  }
  b.blickZiel = Math.atan2(dy, dx);
  return { x: dx / l, y: dy / l };
}

function naechstesItem(spielWelt, bot) {
  if (!bot.inventar.some((e) => !e)) return null;
  let bestes = null;
  let bestAbstand = LOOT_RADIUS;
  for (const g of spielWelt.alleVomTyp('gegenstand')) {
    const abstand = Math.hypot(g.x - bot.x, g.y - bot.y);
    if (abstand < bestAbstand && sichtlinieFrei(spielWelt.welt, bot.x, bot.y, g.x, g.y)) {
      bestes = g;
      bestAbstand = abstand;
    }
  }
  return bestes;
}

/** Zufälliges, begehbares Ziel 250–900 px entfernt – nicht in einem Zonen-Übergang. */
function zufallsZiel(spielWelt, bot) {
  const welt = spielWelt.welt;
  const g = welt.kachelGroesse;
  const z = spielWelt.zufall;
  const uebergaenge = spielWelt.karte.daten.uebergaenge ?? [];
  for (let versuch = 0; versuch < 12; versuch++) {
    const w = z.zahl() * Math.PI * 2;
    const r = 250 + z.zahl() * 650;
    const x = bot.x + Math.cos(w) * r;
    const y = bot.y + Math.sin(w) * r;
    const tx = Math.floor(x / g);
    const ty = Math.floor(y / g);
    if (tx < 2 || ty < 2 || tx >= welt.breite - 2 || ty >= welt.hoehe - 2 || welt.istBlockiert(tx, ty)) continue;
    if (uebergaenge.some((u) => x >= u.px.x0 - 64 && x < u.px.x1 + 64 && y >= u.px.y0 - 64 && y < u.px.y1 + 64)) continue;
    return { art: 'laufen', x: (tx + 0.5) * g, y: (ty + 0.5) * g };
  }
  return null;
}
