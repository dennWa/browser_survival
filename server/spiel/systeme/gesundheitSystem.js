import { tempoFaktor } from '../../../gemeinsam/spieler/skills.js';
import { GEGENSTAENDE } from '../konfiguration/gegenstaende.js';
import { toeten } from './kampfSystem.js';

/**
 * Runde 24 (Überleben): Verletzungen, Krankheiten, Müdigkeit, Buffs und verderbliches Essen. Werte: konfiguration.gesundheit.
 *   spieler.zustand = { blutung: bool, infektion: 0..100 (0 = gesund), bruch: 0 | 1 (gebrochen) | 2 (geschient), schieneRest,
 *                       vergiftung: Sekunden }
 *   Auslöser: Zombie-Treffer → Blutung (blutungChance) / Infektion (infektionChance, Spucke ×2); harte Treffer (≥ bruchAb) und
 *   Explosionen → Bruch; rohes Fleisch/Fisch, dreckiges Wasser, Verdorbenes → Vergiftung (def.vergiftung = Chance).
 *   Heilung über Items (def.heilt = ['blutung', 'infektion', 'bruch', 'vergiftung']): Verband/Erste-Hilfe → Blutung,
 *   Antibiotika → Infektion, Schiene → Bruch (danach `schieneDauer` s humpeln), Aktivkohle → Vergiftung.
 *   Müdigkeit: spieler.muedigkeit 0..100 steigt je Spielstunde; Schlaf senkt sie (Bett-Qualität, arbeitSystem.wacheAuf).
 *   Buffs: spieler.buffs { satt | warm | kraft: Restsekunden } aus besonderem Essen (def.buff) – wirken in ueberleben/kampf.
 *   Verderb: Items mit def.verdirbt (Sekunden) zählen am Eintrag `verderb` herunter (Vorratsschrank ×vorratFaktor) → 'verdorben'.
 * Tempo: Bruch/Schiene/Erschöpfung drücken spieler.tempoFaktor (geht als spielerDaten an die Client-Vorhersage).
 * Runde 28: Nässe (spieler.naesse 0..5, aktualisiereNaesse) → Erkältung (zustand.erkaeltung 0..100, Husten-Ereignis,
 *   spieler.sprintMalus, Schaden ab 50) · Blutung: jeder Schuss, 20 % je Schlag, Ereignis 'blutfleck' jede Sekunde.
 */
export function neuerZustand() {
  return { blutung: false, infektion: 0, bruch: 0, schieneRest: 0, vergiftung: 0, erkaeltung: 0, erkaeltungsRisiko: 0 };
}

/** Runde 28: Nässe-Stufe 0 (trocken) … 5 (klatschnass) aus dem Nässewert (0..5, stetig). */
export function naesseStufe(naesse) {
  return naesse > 0.001 ? Math.min(5, Math.ceil(naesse - 1e-6)) : 0;
}
export const NAESSE_NAMEN = Object.freeze(['trocken', 'klamm', 'feucht', 'nass', 'sehr nass', 'klatschnass']);

/**
 * Runde 28: Nässe & Erkältung (Werte: konfiguration.naesse). Pro Tick aus ueberlebenSystem (vor der Kälte).
 * Nässe steigt draußen bei Regen/Gewitter (Schnee schwächer), sinkt drinnen/im Auto/im Bett (1 Stufe/min), am Feuer schneller,
 * draußen nur bei klarem Wetter am Tag (1 Stufe je 2 min).
 */
