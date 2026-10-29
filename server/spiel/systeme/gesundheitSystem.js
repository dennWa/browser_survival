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
 */
export function neuerZustand() {
  return { blutung: false, infektion: 0, bruch: 0, schieneRest: 0, vergiftung: 0 };
}

/** Pro Tick und lebendem Spieler (aus ueberlebenSystem, nicht im Gottmodus). */
export function aktualisiereGesundheit(spielWelt, spieler, dt) {
  const k = spielWelt.konfiguration.gesundheit;
  const z = (spieler.zustand ??= neuerZustand());
  const dauer = spielWelt.tageszeitDauer();
  const spielStunde = (dauer.tagSekunden + dauer.nachtSekunden) / 24;
  let schaden = 0;
  if (z.blutung) schaden += k.blutungSchaden * dt;
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
  if (z?.blutung || z?.vergiftung > 0 || (z?.infektion ?? 0) >= 50) return false;
  return (spieler.muedigkeit ?? 0) < k.erschoepftAb;
}

/** Nach einem Treffer (kampfSystem.fuegeSchadenZu): Blutung/Infektion/Bruch auswürfeln. */
export function nachTreffer(spielWelt, spieler, menge, quelle, optionen = {}) {
  const k = spielWelt.konfiguration.gesundheit;
  if (!k || spieler.gottmodus || spielWelt.tutorial) return;
  const z = (spieler.zustand ??= neuerZustand());
  const zufall = spielWelt.zufall;
  const vonZombie = quelle?.typ === 'zombie' || optionen.saeure;
  if (vonZombie && !z.blutung && zufall.zahl() < k.blutungChance) {
    z.blutung = true;
    spielWelt.melde(spieler.id, '🩸 Du blutest! Verbinde dich (Verband)');
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
