#!/usr/bin/env node
/**
 * Rauchtest im echten Browser (für Menschen UND KI-Sitzungen): startet den Server, spielt kurz und meldet Fehler.
 *
 *   npm run rauchtest                  Lokal-Modus (Server im Browser-Tab)
 *   npm run rauchtest -- --online      über den Node-Server (WebSocket, Gast-Login)
 *   npm run rauchtest -- --port 8099   anderer Port (Standard 8093)
 *
 * Ablauf: Login → Ladebildschirm weg → laufen → Inventar (I) → Karte (K) → Bau-Modus (B) → Zonenwechsel Waldweg und zurück
 * (nur lokal, über browserSurvival.zone) → Screenshots nach werkzeuge/test/ausgabe/ → Fehlerliste.
 * Exit-Code 1 bei Seiten-/Konsolenfehlern. Braucht Playwright + Chromium (lokal installiert oder global:
 * `npm i -g playwright`); in Cloud-Sandboxen ist es meist schon da.
 */
import { spawn } from 'node:child_process';
import { execSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const AUSGABE = path.join(WURZEL, 'werkzeuge/test/ausgabe');
const argumente = process.argv.slice(2);
const online = argumente.includes('--online');
const port = Number(argumente[argumente.indexOf('--port') + 1]) || 8093;

function ladePlaywright() {
  const require = createRequire(import.meta.url);
  try {
    return require('playwright');
  } catch {
    return require(path.join(execSync('npm root -g').toString().trim(), 'playwright'));
  }
}

const { chromium } = ladePlaywright();
mkdirSync(AUSGABE, { recursive: true });
const server = spawn(process.execPath, ['server/node/start.js', '--gast'], { cwd: WURZEL, env: { ...process.env, PORT: String(port) }, stdio: ['ignore', 'pipe', 'pipe'] });
let serverLog = '';
server.stdout.on('data', (d) => (serverLog += d));
server.stderr.on('data', (d) => (serverLog += d));
await new Promise((ok, fehler) => {
  const t = setTimeout(() => fehler(new Error(`Server startet nicht:\n${serverLog}`)), 10000);
  server.stdout.on('data', () => /läuft|localhost/.test(serverLog) && (clearTimeout(t), ok()));
});

const fehler = [];
const schritte = [];
const schritt = (text) => {
  schritte.push(text);
  console.log(`  ✓ ${text}`);
};
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
try {
  const seite = await browser.newPage({ viewport: { width: 1000, height: 620 } });
  seite.on('pageerror', (e) => fehler.push(`pageerror: ${e.message}`));
  seite.on('console', (m) => m.type() === 'error' && fehler.push(`console: ${m.text()}`));
  const bild = (name) => seite.screenshot({ path: path.join(AUSGABE, `${name}.png`) });

  await seite.goto(`http://localhost:${port}/`);
  await seite.waitForSelector('#login:not([hidden])', { timeout: 60000 });
  schritt('Login-Bildschirm');
  await bild('1_login');
  await seite.selectOption('#login-server', online ? 'dieser' : 'lokal');
  if (online) await seite.click('#login-gast');
  else {
    await seite.fill('#login-name', `Rauch${Date.now() % 1000}`);
    await seite.click('#login-knopf');
  }
  await seite.waitForSelector('#laden', { state: 'hidden', timeout: 60000 });
  schritt(`im Spiel (${online ? 'online' : 'lokal'})`);
  await seite.keyboard.down('KeyD');
  await seite.waitForTimeout(700);
  await seite.keyboard.up('KeyD');
  await seite.waitForTimeout(400);
  await bild('2_spiel');
  schritt('gelaufen');
  await seite.keyboard.press('KeyI');
  await seite.waitForTimeout(400);
  await bild('3_inventar');
  await seite.keyboard.press('KeyI');
  await seite.keyboard.press('KeyK');
  await seite.waitForTimeout(400);
  await bild('4_karte');
  await seite.keyboard.press('KeyK');
  schritt('Inventar & Karte');
  // Bau-Modus (B): Menü geht auf, Hammer in der Hand, Hologramm läuft ohne Fehler; B beendet ihn wieder
  await seite.keyboard.press('KeyB');
  await seite.waitForSelector('#bau-menue:not([hidden])', { timeout: 5000 });
  await seite.waitForTimeout(500);
  await bild('4b_bauen');
  await seite.keyboard.press('KeyB');
  await seite.waitForSelector('#bau-menue', { state: 'hidden', timeout: 5000 });
  schritt('Bau-Modus (B)');
  if (!online) {
    for (const ziel of ['waldweg', 'stadtrand']) {
      await seite.evaluate((z) => browserSurvival.zone(z), ziel);
      await seite.waitForFunction((z) => browserSurvival.spiel?.welt.id === z, ziel, { timeout: 20000 });
      await seite.waitForSelector('#laden', { state: 'hidden', timeout: 30000 });
      await seite.waitForTimeout(500);
      await bild(`5_zone_${ziel}`);
      schritt(`Zone ${ziel}`);
    }
  }
  const info = await seite.evaluate(() => browserSurvival.spiel?.renderer.statistik() ?? '');
  if (info) console.log(`  Grafik: ${info}`);
} catch (e) {
  fehler.push(`Ablauf: ${e.message.split('\n')[0]}`);
} finally {
  await browser.close();
  server.kill();
}

console.log(`\nScreenshots: ${path.relative(WURZEL, AUSGABE)}/`);
if (fehler.length) {
  console.log(`✗ ${fehler.length} Fehler:\n${fehler.map((f) => `  - ${f}`).join('\n')}`);
  process.exitCode = 1;
} else console.log(`✓ Rauchtest ok (${schritte.length} Schritte, keine Fehler)`);
