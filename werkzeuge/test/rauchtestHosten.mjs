/**
 * Runde 47: Rauchtest „Server hosten“ mit ZWEI Browsern (echter WebRTC-DataChannel, Vermittler = öffentlicher PeerJS-Dienst
 * bzw. ?signal=…). Der Node-Server liefert hier nur die Dateien aus – gespielt wird beim Host im Tab.
 *   node werkzeuge/test/rauchtestHosten.mjs [--port 8095]
 * Ablauf: Host: Multiplayer → Server hosten (PvP an, 4 Spieler) → Charakter → im Spiel, Einladen-Fenster zeigt Code + 🟢
 *   → Gast öffnet den Einladungslink (?beitreten=CODE) → Charakter → im Spiel beim Host (Servername, 2 Spieler)
 *   → Host kickt den Gast → Gast landet mit Meldung im Hauptmenü, Wiederbeitritt wird abgelehnt.
 * Ausgabe: werkzeuge/test/ausgabe/hosten/*.png
 */
import { spawn, execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { hauptmenueAbwarten } from './menueHelfer.mjs';

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const AUSGABE = path.join(WURZEL, 'werkzeuge/test/ausgabe/hosten');
const argumente = process.argv.slice(2);
const port = Number(argumente[argumente.indexOf('--port') + 1]) || 8095;
const require = createRequire(import.meta.url);
let playwright;
try {
  playwright = require('playwright');
} catch {
  playwright = require(path.join(execSync('npm root -g').toString().trim(), 'playwright'));
}
mkdirSync(AUSGABE, { recursive: true });

const server = spawn(process.execPath, ['server/node/start.js', '--gast'], { cwd: WURZEL, env: { ...process.env, PORT: String(port), BOTS: '0' }, stdio: ['ignore', 'pipe', 'pipe'] });
let serverLog = '';
server.stdout.on('data', (d) => (serverLog += d));
server.stderr.on('data', (d) => (serverLog += d));
await new Promise((ok, fehler) => {
  const t = setTimeout(() => fehler(new Error(`Server startet nicht:\n${serverLog}`)), 10000);
  server.stdout.on('data', () => /läuft|localhost/.test(serverLog) && (clearTimeout(t), ok()));
});

const fehler = [];
const warte = (ms) => new Promise((r) => setTimeout(r, ms));
async function warteBis(seite, code, text, ms = 60000, arg = undefined) {
  const ende = Date.now() + ms;
  while (Date.now() < ende) {
    if (await seite.evaluate(code, arg).catch(() => false)) return;
    await warte(400);
  }
  throw new Error(`Zeitüberschreitung: ${text}`);
}
// Sandbox: keine mDNS-Auflösung → lokale IPs nicht verschleiern (im echten Heimnetz klappt mDNS bzw. STUN)
const browser = await playwright.chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-features=WebRtcHideLocalIpsWithMdns'] });
const seiten = {};
try {
  // --- Host ---
  const kHost = await browser.newContext({ viewport: { width: 960, height: 600 } });
  const host = (seiten.host = await kHost.newPage());
  host.on('pageerror', (e) => fehler.push(`Host pageerror: ${e.message}`));
  await host.goto(`http://localhost:${port}/`);
  await hauptmenueAbwarten(host);
  await host.click('#hm-multiplayer');
  await host.click('#hm-hosten');
  await host.fill('#hm-host-name', 'Testserver');
  await host.click('#hm-host-pvp button[data-pvp="an"]');
  await host.selectOption('#hm-host-max', '4');
  await host.click('#hm-host-neu button[type="submit"]');
  await host.fill('#ce-name', 'Hosti');
  await host.click('#ce-laden');
  await host.waitForSelector('#laden', { state: 'hidden', timeout: 120000 });
  await warteBis(host, () => !!window.browserSurvival.spiel?.eigeneSid, 'Host im Spiel');
  await host.click('#hud-einladen');
  await warteBis(host, () => document.getElementById('host-status').textContent.includes('🟢'), 'Vermittler bereit', 30000);
  const code = (await host.textContent('#host-code')).trim();
  await host.screenshot({ path: path.join(AUSGABE, '1_host_einladen.png') });
  console.log(`  ✓ Host im Spiel, Einladungscode ${code}, Vermittler bereit`);
  const pvp = await host.evaluate(() => window.browserSurvival.server?.konfiguration?.kampf?.pvp);
  if (pvp !== true) throw new Error(`PvP-Einstellung nicht übernommen (${pvp})`);
  console.log('  ✓ PvP an (wie beim Erstellen gewählt)');
  await host.click('#host-schliessen');

  // --- Gast über den Einladungslink ---
  const kGast = await browser.newContext({ viewport: { width: 960, height: 600 } });
  const gast = (seiten.gast = await kGast.newPage());
  gast.on('pageerror', (e) => fehler.push(`Gast pageerror: ${e.message}`));
  await gast.goto(`http://localhost:${port}/?beitreten=${code}`);
  await hauptmenueAbwarten(gast);
  await warteBis(gast, () => document.getElementById('hm-mp-adresse-eingabe')?.value.length > 0, 'Code aus dem Link vorausgefüllt', 15000);
  await gast.locator('#hm-mp-charakter .hm-knopf', { hasText: /Charakter erstellen/ }).first().click();
  await gast.fill('#ce-name', 'Gasti');
  await gast.click('#ce-laden');
  await gast.waitForSelector('#laden', { state: 'hidden', timeout: 120000 });
  await warteBis(gast, () => !!window.browserSurvival.spiel?.eigeneSid, 'Gast im Spiel');
  const serverName = await gast.evaluate(() => window.browserSurvival.spiel.serverName);
  if (serverName !== 'Testserver') throw new Error(`Gast ist nicht beim Host (${serverName})`);
  await warteBis(host, () => window.browserSurvival.server.spielerAnzahl === 2, 'Host sieht 2 Spieler', 20000);
  await gast.screenshot({ path: path.join(AUSGABE, '2_gast_beim_host.png') });
  console.log('  ✓ Gast per Link beigetreten – Host zählt 2 Spieler');

  // --- Kick ---
  const gastName = await gast.evaluate(() => window.browserSurvival.spiel.benutzername);
  await host.evaluate((n) => window.browserSurvival.spiel.admin('kick', n), gastName);
  await warteBis(gast, () => !document.getElementById('hauptmenue').hidden && /geworfen/.test(document.getElementById('hm-meldung').textContent), 'Gast wurde gekickt', 20000);
  console.log(`  ✓ gekickt: „${await gast.textContent('#hm-meldung')}“`);
  await gast.screenshot({ path: path.join(AUSGABE, '3_gast_gekickt.png') });
  await warteBis(host, () => window.browserSurvival.server.spielerAnzahl === 1, 'Host wieder allein', 15000);
  console.log('  ✓ Host wieder allein');
} catch (e) {
  fehler.push(String(e?.message ?? e));
  for (const [name, seite] of Object.entries(seiten)) {
    await seite.screenshot({ path: path.join(AUSGABE, `fehler_${name}.png`) }).catch(() => {});
    fehler.push(`${name}: ${await seite.evaluate(() => JSON.stringify({ spiel: !!window.browserSurvival?.spiel, meldung: document.getElementById('hm-meldung')?.textContent, status: document.getElementById('host-status')?.textContent })).catch((x) => x.message)}`);
    fehler.push(`${name} p2p:\n    ${(await seite.evaluate(() => window.browserSurvival?.p2p ?? []).catch(() => [])).join('\n    ')}`);
  }
} finally {
  await browser.close();
  server.kill();
}
if (fehler.length) {
  console.log(`✗ Hosten-Rauchtest: ${fehler.length} Fehler\n  ${fehler.join('\n  ')}`);
  process.exit(1);
}
console.log('✓ Hosten-Rauchtest ok');
