import { bewegeKoerper } from '../../../gemeinsam/physik/bewegung.js';
import { lerpWinkel } from '../../../gemeinsam/mathe.js';
import { KACHELN } from '../../../gemeinsam/welt/kacheln.js';
import { erzeugeTier } from '../entitaeten/tier.js';
import { fuegeSchadenZu } from './kampfSystem.js';
import { fuegeZumInventarHinzu, verbrauche } from './inventarSystem.js';

/**
 * Runde 24: Haustiere & Nutztiere (Tier-Entitäten mit art 'hund' | 'katze' | 'huhn', Werte konfiguration.haustiere).
 *   Wild: streunen umher (Hund/Katze wenige je Zone, Hühner auf Rasen). AKTION haustier { ziel } mit passendem Futter zähmt:
 *     Hund ← Fleisch, Katze ← Fisch/Milch, Huhn ← Samen (Huhn wird eingefangen → Item 'huhn' für den Hühnerstall).
 *   Gezähmt (t.besitzer = Spielername): folgt („folgen“) oder wartet („bleib“, E/AKTION schaltet um). Steht der Besitzer
 *     zu weit weg (anderer Raum, Zonenwechsel), taucht es bei ihm wieder auf. Liste am Spieler: spieler.haustiere [{art, name}]
 *     (Spielstand) → `begleite` setzt fehlende Tiere neben ihn, Tiere ohne Besitzer in der Zone verschwinden.
 *   Hund: bellt, wenn Zombies nahe kommen (Ereignis 'bellen'), läuft hin und beißt (bissSchaden). Katze: maunzt ab und zu,
 *     rollt sich neben dem sitzenden/schlafenden Besitzer ein (zustand 'schlaeft') – zählt für „gemütlich“ (ueberlebenSystem).
 */
export const HAUSTIER_ARTEN = Object.freeze(['hund', 'katze', 'huhn']);
const NAMEN = { hund: ['Bello', 'Rex', 'Luna', 'Balu', 'Kira', 'Rocky'], katze: ['Mia', 'Felix', 'Minka', 'Tiger', 'Lilly', 'Garfield'], huhn: ['Henni'] };
export const FUTTER = Object.freeze({
  hund: ['fleisch', 'fleisch_gebraten'],
  katze: ['fisch_barsch', 'fisch_forelle', 'fisch_hecht', 'milch'],
  huhn: ['samen_tomate', 'samen_gurke', 'samen_kartoffel', 'samen_paprika', 'samen_weizen', 'samen_karotte', 'samen_kuerbis', 'samen_erdbeere'],
});

/** Wilde Haustiere beim Zonenstart (nicht in Schneezonen: Hühner) */
export function spawneWildeTiere(spielWelt) {
  const k = spielWelt.konfiguration.haustiere;
  // nur auf richtigen Zonen (kleine Test-/Tutorial-Karten bleiben tierfrei)
  if (!k || spielWelt.tutorial || spielWelt.welt.breite * spielWelt.welt.hoehe < (k.mindestKacheln ?? 4000)) return;
  const anzahl = { hund: k.wildeHunde ?? 0, katze: k.wildeKatzen ?? 0, huhn: spielWelt.welt.schnee ? 0 : (k.wildeHuehner ?? 0) };
  for (const [art, n] of Object.entries(anzahl)) for (let i = 0; i < n; i++) spawneWild(spielWelt, art);
}

function spawneWild(spielWelt, art) {
  const welt = spielWelt.welt;
  const g = welt.kachelGroesse;
  for (let versuch = 0; versuch < 80; versuch++) {
    const tx = spielWelt.zufall.ganzzahl(1, welt.breite - 2);
    const ty = spielWelt.zufall.ganzzahl(1, welt.hoehe - 2);
    const name = KACHELN[welt.kachelAn(tx, ty)]?.name;
    if (welt.istBlockiert(tx, ty) || (art === 'huhn' ? name !== 'gras' : name === 'wasser')) continue;
    return spielWelt.hinzufuegen(erzeugeTier({ id: spielWelt.neueId(), art, x: (tx + 0.5) * g, y: (ty + 0.5) * g, konfiguration: spielWelt.konfiguration }));
  }
  return null;
}

