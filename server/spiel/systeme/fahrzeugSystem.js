import { FAHRZEUG, AUFPRALL_MIN_KMH, LATERNE_MIN_KMH, tempoZuKmh, EINSTIEG_ABSTAND, FAHRZEUG_MAX_KMH, abstandZumFahrzeug, ausstiegsPunkt, fahrzeugKacheln, kmhZuTempo, passt } from '../../../gemeinsam/physik/fahrzeug.js';
import { fuegeSchadenZu, toeten } from './kampfSystem.js';
import { schliesseKiste } from './kistenSystem.js';
import { explodiere } from './sonderZombieSystem.js';
import { erzeugeFahrzeug } from '../entitaeten/fahrzeug.js';
import { aktualisiereTeile, fehlteile } from './autoTeileSystem.js';

/**
 * Fahrzeuge: AKTION 'fahrzeug' = einsteigen (nächstes freies Auto in Reichweite) bzw. aussteigen.
 * Gefahren wird über die normalen Eingaben (gemeinsam/physik/bewegung.js → fahre), damit die Vorhersage passt.
 * Pro Tick: belegte Kacheln aktualisieren (Kollision für alle), Zombies anfahren, verwaiste Autos anhalten,
 * Aufprall-Schaden (Wand/Fahrzeug ≥ AUFPRALL_MIN_KMH), Bäume (≥ AUFPRALL_MIN_KMH) & Straßenlaternen (≥ LATERNE_MIN_KMH) umfahren.
 * Runde 38: Fußgänger werden angefahren (fahreSpielerAn: Schaden = km/h ÷ 110 der Maximal-Leben, ab 110 km/h sofort tot).
 * Zonenwechsel im Auto: loeseFahrzeugFuerWechsel / setzeFahrzeugEin / parkeZurueck (unten, aufgerufen vom SpielServer).
 */
const ANFAHR_MIN_TEMPO = 55; // px/s – langsamer schiebt das Auto Zombies nur
const ANFAHR_SCHADEN = 0.42; // Schaden pro px/s Tempo (Vollgas ≈ 140)

/**
 * Haltbarkeit: ein Zombie-Schlag = 1 (Boss mehr, siehe zombieSystem), ein überfahrener Zombie nur
 * konfiguration.fahrzeug.ueberfahrSchaden (0,5). Bei 0: der Fahrer fliegt raus, das Auto bleibt als Wrack stehen.
 */
export function schlageFahrzeug(spielWelt, fz, schlaege, { leise = false } = {}) {
  if (fz.kaputt || !(schlaege > 0)) return;
  fz.leben = Math.max(0, fz.leben - schlaege);
  // Runde 39: leise = Schaden durch eigenes Fahren (Wand, Laterne, Überfahren) → Client spielt keinen „Teller“-Klang
  spielWelt.ereignis({ typ: 'fahrzeugSchaden', id: fz.id, x: fz.x, y: fz.y, leben: fz.leben, ...(leise ? { leise: 1 } : {}) });
  if (fz.leben > 0) return;
  fz.kaputt = true;
  const beifahrer = (fz.beifahrerId ?? null) !== null ? spielWelt.holen(fz.beifahrerId) : null;
  if (beifahrer?.mitfahrt === fz) aussteigen(spielWelt, beifahrer, { erzwingen: true });
  const fahrer = fz.fahrerId !== null ? spielWelt.holen(fz.fahrerId) : null;
  if (fahrer?.fahrzeug === fz) {
    aussteigen(spielWelt, fahrer, { erzwingen: true });
    spielWelt.melde(fahrer.id, '💥 Das Auto ist kaputt – du wurdest rausgeschleudert!');
  }
  fz.fahrerId = null;
  fz.tempo = 0;
  spielWelt.ereignis({ typ: 'fahrzeugKaputt', id: fz.id, x: fz.x, y: fz.y });
}

/**
 * Runde 32: Insassen (Fahrer + Beifahrer) verletzen – `anteil` der eigenen Maximal-Lebenspunkte (Aufprall: bis
 * konfiguration.fahrzeug.insassenSchaden = 30 % bei Vollgas, Bombenzombie überfahren: bombeInsassen = 50 %).
 */
