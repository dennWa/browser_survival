import { AKTIONEN } from '../../../gemeinsam/protokoll.js';
import { findePfad } from '../../../gemeinsam/physik/pfadfindung.js';
import { findeSitz, sitzPlaetze } from '../../../gemeinsam/welt/sitze.js';

/**
 * Runde 44: Bots leben im Lager wie Menschen – und hören auf Chat-Befehle.
 *
 * Alltag (friedliche Zonen, `welt.friedlich`, z. B. Lagerplatz) statt Loot-Suche/Zufallslauf (botSystem.folgeZiel ruft `lagerAlltag`):
 *   sitzen     freien Stuhl/Bank suchen (oft am Feuer), hinlaufen, AKTION sitzen, 25–70 s sitzen bleiben, wieder aufstehen
 *   waermen    am Feuer stehen und hineinschauen
 *   anschauen  zu einem Deko-Objekt (Zelt, Auto, Tisch, Gitarre, Holzstapel …) gehen und es eine Weile ansehen
 *   schlendern zu einem Punkt in der Nähe des Feuers (bleibt im Lager, nicht am Zaun/Ausgang)
 * Chat (spielServer.#chat → `botBefehl`): „setzt euch“/„hinsetzen“/„ans Feuer“ → alle Bots der Zone (oder nur die genannten,
 *   „Ida, setz dich“) gehen zu freien Plätzen am Feuer und bleiben sitzen (`bot.befehl = 'feuer'`, gilt in jeder Zone; ohne Feuer:
 *   freier Sitz in der Nähe, sonst auf den Boden). „aufstehen“/„steht auf“ → Befehl weg, aufstehen, eigene Wege gehen.
 * Bots nutzen dieselben Aktionen wie Spieler (aktionsPuffer). Platz-Reservierung unter Bots: `b.taetigkeit.sitz`.
 */
const FEUER_SUCHWEITE = 1400; // px: so weit sucht ein Bot nach dem Lagerfeuer
const FEUER_SITZ_RADIUS = 5; // Kacheln: Plätze so nah am Feuer gelten als „am Feuer“
const SCHLENDER_RADIUS = 12; // Kacheln um das Feuer
const ANSCHAU_MUSTER = /tent|car|guitar|table|log-stack|wood-tent|barrel|crate|sign|campfire|post|lamp|candle|tree/i;
const SITZ_DAUER = [25, 70];
const NACH_AUFSTEHEN_PAUSE = 50; // s ohne erneutes Hinsetzen nach „aufstehen“