/** Pro Tick und Haustier (aus tierSystem.aktualisiereTiere). */
export function aktualisiereHaustier(spielWelt, t, dt) {
  const k = spielWelt.konfiguration.haustiere;
  const w = k.arten[t.art];
  t.bissPause = Math.max(0, (t.bissPause ?? 0) - dt);
  t.bellPause = Math.max(0, (t.bellPause ?? 0) - dt);
  if (t.leben < t.maxLeben) t.leben = Math.min(t.maxLeben, t.leben + dt * 0.5);
  const besitzer = t.besitzer ? [...spielWelt.alleVomTyp('spieler')].find((s) => s.name === t.besitzer) : null;
  if (t.besitzer && !besitzer) {
    spielWelt.entfernen(t.id); // Besitzer weg (andere Zone/abgemeldet) – kommt mit ihm zurück (begleite)
    return;
  }
  if (!besitzer) return streune(spielWelt, t, w, dt);
  // Hund: Zombies in der Nähe → bellen und angreifen
  if (t.art === 'hund') {
    const zombie = naechsterZombie(spielWelt, t, besitzer, k.wachRadius);
    if (zombie) {
      if (t.bellPause <= 0) {
        t.bellPause = 3 + spielWelt.zufall.zahl() * 2;
        spielWelt.ereignis({ typ: 'bellen', id: t.id, x: t.x, y: t.y });
      }
      if (t.zustand !== 'bleib') {
        t.zustand = 'angriff';
        const d = Math.hypot(zombie.x - t.x, zombie.y - t.y);
        if (d > t.radius + zombie.radius + 6) laufeZu(spielWelt, t, zombie, w.rennTempo, dt);
        else if (t.bissPause <= 0) {
          t.bissPause = k.bissPause;
          t.blick = Math.atan2(zombie.y - t.y, zombie.x - t.x);
          spielWelt.setzeAktion(t, 'angriff', 0.4);
          fuegeSchadenZu(spielWelt, zombie, k.bissSchaden, besitzer, t.blick, { rueckstoss: 0.5 });
        }
        return;
      }
    }
  }
  if (besitzer.tot) return;
  const d = Math.hypot(besitzer.x - t.x, besitzer.y - t.y);
  if (d > k.teleportAb) {
    // zu weit weg (Haus gewechselt, Auto …): neben dem Besitzer auftauchen
    t.x = besitzer.x - Math.cos(besitzer.blick) * 26;
    t.y = besitzer.y - Math.sin(besitzer.blick) * 26;
    return;
  }
  if (t.zustand === 'bleib') return;
  // Katze: rollt sich ein, wenn der Besitzer sitzt/schläft
  if (t.art === 'katze' && (besitzer.arbeit?.art === 'sitzen' || besitzer.arbeit?.art === 'schlafen') && d < 90) {
    t.zustand = 'schlaeft';
    return;
  }
  if (t.art === 'katze' && spielWelt.zufall.zahl() < dt / 30 && d < 300) spielWelt.ereignis({ typ: 'miau', id: t.id, x: t.x, y: t.y });
  t.zustand = 'folgen';
  if (d > w.folgeAbstand) laufeZu(spielWelt, t, besitzer, d > w.folgeAbstand * 2.5 ? w.rennTempo : w.tempo, dt);
}

function streune(spielWelt, t, w, dt) {
  t.zustand = 'ruhend';
  t.wanderTimer -= dt;
  if (t.wanderTimer <= 0) {
    t.wanderTimer = 2 + spielWelt.zufall.zahl() * 5;
    const winkel = spielWelt.zufall.zahl() * Math.PI * 2;
    const r = 20 + spielWelt.zufall.zahl() * 70;
    t.wanderZiel = spielWelt.zufall.zahl() < 0.4 ? null : { x: t.x + Math.cos(winkel) * r, y: t.y + Math.sin(winkel) * r };
    if (t.art === 'huhn' && spielWelt.zufall.zahl() < 0.25) spielWelt.ereignis({ typ: 'gackern', id: t.id, x: t.x, y: t.y });
  }
  if (t.wanderZiel) {
    if (Math.hypot(t.wanderZiel.x - t.x, t.wanderZiel.y - t.y) < 4) t.wanderZiel = null;
    else laufeZu(spielWelt, t, t.wanderZiel, w.tempo * 0.5, dt);
  }
}

function laufeZu(spielWelt, t, ziel, tempo, dt) {
  const winkel = Math.atan2(ziel.y - t.y, ziel.x - t.x);
  const vorher = { x: t.x, y: t.y };
  bewegeKoerper(t, Math.cos(winkel) * tempo * dt, Math.sin(winkel) * tempo * dt, t.radius, spielWelt.welt);
  t.blick = lerpWinkel(t.blick, winkel, Math.min(1, dt * 8));
  if (Math.hypot(t.x - vorher.x, t.y - vorher.y) < tempo * dt * 0.2) t.wanderZiel = null;
}