function verletzeInsassen(spielWelt, fz, anteil, winkel = 0) {
  if (!(anteil > 0)) return;
  const ids = [fz.fahrerId, fz.beifahrerId].filter((id) => id !== null && id !== undefined);
  for (const id of ids) {
    const s = spielWelt.holen(id);
    if (!s || s.typ !== 'spieler' || s.tot) continue;
    fuegeSchadenZu(spielWelt, s, (s.maxLeben ?? 100) * anteil, null, winkel, { explosion: true });
  }
}

/** Runde 32: Aufprall-Anteil 0..1 aus dem Tempo (ab AUFPRALL_MIN_KMH, 1 = Vollgas). */
function aufprallAnteil(kmh) {
  return Math.min(1, Math.max(0, (kmh - AUFPRALL_MIN_KMH) / (FAHRZEUG_MAX_KMH - AUFPRALL_MIN_KMH)));
}

export function fahrzeugAktion(spielWelt, spieler) {
  if (spieler.fahrzeug) return aussteigen(spielWelt, spieler);
  if (spieler.mitfahrt) return aussteigen(spielWelt, spieler);
  const fz = naechstesFreiesFahrzeug(spielWelt, spieler.x, spieler.y);
  // Runde 28: Fahrersitz besetzt → Beifahrersitz (der Erste fährt, der Zweite sitzt daneben)
  if (!fz) {
    const mit = naechstesFahrzeugMitPlatz(spielWelt, spieler.x, spieler.y);
    if (!mit) return;
    mit.beifahrerId = spieler.id;
    spieler.mitfahrt = mit;
    spieler.arbeit = null;
    spieler.nachladenRest = 0;
    setzeAufBeifahrersitz(spieler, mit);
    spielWelt.ereignis({ typ: 'fahrzeug', ein: true, beifahrer: true, x: mit.x, y: mit.y, von: spieler.id });
    spielWelt.melde(spieler.id, 'Du sitzt auf dem Beifahrersitz (E = aussteigen)');
    return;
  }
  if (fz.kaputt) return;
  fz.fahrerId = spieler.id;
  fz.tempo = 0;
  fz.lenkung = 0;
  spieler.fahrzeug = fz;
  spieler.arbeit = null;
  spieler.nachladenRest = 0;
  spielWelt.ereignis({ typ: 'fahrzeug', ein: true, x: fz.x, y: fz.y, von: spieler.id });
  // Runde 27: Steuer-Hinweis zeigt der Client selbst (Touch und PC unterschiedlich, clientSpiel Ereignis 'fahrzeug')
  const fehlt = fehlteile(fz); // Runde 47
  if (fehlt.length) spielWelt.melde(spieler.id, `🔧 Der Wagen springt nicht an – es fehlt: ${fehlt.join(', ')} (Auto-Menü: G)`);
}

/** Runde 28: Beifahrer sitzt rechts neben der Fahrzeugmitte (Seite = +y im Fahrzeug, bei winkel 0 nach unten). */
export function setzeAufBeifahrersitz(spieler, fz) {
  const seite = Math.min(10, fz.breite * 0.22);
  spieler.x = fz.x - Math.sin(fz.winkel) * seite;
  spieler.y = fz.y + Math.cos(fz.winkel) * seite;
}

function naechstesFahrzeugMitPlatz(spielWelt, x, y) {
  let bestes = null;
  let bestAbstand = Infinity;
  for (const fz of spielWelt.alleVomTyp('fahrzeug')) {
    if (fz.kaputt || fz.fahrerId === null || (fz.beifahrerId ?? null) !== null) continue;
    const abstand = abstandZumFahrzeug(fz, x, y);
    if (abstand <= EINSTIEG_ABSTAND && abstand < bestAbstand) {
      bestes = fz;
      bestAbstand = abstand;
    }
  }
  return bestes;
}

