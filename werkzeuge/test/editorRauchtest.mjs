#!/usr/bin/env node
/**
 * Rauchtest des Map-Editors im echten Browser (Playwright + Chromium): startet den Node-Server, öffnet /editor/ und
 * spielt die wichtigsten Abläufe durch. Screenshots → werkzeuge/test/ausgabe/editor-*.png. Exit-Code 1 bei Fehlern.
 *
 *   npm run rauchtest:editor [-- --port 8094]
 *
 * Ablauf: Login-Link → Editor → neue Zone (Rechteck aufziehen) → Kacheln malen (Pinsel, Rechteck, Linie, Füllen) →
 * Objekt platzieren + drehen + verschieben → Rückgängig/Wiederholen → Spielzone Waldweg als Vorlage öffnen → Auswahl +
 * Ausschnitt-Export → Zone vergrößern → 3D-Ansicht → Validierung → Neu laden (Entwurf + Verlauf bleiben) → Karte testen.
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
const nurBis = argumente.includes('--schnell');

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
const fehler = [];
const schritt = (t) => console.log(`• ${t}`);
const pruefe = (bedingung, text) => {
  if (!bedingung) fehler.push(text);
  console.log(`  ${bedingung ? '✓' : '✗'} ${text}`);
};

let browser = null;
try {
  for (let i = 0; i < 50 && !serverLog.includes('läuft'); i++) await new Promise((r) => setTimeout(r, 100));
  browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_BROWSERS_PATH ? undefined : undefined, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const seite = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  seite.on('pageerror', (e) => fehler.push(`Seitenfehler: ${e.message}`));
  seite.on('console', (m) => m.type() === 'error' && !/favicon|404/.test(m.text()) && fehler.push(`Konsole: ${m.text()}`));
  const basis = `http://localhost:${port}`;

  schritt('Login-Bildschirm hat den Map-Editor-Link');
  await seite.goto(`${basis}/client/`);
  await seite.waitForSelector('#login-editor', { state: 'attached', timeout: 20000 });
  pruefe((await seite.getAttribute('#login-editor', 'href')) === '../editor/', 'Link zeigt auf ../editor/');

  schritt('Editor öffnen');
  await seite.goto(`${basis}/editor/`);
  await seite.waitForFunction(() => window.mapEditor, null, { timeout: 15000 });
  await seite.evaluate(async () => {
    // sauberer Start: alte Entwürfe weg
    for (const id of [...window.mapEditor.zustand.zonen.keys()]) await window.mapEditor.zustand.entferneZone(id);
  });
  const flaeche = await seite.locator('#leinwand2d').boundingBox();
  const mitte = { x: flaeche.x + flaeche.width / 2, y: flaeche.y + flaeche.height / 2 };

  schritt('Neue Zone per Rechteck aufziehen');
  await seite.click('[data-befehl="neu"]');
  await seite.click('#dialog button.akzent');
  await seite.mouse.move(mitte.x - 200, mitte.y - 150);
  await seite.mouse.down();
  await seite.mouse.move(mitte.x + 100, mitte.y + 50, { steps: 5 });
  await seite.mouse.up();
  await seite.fill('#dialog [name="id"]', 'testzone');
  await seite.click('#dialog button.akzent');
  const groesse = await seite.evaluate(() => ({ b: window.mapEditor.zustand.karte?.breite, h: window.mapEditor.zustand.karte?.hoehe, rasen: window.mapEditor.zustand.karte?.zellen.every((z) => z === ',') }));
  pruefe(groesse.b >= 4 && groesse.h >= 4 && groesse.rasen, `Zone angelegt (${groesse.b} × ${groesse.h}, nur Rasen)`);

  const kachel = async (x, y) => seite.evaluate(([x, y]) => {
    const p = window.mapEditor.zeichner.zuBild(x + 0.5, y + 0.5);
    const r = document.getElementById('leinwand2d').getBoundingClientRect();
    return { x: r.left + p.x, y: r.top + p.y };
  }, [x, y]);
  const klick = async (x, y) => {
    const p = await kachel(x, y);
    await seite.mouse.click(p.x, p.y);
  };
  const ziehe = async (a, b) => {
    const p = await kachel(...a);
    const q = await kachel(...b);
    await seite.mouse.move(p.x, p.y);
    await seite.mouse.down();
    await seite.mouse.move(q.x, q.y, { steps: 6 });
    await seite.mouse.up();
  };

  schritt('Kacheln malen');
  await seite.click('#kategorien [data-kategorie="Wege"]');
  await seite.click('#bauleiste [data-id="kachel:="]');
  await ziehe([1, 1], [6, 1]);
  await seite.keyboard.press('u');
  await ziehe([2, 4], [5, 6]);
  await seite.click('#kategorien [data-kategorie="Mauern"]');
  await seite.click('#bauleiste [data-id="kachel:#"]');
  await seite.keyboard.press('l');
  await ziehe([8, 2], [8, 7]);
  const gemalt = await seite.evaluate(() => {
    const k = window.mapEditor.zustand.karte;
    return { strasse: k.kachelAn(3, 1), rechteck: k.kachelAn(4, 5), wand: k.kachelAn(8, 5) };
  });
  pruefe(gemalt.strasse === '=' && gemalt.rechteck === '=' && gemalt.wand === '#', `Pinsel/Rechteck/Linie malen (${JSON.stringify(gemalt)})`);

  schritt('Spieler-Start + Objekt setzen, drehen, rückgängig');
  await seite.click('#kategorien [data-kategorie="Spawns"]');
  await seite.click('#bauleiste [data-id="marker:start"]');
  await klick(3, 9);
  await seite.click('#kategorien [data-kategorie="Möbel"]');
  await seite.click('#bauleiste [data-id="objekt:tisch"]');
  await klick(12, 9);
  await seite.keyboard.press('Escape');
  const objekte = await seite.evaluate(() => window.mapEditor.zustand.karte.s('objekte').size);
  pruefe(objekte === 1, 'Tisch gesetzt');
  await seite.keyboard.press('Control+z');
  pruefe((await seite.evaluate(() => window.mapEditor.zustand.karte.s('objekte').size)) === 0, 'Rückgängig entfernt den Tisch');
  await seite.keyboard.press('Control+y');
  pruefe((await seite.evaluate(() => window.mapEditor.zustand.karte.s('objekte').size)) === 1, 'Wiederholen bringt ihn zurück');
  await seite.screenshot({ path: path.join(AUSGABE, 'editor-1-neu.png') });

  schritt('Neu laden: Entwurf + Verlauf bleiben');
  await seite.waitForTimeout(1200);
  await seite.reload();
  await seite.waitForFunction(() => window.mapEditor?.zustand.karte, null, { timeout: 15000 });
  const nachLaden = await seite.evaluate(() => ({ id: window.mapEditor.zustand.karte.id, obj: window.mapEditor.zustand.karte.s('objekte').size, verlauf: window.mapEditor.zustand.verlauf.zurueck.length }));
  pruefe(nachLaden.id === 'testzone' && nachLaden.obj === 1 && nachLaden.verlauf >= 5, `Entwurf wiederhergestellt (${JSON.stringify(nachLaden)})`);
  await seite.keyboard.press('Control+z');
  pruefe((await seite.evaluate(() => window.mapEditor.zustand.karte.s('objekte').size)) === 0, 'Rückgängig über Sitzungen hinweg');

  if (!nurBis) {
    schritt('Spielzone Waldweg als Vorlage');
    await seite.evaluate(() => window.mapEditor.oeffneSpielzone('waldweg'));
    const ww = await seite.evaluate(() => ({ b: window.mapEditor.zustand.karte.breite, obj: window.mapEditor.zustand.karte.s('objekte').size }));
    pruefe(ww.b === 160 && ww.obj > 100, `Waldweg geladen (${JSON.stringify(ww)})`);
    await seite.waitForTimeout(600);
    await seite.screenshot({ path: path.join(AUSGABE, 'editor-2-waldweg.png') });

    schritt('Zonen-Werte (Phase 5): Wetter setzen, Standard sichtbar');
    await seite.click('#panel-reiter button:has-text("Zone")');
    await seite.fill('#panel-inhalt [name="regenAnteil"]', '0.9');
    await seite.press('#panel-inhalt [name="regenAnteil"]', 'Tab');
    pruefe((await seite.evaluate(() => window.mapEditor.zustand.karte.wert('einstellungen.wetter.regenAnteil'))) === 0.9, 'Regen-Anteil 0.9 in der Zone gesetzt');
    pruefe((await seite.locator('#panel-inhalt').textContent()).includes('Standard: 0.6'), 'globaler Standard wird angezeigt');
    await seite.screenshot({ path: path.join(AUSGABE, 'editor-4-zone.png') });

    schritt('Prefab „Wohnhaus“ einfügen (Phase 6), Innen/Außen anzeigen');
    await seite.click('#panel-reiter button:has-text("Prefabs")');
    const raeumeVorher = await seite.evaluate(() => window.mapEditor.zustand.karte.s('raeume').size);
    await seite.click('#panel-inhalt button:has-text("Wohnhaus")');
    await seite.evaluate(() => window.mapEditor.zeichner.springeZu(60, 40, 14));
    await seite.waitForTimeout(300);
    await klick(60, 40);
    pruefe((await seite.evaluate(() => window.mapEditor.zustand.karte.s('raeume').size)) === raeumeVorher + 1, 'Wohnhaus eingefügt, Raum angelegt');
    await seite.click('#panel-reiter button:has-text("Zone")');
    await seite.check('#panel-inhalt [name="innen"]');
    await seite.waitForTimeout(400);
    await seite.screenshot({ path: path.join(AUSGABE, 'editor-5-prefab.png') });

    schritt('Zonen verbinden (Phase 7): Stadtrand dazu, aus Übergängen anordnen, Nachbar am Rand');
    await seite.evaluate(() => window.mapEditor.oeffneSpielzone('stadtrand'));
    await seite.click('#panel-reiter button:has-text("Zonen")');
    await seite.click('#panel-inhalt button:has-text("Aus Übergängen anordnen")');
    const layout = await seite.evaluate(() => window.mapEditor.zustand.layout);
    pruefe(layout.waldweg && layout.stadtrand && layout.waldweg.y === layout.stadtrand.y - 120 && layout.waldweg.x === layout.stadtrand.x + 89, `Waldweg nördlich angeordnet (${JSON.stringify(layout)})`);
    pruefe((await seite.evaluate(() => window.mapEditor.zeichner.nachbarn.length)) === 1, 'Nachbarzone wird am Rand gezeigt');
    await seite.evaluate(() => window.mapEditor.zeichner.springeZu(120, 2, 6));
    await seite.waitForTimeout(400);
    await seite.screenshot({ path: path.join(AUSGABE, 'editor-6-zonen.png') });

    schritt('3D-Ansicht');
    await seite.keyboard.press('3');
    await seite.waitForTimeout(1500);
    await seite.screenshot({ path: path.join(AUSGABE, 'editor-3-3d.png') });
    await seite.keyboard.press('3');
  }

  const pruefung = await seite.locator('#status-pruefung').textContent();
  console.log(`  Statusleiste: ${pruefung}`);
} catch (e) {
  fehler.push(`Abbruch: ${e.stack ?? e.message}`);
} finally {
  await browser?.close().catch(() => {});
  server.kill();
}
if (fehler.length) {
  console.error(`\n✗ ${fehler.length} Fehler:\n${fehler.map((f) => `  - ${f}`).join('\n')}`);
  process.exitCode = 1;
} else console.log('\n✓ Editor-Rauchtest ohne Fehler');