const SETZEN = /\b(setzt euch|setz dich|setzen|hinsetzen|platz nehmen|nehmt platz|ans feuer|zum feuer|kommt (mal )?(her|ans feuer))\b/i;
const AUFSTEHEN = /\b(aufstehen|steht auf|steh auf|aufgestanden|los geht'?s|weitermachen|macht euer ding|geht spielen)\b/i;
const ANTWORT_SETZEN = ['Bin unterwegs! 🔥', 'Gute Idee, ich komm ans Feuer.', 'Okay, ich such mir einen Platz.', 'Komme! Ist eh gemütlich da.', 'Bin gleich da.'];
const ANTWORT_AUFSTEHEN = ['Okay, ich vertret mir die Beine.', 'Alles klar, bis gleich!', 'Na gut – war gerade so bequem.', 'Bin dann mal unterwegs.'];
const ANTWORT_SCHON = ['Sitz doch schon 🙂', 'Bin schon am Feuer.'];

/**
 * Chat-Text eines Spielers auswerten. @returns Antworten [{ name, text }] (je angesprochenem Bot eine) – leer, wenn kein Befehl.
 */
export function botBefehl(spielWelt, von, text) {
  const setzen = SETZEN.test(text);
  const aufstehen = !setzen && AUFSTEHEN.test(text);
  if (!setzen && !aufstehen) return [];
  const bots = [...spielWelt.alleVomTyp('spieler')].filter((s) => s.bot && !s.tot && s !== von);
  if (!bots.length) return [];
  const klein = text.toLowerCase();
  const genannt = bots.filter((b) => klein.includes(b.name.replace(/^Bot\s+/, '').toLowerCase()));
  const ziel = genannt.length ? genannt : bots;
  const z = spielWelt.zufall;
  const waehle = (liste) => liste[z.ganzzahl(0, liste.length - 1)];
  const antworten = [];
  for (const bot of ziel) {
    const b = bot.bot;
    if (setzen) {
      const schon = b.befehl === 'feuer' && bot.arbeit?.art === 'sitzen';
      b.befehl = 'feuer';
      if (!schon) beendeTaetigkeit(bot);
      antworten.push({ name: bot.name, text: waehle(schon ? ANTWORT_SCHON : ANTWORT_SETZEN) });
    } else {
      b.befehl = null;
      b.sitzSperre = NACH_AUFSTEHEN_PAUSE;
      beendeTaetigkeit(bot);
      antworten.push({ name: bot.name, text: waehle(ANTWORT_AUFSTEHEN) });
    }
  }
  return antworten;
}

/** Laufende Tätigkeit abbrechen (sitzt der Bot, steht er im nächsten Takt auf). */
function beendeTaetigkeit(bot) {
  const b = bot.bot;
  b.taetigkeit = null;
  b.ziel = null;
  b.pfad = null;
  b.pause = 0;
  if (bot.arbeit?.art === 'sitzen') b.aufstehen = true;
}

/** Hat der Bot gerade etwas Eigenes zu tun (Befehl oder friedliche Zone)? Dann übernimmt `lagerAlltag` statt Loot/Zufallslauf. */
export function hatLagerAlltag(spielWelt, bot) {
  return bot.bot.befehl === 'feuer' || !!spielWelt.welt.friedlich;
}

/**
 * Pro Tick ohne Gefahr (botSystem.folgeZiel): Tätigkeit fortsetzen oder eine neue wählen. @returns Laufrichtung { x, y }
 */
export function lagerAlltag(spielWelt, bot, dt) {
  const b = bot.bot;
  const z = spielWelt.zufall;
  b.sitzSperre = Math.max(0, (b.sitzSperre ?? 0) - dt);
  if (b.aufstehen) {
    b.aufstehen = false;
    if (bot.arbeit?.art === 'sitzen' && b.aktionWarte <= 0) {
      bot.aktionsPuffer.push({ art: AKTIONEN.SITZEN }); // umschalten = aufstehen
      b.aktionWarte = 0.4;
      b.pause = 0.8 + z.zahl();
    }
    return STILL;
  }
  if (b.pause > 0) {
    b.pause -= dt;
    return STILL;
  }
  let t = b.taetigkeit;
  if (!t) t = b.taetigkeit = waehleTaetigkeit(spielWelt, bot);
  if (!t) {
    b.pause = 1.5;
    return STILL;
  }
  // Am Ziel? (Sitzen: am Standpunkt vor dem Sitz)
  if (!t.angekommen) {
    const richtung = laufeZu(spielWelt, bot, t);
    if (richtung) return richtung;
    t.angekommen = true;
    t.rest = t.dauer;
  }
  if (t.art === 'sitzen') return sitze(spielWelt, bot, t, dt);
  // Stehen und schauen (wärmen, anschauen, schlendern)
  if (t.blickAuf) b.blickZiel = Math.atan2(t.blickAuf.y - bot.y, t.blickAuf.x - bot.x) + Math.sin(t.rest * 0.7) * 0.25;
  else {
    b.schauen = (b.schauen ?? 0) - dt;
    if (b.schauen <= 0) {
      b.schauen = 1 + z.zahl() * 2;
      b.blickZiel = bot.blick + (z.zahl() * 2 - 1) * 1.4;
    }
  }
  t.rest -= dt;
  if (t.rest <= 0) {
    b.taetigkeit = null;
    b.pause = 0.5 + z.zahl() * 1.5;
  }
  return STILL;
}

const STILL = Object.freeze({ x: 0, y: 0 });

/** Sitzen: hinsetzen (AKTION), sitzen bleiben, bei Befehl „feuer“ bis zum Aufstehen-Befehl. */
function sitze(spielWelt, bot, t, dt) {
  const b = bot.bot;
  if (bot.arbeit?.art !== 'sitzen') {
    if (t.gesessen) {
      // schon gesessen und wieder hoch (z. B. Platz weg) → fertig
      b.taetigkeit = null;
      return STILL;
    }
    if (b.aktionWarte <= 0) {
      bot.aktionsPuffer.push({ art: AKTIONEN.SITZEN });
      b.aktionWarte = 0.5;
      t.versuche = (t.versuche ?? 0) + 1;
      if (t.versuche > 3) {
        b.taetigkeit = null; // klappt nicht (Platz belegt?) → etwas anderes
        b.pause = 0.5;
      }
    }
    return STILL;
  }
  t.gesessen = true;
  b.blickZiel = bot.blick; // im Sitzen nicht herumdrehen (die Figur schaut ohnehin in Sitzrichtung)
  if (b.befehl === 'feuer' && t.amFeuer) return STILL; // bleibt, bis jemand „aufstehen“ sagt
  t.rest -= dt;
  if (t.rest <= 0) {
    b.aufstehen = true;
    b.taetigkeit = null;
    b.sitzSperre = 15 + spielWelt.zufall.zahl() * 20;
  }
  return STILL;
}

/** Laufen zum Ziel der Tätigkeit (A*). @returns Richtung oder null = angekommen */
function laufeZu(spielWelt, bot, t) {
  const b = bot.bot;
  if (bot.arbeit?.art === 'sitzen') {
    b.aufstehen = true; // erst aufstehen, dann loslaufen
    return STILL;
  }
  if (Math.hypot(t.x - bot.x, t.y - bot.y) < 10) return null;
  if (!b.pfad || b.pfadZiel !== t) {
    b.pfad = findePfad(spielWelt.welt, bot.x, bot.y, t.x, t.y, { maxKnoten: 4000, tuerKosten: 2 });
    b.pfadZiel = t;
    if (!b.pfad) {
      b.taetigkeit = null;
      b.pause = 0.6;
      return STILL;
    }
  }
  while (b.pfad.length && Math.hypot(b.pfad[0].x - bot.x, b.pfad[0].y - bot.y) < 10) b.pfad.shift();
  const naechster = b.pfad[0] ?? t;
  const dx = naechster.x - bot.x;
  const dy = naechster.y - bot.y;
  const l = Math.hypot(dx, dy);
  if (!b.pfad.length && l < 10) return null;
  b.blickZiel = Math.atan2(dy, dx);
  return { x: dx / l, y: dy / l };
}

/** Neue Tätigkeit wählen – mit Befehl „feuer“ immer: Platz am Feuer. */
function waehleTaetigkeit(spielWelt, bot) {
  const b = bot.bot;
  const z = spielWelt.zufall;
  const feuer = naechstesFeuer(spielWelt, bot);
  if (b.befehl === 'feuer') return sitzTaetigkeit(spielWelt, bot, feuer, true) ?? bodenSitz(spielWelt, bot, feuer);
  const r = z.zahl();
  if (r < 0.42 && !(b.sitzSperre > 0)) {
    const t = sitzTaetigkeit(spielWelt, bot, feuer, z.zahl() < 0.6);
    if (t) return t;
  }
  if (r < 0.6 && feuer) return waermTaetigkeit(spielWelt, bot, feuer);
  if (r < 0.85) {
    const t = anschauTaetigkeit(spielWelt, bot, feuer);
    if (t) return t;
  }
  return schlenderTaetigkeit(spielWelt, bot, feuer);
}

function naechstesFeuer(spielWelt, bot) {
  const f = spielWelt.welt.naechstesBauwerk(bot.x, bot.y, FEUER_SUCHWEITE, (b) => b.typ === 'lagerfeuer' && b.brennt);
  if (!f) return null;
  const g = spielWelt.welt.kachelGroesse;
  return { x: (f.tx + 0.5) * g, y: (f.ty + 0.5) * g };
}

/** Alle Sitzplätze der Karte (einmal je Zone berechnet). */
function alleSitze(spielWelt) {
  if (!spielWelt.botSitze) {
    const welt = spielWelt.welt;
    spielWelt.botSitze = welt.objekte.flatMap((o) => (o.ebene === 'oben' || o.ebene === 'boden' || o.ebene === 'unsichtbar' || o.ebene === 'licht' ? [] : sitzPlaetze(o, welt.typen?.[o.typ], welt.kachelGroesse)));
  }
  return spielWelt.botSitze;
}

/** Sitzt dort schon jemand oder hat ein anderer Bot den Platz vor? */
function platzBelegt(spielWelt, bot, p) {
  for (const s of spielWelt.alleVomTyp('spieler')) {
    if (s === bot) continue;
    const ort = s.arbeit?.art === 'sitzen' ? s.arbeit.ort : null;
    if (ort && Math.abs(ort.x - p.x) < 6 && Math.abs(ort.y - p.y) < 6) return true;
    const vor = s.bot?.taetigkeit?.sitz;
    if (vor && Math.abs(vor.x - p.x) < 6 && Math.abs(vor.y - p.y) < 6) return true;
  }
  return false;
}

/** Freien Sitz suchen (amFeuer: nur Plätze nahe am Feuer) und einen begehbaren Standpunkt davor, von dem aus genau er gewählt wird. */
function sitzTaetigkeit(spielWelt, bot, feuer, amFeuer) {
  const welt = spielWelt.welt;
  const g = welt.kachelGroesse;
  const z = spielWelt.zufall;
  let kandidaten = alleSitze(spielWelt).filter((p) => !platzBelegt(spielWelt, bot, p));
  if (amFeuer && feuer) kandidaten = kandidaten.filter((p) => Math.hypot(p.x - feuer.x, p.y - feuer.y) < FEUER_SITZ_RADIUS * g);
  else kandidaten = kandidaten.filter((p) => Math.hypot(p.x - bot.x, p.y - bot.y) < 900);
  if (!kandidaten.length) return null;
  // nahe Plätze bevorzugen, etwas Zufall (nicht alle Bots auf denselben Stuhl)
  kandidaten.sort((a, b) => Math.hypot(a.x - bot.x, a.y - bot.y) * (0.7 + 0.6 * z.zahl()) - Math.hypot(b.x - bot.x, b.y - bot.y) * (0.7 + 0.6 * z.zahl()));
  for (const p of kandidaten.slice(0, 6)) {
    const stand = standpunkt(spielWelt, bot, p);
    if (!stand) continue;
    const nahFeuer = !!feuer && Math.hypot(p.x - feuer.x, p.y - feuer.y) < FEUER_SITZ_RADIUS * g;
    return { art: 'sitzen', x: stand.x, y: stand.y, sitz: { x: p.x, y: p.y }, amFeuer: nahFeuer, dauer: SITZ_DAUER[0] + z.zahl() * (SITZ_DAUER[1] - SITZ_DAUER[0]) };
  }
  return null;
}

/** Begehbarer Punkt nahe am Sitz, an dem findeSitz genau diesen Platz liefert (vorn zuerst, dann seitlich, dann hinten). */
function standpunkt(spielWelt, bot, p) {
  const welt = spielWelt.welt;
  const g = welt.kachelGroesse;
  for (const abstand of [0.95, 1.25, 1.5]) {
    for (const dreh of [0, 0.6, -0.6, Math.PI / 2, -Math.PI / 2, 2.2, -2.2, Math.PI]) {
      const w = p.blick + dreh;
      const x = p.x + Math.cos(w) * abstand * g;
      const y = p.y + Math.sin(w) * abstand * g;
      if (welt.istBereichBlockiert(x - 9, y - 9, x + 9, y + 9)) continue;
      const gefunden = findeSitz(welt, x, y, (q) => platzBelegt(spielWelt, bot, q));
      if (!gefunden || Math.abs(gefunden.x - p.x) > 1 || Math.abs(gefunden.y - p.y) > 1) continue;
      return { x, y };
    }
  }
  return null;
}

/** Kein freier Stuhl am Feuer: auf den Boden ans Feuer setzen (Ring ~2 Kacheln). Ohne Feuer: einfach da hinsetzen, wo man ist. */
function bodenSitz(spielWelt, bot, feuer) {
  if (!feuer) return { art: 'sitzen', x: bot.x, y: bot.y, amFeuer: true, dauer: 1e6 };
  const punkt = ringPunkt(spielWelt, bot, feuer, 2.1);
  return punkt ? { art: 'sitzen', ...punkt, amFeuer: true, dauer: 1e6 } : { art: 'sitzen', x: bot.x, y: bot.y, amFeuer: true, dauer: 1e6 };
}

function waermTaetigkeit(spielWelt, bot, feuer) {
  const punkt = ringPunkt(spielWelt, bot, feuer, 2.0 + spielWelt.zufall.zahl() * 0.8);
  return punkt ? { art: 'waermen', ...punkt, blickAuf: feuer, dauer: 8 + spielWelt.zufall.zahl() * 14 } : null;
}

/** Freier Punkt auf einem Ring um das Feuer (Radius in Kacheln), von der Bot-Seite aus zuerst. */
function ringPunkt(spielWelt, bot, feuer, radius) {
  const welt = spielWelt.welt;
  const g = welt.kachelGroesse;
  const start = Math.atan2(bot.y - feuer.y, bot.x - feuer.x) + (spielWelt.zufall.zahl() - 0.5) * 1.2;
  for (let i = 0; i < 16; i++) {
    const w = start + (i % 2 ? 1 : -1) * Math.ceil(i / 2) * 0.4;
    const x = feuer.x + Math.cos(w) * radius * g;
    const y = feuer.y + Math.sin(w) * radius * g;
    if (welt.istBereichBlockiert(x - 9, y - 9, x + 9, y + 9)) continue;
    if ([...spielWelt.alleVomTyp('spieler')].some((s) => s !== bot && Math.hypot(s.x - x, s.y - y) < 22)) continue;
    return { x, y };
  }
  return null;
}

/** Zu einem Deko-Objekt gehen und es ansehen. */
function anschauTaetigkeit(spielWelt, bot, feuer) {
  const welt = spielWelt.welt;
  const g = welt.kachelGroesse;
  const z = spielWelt.zufall;
  const mitte = feuer ?? bot;
  const ziele = welt.objekte.filter((o) => {
    const datei = welt.typen?.[o.typ]?.glbDatei ?? '';
    if (!ANSCHAU_MUSTER.test(datei) || /fence/i.test(datei)) return false;
    return Math.hypot((o.x + o.b / 2) * g - mitte.x, (o.y + o.h / 2) * g - mitte.y) < SCHLENDER_RADIUS * g;
  });
  for (let versuch = 0; versuch < 5 && ziele.length; versuch++) {
    const o = ziele[z.ganzzahl(0, ziele.length - 1)];
    const ox = (o.x + o.b / 2) * g;
    const oy = (o.y + o.h / 2) * g;
    const r = (Math.max(o.b, o.h) / 2 + 0.9) * g;
    for (let i = 0; i < 8; i++) {
      const w = z.zahl() * Math.PI * 2;
      const x = ox + Math.cos(w) * r;
      const y = oy + Math.sin(w) * r;
      if (welt.istBereichBlockiert(x - 9, y - 9, x + 9, y + 9)) continue;
      return { art: 'anschauen', x, y, blickAuf: { x: ox, y: oy }, dauer: 4 + z.zahl() * 8 };
    }
  }
  return null;
}

/** Ein paar Schritte gehen – in friedlichen Zonen in der Nähe des Feuers bleiben (nicht zum Zaun/Ausgang). */
function schlenderTaetigkeit(spielWelt, bot, feuer) {
  const welt = spielWelt.welt;
  const g = welt.kachelGroesse;
  const z = spielWelt.zufall;
  const mitte = feuer ?? bot;
  for (let versuch = 0; versuch < 12; versuch++) {
    const w = z.zahl() * Math.PI * 2;
    const r = (2.5 + z.zahl() * (SCHLENDER_RADIUS - 2.5)) * g;
    const x = mitte.x + Math.cos(w) * r;
    const y = mitte.y + Math.sin(w) * r;
    if (welt.istBereichBlockiert(x - 9, y - 9, x + 9, y + 9)) continue;
    return { art: 'schlendern', x, y, dauer: 2 + z.zahl() * 4 };
  }
  return null;
}
