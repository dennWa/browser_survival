import { SKILLS, leereSkills, tempoFaktor, zusatzLeben } from '../../../gemeinsam/spieler/skills.js';

/**
 * Level & Erfahrung: Jeder getötete Zombie gibt XP (konfiguration.level.xpProZombie).
 * Level 1 → 2 braucht `ersteStufe` XP, jedes weitere Level `zuwachs` mehr (50, 70, 90 …).
 * XP zählen pro Level (Balken fängt nach dem Aufstieg wieder bei 0 an). Wer stirbt, fängt bei Level 1 an.
 * Pro Aufstieg gibt es Skillpunkte (gemeinsam/spieler/skills.js) – auch die sind beim Tod weg.
 */
export function xpFuerNaechstesLevel(level, k) {
  return k.ersteStufe + (level - 1) * k.zuwachs;
}

export function gibXp(spielWelt, spieler, menge) {
  if (!(menge > 0) || spieler.tot) return;
  const k = spielWelt.konfiguration.level;
  spieler.xp += menge;
  let noetig = xpFuerNaechstesLevel(spieler.level, k);
  while (spieler.xp >= noetig && noetig > 0) {
    spieler.xp -= noetig;
    spieler.level++;
    spieler.skillPunkte += k.punkteProLevel ?? 1;
    noetig = xpFuerNaechstesLevel(spieler.level, k);
    spielWelt.melde(spieler.id, `⭐ Level ${spieler.level} erreicht! +1 Skillpunkt (U)`);
    spielWelt.ereignis({ typ: 'levelAuf', id: spieler.id, x: spieler.x, y: spieler.y, level: spieler.level });
  }
}

/** Tod: Level, XP und alle Skills weg. */
export function setzeLevelZurueck(spieler, konfiguration) {
  spieler.level = 1;
  spieler.xp = 0;
  spieler.skills = leereSkills();
  spieler.skillPunkte = 0;
  wendeSkillsAn(spieler, konfiguration);
}

/** AKTION 'skill' { skill }: einen Skillpunkt verteilen. */
export function setzeSkillpunkt(spielWelt, spieler, skill) {
  const def = SKILLS[skill];
  if (!def || spieler.skillPunkte <= 0 || spieler.skills[skill] >= def.max) return;
  spieler.skillPunkte--;
  spieler.skills[skill]++;
  const vorher = spieler.maxLeben;
  wendeSkillsAn(spieler, spielWelt.konfiguration);
  if (!spieler.tot) spieler.leben = Math.min(spieler.maxLeben, spieler.leben + Math.max(0, spieler.maxLeben - vorher)); // neue Lebenspunkte gleich auffüllen
  spielWelt.melde(spieler.id, `${def.symbol} ${def.name} Stufe ${spieler.skills[skill]}`);
}

/** Wirkung der Skills auf die Spielerwerte (Max-Leben, Lauftempo) – nach Laden, Verteilen und Tod. */
export function wendeSkillsAn(spieler, konfiguration) {
  spieler.maxLeben = konfiguration.spieler.leben + zusatzLeben(spieler.skills);
  spieler.leben = Math.min(spieler.leben, spieler.maxLeben);
  spieler.tempoFaktor = tempoFaktor(spieler.skills);
}