export function aktualisiereNaesse(spielWelt, spieler, dt, { regenschutz = 0, feuer = false } = {}) {
  const k = spielWelt.konfiguration.naesse;
  if (!k || spielWelt.tutorial) {
    spieler.naesse = 0;
    return;
  }
  const z = (spieler.zustand ??= neuerZustand());
  const art = spielWelt.wetter?.art;
  const drinnen = !!spieler.fahrzeug || !!spieler.mitfahrt || spieler.arbeit?.art === 'schlafen' || spielWelt.welt.istUnterDach(spieler.x, spieler.y);
  const niederschlag = art === 'regen' ? 1 : art === 'gewitter' || art === 'starkregen' ? k.gewitterFaktor : art === 'schnee' || art === 'schneesturm' ? k.schneeFaktor : 0;
  let n = spieler.naesse ?? 0;
  const vorher = naesseStufe(n);
  if (!drinnen && niederschlag > 0) n += (dt / k.regenSekunden) * niederschlag * Math.max(0, 1 - regenschutz);
  else if (feuer || drinnen) n -= dt / (feuer ? k.trocknenFeuer : k.trocknenDrinnen);
  else if (art === 'klar' && !spielWelt.istNacht) n -= dt / k.trocknenDraussen; // Runde 29: draußen nur bei Sonne – nachts oder bei Nebel/Sturm bleibt man nass
  spieler.naesse = Math.max(0, Math.min(5, n));
  const stufe = naesseStufe(spieler.naesse);
  if (stufe > vorher && stufe >= 3) spielWelt.melde(spieler.id, `Du bist ${NAESSE_NAMEN[stufe]} – such dir ein Dach, sonst erkältest du dich`);
  // Erkältungs-Risiko: ab „feucht“ läuft die Uhr (erkaeltungNach s), trocken baut sie doppelt so schnell wieder ab
  if (!z.erkaeltung) {
    if (stufe >= k.risikoAb) z.erkaeltungsRisiko = (z.erkaeltungsRisiko ?? 0) + dt; // 5 Minuten mindestens feucht
    else z.erkaeltungsRisiko = Math.max(0, (z.erkaeltungsRisiko ?? 0) - dt * 2);
    if (z.erkaeltungsRisiko >= k.erkaeltungNach) {
      z.erkaeltung = 1;
      z.erkaeltungsRisiko = 0;
      spieler.hustenIn = 4;
      spielWelt.melde(spieler.id, 'Du hast dich erkältet – Antibiotika helfen, Wärme und Trockenheit bremsen es');
    }
  }
}

/** Runde 28: Verlauf einer Erkältung (wird schlimmer), Husten, Sprint-Malus, Schaden ab schadenAb. → Schaden pro Sekunde */
function aktualisiereErkaeltung(spielWelt, spieler, z, dt) {
  const k = spielWelt.konfiguration.naesse;
  spieler.sprintMalus = 1;
  if (!k || !(z.erkaeltung > 0)) return 0;
  const nass = naesseStufe(spieler.naesse ?? 0) >= k.risikoAb;
  const warm = spieler.gemuetlich || spieler.arbeit?.art === 'schlafen';
  const vorher = z.erkaeltung;
  z.erkaeltung = Math.min(100, z.erkaeltung + (k.erkaeltungProMinute / 60) * (nass ? 1.5 : 1) * (warm ? 0.4 : 1) * dt);
  if (vorher < k.sprintAb && z.erkaeltung >= k.sprintAb) spielWelt.melde(spieler.id, 'Die Erkältung wird schlimmer – du kommst beim Rennen schnell außer Atem');
  if (vorher < k.schadenAb && z.erkaeltung >= k.schadenAb) spielWelt.melde(spieler.id, 'Starke Erkältung! Du wirst schwächer – nimm Antibiotika');
  if (z.erkaeltung >= k.sprintAb) spieler.sprintMalus = k.sprintFaktor;
  // Husten: je schlimmer, desto öfter (Ereignis → alle in der Nähe hören es leise)
  spieler.hustenIn = (spieler.hustenIn ?? k.hustenMax / 2) - dt;
  if (spieler.hustenIn <= 0) {
    const anteil = z.erkaeltung / 100;
    spieler.hustenIn = (k.hustenMax + (k.hustenMin - k.hustenMax) * anteil) * (0.7 + 0.6 * spielWelt.zufall.zahl());
    spielWelt.ereignis({ typ: 'husten', von: spieler.id, x: spieler.x, y: spieler.y, staerke: Math.round(anteil * 100) / 100 });
  }
  if (z.erkaeltung < k.schadenAb) return 0;
  return k.schadenMin + (k.schadenMax - k.schadenMin) * ((z.erkaeltung - k.schadenAb) / (100 - k.schadenAb));
}

