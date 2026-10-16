/**
 * Level & Erfahrung: Jeder getötete Zombie gibt XP (konfiguration.level.xpProZombie).
 * Level 1 → 2 braucht `ersteStufe` XP, jedes weitere Level `zuwachs` mehr (50, 70, 90 …).
 * XP zählen pro Level (Balken fängt nach dem Aufstieg wieder bei 0 an). Wer stirbt, fängt bei Level 1 an.
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
    noetig = xpFuerNaechstesLevel(spieler.level, k);
    spielWelt.melde(spieler.id, `⭐ Level ${spieler.level} erreicht!`);
    spielWelt.ereignis({ typ: 'levelAuf', id: spieler.id, x: spieler.x, y: spieler.y, level: spieler.level });
  }
}

export function setzeLevelZurueck(spieler) {
  spieler.level = 1;
  spieler.xp = 0;
}