export function aussteigen(spielWelt, spieler, { erzwingen = false } = {}) {
  if (spieler.mitfahrt) {
    // Beifahrer: auf der Beifahrerseite raus (sonst irgendwo frei, notfalls neben das Auto)
    const mit = spieler.mitfahrt;
    const punkt = ausstiegsPunkt(mit, spielWelt.welt, spielWelt.konfiguration.spieler.radius); // 1. Kandidat = Beifahrerseite
    if (!punkt && !erzwingen) {
      spielWelt.melde(spieler.id, 'Hier ist kein Platz zum Aussteigen');
      return;
    }
    spieler.mitfahrt = null;
    if (mit.beifahrerId === spieler.id) mit.beifahrerId = null;
    if (punkt) {
      spieler.x = punkt.x;
      spieler.y = punkt.y;
    }
    spielWelt.ereignis({ typ: 'fahrzeug', ein: false, beifahrer: true, x: mit.x, y: mit.y, von: spieler.id });
    return;
  }
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
  fz.lenkung = 0;
  // Auto zerstört und rundum eingekeilt: trotzdem neben dem Wrack landen (nie im Wrack stecken bleiben)
  const ziel = punkt ?? (erzwingen ? { x: fz.x - Math.sin(fz.winkel) * (fz.breite / 2 + 18), y: fz.y + Math.cos(fz.winkel) * (fz.breite / 2 + 18) } : null);
  if (ziel) {
    spieler.x = ziel.x;
    spieler.y = ziel.y;
  }
  spielWelt.ereignis({ typ: 'fahrzeug', ein: false, x: fz.x, y: fz.y, von: spieler.id });
}