/** Pro Tick und lebendem Spieler (aus ueberlebenSystem, nicht im Gottmodus). */
export function aktualisiereGesundheit(spielWelt, spieler, dt) {
  const k = spielWelt.konfiguration.gesundheit;
  const z = (spieler.zustand ??= neuerZustand());
  const dauer = spielWelt.tageszeitDauer();
  const spielStunde = (dauer.tagSekunden + dauer.nachtSekunden) / 24;
  let schaden = 0;
  if (z.blutung) {
    schaden += k.blutungSchaden * dt;
    // Runde 28: Blutspur – etwa jede Sekunde ein Fleck unter der Figur (Client lässt ihn ~1 min liegen)
    spieler.blutTakt = (spieler.blutTakt ?? 0) - dt;
    if (spieler.blutTakt <= 0 && !spieler.fahrzeug && !spieler.mitfahrt) {
      spieler.blutTakt = k.blutfleckTakt ?? 1;
      spielWelt.ereignis({ typ: 'blutfleck', x: Math.round(spieler.x), y: Math.round(spieler.y) });
    }
  }
  schaden += aktualisiereErkaeltung(spielWelt, spieler, z, dt) * dt;
  if (z.infektion > 0) {
    z.infektion = Math.min(100, z.infektion + (k.infektionProStunde / spielStunde) * dt);
    if (z.infektion >= 100) schaden += k.infektionSchaden * dt;
  }
  if (z.vergiftung > 0) {
    z.vergiftung = Math.max(0, z.vergiftung - dt);
    schaden += k.vergiftungSchaden * dt;
    spieler.durst = Math.max(0, spieler.durst - k.vergiftungDurst * dt);
  }
  if (z.bruch === 2) {
    z.schieneRest -= dt;
    if (z.schieneRest <= 0) {
      z.bruch = 0;
      spielWelt.melde(spieler.id, '🦴 Dein Bein ist verheilt');
    }
  }
  // Müdigkeit (Schlafende erholen sich in arbeitSystem.wacheAuf)
  if (spieler.arbeit?.art !== 'schlafen') spieler.muedigkeit = Math.min(100, (spieler.muedigkeit ?? 0) + (k.muedigkeitProStunde / spielStunde) * dt);
  for (const [name, rest] of Object.entries(spieler.buffs ?? {})) {
    if (rest - dt <= 0) delete spieler.buffs[name];
    else spieler.buffs[name] = rest - dt;
  }
  if (schaden > 0) {
    spieler.leben -= schaden;
    if (spieler.leben <= 0) toeten(spielWelt, spieler);
  }
  // Tempo: Skill × Bein × Erschöpfung (Client-Vorhersage bekommt den Wert über spielerDaten)
  const bein = z.bruch === 1 ? k.bruchTempo : z.bruch === 2 ? k.schieneTempo : 1;
  const muede = (spieler.muedigkeit ?? 0) >= k.erschoepftAb ? k.erschoepftTempo : 1;
  spieler.tempoFaktor = tempoFaktor(spieler.skills) * bein * muede;
  // Verderb im Inventar (1×/s reicht)
  spieler.verderbTakt = (spieler.verderbTakt ?? 0) - dt;
  if (spieler.verderbTakt <= 0) {
    spieler.verderbTakt = 1;
    lasseVerderben(spieler.inventar, 1);
  }
}

/** Darf man gerade heilen (Regeneration)? Nicht bei Blutung, starker Infektion, Vergiftung oder Erschöpfung. */
export function darfHeilen(spieler, k) {
  const z = spieler.zustand;
  if (z?.blutung || z?.vergiftung > 0 || (z?.infektion ?? 0) >= 50 || (z?.erkaeltung ?? 0) >= 50) return false;
  return (spieler.muedigkeit ?? 0) < k.erschoepftAb;
}

