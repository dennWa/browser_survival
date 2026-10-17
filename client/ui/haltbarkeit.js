/**
 * Haltbarkeits-Balken an einem Inventar-/Schnellleistenplatz: Werkzeuge (Axt, Spitzhacke, Hacke) nutzen sich ab und
 * gehen kaputt (server: inventarSystem.nutzeWerkzeug). Der Eintrag trägt `haltbarkeit` (fehlt = voll), die Definition
 * den Höchstwert. Der Balken ist ein CSS-::after (stil.css `.slot[data-haltbar]`).
 */
export function setzeHaltbarkeit(knopf, eintrag, itemDefinitionen) {
  const max = eintrag && itemDefinitionen?.[eintrag.defId]?.haltbarkeit;
  if (!max) {
    if (knopf.dataset.haltbar !== undefined) delete knopf.dataset.haltbar;
    return;
  }
  const anteil = Math.max(0, Math.min(1, (eintrag.haltbarkeit ?? max) / max));
  knopf.dataset.haltbar = anteil < 0.25 ? 'niedrig' : anteil < 0.6 ? 'mittel' : 'voll';
  knopf.style.setProperty('--hf', String(anteil));
  knopf.title = `${itemDefinitionen[eintrag.defId].name} – Haltbarkeit ${Math.round(anteil * 100)} %`;
}
