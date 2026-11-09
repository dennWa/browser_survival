/**
 * Runde 47: Rauchtest Funkgerät/Sprachchat mit ZWEI Browsern (WebRTC echt, Mikrofon = Chromium-Testton).
 *   node werkzeuge/test/rauchtestFunk.mjs [--port 8094]
 * Ablauf: Node-Server (Gast) → Anna + Bert treten bei (Multiplayer → Dieser Server) → beide Funk an (gleiche Frequenz)
 * → Anna hält die Funk-Taste → Bert: WebRTC verbunden, Funk-Spur kommt an (Bytes > 0, Pegel > 0), HUD zeigt „📻 Anna“.
 * → Bert dreht die Frequenz weg → Verbindung wird abgebaut. Ausgabe: werkzeuge/test/ausgabe/funk/*.png
 */
import { spawn, execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { hauptmenueAbwarten, multiplayerGast } from './menueHelfer.mjs';

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const AUSGABE = path.join(WURZEL, 'werkzeuge/test/ausgabe/funk');
const argumente = process.argv.slice(2);
const port = Number(argumente[argumente.indexOf('--port') + 1]) || 8094;
const require = createRequire(import.meta.url);
let playwright;
try {
  playwright = require('playwright');
} catch {
  playwright = require(path.join(execSync('npm root -g').toString().trim(), 'playwright'));
}
mkdirSync(AUSGABE, { recursive: true });

const server = spawn(process.execPath, ['server/node/start.js', '--gast'], { cwd: WURZEL, env: { ...process.env, PORT: String(port), BOTS: '0', HERZSCHLAG_MS: '120000' }, stdio: ['ignore', 'pipe', 'pipe'] });
let serverLog = '';
server.stdout.on('data', (d) => (serverLog += d));
server.stderr.on('data', (d) => (serverLog += d));
await new Promise((ok, fehler) => {
  const t = setTimeout(() => fehler(new Error(`Server startet nicht:\n${serverLog}`)), 10000);
  server.stdout.on('data', () => /läuft|localhost/.test(serverLog) && (clearTimeout(t), ok()));
});

const fehler = [];
const browser = await playwright.chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'] });
const warte = (ms) => new Promise((r) => setTimeout(r, ms));
async function warteBis(seite, code, text, ms = 30000) {
  const ende = Date.now() + ms;
  while (Date.now() < ende) {
    if (await seite.evaluate(code)) return;
    await warte(300);
  }
  throw new Error(`Zeitüberschreitung: ${text}`);
}
try {
  const seiten = {};
  globalThis.alleSeiten = seiten;
  for (const name of ['Anna', 'Bert']) {
    const kontext = await browser.newContext({ viewport: { width: 900, height: 560 }, permissions: ['microphone'] });
    const seite = await kontext.newPage();
    seite.on('pageerror', (e) => fehler.push(`${name} pageerror: ${e.message}`));
    seite.on('console', (m) => m.type() === 'error' && !/favicon|WebGL|GPU stall/.test(m.text()) && fehler.push(`${name} console: ${m.text()}`));
    seite.on('console', (m) => /Verbindung|getrennt|WebSocket/i.test(m.text()) && console.log(`    [${name}] ${m.text()}`));
    seite.on('websocket', (ws) => {
      let letzteGesendet = '';
      ws.on('framesent', (f) => (letzteGesendet = String(f.payload).slice(0, 120) + ` (${String(f.payload).length} B)`));
      ws.on('socketerror', (e) => console.log(`    [${name}] socketerror ${e}`));
      ws.on('close', () => console.log(`    [${name}] WebSocket zu – zuletzt gesendet: ${letzteGesendet}`));
    });
    await seite.goto(`http://localhost:${port}/`);
    await hauptmenueAbwarten(seite);
    await multiplayerGast(seite, 'Dieser Server', name);
    seiten[name] = seite;
    // Nacheinander: zwei gleichzeitig ladende Software-3D-Seiten bremsen die Maschine zu sehr aus
    await seite.waitForSelector('#laden', { state: 'hidden', timeout: 120000 });
    await warteBis(seite, () => !!window.browserSurvival.spiel?.eigeneSid, `${name}: im Spiel`);
    console.log(`  ✓ ${name} im Spiel (sid ${await seite.evaluate(() => window.browserSurvival.spiel.eigeneSid)})`);
  }
  const { Anna: anna, Bert: bert } = seiten;
  for (const seite of [anna, bert]) await seite.evaluate(() => window.browserSurvival.spiel.funk('an'));
  await warteBis(bert, () => window.browserSurvival.spiel.funkLage?.partner?.length === 1, 'Bert sieht Anna auf der Frequenz');
  console.log('  ✓ beide auf 100,0 MHz');
  await anna.keyboard.press('BracketLeft'); // Ü = Funkgerät-Fenster
  await warte(500);
  await anna.screenshot({ path: path.join(AUSGABE, '1_funkfenster.png') });
  await anna.keyboard.press('Escape');
  await warteBis(bert, async () => (await window.browserSurvival.spiel.stimme.zustand()).some((p) => p.verbindung === 'connected'), 'WebRTC verbunden', 40000);
  console.log('  ✓ WebRTC verbunden');
  await anna.keyboard.down('KeyY'); // Z (QWERTZ) = funken
  await warteBis(bert, () => window.browserSurvival.spiel.stimme.funkSprecher.includes('Anna'), 'Bert sieht „Anna funkt“');
  const vorher = (await bert.evaluate(() => window.browserSurvival.spiel.stimme.zustand()))[0];
  await warte(2500);
  const nachher = (await bert.evaluate(() => window.browserSurvival.spiel.stimme.zustand()))[0];
  const anzeige = await bert.evaluate(() => document.getElementById('hud-funk-anzeige').textContent);
  await bert.screenshot({ path: path.join(AUSGABE, '2_bert_hoert.png') });
  await anna.keyboard.up('KeyY');
  console.log(`  · Bert: Funk-Pegel ${nachher.funk}, Funk-Bytes ${vorher.bytes[1]} → ${nachher.bytes[1]}, HUD „${anzeige}“`);
  if (!(nachher.funk > 0)) throw new Error('Funk-Pegel bei Bert ist 0');
  if (!(nachher.bytes[1] > vorher.bytes[1])) throw new Error('Funk-Spur kommt nicht an');
  if (!anzeige.includes('Anna')) throw new Error('HUD zeigt den Funker nicht');
  console.log('  ✓ Bert hört Anna über Funk');
  await bert.evaluate(() => window.browserSurvival.spiel.funk('frequenz', 1015));
  await warteBis(bert, async () => (await window.browserSurvival.spiel.stimme.zustand()).length === 0, 'Verbindung nach Frequenzwechsel abgebaut', 15000);
  console.log('  ✓ andere Frequenz → getrennt');
} catch (e) {
  fehler.push(String(e?.message ?? e));
  for (const [name, seite] of Object.entries(globalThis.alleSeiten ?? {})) {
    await seite.screenshot({ path: path.join(AUSGABE, `fehler_${name}.png`) }).catch(() => {});
    fehler.push(`${name}: ${await seite.evaluate(() => JSON.stringify({ spiel: !!window.browserSurvival?.spiel, sid: window.browserSurvival?.spiel?.eigeneSid, meldung: document.getElementById('hm-meldung')?.textContent })).catch((x) => x.message)}`);
  }
} finally {
  await browser.close();
  server.kill();
}
if (fehler.length) {
  console.log(`✗ Funk-Rauchtest: ${fehler.length} Fehler\n  ${fehler.join('\n  ')}\n--- Server ---\n${serverLog.split('\n').slice(-25).join('\n')}`);
  process.exit(1);
}
console.log('✓ Funk-Rauchtest ok');
