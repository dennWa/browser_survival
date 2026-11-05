/**
 * Rauchtest Basisbau-Größenwahl (Runde 36): Hammer in die Hand, Bau-Modus (B), Boden wählen, Rechtsklick → Popup 1×1/4×4/8×8
 * → Wahl landet in den Spielerdaten (bauBlock). Aufruf: node werkzeuge/test/bauGroesse.mjs (Port 8096, Playwright nötig).
 */
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { hauptmenueAbwarten, singleplayerStarten } from './menueHelfer.mjs';
const { chromium } = createRequire(import.meta.url)('playwright');
const AUS = new URL('./ausgabe/', import.meta.url).pathname;
const port = 8096;
const server = spawn(process.execPath, ['server/node/start.js', '--gast'], { cwd: process.cwd(), env: { ...process.env, PORT: String(port) }, stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 2500));
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
let fehler = 0;
const pruefe = (ok, text) => { console.log(`${ok ? '✓' : '✗'} ${text}`); if (!ok) fehler++; };
try {
  const s = await (await browser.newContext({ viewport: { width: 1000, height: 640 } })).newPage();
  s.on('pageerror', (e) => { console.log('PAGEERR', e.message); fehler++; });
  await s.goto(`http://localhost:${port}/`);
  await hauptmenueAbwarten(s);
  await singleplayerStarten(s, 'Bau' + (Date.now() % 1000));
  await s.waitForSelector('#laden', { state: 'hidden', timeout: 90000 });
  await s.evaluate(() => { browserSurvival.gib('hammer', 1); browserSurvival.gib('holz', 300); });
  await s.waitForTimeout(600);
  await s.keyboard.press('KeyB');
  await s.waitForSelector('#bau-menue:not([hidden])', { timeout: 5000 });
  await s.evaluate(() => { browserSurvival.spiel.bau.auswahl = 'holzboden'; });
  await s.waitForTimeout(400);
  await s.mouse.move(500, 300);
  await s.mouse.click(500, 300, { button: 'right' });
  await s.waitForSelector('.bau-groessen', { timeout: 3000 });
  pruefe(true, 'Rechtsklick öffnet Größen-Popup');
  await s.screenshot({ path: `${AUS}/bau_groesse_popup.png` });
  const knoepfe = await s.$$eval('.bau-groessen .bau-groesse', (k) => k.map((e) => e.textContent));
  pruefe(JSON.stringify(knoepfe) === JSON.stringify(['1×1', '4×4', '8×8']), `Optionen: ${knoepfe.join(' ')}`);
  await s.click('.bau-groessen .bau-groesse:has-text("8×8")');
  await s.waitForTimeout(800);
  const daten = await s.evaluate(() => browserSurvival.spiel.spielerDaten.bauBlock);
  pruefe(daten === 8, `bauBlock beim Server = ${daten}`);
  pruefe((await s.$('.bau-groessen')) === null, 'Popup nach Wahl zu');
  const knopf = await s.textContent('#bau-menue .bau-knopf:has-text("▦")');
  pruefe(knopf.includes('8×8'), `Knopf zeigt ${knopf}`);
  // Zweiter Rechtsklick öffnet/schließt; Esc schließt nur das Popup
  await s.mouse.click(500, 300, { button: 'right' });
  await s.waitForSelector('.bau-groessen');
  await s.keyboard.press('Escape');
  await s.waitForTimeout(300);
  pruefe((await s.$('.bau-groessen')) === null, 'Esc schließt Popup');
  pruefe(await s.evaluate(() => browserSurvival.spiel.bau.aktiv), 'Bau-Modus noch an (Esc nur fürs Popup)');
  // Ohne Block-Bauteil: Rechtsklick löst Auswahl (wie bisher)
  await s.evaluate(() => { browserSurvival.spiel.bau.auswahl = 'holzwand'; browserSurvival.spiel.bau.auswahl = 'kerze'; });
  await s.mouse.click(500, 300, { button: 'right' });
  await s.waitForTimeout(200);
  pruefe((await s.$('.bau-groessen')) === null && (await s.evaluate(() => browserSurvival.spiel.bau.auswahl)) === null, 'Nicht-Block-Teil: Rechtsklick löst Auswahl');
} finally { await browser.close(); server.kill(); }
process.exit(fehler ? 1 : 0);
