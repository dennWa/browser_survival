/**
 * Zonen-Übergänge (offene Welt aus mehreren Karten, siehe kartenLader.js → uebergaenge).
 *
 * Wer zu Fuß ein Übergangs-Rechteck betritt, bekommt spieler.zonenwechsel = { ziel, ankunft, name }.
 * Den eigentlichen Umzug in die andere SpielWelt macht der SpielServer direkt nach dem Tick (#zonenwechsel).
 * spieler.imUebergang verhindert Dauer-Auslösen: erst raus aus dem Rechteck, dann zählt es wieder.
 */
export function pruefeUebergaenge(spielWelt) {
  const liste = spielWelt.karte.daten.uebergaenge;
  if (!liste?.length) return;
  for (const s of spielWelt.alleVomTyp('spieler')) {
    if (s.tot || s.zonenwechsel) continue;
    // Gezielte Übergänge vor gestreckten Kanten-Übergängen (kante, Runde 18) – sonst schluckt die Kante z. B. den Waldweg
    const drin = (u) => s.x >= u.px.x0 && s.x < u.px.x1 && s.y >= u.px.y0 && s.y < u.px.y1;
    const u = liste.find((u) => !u.kante && drin(u)) ?? liste.find(drin);
    if (!u) {
      s.imUebergang = false;
      continue;
    }
    if (s.imUebergang) continue;
    s.imUebergang = true;
    if (s.fahrzeug) spielWelt.melde(s.id, `Nach ${u.name} geht es nur zu Fuß weiter`);
    else s.zonenwechsel = { ziel: u.ziel, ankunft: u.ankunft, name: u.name, versatz: u.nahtlos?.versatz ?? null };
  }
}