function naechsterZombie(spielWelt, t, besitzer, radius) {
  let bester = null;
  let bestAbstand = radius;
  for (const z of spielWelt.alleVomTyp('zombie')) {
    const d = Math.min(Math.hypot(z.x - t.x, z.y - t.y), Math.hypot(z.x - besitzer.x, z.y - besitzer.y));
    if (d < bestAbstand) {
      bester = z;
      bestAbstand = d;
    }
  }
  return bester;
}

/** AKTION haustier { ziel }: wildes Tier zähmen/fangen bzw. eigenes Tier „bleib“ ↔ „folgen“. */
export function haustierAktion(spielWelt, spieler, ziel) {
  const t = spielWelt.holen(ziel);
  if (!t || t.typ !== 'tier' || !HAUSTIER_ARTEN.includes(t.art)) return false;
  if (Math.hypot(t.x - spieler.x, t.y - spieler.y) > 80) return false;
  if (t.besitzer === spieler.name) {
    t.zustand = t.zustand === 'bleib' ? 'folgen' : 'bleib';
    spielWelt.melde(spieler.id, t.zustand === 'bleib' ? `${t.name}: Bleib!` : `${t.name}: Bei Fuß!`);
    return true;
  }
  if (t.besitzer) {
    spielWelt.melde(spieler.id, `${t.name} gehört ${t.besitzer}`);
    return false;
  }
  const slot = spieler.inventar.findIndex((e) => e && FUTTER[t.art].includes(e.defId));
  if (slot < 0) {
    spielWelt.melde(spieler.id, { hund: 'Der Hund mag Fleisch …', katze: 'Die Katze will Fisch oder Milch …', huhn: 'Mit Samen lockst du das Huhn an …' }[t.art]);
    return false;
  }
  verbrauche(spieler, slot);
  if (t.art === 'huhn') {
    if (fuegeZumInventarHinzu(spieler, 'huhn', 1) > 0) {
      spielWelt.melde(spieler.id, 'Kein Platz für das Huhn');
      return false;
    }
    spielWelt.entfernen(t.id);
    spielWelt.ereignis({ typ: 'gackern', id: t.id, x: t.x, y: t.y });
    spielWelt.melde(spieler.id, '🐔 Huhn eingefangen – für einen Hühnerstall (Bau-Menü → Farm)');
    return true;
  }
  const max = spielWelt.konfiguration.haustiere.maxJeArt;
  if ((spieler.haustiere ?? []).filter((h) => h.art === t.art).length >= max) {
    spielWelt.melde(spieler.id, `Du hast schon ${max === 1 ? 'ein' : max} ${t.art === 'hund' ? 'Hund' : 'Katze'}${max > 1 ? 'n' : ''}`);
    return false;
  }
  t.besitzer = spieler.name;
  t.name = spielWelt.zufall.auswahl(NAMEN[t.art]);
  t.zustand = 'folgen';
  spieler.haustiere = [...(spieler.haustiere ?? []), { art: t.art, name: t.name }];
  spielWelt.ereignis({ typ: t.art === 'hund' ? 'bellen' : 'miau', id: t.id, x: t.x, y: t.y });
  spielWelt.melde(spieler.id, `${t.art === 'hund' ? '🐕' : '🐈'} ${t.name} gehört jetzt zu dir! (E: Bleib / Bei Fuß)`);
  return true;
}

/** Fehlende eigene Haustiere des Spielers in der Zone neben ihn setzen (alle 2 s aus tierSystem). */
export function begleite(spielWelt, spieler) {
  if (!spieler.haustiere?.length || spieler.tot) return;
  const da = [...spielWelt.alleVomTyp('tier')].filter((t) => t.besitzer === spieler.name);
  for (const h of spieler.haustiere) {
    if (da.some((t) => t.art === h.art && t.name === h.name)) continue;
    const t = erzeugeTier({ id: spielWelt.neueId(), art: h.art, x: spieler.x - Math.cos(spieler.blick) * 24, y: spieler.y - Math.sin(spieler.blick) * 24, konfiguration: spielWelt.konfiguration });
    Object.assign(t, { besitzer: spieler.name, name: h.name, zustand: 'folgen' });
    spielWelt.hinzufuegen(t);
  }
}

/** Haustier gestorben (kampfSystem.toeten): aus der Liste des Besitzers streichen. */
export function haustierGestorben(spielWelt, t) {
  const s = [...spielWelt.alleVomTyp('spieler')].find((x) => x.name === t.besitzer);
  if (!s) return;
  s.haustiere = (s.haustiere ?? []).filter((h) => !(h.art === t.art && h.name === t.name));
  spielWelt.melde(s.id, `💔 ${t.name} ist gestorben …`);
}
