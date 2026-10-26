/**
 * Zonen-Übergänge (offene Welt aus mehreren Karten, siehe kartenLader.js → uebergaenge).
 *
 * Wer ein Übergangs-Rechteck betritt (zu Fuß oder im Auto), wartet dort `konfiguration.welt.uebergangSekunden` (5 s,
 * Countdown `spieler.uebergang = { name, rest }` → spielerDatenPrivat → HUD); wer vorher rausgeht, bricht ab. Danach
 * bekommt er spieler.zonenwechsel = { ziel, ankunft, name } – den Umzug (Auto fährt mit) macht der SpielServer direkt
 * nach dem Tick (#wechsleZone). spieler.imUebergang verhindert Dauer-Auslösen: erst raus aus dem Rechteck, dann zählt es wieder.
 */
export function pruefeUebergaenge(spielWelt, dt = 0) {
  const liste = spielWelt.karte.daten.uebergaenge;
  if (!liste?.length) return;
  const wartezeit = spielWelt.konfiguration.welt.uebergangSekunden ?? 0;
  for (const s of spielWelt.alleVomTyp('spieler')) {
    if (s.tot || s.zonenwechsel) {
      s.uebergang = null;
      continue;
    }
    const u = liste.find((u) => punkteVon(s).some(([x, y]) => x >= u.px.x0 && x < u.px.x1 && y >= u.px.y0 && y < u.px.y1));
    if (!u) {
      s.imUebergang = false;
      s.uebergang = null;
      continue;
    }
    if (s.imUebergang) continue;
    if (s.uebergang?.u !== u) s.uebergang = { u, name: u.name, rest: wartezeit };
    else s.uebergang.rest -= dt;
    if (s.uebergang.rest > 1e-9) continue;
    s.uebergang = null;
    s.imUebergang = true;
    s.zonenwechsel = { ziel: u.ziel, ankunft: u.ankunft, name: u.name };
  }
}

/** Zu Fuß: die Position; im Auto: Front, Mitte und Heck (die Mitte erreicht den 1 Kachel breiten Randstreifen nie). */
function punkteVon(s) {
  const fz = s.fahrzeug;
  if (!fz) return [[s.x, s.y]];
  const l = fz.laenge / 2 + 4;
  const dx = Math.cos(fz.winkel) * l;
  const dy = Math.sin(fz.winkel) * l;
  return [[fz.x + dx, fz.y + dy], [fz.x, fz.y], [fz.x - dx, fz.y - dy]];
}
