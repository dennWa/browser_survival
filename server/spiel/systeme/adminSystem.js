import { ADMIN_BEFEHLE } from '../../../gemeinsam/protokoll.js';
import { wegFrei } from '../../../gemeinsam/physik/strahl.js';
import { GEGENSTAENDE } from '../konfiguration/gegenstaende.js';
import { erzeugeZombie, waehleZombieVariante } from '../entitaeten/zombie.js';
import { fuegeZumInventarHinzu } from './inventarSystem.js';
import { toeten } from './kampfSystem.js';
import { setzeWetter, wetterDerZone } from './wetterSystem.js';
import { botsDerZone, entferneBot, spawneBot } from './botSystem.js';
import { entferneFlagge } from './territoriumSystem.js';
import { spuleZeitVor } from './arbeitSystem.js';

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
const ZEIT_VORSTELLEN_STUNDEN = 12;
const SPAWN_ABSTAND = 90; // px vor dem Admin

/** Landen in einer Wand/einem Möbel/Baum? → zur nächsten freien Kachel (Spiralsuche), sonst steckt man fest. */
function landeAufFreiemBoden(spielWelt, spieler) {
  const welt = spielWelt.welt;
  const g = welt.kachelGroesse;
  const tx0 = Math.floor(spieler.x / g);
  const ty0 = Math.floor(spieler.y / g);
  for (let r = 0; r <= 12; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        if (welt.istBlockiert(tx0 + dx, ty0 + dy)) continue;
        if (r > 0) {
          spieler.x = (tx0 + dx + 0.5) * g;
          spieler.y = (ty0 + dy + 0.5) * g;
        }
        return;
      }
    }
  }
}

export function fuehreAdminBefehlAus(spielWelt, spieler, befehl, aktion = {}) {
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
    case ADMIN_BEFEHLE.FLIEGEN:
      if (spieler.fahrzeug) {
        spielWelt.melde(spieler.id, 'Erst aus dem Auto aussteigen');
        break;
      }
      spieler.fliegen = !spieler.fliegen;
      if (!spieler.fliegen) landeAufFreiemBoden(spielWelt, spieler);
      spielWelt.melde(spieler.id, spieler.fliegen ? 'Flugmodus AN – Umschalt = schneller, Umschalt+B = landen' : 'Flugmodus aus');
      break;
    case ADMIN_BEFEHLE.UNENDLICH_MUNITION:
      spieler.unendlichMunition = !spieler.unendlichMunition;
      spielWelt.melde(spieler.id, spieler.unendlichMunition ? 'Unendlich Munition AN' : 'Unendlich Munition aus');
      break;
    case ADMIN_BEFEHLE.UNENDLICH_AUSDAUER:
      spieler.unendlichAusdauer = !spieler.unendlichAusdauer;
      if (spieler.unendlichAusdauer) Object.assign(spieler, { ausdauer: k.ausdauerMax, erschoepft: false });
      spielWelt.melde(spieler.id, spieler.unendlichAusdauer ? 'Unendlich Ausdauer AN' : 'Unendlich Ausdauer aus');
      break;
    case ADMIN_BEFEHLE.ZEIT_VORSTELLEN:
      spuleZeitVor(spielWelt, ZEIT_VORSTELLEN_STUNDEN);
      spielWelt.zeitSprung = ZEIT_VORSTELLEN_STUNDEN; // SpielServer zieht die übrigen aktiven Zonen mit
      spielWelt.melde(spieler.id, `+${ZEIT_VORSTELLEN_STUNDEN} Stunden – Pflanzen wachsen, Uhr läuft weiter`);
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
    case ADMIN_BEFEHLE.FLAGGE_ENTFERNEN:
      spielWelt.melde(spieler.id, entferneFlagge(spielWelt, spieler) ? 'Basis-Flagge zurückgenommen – du kannst eine neue setzen' : 'Hier stand keine Flagge – Flaggen-Vermerk zurückgesetzt');
      break;
    case ADMIN_BEFEHLE.ZEIT_SPRINGEN: {
      // 3 Sekunden vor den nächsten Wechsel – Dämmerung und Horde laufen ganz normal ab
      const { tagSekunden, nachtSekunden } = spielWelt.tageszeitDauer();
      spielWelt.zeit = (spielWelt.istNacht ? tagSekunden + nachtSekunden : tagSekunden) - 3;
      spielWelt.melde(spieler.id, spielWelt.istNacht ? 'Gleich wird es hell …' : 'Gleich wird es dunkel …');
      break;
    }
    case ADMIN_BEFEHLE.BOT_SETZEN: {
      const g = spielWelt.welt.kachelGroesse;
      if (spielWelt.welt.istBlockiert(aktion.tx, aktion.ty)) {
        spielWelt.melde(spieler.id, 'Da ist kein Platz für einen Bot');
        break;
      }
      const bot = spawneBot(spielWelt, { x: (aktion.tx + 0.5) * g, y: (aktion.ty + 0.5) * g });
      spielWelt.melde(spieler.id, `${bot.name} gesetzt`);
      break;
    }
    case ADMIN_BEFEHLE.BOT_ENTFERNEN: {
      const g = spielWelt.welt.kachelGroesse;
      const x = (aktion.tx + 0.5) * g;
      const y = (aktion.ty + 0.5) * g;
      const bot = botsDerZone(spielWelt).sort((a, b) => Math.hypot(a.x - x, a.y - y) - Math.hypot(b.x - x, b.y - y))[0];
      if (!bot || Math.hypot(bot.x - x, bot.y - y) > g * 4) {
        spielWelt.melde(spieler.id, 'Kein Bot in der Nähe der Klickstelle');
        break;
      }
      entferneBot(spielWelt, bot);
      spielWelt.melde(spieler.id, `${bot.name} entfernt`);
      break;
    }
    case ADMIN_BEFEHLE.BOTS_ENTFERNEN: {
      const bots = botsDerZone(spielWelt);
      for (const bot of bots) entferneBot(spielWelt, bot);
      spielWelt.melde(spieler.id, `${bots.length} Bot(s) entfernt`);
      break;
    }
    case ADMIN_BEFEHLE.WETTER: {
      // Runde 23: klar → Regen/Schnee → Gewitter/Schneesturm → Sturm → Nebel → klar
      const arten = wetterDerZone(spielWelt);
      const naechstes = arten[(arten.indexOf(spielWelt.wetter.art) + 1) % arten.length];
      setzeWetter(spielWelt, naechstes, 120);
      spielWelt.melde(spieler.id, `Wetter: ${naechstes}`);
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
