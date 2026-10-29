import { tageszeit } from '../../../gemeinsam/tageszeit.js';
import { erzeugeZombie, waehleZombieVariante } from '../entitaeten/zombie.js';

/**
 * Tag & Nacht: Uhr weiterdrehen, bei Einbruch der Nacht eine Horde schicken, morgens verschwindet sie wieder.
 * Wie sich die Nacht auf Zombies auswirkt (Sichtweite, Tempo), steht im zombieSystem.
 * Runde 24 – Progression (`konfiguration.horde`, `hordeFuer(tag)`): die Horde wächst mit den Tagen (wachstumProTag, bis maxFaktor),
 * ab staerkeAbTag haben Horden-Zombies mehr Leben; Sonder-Zombies kommen über `abTag` der Varianten dazu.
 * Jede bossAlle-te Nacht = Boss-Nacht (Brocken-Rudel), jede blutmondAlle-te = Blutmond (doppelte Horde, roter Mond).
 * `spielWelt.nachtArt` ('normal' | 'boss' | 'blutmond') geht im Schnappschuss mit (ZUSTAND.nachtArt, nur nachts ≠ normal).
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
  if (istNacht && !spielWelt.tutorial) {
    const plan = hordeFuer(spielWelt.konfiguration, spielWelt.tag);
    spielWelt.nachtArt = plan.art;
    const anzahl = schickeHorde(spielWelt, plan);
    const text = {
      boss: 'Boss-Nacht! Schwere Schritte kommen näher …',
      blutmond: 'BLUTMOND! Die Horde ist doppelt so groß – verbarrikadiert euch!',
    }[plan.art] ?? `Die Nacht bricht herein … ${anzahl > 0 ? 'Etwas kommt näher.' : ''}`.trim();
    meldeAllen(spielWelt, text);
  } else {
    spielWelt.nachtArt = 'normal';
    for (const z of [...spielWelt.alleVomTyp('zombie')]) if (z.nacht) spielWelt.entfernen(z.id);
    meldeAllen(spielWelt, `Tag ${spielWelt.tag}: Der Morgen graut – die Horde zieht ab.`);
  }
}

/**
 * Horde für einen Spieltag: { art, anzahl, lebenFaktor, bosse, extra (Zusatzgewichte je Variante) }.
 * Tag 1 = Grundgröße; dann +wachstumProTag je Tag bis maxFaktor. Blutmond verdoppelt, Boss-Nacht schickt zusätzlich Brocken.
 */
export function hordeFuer(konfiguration, tag) {
  const k = konfiguration.horde ?? {};
  const basis = konfiguration.zombie.nachtHorde;
  const faktor = Math.min(k.maxFaktor ?? 3, 1 + (k.wachstumProTag ?? 0) * Math.max(0, tag - 1));
  const blutmond = (k.blutmondAlle ?? 0) > 0 && tag % k.blutmondAlle === 0;
  const boss = !blutmond && (k.bossAlle ?? 0) > 0 && tag % k.bossAlle === 0;
  const lebenFaktor = tag >= (k.staerkeAbTag ?? Infinity) ? (k.staerkeFaktor ?? 1) : 1;
  return {
    art: blutmond ? 'blutmond' : boss ? 'boss' : 'normal',
    anzahl: Math.round(basis * faktor * (blutmond ? (k.blutmondFaktor ?? 2) : 1)),
    lebenFaktor,
    bosse: boss ? 1 + Math.floor(tag / Math.max(1, k.bossAlle) / 2) : 0,
    extra: tag >= 10 ? { sprinter: 0.8, spucker: 0.5 } : {},
  };
}

/** Zusätzliche Nacht-Zombies an Spawnpunkten, die gerade kein Spieler sieht. */
export function schickeHorde(spielWelt, plan = hordeFuer(spielWelt.konfiguration, spielWelt.tag ?? 1)) {
  const k = spielWelt.konfiguration.zombie;
  const spieler = [...spielWelt.alleVomTyp('spieler')].filter((s) => !s.tot);
  // Horden-Spawnpunkte (Map-Editor: zombieSpawns[].horde) – gibt es welche, kommt die Horde nur dort
  const alle = spielWelt.karte.zombieSpawns;
  const kandidaten = alle.some((p) => p.horde) ? alle.filter((p) => p.horde) : alle;
  const frei = kandidaten.filter((p) => spieler.every((s) => Math.hypot(s.x - p.x, s.y - p.y) >= k.respawnMindestAbstand));
  if (frei.length === 0) return 0;
  const varianten = [];
  for (let i = 0; i < plan.anzahl; i++) varianten.push(waehleZombieVariante(spielWelt.zufall, spielWelt.konfiguration, spielWelt.tag ?? 1, plan.extra));
  for (let i = 0; i < plan.bosse; i++) varianten.push('brocken');
  for (const variante of varianten) {
    const p = spielWelt.zufall.auswahl(frei);
    const z = erzeugeZombie({
      id: spielWelt.neueId(),
      x: p.x + (spielWelt.zufall.zahl() - 0.5) * 24,
      y: p.y + (spielWelt.zufall.zahl() - 0.5) * 24,
      konfiguration: spielWelt.konfiguration,
      variante,
    });
    z.leben = z.maxLeben = Math.round(z.leben * plan.lebenFaktor);
    z.nacht = true;
    if (plan.art === 'blutmond') z.jagdGeschwindigkeit *= 1.08;
    spielWelt.hinzufuegen(z);
  }
  return varianten.length;
}

function meldeAllen(spielWelt, text) {
  if (spielWelt.tutorial) return; // Tutorial stellt die Uhr selbst
  for (const s of spielWelt.alleVomTyp('spieler')) spielWelt.melde(s.id, text);
}
