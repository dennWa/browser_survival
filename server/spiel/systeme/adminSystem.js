import { ADMIN_BEFEHLE } from '../../../gemeinsam/protokoll.js';
import { wegFrei } from '../../../gemeinsam/physik/strahl.js';
import { GEGENSTAENDE } from '../konfiguration/gegenstaende.js';
import { erzeugeZombie, waehleZombieVariante } from '../entitaeten/zombie.js';
import { fuegeZumInventarHinzu } from './inventarSystem.js';
import { toeten } from './kampfSystem.js';

/**
 * Admin-Befehle (Gottmodus & Co.). Läuft nur für Spieler mit `admin = true` –
 * das Recht vergibt allein die Authentifizierung (konten.json "admin": true, Lokal-Modus: immer).
 */
const AUSRUESTUNG = [
  ['pistole', 1],
  ['schrotflinte', 1],
  ['munition_9mm', 60],
  ['munition_12', 24],
];
const SPAWN_ABSTAND = 90; // px vor dem Admin

export function fuehreAdminBefehlAus(spielWelt, spieler, befehl) {
  if (!spieler.admin) {
    spielWelt.melde(spieler.id, 'Keine Admin-Rechte');
    return;
  }
  const k = spielWelt.konfiguration.spieler;
  switch (befehl) {
    case ADMIN_BEFEHLE.GOTTMODUS:
      spieler.gottmodus = !spieler.gottmodus;
      spielWelt.melde(spieler.id, spieler.gottmodus ? 'Gottmodus AN' : 'Gottmodus aus');
      break;
    case ADMIN_BEFEHLE.UNSICHTBAR:
      spieler.unsichtbar = !spieler.unsichtbar;
      if (spieler.unsichtbar) vergissSpieler(spielWelt, spieler);
      spielWelt.melde(spieler.id, spieler.unsichtbar ? 'Unsichtbar für Zombies' : 'Wieder sichtbar');
      break;
    case ADMIN_BEFEHLE.HEILEN:
      Object.assign(spieler, { leben: spieler.maxLeben, hunger: 100, durst: 100, ausdauer: k.ausdauerMax, erschoepft: false });
      spielWelt.melde(spieler.id, 'Geheilt');
      break;
    case ADMIN_BEFEHLE.AUSRUESTEN: {
      let alles = true;
      for (const [defId, menge] of AUSRUESTUNG) {
        if (!GEGENSTAENDE[defId]) continue;
        const magazin = GEGENSTAENDE[defId].magazin ?? 0;
        if (fuegeZumInventarHinzu(spieler, defId, menge, magazin) > 0) alles = false;
      }
      spielWelt.melde(spieler.id, alles ? 'Waffen & Munition erhalten' : 'Inventar voll – nicht alles erhalten');
      break;
    }
    case ADMIN_BEFEHLE.ZOMBIE_SPAWNEN:
      spawneVorSpieler(spielWelt, spieler);
      break;
    case ADMIN_BEFEHLE.ZEIT_SPRINGEN: {
      // 3 Sekunden vor den nächsten Wechsel – Dämmerung und Horde laufen ganz normal ab
      const { tagSekunden, nachtSekunden } = spielWelt.tageszeitDauer();
      spielWelt.zeit = (spielWelt.istNacht ? tagSekunden + nachtSekunden : tagSekunden) - 3;
      spielWelt.melde(spieler.id, spielWelt.istNacht ? 'Gleich wird es hell …' : 'Gleich wird es dunkel …');
      break;
    }
    case ADMIN_BEFEHLE.ZOMBIES_TOETEN: {
      const zombies = [...spielWelt.alleVomTyp('zombie')];
      for (const z of zombies) toeten(spielWelt, z);
      spielWelt.melde(spieler.id, `${zombies.length} Zombies erledigt`);
      break;
    }
  }
}

/** Zombie direkt vor dem Admin – oder auf ihm, falls dort eine Wand ist. Kommt nach dem Tod nicht wieder. */
function spawneVorSpieler(spielWelt, spieler) {
  let x = spieler.x + Math.cos(spieler.blick) * SPAWN_ABSTAND;
  let y = spieler.y + Math.sin(spieler.blick) * SPAWN_ABSTAND;
  const radius = spielWelt.konfiguration.zombie.radius + 2;
  if (!wegFrei(spielWelt.welt, spieler.x, spieler.y, x, y, radius)) {
    x = spieler.x;
    y = spieler.y;
  }
  spielWelt.hinzufuegen(
    erzeugeZombie({
      id: spielWelt.neueId(),
      x,
      y,
      konfiguration: spielWelt.konfiguration,
      blick: spieler.blick + Math.PI,
      variante: waehleZombieVariante(spielWelt.zufall, spielWelt.konfiguration),
    }),
  );
}

/** Wer unsichtbar wird, wird auch nicht mehr verfolgt. */
function vergissSpieler(spielWelt, spieler) {
  for (const z of spielWelt.alleVomTyp('zombie')) {
    if (z.zielId !== spieler.id) continue;
    z.zielId = null;
    z.zustand = 'ruhend';
    z.pfad = null;
  }
}