export function naechstesFreiesFahrzeug(spielWelt, x, y) {
  let bestes = null;
  let bestAbstand = Infinity;
  for (const fz of spielWelt.alleVomTyp('fahrzeug')) {
    if (fz.fahrerId !== null || fz.kaputt) continue;
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
  // Runde 28: Auto des Beifahrers nicht mehr in dieser Zone (Fahrer ist rübergefahren) → zu Fuß weiter
  for (const s of spielWelt.alleVomTyp('spieler')) if (s.mitfahrt && spielWelt.holen(s.mitfahrt.id) !== s.mitfahrt) s.mitfahrt = null;
  for (const fz of spielWelt.alleVomTyp('fahrzeug')) {
    // Runde 28: Beifahrer weg (tot, ausgeloggt, ausgestiegen)? → Platz frei; sonst sitzt er mit (Position folgt dem Auto)
    if ((fz.beifahrerId ?? null) !== null) {
      const bf = spielWelt.holen(fz.beifahrerId);
      if (!bf || bf.tot || bf.mitfahrt !== fz) fz.beifahrerId = null;
      else setzeAufBeifahrersitz(bf, fz);
    }
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
    fz.aufprallPause = Math.max(0, (fz.aufprallPause ?? 0) - dt);
    aktualisiereTeile(spielWelt, fz); // Runde 47: Sprit verbrauchen, Antrieb an/aus
    if (fz.kaputt) {
      fz.tempo = 0;
      fz.aufprall = null;
      continue;
    }
    if (fz.aufprall) {
      verarbeiteAufprall(spielWelt, fz);
      fz.aufprall = null;
    }
    if (Math.abs(fz.tempo) >= kmhZuTempo(AUFPRALL_MIN_KMH)) {
      fahreHindernisseUm(spielWelt, fz);
      if (fz.kaputt) continue;
    }
    if (Math.abs(fz.tempo) >= ANFAHR_MIN_TEMPO) {
      fahreZombiesAn(spielWelt, fz);
      fahreTiereUeber(spielWelt, fz);
    }
    if (tempoZuKmh(fz.tempo) >= (spielWelt.konfiguration.fahrzeug.spielerAnfahrMinKmh ?? 4)) fahreSpielerAn(spielWelt, fz);
  }
  laternenNachwachsen(spielWelt, dt);
}

/**
 * Aufprall an Wand/anderem Fahrzeug (fahre() hat `fz.aufprall = { kmh, schramm }` gemerkt): ab AUFPRALL_MIN_KMH Schaden am eigenen Auto,
 * linear mit dem Tempo; Entlangschrammen nur anteilig; dazwischen Pause (kein Dauerschaden beim Anliegen an der Wand).
 */
function verarbeiteAufprall(spielWelt, fz) {
  if (fz.aufprallPause > 0) return;
  const k = spielWelt.konfiguration.fahrzeug.aufprallSchaden;
  const { kmh, schramm } = fz.aufprall;
  const anteil = aufprallAnteil(kmh);
  const schaden = (k.min + (k.max - k.min) * anteil) * (schramm ? k.schrammFaktor : 1);
  // Runde 32: Insassen nehmen Schaden je nach Tempo (Vollgas frontal = insassenSchaden, Schrammen anteilig)
  verletzeInsassen(spielWelt, fz, (spielWelt.konfiguration.fahrzeug.insassenSchaden ?? 0.3) * anteil * (schramm ? k.schrammFaktor : 1), fz.winkel);
  fz.aufprallPause = k.pause;
  const vorn = fz.laenge / 2;
  spielWelt.ereignis({ typ: 'aufprall', x: fz.x + Math.cos(fz.winkel) * vorn * Math.sign(fz.tempo || 1), y: fz.y + Math.sin(fz.winkel) * vorn * Math.sign(fz.tempo || 1), tempo: Math.abs(fz.tempo) });
  schlageFahrzeug(spielWelt, fz, schaden, { leise: true });
  stosseFahrzeugAn(spielWelt, fz, -Math.sign(fz.tempo || 1) * kmhZuTempo(kmh), fz.aufprall.mit); // fz.tempo ist schon umgekehrt
}

/** Runde 31: Zusammenstoß – das getroffene, unbesetzte Fahrzeug bekommt einen Stoß in Fahrtrichtung des Rammers (ein Teil des Tempos, entlang seiner Längsachse). */
function stosseFahrzeugAn(spielWelt, fz, tempo, andereId) {
  if (andereId === undefined || andereId === null) return;
  const anderes = spielWelt.holen(andereId);
  if (!anderes || anderes.typ !== 'fahrzeug' || anderes.kaputt || anderes.fahrerId !== null) return;
  const stoss = (spielWelt.konfiguration.fahrzeug.stossFaktor ?? 0.4) * tempo;
  const mitFahrtrichtung = Math.cos(fz.winkel) * Math.cos(anderes.winkel) + Math.sin(fz.winkel) * Math.sin(anderes.winkel);
  anderes.tempo = Math.max(-FAHRZEUG.rueckwaertsMax, Math.min(FAHRZEUG.max, anderes.tempo + stoss * mitFahrtrichtung));
}

/** Bäume & Straßenlaternen unter dem Fahrzeug bei ≥ AUFPRALL_MIN_KMH: umgefahren (Baum kippt wie beim Fällen, Laterne knickt um); Baum bremst etwas, Laterne deutlich (laterneBremse) + kleiner Schaden. */
function fahreHindernisseUm(spielWelt, fz) {
  const welt = spielWelt.welt;
  const kandidaten = welt.umfahrbareImKreis(fz.x, fz.y, fz.laenge / 2 + 8);
  if (kandidaten.length === 0) return;
  const fahrer = fz.fahrerId !== null ? spielWelt.holen(fz.fahrerId) : null;
  for (const h of kandidaten) {
    if (abstandZumFahrzeug(fz, h.x, h.y) > h.radius + 2) continue;
    if (h.typ === 'laterne' && tempoZuKmh(fz.tempo) < LATERNE_MIN_KMH) continue; // Laternen erst ab LATERNE_MIN_KMH
    if (h.typ === 'baum') {
      verletzeInsassen(spielWelt, fz, (spielWelt.konfiguration.fahrzeug.insassenSchaden ?? 0.3) * aufprallAnteil(tempoZuKmh(Math.abs(fz.tempo))), fz.winkel); // Runde 32
      welt.setzeRessource(h.id, false);
      spielWelt.ressourcenNachwuchs.set(h.id, spielWelt.konfiguration.ressourcen.holz.nachwachsen);
      spielWelt.ereignis({ typ: 'abgebaut', art: 'holz', x: h.x, y: h.y, id: h.id, von: fahrer?.id ?? null, sx: fz.x, sy: fz.y, fahrzeug: true });
      fz.tempo *= spielWelt.konfiguration.fahrzeug.baumBremse ?? 0.45; // Phase 4: Baum bremst mindestens so stark wie eine Laterne
    } else {
      welt.setzeLaterne(h.id, false);
      spielWelt.laternenNachwuchs.set(h.id, spielWelt.konfiguration.fahrzeug.laterneNachwachsen);
      spielWelt.ereignis({ typ: 'laterneUmgefahren', id: h.id, x: h.x, y: h.y, sx: fz.x, sy: fz.y });
      fz.tempo *= spielWelt.konfiguration.fahrzeug.laterneBremse ?? 0.6; // Runde 18: Laterne bremst deutlich
      schlageFahrzeug(spielWelt, fz, spielWelt.konfiguration.fahrzeug.laterneSchaden, { leise: true });
      if (fz.kaputt) return;
    }
  }
}

/** Umgefahrene Laternen werden nach einiger Zeit wieder aufgestellt – nicht, solange ein Fahrzeug daneben steht. */
function laternenNachwachsen(spielWelt, dt) {
  for (const [id, rest] of spielWelt.laternenNachwuchs) {
    const neu = rest - dt;
    if (neu > 0) {
      spielWelt.laternenNachwuchs.set(id, neu);
      continue;
    }
    const l = spielWelt.welt.laternen[id];
    const belegt = spielWelt.alleVomTyp('fahrzeug').some((fz) => abstandZumFahrzeug(fz, l.x, l.y) < 24);
    if (belegt) {
      spielWelt.laternenNachwuchs.set(id, 5);
      continue;
    }
    spielWelt.laternenNachwuchs.delete(id);
    spielWelt.welt.setzeLaterne(id, true);
  }
}

/** Hasen unter dem Auto: sofort überfahren (Fleisch liegt dort), das Auto bremst nicht und nimmt keinen Schaden. */
function fahreTiereUeber(spielWelt, fz) {
  const fahrer = fz.fahrerId !== null ? spielWelt.holen(fz.fahrerId) : null;
  for (const t of [...spielWelt.alleVomTyp('tier')]) {
    if (abstandZumFahrzeug(fz, t.x, t.y) > t.radius + 4) continue;
    spielWelt.ereignis({ typ: 'aufprall', x: t.x, y: t.y, tempo: 70, ziel: 'tier' });
    toeten(spielWelt, t, fahrer);
  }
}

/** Zombies vor/unter dem Auto: Schaden je nach Tempo, wegschleudern, Auto bremst etwas. */
function fahreZombiesAn(spielWelt, fz) {
  const fahrer = fz.fahrerId !== null ? spielWelt.holen(fz.fahrerId) : null;
  for (const z of spielWelt.alleVomTyp('zombie')) {
    if (fz.treffer.has(z.id)) continue;
    if (abstandZumFahrzeug(fz, z.x, z.y) > z.radius + 2) continue;
    fz.treffer.set(z.id, 0.6);
    if (z.variante === 'explosiv') {
      // Runde 32: Bombenzombie überfahren → explodiert; Auto verliert bombeAuto (50 %) der Haltbarkeit, Insassen bombeInsassen (50 %) ihres Lebens
      const k = spielWelt.konfiguration.fahrzeug;
      const vorher = fz.leben;
      explodiere(spielWelt, z);
      fz.leben = vorher; // Explosion trifft im Auto nur das Auto (kampfSystem) – hier genau festgelegt statt doppelt
      verletzeInsassen(spielWelt, fz, k.bombeInsassen ?? 0.5, fz.winkel);
      schlageFahrzeug(spielWelt, fz, (fz.maxLeben ?? k.haltbarkeit) * (k.bombeAuto ?? 0.5));
      if (fz.kaputt) return;
      continue;
    }
    const schaden = Math.abs(fz.tempo) * ANFAHR_SCHADEN;
    spielWelt.ereignis({ typ: 'aufprall', x: z.x, y: z.y, tempo: Math.abs(fz.tempo), ziel: 'zombie' }); // ziel → Client: Matsch-Sound
    fuegeSchadenZu(spielWelt, z, schaden, fahrer, fz.winkel + (fz.tempo < 0 ? Math.PI : 0), { ohneXp: true }); // Roadkill bringt 0 XP
    fz.tempo *= 0.8;
    schlageFahrzeug(spielWelt, fz, spielWelt.konfiguration.fahrzeug.ueberfahrSchaden, { leise: true });
    if (fz.kaputt) return;
  }
}

/**
 * Runde 38: Spieler (auch Bots) zu Fuß, die vom Auto erfasst werden: Schaden = Anteil der Maximal-Lebenspunkte gleich
 * Tempo ÷ spielerTodKmh (110 km/h; bei höchstens 120 km/h also ab 110 sofort tot, darunter z. B. 55 km/h = 50 %).
 * Gilt unabhängig vom PvP-Schalter; Insassen (Fahrer/Beifahrer) und Gottmodus bleiben verschont. `fz.treffer` = kurze Sperre je Opfer.
 */
function fahreSpielerAn(spielWelt, fz) {
  const k = spielWelt.konfiguration.fahrzeug;
  const kmh = tempoZuKmh(fz.tempo);
  const fahrer = fz.fahrerId !== null ? spielWelt.holen(fz.fahrerId) : null;
  for (const s of [...spielWelt.alleVomTyp('spieler')]) {
    if (s.tot || s.gottmodus || s.fliegen || s.fahrzeug || s.mitfahrt || s.id === fz.fahrerId) continue;
    if (fz.treffer.has(s.id)) continue;
    if (abstandZumFahrzeug(fz, s.x, s.y) > (s.radius ?? spielWelt.konfiguration.spieler.radius) + 2) continue;
    fz.treffer.set(s.id, 0.8);
    spielWelt.ereignis({ typ: 'aufprall', x: s.x, y: s.y, tempo: Math.abs(fz.tempo), ziel: 'spieler' });
    const winkel = fz.winkel + (fz.tempo < 0 ? Math.PI : 0);
    const todKmh = k.spielerTodKmh ?? 110;
    if (kmh >= todKmh) {
      spielWelt.melde(s.id, '💥 Du wurdest von einem Auto überfahren!');
      toeten(spielWelt, s, fahrer, { endgueltig: true, ohneXp: true });
    } else {
      spielWelt.melde(s.id, '💥 Du wurdest angefahren!');
      fuegeSchadenZu(spielWelt, s, (s.maxLeben ?? 100) * (kmh / todKmh), fahrer, winkel, { ohneXp: true });
    }
    fz.tempo *= 0.9;
  }
}

// ---------------------------------------------------------------------------
// Zonenwechsel im Auto (Runde 21): das Auto fährt mit in die neue Zone (spielServer.#wechsleZone)

/**
 * Auto des Fahrers aus seiner Zone lösen (Kofferraum-Fenster anderer zu, Entität raus). Liefert die Entität oder null
 * (zu Fuß / Wrack). Passt es drüben nicht hin: `parkeZurueck`.
 */
export function loeseFahrzeugFuerWechsel(spielWelt, spieler) {
  const fz = spieler.fahrzeug;
  if (!fz || fz.kaputt) return null;
  spieler.fahrzeug = null;
  fz.fahrerId = null;
  fz.tempo = 0;
  fz.lenkung = 0;
  for (const s of spielWelt.alleVomTyp('spieler')) if (s.offeneKiste === `f${fz.id}`) schliesseKiste(spielWelt, s);
  spielWelt.entfernen(fz.id);
  return fz;
}

/** Konnte das Auto drüben nirgends hin: bleibt in der alten Zone stehen, wo es war. */
export function parkeZurueck(spielWelt, fz) {
  fz.letzteKacheln = '';
  spielWelt.hinzufuegen(fz);
}

/**
 * Auto in der neuen Zone nahe `punkt` abstellen (freie Pose, nicht in einem Übergang) und den Spieler hineinsetzen.
 * Sucht ringförmig bis ~6 Kacheln, je Stelle Fahrtrichtung wie vorher bzw. gedreht. @returns true, wenn es geklappt hat
 */
export function setzeFahrzeugEin(spielWelt, alt, spieler, punkt) {
  const g = spielWelt.welt.kachelGroesse;
  const fz = erzeugeFahrzeug({ id: spielWelt.neueId(), modell: alt.modell, x: punkt.x, y: punkt.y, winkel: alt.winkel, laenge: alt.laenge, breite: alt.breite, haltbarkeit: alt.maxLeben, teile: { tank: alt.tank, reifen: alt.reifen, batterie: alt.batterie } });
  fz.leben = alt.leben;
  fz.kofferraum = alt.kofferraum;
  const uebergaenge = spielWelt.karte.daten.uebergaenge ?? [];
  const imUebergang = (x, y) => uebergaenge.some((u) => x + fz.laenge / 2 > u.px.x0 && x - fz.laenge / 2 < u.px.x1 && y + fz.laenge / 2 > u.px.y0 && y - fz.laenge / 2 < u.px.y1);
  const winkel = [alt.winkel, alt.winkel + Math.PI, alt.winkel + Math.PI / 2, alt.winkel - Math.PI / 2];
  for (let ring = 0; ring <= 6; ring++) {
    for (let dy = -ring; dy <= ring; dy++) {
      for (let dx = -ring; dx <= ring; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== ring) continue;
        const x = punkt.x + dx * g;
        const y = punkt.y + dy * g;
        if (imUebergang(x, y)) continue;
        const w = winkel.find((w) => passt(fz, x, y, spielWelt.welt, w));
        if (w === undefined) continue;
        Object.assign(fz, { x, y, winkel: w, fahrerId: spieler.id });
        spielWelt.hinzufuegen(fz);
        Object.assign(spieler, { x, y, fahrzeug: fz });
        return true;
      }
    }
  }
  return false;
}
