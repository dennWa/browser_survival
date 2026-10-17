import { tageszeit } from '../../../gemeinsam/tageszeit.js';
import { erzeugeZombie, waehleZombieVariante } from '../entitaeten/zombie.js';

/**
 * Tag & Nacht: Uhr weiterdrehen, bei Einbruch der Nacht eine Horde schicken, morgens verschwindet sie wieder.
 * Wie sich die Nacht auf Zombies auswirkt (Sichtweite, Tempo), steht im zombieSystem.
 */
export function aktualisiereTageszeit(spielWelt, dt) {
  const dauer = spielWelt.tageszeitDauer();
  const zyklus = dauer.tagSekunden + dauer.nachtSekunden;
  spielWelt.zeit += dt;
  if (spielWelt.zeit >= zyklus) {
    spielWelt.zeit -= zyklus;
    spielWelt.tag++;
  }
  const { istNacht } = tageszeit(spielWelt.zeit, dauer);
  if (istNacht === spielWelt.istNacht) return;
  spielWelt.istNacht = istNacht;
  if (istNacht) {
    const anzahl = schickeHorde(spielWelt);
    meldeAllen(spielWelt, `Die Nacht bricht herein … ${anzahl > 0 ? 'Etwas kommt näher.' : ''}`.trim());
  } else {
    for (const z of [...spielWelt.alleVomTyp('zombie')]) if (z.nacht) spielWelt.entfernen(z.id);
    meldeAllen(spielWelt, `Tag ${spielWelt.tag}: Der Morgen graut – die Horde zieht ab.`);
  }
}

/** Zusätzliche Nacht-Zombies an Spawnpunkten, die gerade kein Spieler sieht. */
export function schickeHorde(spielWelt) {
  const k = spielWelt.konfiguration.zombie;
  const spieler = [...spielWelt.alleVomTyp('spieler')].filter((s) => !s.tot);
  // Horden-Spawnpunkte (Map-Editor: zombieSpawns[].horde) – gibt es welche, kommt die Horde nur dort
  const alle = spielWelt.karte.zombieSpawns;
  const kandidaten = alle.some((p) => p.horde) ? alle.filter((p) => p.horde) : alle;
  const frei = kandidaten.filter((p) => spieler.every((s) => Math.hypot(s.x - p.x, s.y - p.y) >= k.respawnMindestAbstand));
  if (frei.length === 0) return 0;
  for (let i = 0; i < k.nachtHorde; i++) {
    const p = spielWelt.zufall.auswahl(frei);
    const z = erzeugeZombie({
      id: spielWelt.neueId(),
      x: p.x + (spielWelt.zufall.zahl() - 0.5) * 24,
      y: p.y + (spielWelt.zufall.zahl() - 0.5) * 24,
      konfiguration: spielWelt.konfiguration,
      variante: waehleZombieVariante(spielWelt.zufall, spielWelt.konfiguration),
    });
    z.nacht = true;
    spielWelt.hinzufuegen(z);
  }
  return k.nachtHorde;
}

function meldeAllen(spielWelt, text) {
  for (const s of spielWelt.alleVomTyp('spieler')) spielWelt.melde(s.id, text);
}
