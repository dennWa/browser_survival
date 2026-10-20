import { KACHEL_GROESSE } from '../../gemeinsam/konstanten.js';
import { sichtlinieFrei } from '../../gemeinsam/physik/strahl.js';
import { STANDARD_KONFIGURATION } from '../../server/spiel/konfiguration/spielKonfiguration.js';
import { ausSchluessel } from './karte.js';
import { pruefWelt } from './innen.js';
import { validiere } from './validierung.js';

/**
 * Lückenfinder (Editor 2.0, Schritt 9.3) – erst LOKAL berechnet (rein, kein DOM), dann erklärt/priorisiert die KI (ui/kiAufgaben.js).
 * Befunde { art, text, x, y, gewicht } (gewicht 1–3: 3 = wichtig):
 *   sackgasse        begehbare Kachel mit nur einem begehbaren Nachbarn am Ende eines ≥ 4 Kacheln langen Gangs
 *   haus-ohne-tuer   Innenfläche (zusammenhängend) ohne Tür/Öffnung nach draußen → Haus ohne Eingang
 *   raum-ohne-loot   Raum (Buchstabe) ohne Loot-Punkt · zone-ohne-loot  gar kein Loot (Punkte + Loot-Zonen)
 *   spawn-sicht      Zombie-Spawn in Sichtweite des Starts (Spiel-Sichtlinie `sichtlinieFrei`, ≤ Bemerk-Radius × 1,5)
 *   unerreichbar     aus der Prüfung (Erreichbarkeit vom Start)
 */
const MAX_BEFUNDE = 40;

export function findeLuecken(karte, { max = MAX_BEFUNDE } = {}) {
  const pw = pruefWelt(karte);
  const befunde = [];
  if (!pw) return befunde;
  const { welt, geladen } = pw;
  const g = KACHEL_GROESSE;
  const frei = (x, y) => x >= 0 && y >= 0 && x < welt.breite && y < welt.hoehe && !welt.istBlockiert(x, y);
  const innen = (x, y) => welt.istInnen((x + 0.5) * g, (y + 0.5) * g);

  // Räume / Zone ohne Loot
  const lootRaeume = new Set([...karte.s('marker').values()].filter((m) => m.art === 'loot').map((m) => m.raum));
  for (const [k, r] of karte.s('raeume')) if (!lootRaeume.has(k)) befunde.push({ art: 'raum-ohne-loot', text: `Raum ${k} „${r.name}“ hat keinen Loot-Punkt`, x: null, y: null, gewicht: 2 });
  if (!lootRaeume.size && !karte.s('lootZonen').size) befunde.push({ art: 'zone-ohne-loot', text: 'Die Zone hat gar kein Loot (keine Loot-Punkte, keine Loot-Zonen)', x: null, y: null, gewicht: 3 });

  // Häuser ohne Eingang: Innenflächen, von denen kein Nachbar draußen begehbar ist (Türen T zählen als Eingang)
  const gesehen = new Uint8Array(welt.breite * welt.hoehe);
  for (let y = 0; y < welt.hoehe; y++)
    for (let x = 0; x < welt.breite; x++) {
      const i = y * welt.breite + x;
      if (gesehen[i] || !frei(x, y) || !innen(x, y)) continue;
      const offen = [[x, y]];
      gesehen[i] = 1;
      let groesse = 0;
      let eingang = false;
      while (offen.length) {
        const [cx, cy] = offen.pop();
        groesse++;
        for (const [nx, ny] of [[cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]]) {
          if (nx < 0 || ny < 0 || nx >= welt.breite || ny >= welt.hoehe) continue;
          if (welt.kachelAn(nx, ny) === 'T') eingang = true;
          if (!frei(nx, ny)) continue;
          if (!innen(nx, ny)) {
            eingang = true;
            continue;
          }
          const j = ny * welt.breite + nx;
          if (!gesehen[j]) {
            gesehen[j] = 1;
            offen.push([nx, ny]);
          }
        }
      }
      if (!eingang && groesse >= 2) befunde.push({ art: 'haus-ohne-tuer', text: `Haus/Innenfläche (${groesse} Kacheln) ohne Eingang – Tür T in die Wand setzen`, x, y, gewicht: 3 });
    }

  // Sackgassen: Gang-Enden (genau 1 freier 4er-Nachbar), Gang mindestens 4 Kacheln lang, draußen (Häuser sind gewollt eng)
  let sackgassen = 0;
  for (let y = 0; y < welt.hoehe && sackgassen < 8; y++)
    for (let x = 0; x < welt.breite && sackgassen < 8; x++) {
      if (!frei(x, y) || innen(x, y)) continue;
      const nachbarn = [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]].filter(([a, b]) => frei(a, b));
      if (nachbarn.length !== 1) continue;
      let [px, py] = [x, y];
      let [cx, cy] = nachbarn[0];
      let laenge = 1;
      while (laenge < 6) {
        const weiter = [[cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]].filter(([a, b]) => frei(a, b) && !(a === px && b === py));
        if (weiter.length !== 1) break;
        [px, py, cx, cy] = [cx, cy, ...weiter[0]];
        laenge++;
      }
      if (laenge >= 4) {
        sackgassen++;
        befunde.push({ art: 'sackgasse', text: `Sackgasse: Gang (${laenge}+ Kacheln) endet blind`, x, y, gewicht: 1 });
      }
    }

  // Spawns in Sichtweite des Starts (mit der Spiel-Sichtlinie)
  const start = geladen.spielerStarts[0];
  const sicht = (karte.wert('einstellungen.zombie.aggroRadius') ?? STANDARD_KONFIGURATION.zombie.aggroRadius) * 1.5;
  if (start)
    for (const [schl, m] of karte.s('marker')) {
      if (m.art !== 'zombie') continue;
      const [x, y] = ausSchluessel(schl);
      const zx = (x + 0.5) * g;
      const zy = (y + 0.5) * g;
      const d = Math.hypot(zx - start.x, zy - start.y);
      if (d <= sicht && sichtlinieFrei(welt, start.x, start.y, zx, zy)) befunde.push({ art: 'spawn-sicht', text: `Zombie-Spawn in Sichtweite des Starts (${Math.round(d / g)} Kacheln, freie Sicht)`, x, y, gewicht: 2 });
    }

  // Unerreichbares aus der Prüfung
  for (const e of validiere(karte)) if (e.code === 'unerreichbar' || e.code === 'plateau-ohne-zugang') befunde.push({ art: 'unerreichbar', text: e.text, x: e.x, y: e.y, gewicht: 2 });

  return befunde.sort((a, b) => b.gewicht - a.gewicht).slice(0, max);
}

/** Befunde als kompakter Text für die KI */
export const befundeText = (befunde) => befunde.map((b, i) => `${i + 1}. [${b.art}] ${b.text}${b.x !== null ? ` bei ${b.x}|${b.y}` : ''}`).join('\n') || 'keine Befunde';
