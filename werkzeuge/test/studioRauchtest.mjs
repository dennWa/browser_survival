#!/usr/bin/env node
/**
 * Rauchtest Browser Survival Studio (Electron + Playwright): startet das Programm, öffnet eine Zone, baut mit Werkzeugen
 * und KI-Werkzeugen (wie MCP), prüft Undo, Export-Definition, MCP-Server und macht Screenshots nach werkzeuge/test/ausgabe/.
 *   npm run rauchtest:studio            (Linux ohne Bildschirm: xvfb-run -a npm run rauchtest:studio)
 */
import { createRequire } from 'node:module';
import { mkdirSync, rmSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const AUSGABE = path.join(WURZEL, 'werkzeuge/test/ausgabe');
mkdirSync(AUSGABE, { recursive: true });
let playwright;
try {
  playwright = require('playwright');
} catch {
  playwright = require(path.join(require('node:child_process').execSync('npm root -g').toString().trim(), 'playwright'));
}
const TESTZONE = 'studio_rauchtest';
const nutzerDaten = mkdtempSync(path.join(tmpdir(), 'studio-test-'));
const fehler = [];
let ok = 0;
const pruefe = (bedingung, text) => {
  if (bedingung) {
    ok++;
    console.log(`  ✓ ${text}`);
  } else {
    fehler.push(text);
    console.log(`  ✗ ${text}`);
  }
};

const app = await playwright._electron.launch({
  executablePath: require('electron'),
  args: [path.join(WURZEL, 'studio/main/start.mjs'), `--user-data-dir=${nutzerDaten}`, ...(process.platform === 'linux' ? ['--no-sandbox'] : [])],
  env: { ...process.env, STUDIO_SPIELORDNER: WURZEL },
});
try {
  const fenster = await app.firstWindow();
  const konsole = [];
  fenster.on('console', (m) => m.type() === 'error' && konsole.push(m.text()));
  fenster.on('pageerror', (e) => konsole.push(String(e)));
  await fenster.waitForFunction(() => window.studio?.bereit === true || document.getElementById('startbild')?.classList.contains('offen'), null, { timeout: 30000 });
  await fenster.waitForTimeout(800);
  await fenster.screenshot({ path: path.join(AUSGABE, 'studio-1-start.png') });
  pruefe(await fenster.locator('#startbild.offen').count(), 'Startbildschirm erscheint');
  await fenster.click('[data-start=karten]');
  await fenster.waitForFunction(() => window.studio?.bereit === true);
  const zonen = await fenster.evaluate(() => window.studio.zonenPanel.liste.map((z) => z.id));
  pruefe(zonen.includes('stadtrand') && zonen.includes('waldweg'), `Zonen gelistet (${zonen.join(', ')})`);
  // Echte Zone nur ansehen (nichts ändern → kein Entwurf)
  await fenster.click('[data-zone=waldweg]');
  await fenster.waitForFunction(() => window.studio.dok.karte?.id === 'waldweg');
  await fenster.waitForTimeout(1500);
  await fenster.screenshot({ path: path.join(AUSGABE, 'studio-2-waldweg-3d.png') });
  pruefe((await fenster.evaluate(() => window.studio.pruefung.liste.filter((p) => p.schwere === 'fehler').length)) === 0, 'Waldweg: Prüfung ohne Fehler (Übergänge kennen alle Zonen)');

  // KI-Werkzeuge (derselbe Weg wie MCP) in einer eigenen Testzone
  const ki = (name, args) => fenster.evaluate(([n, a]) => window.studioKi.fuehreAus(n, a, 'test'), [name, args]);
  let r = await ki('zone_neu', { id: TESTZONE, name: 'Rauchtest', breite: 60, hoehe: 46 });
  pruefe(r.ok && (await fenster.evaluate(() => window.studio.dok.karte.id)) === TESTZONE, `KI zone_neu: ${r.text}`);
  r = await ki('raum_bauen', { x: 10, y: 10, b: 9, h: 7, name: 'Testhütte', lootTabelle: 'wohnung', tuer: 's' });
  pruefe(r.ok, `KI raum_bauen: ${r.text}`);
  r = await ki('objekt_platzieren', { id: 'objekt:tisch', x: 12, y: 12, skalierung: 1.5 });
  pruefe(r.ok, `KI objekt_platzieren mit Skalierung: ${r.text}`);
  r = await ki('spawnpunkt_setzen', { x: 12.7, y: 12.7, inhalt: 'apfel', chance: 40, intervall: 10, hoehe: 0.75 });
  pruefe(r.ok, `KI spawnpunkt_setzen: ${r.text}`);
  r = await ki('katalog', { suche: 'baum' });
  pruefe(r.ok && r.daten.anzahl > 0, `KI katalog findet Bäume (${r.daten?.anzahl})`);
  r = await ki('zone_ausschnitt', { x: 8, y: 8, b: 14, h: 11 });
  pruefe(r.ok && r.text.includes('#'), 'KI zone_ausschnitt liefert Raster');
  for (let i = 0; i < 6; i++) await ki('objekt_platzieren', { id: 'objekt:baum', x: 30 + i * 4, y: 30 + (i % 2) * 3, skalierung: 0.8 + i * 0.15 });
  r = await ki('ansicht_bild', { modus: '3d', x: 20, y: 18, zoom: 40 });
  pruefe(r.ok && r.bild?.length > 1000, `KI ansicht_bild liefert PNG (${Math.round((r.bild?.length ?? 0) / 1024)} KB)`);
  await fenster.screenshot({ path: path.join(AUSGABE, 'studio-3-ki-raum.png') });

  // Werkzeuge über die Oberfläche (Maus)
  await fenster.keyboard.press('Escape');
  await fenster.click('[data-befehl="ansicht.2d"]');
  await fenster.evaluate(() => window.studio.ansicht.zeige(30, 23, 50));
  await fenster.waitForTimeout(300);
  await fenster.click('#leinwand', { position: { x: 500, y: 420 } });
  await fenster.keyboard.press('h');
  pruefe((await fenster.evaluate(() => window.studio.werkzeuge.aktiv)) === 'raum', 'Taste H wählt Raum-Werkzeug');
  const raeumeVorher = await fenster.evaluate(() => window.studio.dok.karte.zellen.filter((z) => z === '#').length);
  const box = await fenster.locator('#leinwand').boundingBox();
  await fenster.mouse.move(box.x + box.width * 0.55, box.y + box.height * 0.3);
  await fenster.mouse.down();
  await fenster.mouse.move(box.x + box.width * 0.7, box.y + box.height * 0.45, { steps: 6 });
  await fenster.mouse.move(box.x + box.width * 0.75, box.y + box.height * 0.55, { steps: 6 });
  await fenster.mouse.up();
  pruefe((await fenster.evaluate(() => window.studio.dok.karte.zellen.filter((z) => z === '#').length)) > raeumeVorher, 'Raum mit der Maus gezogen');
  await fenster.click('#asset-reiter [data-reiter=moebel]');
  await fenster.locator('#asset-raster .asset').first().click();
  pruefe((await fenster.evaluate(() => window.studio.werkzeuge.aktiv)) === 'objekt', 'Klick auf Möbel-Asset wählt Objekt-Werkzeug');
  const objVorher = await fenster.evaluate(() => window.studio.dok.karte.s('objekte').size);
  await fenster.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.7);
  await fenster.mouse.move(box.x + box.width * 0.31, box.y + box.height * 0.7);
  await fenster.mouse.click(box.x + box.width * 0.31, box.y + box.height * 0.7);
  pruefe((await fenster.evaluate(() => window.studio.dok.karte.s('objekte').size)) === objVorher + 1, 'Objekt per Klick platziert');
  await fenster.screenshot({ path: path.join(AUSGABE, 'studio-4-2d.png') });
  const vorher = await fenster.evaluate(() => window.studio.dok.karte.s('objekte').size);
  await fenster.keyboard.press('Control+z');
  pruefe((await fenster.evaluate(() => window.studio.dok.karte.s('objekte').size)) === vorher - 1, 'Strg+Z nimmt den letzten Schritt zurück');
  await fenster.keyboard.press('Control+y');
  pruefe((await fenster.evaluate(() => window.studio.dok.karte.s('objekte').size)) === vorher, 'Strg+Y stellt wieder her');

  // Definition (Export-Inhalt) prüfen
  const def = await fenster.evaluate(() => window.studio.dok.definition());
  pruefe(def.spawnpunkte?.length === 1 && def.objekte.some((o) => o.skalierung === 1.5), 'Spiel-Definition enthält Spawnpunkt + skaliertes Objekt');

  // Inspektor + Asset-Leiste + Befehlspalette
  await fenster.evaluate(() => window.studio.dok.waehle([{ s: 'spawnpunkte', k: [...window.studio.dok.karte.s('spawnpunkte').keys()][0] }]));
  await fenster.waitForTimeout(200);
  pruefe(await fenster.locator('#inspektor [data-feld=chance]').count(), 'Inspektor zeigt Spawnpunkt-Felder');
  await fenster.click('[data-befehl="ansicht.3d"]');
  await fenster.evaluate(() => window.studio.ansicht.zeigeAuswahl());
  await fenster.waitForTimeout(400);
  await fenster.screenshot({ path: path.join(AUSGABE, 'studio-5-inspektor.png') });
  await fenster.click('#asset-reiter [data-reiter=modelle]');
  await fenster.waitForTimeout(800);
  pruefe((await fenster.locator('#asset-raster .asset').count()) > 20, 'Modelle aus dem Spielordner in der Asset-Leiste');
  await fenster.screenshot({ path: path.join(AUSGABE, 'studio-6-modelle.png') });

  // MCP-Server von außen (wie Claude Code)
  const mcp = await fenster.evaluate(() => window.studioNativ.aufruf('mcp.info'));
  const antwort = await fetch(mcp.url, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', Authorization: `Bearer ${mcp.token}` }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }) });
  const liste = await antwort.json();
  pruefe(liste.result?.tools?.length >= 20, `MCP tools/list: ${liste.result?.tools?.length} Werkzeuge`);
  const ohne = await fetch(mcp.url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  pruefe(ohne.status === 401, 'MCP ohne Token abgewiesen (401)');
  const aufruf = await fetch(mcp.url, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', Authorization: `Bearer ${mcp.token}` }, body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'zone_info', arguments: {} } }) });
  const info = await aufruf.json();
  pruefe(info.result?.content?.[0]?.text?.includes(TESTZONE), 'MCP tools/call zone_info antwortet mit der offenen Zone');

  // Testlauf: echtes Spiel in eigenem Fenster
  const neuesFenster = app.waitForEvent('window', { timeout: 20000 });
  await fenster.evaluate(() => window.studio.befehle.aus('zone.testen'));
  const spiel = await neuesFenster;
  await spiel.waitForSelector('#editor-test-banner', { timeout: 60000 });
  await spiel.waitForTimeout(4000);
  await spiel.screenshot({ path: path.join(AUSGABE, 'studio-7-testlauf.png') });
  pruefe((await spiel.textContent('#editor-test-banner')).includes('Rauchtest'), 'Testlauf startet das Spiel mit der Studio-Zone');
  await spiel.close();
  pruefe(!konsole.length, `keine Konsolenfehler${konsole.length ? `: ${konsole.slice(0, 3).join(' | ')}` : ''}`);
} catch (f) {
  fehler.push(f.message);
  console.error(f);
} finally {
  await app.close().catch(() => {});
  rmSync(nutzerDaten, { recursive: true, force: true });
  rmSync(path.join(WURZEL, '.studio/entwuerfe', `${TESTZONE}.json`), { force: true });
}
console.log(`\n${ok} ok, ${fehler.length} Fehler`);
process.exitCode = fehler.length ? 1 : 0;