/** Nach einem Treffer (kampfSystem.fuegeSchadenZu): Blutung/Infektion/Bruch auswürfeln. */
export function nachTreffer(spielWelt, spieler, menge, quelle, optionen = {}) {
  const k = spielWelt.konfiguration.gesundheit;
  if (!k || spieler.gottmodus || spielWelt.tutorial) return;
  const z = (spieler.zustand ??= neuerZustand());
  const zufall = spielWelt.zufall;
  const vonZombie = quelle?.typ === 'zombie' || optionen.saeure;
  // Runde 28: jeder Schuss blutet, jeder Schlag (Zombie, Nahkampf, Tier) mit blutungChance (1 zu 5)
  const schuss = optionen.schuss === true;
  const schlag = !schuss && !optionen.explosion && !optionen.feuer && !optionen.saeure && ['zombie', 'spieler', 'tier'].includes(quelle?.typ);
  if (!z.blutung && (schuss || (schlag && zufall.zahl() < k.blutungChance))) {
    z.blutung = true;
    spielWelt.melde(spieler.id, 'Du blutest! Verbinde dich (Verband – auch aus 2 Stofffetzen)');
  }
  if (vonZombie && z.infektion <= 0 && zufall.zahl() < k.infektionChance * (optionen.saeure ? 2 : 1)) {
    z.infektion = 1;
    spielWelt.melde(spieler.id, '🦠 Die Wunde hat sich entzündet – du brauchst Antibiotika');
  }
  if ((menge >= k.bruchAb || optionen.explosion) && z.bruch !== 1 && zufall.zahl() < k.bruchChance) {
    z.bruch = 1;
    spielWelt.melde(spieler.id, '🦴 Bein gebrochen! Du humpelst – eine Schiene hilft');
  }
}

/** Beim Essen/Trinken/Behandeln (inventarSystem.konsumiere): Heilwirkungen, Vergiftung, Buffs. */
export function wendeItemAn(spielWelt, spieler, def) {
  const k = spielWelt.konfiguration.gesundheit;
  const z = (spieler.zustand ??= neuerZustand());
  const geheilt = [];
  for (const was of def.heilt ?? []) {
    if (was === 'blutung' && z.blutung) (z.blutung = false), geheilt.push('Blutung gestillt');
    if (was === 'infektion' && z.infektion > 0) (z.infektion = 0), geheilt.push('Infektion bekämpft');
    if (was === 'vergiftung' && z.vergiftung > 0) (z.vergiftung = 0), geheilt.push('Vergiftung gelindert');
    if (was === 'erkaeltung' && z.erkaeltung > 0) (z.erkaeltung = 0), (z.erkaeltungsRisiko = 0), geheilt.push('Erkältung auskuriert');
    if (was === 'bruch' && z.bruch === 1) {
      z.bruch = 2;
      z.schieneRest = k.schieneDauer;
      geheilt.push('Bein geschient');
    }
  }
  if (geheilt.length) spielWelt.melde(spieler.id, `✚ ${geheilt.join(', ')}`);
  if (def.vergiftung && !spieler.gottmodus && spielWelt.zufall.zahl() < def.vergiftung) {
    z.vergiftung = Math.max(z.vergiftung, k.vergiftungDauer);
    spielWelt.melde(spieler.id, '🤢 Dir ist übel – das war wohl nicht gut');
  }
  if (def.buff) {
    spieler.buffs = { ...(spieler.buffs ?? {}), [def.buff.name]: def.buff.dauer };
    spielWelt.melde(spieler.id, { satt: '🍲 Pappsatt – Hunger kommt langsamer', warm: '♨ Wohlig warm – du frierst langsamer', kraft: '💪 Gestärkt – Nahkampf stärker' }[def.buff.name] ?? 'Gestärkt');
  }
  return geheilt.length > 0;
}

/** Verderbliches in einer Liste von Einträgen um `sekunden` altern lassen (Inventar, Kisten). */
export function lasseVerderben(eintraege, sekunden) {
  for (const e of eintraege) {
    const def = e && GEGENSTAENDE[e.defId];
    if (!def?.verdirbt) continue;
    e.verderb = (e.verderb ?? def.verdirbt) - sekunden;
    if (e.verderb > 0) continue;
    e.defId = 'verdorben';
    delete e.verderb;
  }
}
