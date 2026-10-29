#!/usr/bin/env node
/**
 * Baut das UI-Icon-Sprite client/assets/eigene/ui-icons.svg aus game-icons.net (CC BY 3.0, Lorc, Delapouite & Co.).
 * Quelle: npm-Paket @iconify-json/game-icons (alle Icons als JSON) – wird bei Bedarf per `npm pack` geholt.
 *
 *   node werkzeuge/assets/baue_ui_icons.mjs [pfad/zu/icons.json]
 *
 * Neues Icon: Eintrag in ICONS (Sprite-ID → game-icons-Name), Skript laufen lassen, im HTML/JS mit
 * `<svg class="ui-icon"><use href="assets/eigene/ui-icons.svg#i-<id>"/></svg>` (bzw. `uiIcon(id)` aus client/ui/uiIcons.js) nutzen.
 * Credits: Eintrag „Game Icons“ in client/assets/eigene/credits.json (Pflicht, CC BY).
 */
import { execSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const ZIEL = path.join(WURZEL, 'client/assets/eigene/ui-icons.svg');

export const ICONS = {
  // HUD-Werte
  leben: 'heart-beats',
  hunger: 'meat',
  durst: 'water-drop',
  ausdauer: 'power-lightning',
  xp: 'upgrade',
  kaelte: 'thermometer-cold',
  // obere Leiste
  bauen: 'claw-hammer',
  skills: 'star-medal',
  kofferraum: 'suitcase',
  sitzen: 'wooden-chair',
  zoom: 'magnifying-glass',
  admin: 'checked-shield',
  einstellungen: 'cog',
  chat: 'chat-bubble',
  inventar: 'backpack',
  feld: 'sprout',
  karte: 'treasure-map',
  licht: 'flashlight',
  // Ausrüstungs-Slots (Inventar, Charakter)
  kopf: 'winter-hat',
  oberkoerper: 'hoodie',
  beine: 'trousers',
  fuesse: 'fur-boot',
  haende: 'winter-gloves',
  ruecken: 'backpack',
  hand: 'plain-dagger',
  person: 'person',
  // Wetter/Tageszeit
  sonne: 'sun',
  mond: 'moon',
  schneeflocke: 'snowflake-2',
};

function ladeIconify(pfad) {
  if (pfad) return JSON.parse(readFileSync(pfad, 'utf8'));
  const tmp = mkdtempSync(path.join(tmpdir(), 'gameicons-'));
  execSync('npm pack @iconify-json/game-icons --silent', { cwd: tmp });
  const tgz = readdirSync(tmp).find((d) => d.endsWith('.tgz'));
  execSync(`tar xzf ${tgz}`, { cwd: tmp });
  return JSON.parse(readFileSync(path.join(tmp, 'package/icons.json'), 'utf8'));
}

const daten = ladeIconify(process.argv[2]);
const groesse = daten.width ?? 512;
const symbole = Object.entries(ICONS).map(([id, name]) => {
  const icon = daten.icons[name];
  if (!icon) throw new Error(`game-icons: „${name}“ fehlt`);
  return `  <symbol id="i-${id}" viewBox="0 0 ${icon.width ?? groesse} ${icon.height ?? groesse}">${icon.body}</symbol>`;
});
writeFileSync(
  ZIEL,
  `<svg xmlns="http://www.w3.org/2000/svg" style="display:none">\n  <!-- game-icons.net (CC BY 3.0) – erzeugt von werkzeuge/assets/baue_ui_icons.mjs, nicht von Hand ändern -->\n${symbole.join('\n')}\n</svg>\n`,
);
console.log(`${symbole.length} Icons → ${path.relative(WURZEL, ZIEL)}`);
