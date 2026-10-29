#!/usr/bin/env node
/**
 * Rauchtest Runde 23 (Lokal-Modus, echter Browser): prüft die Neuerungen je Phase und macht Screenshots.
 *
 *   npm run rauchtest:r23                 alle Phasen
 *   npm run rauchtest:r23 -- --phase 1    nur Phase 1 (mehrere: --phase 1,2)
 *
 * Screenshots: werkzeuge/test/ausgabe/r23_*.png · Exit-Code 1 bei Seiten-/Konsolenfehlern oder fehlgeschlagener Prüfung.
 * Muster wie rauchtest.mjs (Server --gast, Playwright/Chromium mit SwiftShader, Gottmodus für die Testfigur).
 */
import { spawn, execSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const AUSGABE = path.join(WURZEL, 'werkzeuge/test/ausgabe');
const argumente = process.argv.slice(2);
const port = Number(argumente[argumente.indexOf('--port') + 1]) || 8094;
const phasenArg = argumente.includes('--phase') ? argumente[argumente.indexOf('--phase') + 1] : '';
const PHASEN = phasenArg ? new Set(phasenArg.split(',').map(Number)) : null;
const phaseAn = (n) => !PHASEN || PHASEN.has(n);

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
let schritte = 0;
const schritt = (text) => {
  schritte++;
  console.log(`  ✓ ${text}`);
};
const pruefe = (ok, text) => (ok ? schritt(text) : fehler.push(`Prüfung: ${text}`));

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
try {
  const seite = await browser.newPage({ viewport: { width: 1100, height: 680 } });
  seite.on('pageerror', (e) => fehler.push(`pageerror: ${e.message}`));
  seite.on('console', (m) => m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text()) && fehler.push(`console: ${m.text()}`));
  const bild = (name) => seite.screenshot({ path: path.join(AUSGABE, `r23_${name}.png`) });
  /** Server-Spieler (eigene Figur) in der aktuellen Zone → fn(ich, welt) im Browser */
  const amServer = (fn, arg) =>
    seite.evaluate(
      ([quelle, a]) => {
        const srv = browserSurvival.server;
        for (const z of srv.zonen.values()) {
          const ich = z.spielWelt.holen(browserSurvival.spiel.eigeneId);
          if (ich) return new Function('ich', 'welt', 'a', quelle)(ich, z.spielWelt, a);
        }
        return null;
      },
      [fn, arg],
    );
  const zone = async (id) => {
    await seite.evaluate((z) => browserSurvival.zone(z), id);
    await seite.waitForFunction((z) => browserSurvival.spiel?.welt.id === z, id, { timeout: 30000 });
    await seite.waitForTimeout(1500);
    await seite.waitForSelector('#laden', { state: 'hidden', timeout: 30000 });
    await amServer('ich.gottmodus = true;');
  };

  await seite.goto(`http://localhost:${port}/`);
  await seite.waitForSelector('#login:not([hidden])', { timeout: 60000 });
  await seite.selectOption('#login-server', 'lokal');
  await seite.fill('#login-name', `R23_${Date.now() % 1000}`);
  await seite.click('#login-knopf');
  await seite.waitForSelector('#laden', { state: 'hidden', timeout: 60000 });
  await amServer('ich.gottmodus = true;');
  schritt('im Spiel (lokal)');

  // ---------------------------------------------------------------- Phase 1
  if (phaseAn(1)) {
    // M öffnet die Karte
    await seite.keyboard.press('KeyM');
    await seite.waitForTimeout(400);
    pruefe(await seite.evaluate(() => browserSurvival.spiel.karte.offen), 'M öffnet die Karte');
    await seite.keyboard.press('KeyM');
    // Klick ins Spiel bei offenem Inventar schießt nicht
    await seite.keyboard.press('Tab');
    await seite.waitForTimeout(400);
    const schuesseVorher = await amServer('return ich.inventar.find((e) => e?.defId === "pistole")?.magazin ?? null;');
    await amServer('const i = ich.inventar.findIndex((e) => e?.defId === "pistole"); ich.ausgeruestet = i;');
    await seite.mouse.move(900, 600);
    await seite.mouse.down();
    await seite.waitForTimeout(700);
    await seite.mouse.up();
    const schuesseNachher = await amServer('return ich.inventar.find((e) => e?.defId === "pistole")?.magazin ?? null;');
    pruefe(schuesseVorher === schuesseNachher, `Klick bei offenem Inventar schießt nicht (Magazin ${schuesseVorher} → ${schuesseNachher})`);
    await seite.keyboard.press('Escape');
    // Esc im Bett = aufstehen
    await amServer('ich.arbeit = { art: "schlafen", dauer: 60, rest: 60, x: ich.x, y: ich.y, ort: { x: ich.x, y: ich.y } };');
    await seite.waitForFunction(() => browserSurvival.spiel.schlaeft, null, { timeout: 5000 });
    await seite.keyboard.press('Escape');
    await seite.waitForTimeout(800);
    pruefe((await amServer('return ich.arbeit?.art ?? null;')) === null, 'Esc bricht Schlafen ab');
    // Obst gibt Wasser
    const durst = await amServer('ich.durst = 50; ich.inventar[7] = { defId: "apfel", menge: 1 }; return ich.durst;');
    await amServer('ich.aktionsPuffer.push({ art: "konsumieren", slot: 7 });');
    await seite.waitForTimeout(400);
    pruefe((await amServer('return ich.durst;')) > durst, 'Apfel löscht etwas Durst');
    // Kofferraum-Hinweis hinter einem Auto
    const hinter = await amServer(`
      const fz = [...welt.alleVomTyp('fahrzeug')].find((f) => !f.kaputt && f.fahrerId === null);
      if (!fz) return null;
      const d = fz.laenge / 2 + 8;
      return { x: fz.x - Math.cos(fz.winkel) * d, y: fz.y - Math.sin(fz.winkel) * d };`);
    if (hinter) {
      await seite.evaluate(({ x, y }) => browserSurvival.tp(x / 32, y / 32), hinter);
      await seite.waitForTimeout(1200);
      const text = await seite.evaluate(() => document.getElementById('hud-angeln').textContent);
      pruefe(/Kofferraum/.test(text), `Kofferraum-Hinweis („${text}“)`);
      await bild('1_auto_alt');
    } else fehler.push('Prüfung: kein Auto in der Startzone gefunden');
    // Schneezone: Villa innen (Schneeflecken in den Wänden?)
    await zone('schneeland');
    await bild('1_schnee_aussen');
    const villa = await seite.evaluate(() => {
      const r = browserSurvival.spiel.welt.raeume.find((r) => r.name === 'Skihütte');
      return r ? { tx: Math.floor(r.x / 32), ty: Math.floor(r.y / 32) } : null;
    });
    if (villa) {
      await seite.evaluate(({ tx, ty }) => browserSurvival.tp(tx, ty), villa);
      await seite.waitForTimeout(2000);
      await bild('1_schnee_villa_innen');
      schritt('Schneeland Hütte innen (Screenshot: keine Schneeflecken unter ausgeblendeten Wänden)');
    }
    await zone('stadtrand');
  }

  const info = await seite.evaluate(() => browserSurvival.spiel?.renderer.statistik() ?? '');
  if (info) console.log(`  Grafik: ${info}`);
} catch (e) {
  fehler.push(`Ablauf: ${e.message.split('\n')[0]}`);
} finally {
  await browser.close();
  server.kill();
}

console.log(`\nScreenshots: ${path.relative(WURZEL, AUSGABE)}/r23_*.png`);
if (fehler.length) {
  console.log(`✗ ${fehler.length} Fehler:\n${fehler.map((f) => `  - ${f}`).join('\n')}`);
  process.exitCode = 1;
} else console.log(`✓ Rauchtest Runde 23 ok (${schritte} Schritte)`);
