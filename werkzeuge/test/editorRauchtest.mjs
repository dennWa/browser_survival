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
 * Editor 2.0: Menüleiste, Asset-Browser (Suche), Kontextmenü, Ebenen sperren, Hilfe mit Suche.
 */
import { spawn, execSync } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
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
  /** Menüpunkt über die Menüleiste anklicken */
  const menue = async (titel, befehl) => {
    await seite.click(`#menue .menue-titel:has-text("${titel}")`);
    await seite.click(`.menue-liste [data-befehl="${befehl}"]`);
  };
  const asset = async (id) => {
    await seite.click('#links [data-reiter="🧱 Assets"]');
    await seite.click(`#links button.asset[data-id="${id}"]`);
  };

  schritt('Neue Zone per Rechteck aufziehen');
  await menue('Datei', 'datei.neu');
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
  await asset('kachel:=');
  await ziehe([1, 1], [6, 1]);
  await seite.keyboard.press('u');
  await ziehe([2, 4], [5, 6]);
  await asset('kachel:#');
  await seite.keyboard.press('l');
  await ziehe([8, 2], [8, 7]);
  const gemalt = await seite.evaluate(() => {
    const k = window.mapEditor.zustand.karte;
    return { strasse: k.kachelAn(3, 1), rechteck: k.kachelAn(4, 5), wand: k.kachelAn(8, 5) };
  });
  pruefe(gemalt.strasse === '=' && gemalt.rechteck === '=' && gemalt.wand === '#', `Pinsel/Rechteck/Linie malen (${JSON.stringify(gemalt)})`);

  schritt('Spieler-Start + Objekt setzen, drehen, rückgängig');
  await asset('marker:start');
  await klick(3, 9);
  // Asset-Suche statt Blättern
  await seite.fill('#links .asset-suche', 'tisch');
  pruefe(await seite.locator('#links button.asset[data-id="objekt:tisch"]').count() === 1, 'Asset-Suche findet „tisch“');
  await asset('objekt:tisch');
  await seite.fill('#links .asset-suche', '');
  await klick(12, 9);
  await seite.keyboard.press('Escape');
  const objekte = await seite.evaluate(() => window.mapEditor.zustand.karte.s('objekte').size);
  pruefe(objekte === 1, 'Tisch gesetzt');
  await seite.keyboard.press('Control+z');
  pruefe((await seite.evaluate(() => window.mapEditor.zustand.karte.s('objekte').size)) === 0, 'Rückgängig entfernt den Tisch');
  await seite.keyboard.press('Control+y');
  pruefe((await seite.evaluate(() => window.mapEditor.zustand.karte.s('objekte').size)) === 1, 'Wiederholen bringt ihn zurück');
  await seite.screenshot({ path: path.join(AUSGABE, 'editor-1-neu.png') });

  schritt('Editor 2.0: Menü, Kontextmenü, Ebenen sperren, Hilfe');
  await seite.click('#menue .menue-titel:has-text("Bearbeiten")');
  const menueText = await seite.locator('.menue-liste').textContent();
  pruefe(menueText.includes('Rückgängig') && menueText.includes('Strg+Z'), 'Menü Bearbeiten zeigt Befehle mit Kürzeln');
  await seite.keyboard.press('Escape');
  await seite.keyboard.press('v');
  const tisch = await kachel(12, 9);
  await seite.mouse.click(tisch.x, tisch.y, { button: 'right' });
  await seite.waitForSelector('.menue-liste [data-befehl="bearbeiten.duplizieren"]');
  await seite.click('.menue-liste [data-befehl="bearbeiten.duplizieren"]');
  pruefe((await seite.evaluate(() => window.mapEditor.zustand.karte.s('objekte').size)) === 2, 'Kontextmenü → Duplizieren');
  await seite.keyboard.press('Control+z');
  await seite.evaluate(() => window.mapEditor.zustand.leereAuswahl());
  await seite.click('#rechts [data-reiter="Ebenen"]');
  await seite.click('#rechts button[data-e="objekte"][data-f="gesperrt"]');
  await klick(12, 9);
  pruefe((await seite.evaluate(() => window.mapEditor.zustand.auswahl.size)) === 0, 'gesperrte Ebene ist nicht anklickbar');
  await seite.click('#rechts button[data-e="objekte"][data-f="gesperrt"]');
  await klick(12, 9);
  pruefe((await seite.evaluate(() => window.mapEditor.zustand.auswahl.size)) === 1, 'entsperrt wieder anklickbar');
  await seite.click('#rechts [data-reiter="Inspektor"]');
  await seite.keyboard.press('?');
  await seite.fill('#dialog .hilfe-suche', 'duplizieren');
  pruefe((await seite.locator('#dialog .hilfe-zeile:visible').count()) >= 1 && (await seite.locator('#dialog .hilfe-zeile:visible').count()) < 5, 'Hilfe: Suche filtert die Befehle');
  await seite.keyboard.press('Escape');

  schritt('Neu laden: Entwurf + Verlauf bleiben');
  await seite.waitForTimeout(1200);
  await seite.reload();
  await seite.waitForFunction(() => window.mapEditor?.zustand.karte, null, { timeout: 15000 });
  const nachLaden = await seite.evaluate(() => ({ id: window.mapEditor.zustand.karte.id, obj: window.mapEditor.zustand.karte.s('objekte').size, verlauf: window.mapEditor.zustand.verlauf.zurueck.length }));
  pruefe(nachLaden.id === 'testzone' && nachLaden.obj === 1 && nachLaden.verlauf >= 5, `Entwurf wiederhergestellt (${JSON.stringify(nachLaden)})`);
  await seite.keyboard.press('Control+z');
  pruefe((await seite.evaluate(() => window.mapEditor.zustand.karte.s('objekte').size)) === 0, 'Rückgängig über Sitzungen hinweg');
  await seite.keyboard.press('Control+y');

  schritt('Datensicherheit (1.6): Autosave-Anzeige, Komplett-Backup, Wiederherstellen');
  await seite.waitForTimeout(1200);
  pruefe((await seite.locator('#speicher-status').textContent()).includes('gespeichert'), `Autosave-Anzeige (${(await seite.locator('#speicher-status').textContent()).trim()})`);
  const [download] = await Promise.all([seite.waitForEvent('download'), menue('Datei', 'datei.backup')]);
  const backupPfad = await download.path();
  const backup = JSON.parse(readFileSync(backupPfad, 'utf8'));
  pruefe(backup.format === 'browser-survival-editor-backup' && backup.entwuerfe.some((e) => e.id === 'testzone') && !JSON.stringify(backup).includes('editorGemini'), `Backup enthält die Zone (${download.suggestedFilename()})`);
  await seite.evaluate(() => window.mapEditor.zustand.entferneZone('testzone'));
  const [wahl] = await Promise.all([seite.waitForEvent('filechooser'), menue('Datei', 'datei.wiederherstellen')]);
  await wahl.setFiles(backupPfad);
  await seite.click('#dialog button:has-text("Wiederherstellen")');
  const zurueckGeholt = await seite.evaluate(() => ({ da: window.mapEditor.zustand.zonen.has('testzone'), obj: window.mapEditor.zustand.zonen.get('testzone')?.karte.s('objekte').size }));
  pruefe(zurueckGeholt.da && zurueckGeholt.obj === 1, `Backup wiederhergestellt (${JSON.stringify(zurueckGeholt)})`);

  if (!nurBis) {
    schritt('Spielzone Waldweg als Vorlage');
    await seite.evaluate(() => window.mapEditor.oeffneSpielzone('waldweg'));
    const ww = await seite.evaluate(() => ({ b: window.mapEditor.zustand.karte.breite, obj: window.mapEditor.zustand.karte.s('objekte').size }));
    pruefe(ww.b === 160 && ww.obj > 100, `Waldweg geladen (${JSON.stringify(ww)})`);
    await seite.waitForTimeout(600);
    await seite.screenshot({ path: path.join(AUSGABE, 'editor-2-waldweg.png') });

    schritt('Zonen-Werte (Phase 5): Wetter setzen, Standard sichtbar');
    await seite.evaluate(() => window.mapEditor.zustand.leereAuswahl());
    await seite.click('#rechts [data-reiter="Inspektor"]');
    await seite.click('#rechts details[data-bereich="wetter"] > summary');
    await seite.fill('#rechts [name="regenAnteil"]', '0.9');
    await seite.press('#rechts [name="regenAnteil"]', 'Tab');
    pruefe((await seite.evaluate(() => window.mapEditor.zustand.karte.wert('einstellungen.wetter.regenAnteil'))) === 0.9, 'Regen-Anteil 0.9 in der Zone gesetzt');
    pruefe((await seite.locator('#rechts .inhalt').textContent()).includes('Standard: 0.6'), 'globaler Standard wird angezeigt');
    await seite.screenshot({ path: path.join(AUSGABE, 'editor-4-zone.png') });

    schritt('Prefab „Wohnhaus“ einfügen (Phase 6), Innen/Außen anzeigen');
    await seite.click('#links [data-reiter="🏠 Prefabs"]');
    const raeumeVorher = await seite.evaluate(() => window.mapEditor.zustand.karte.s('raeume').size);
    await seite.click('#links .inhalt button:has-text("Wohnhaus")');
    await seite.evaluate(() => window.mapEditor.zeichner.springeZu(60, 40, 14));
    await seite.waitForTimeout(300);
    await klick(60, 40);
    pruefe((await seite.evaluate(() => window.mapEditor.zustand.karte.s('raeume').size)) === raeumeVorher + 1, 'Wohnhaus eingefügt, Raum angelegt');
    await seite.click('#rechts [data-reiter="Ebenen"]');
    await seite.check('#rechts [data-anzeige="innen"]');
    await seite.waitForTimeout(400);
    await seite.screenshot({ path: path.join(AUSGABE, 'editor-5-prefab.png') });

    schritt('Zonen verbinden (Phase 7): Stadtrand dazu, aus Übergängen anordnen, Nachbar am Rand');
    await seite.evaluate(() => window.mapEditor.oeffneSpielzone('stadtrand'));
    await seite.click('#links [data-reiter="🗺 Zonen"]');
    await seite.click('#links .inhalt button:has-text("Aus Übergängen anordnen")');
    const layout = await seite.evaluate(() => window.mapEditor.zustand.layout);
    pruefe(layout.waldweg && layout.stadtrand && layout.waldweg.y === layout.stadtrand.y - 120 && layout.waldweg.x === layout.stadtrand.x + 89, `Waldweg nördlich angeordnet (${JSON.stringify(layout)})`);
    pruefe((await seite.evaluate(() => window.mapEditor.zeichner.nachbarn.length)) === 1, 'Nachbarzone wird am Rand gezeigt');
    await seite.evaluate(() => window.mapEditor.zeichner.springeZu(120, 2, 6));
    await seite.waitForTimeout(400);
    await seite.screenshot({ path: path.join(AUSGABE, 'editor-6-zonen.png') });

    schritt('KI (Phase 8): Bereich markieren, Ausschnitt exportieren, Antwort importieren mit Vorschau');
    await seite.evaluate(() => window.mapEditor.zustand.aktiviere('waldweg'));
    await seite.evaluate(() => window.mapEditor.zeichner.springeZu(40, 16, 18));
    await seite.keyboard.press('v');
    await ziehe([30, 10], [50, 22]);
    const rechteck = await seite.evaluate(() => window.mapEditor.zustand.auswahlRechteck);
    pruefe(rechteck?.x === 30 && rechteck?.b === 21, `Bereich markiert (${JSON.stringify(rechteck)})`);
    await menue('Datei', 'ki.ausschnitt');
    const text = await seite.inputValue('#dialog textarea');
    pruefe(text.includes('x 30–50, y 10–22') && text.includes('## So antwortest du'), 'Ausschnitt-Text mit Bereich + Anleitung');
    await seite.click('#dialog button:has-text("Schließen")');
    await menue('KI', 'ki.import');
    await seite.fill('#dialog [name="text"]', 'Gerne:\n```json\n[{"aktion":"setze","typ":"busch","x":32,"y":20},{"aktion":"setze","typ":"palme","x":33,"y":20},{"aktion":"marker","art":"zombie","x":80,"y":80}]\n```');
    await seite.click('#dialog button:has-text("Prüfen")');
    await seite.waitForSelector('#rechts [data-reiter="KI-Import"]');
    const diff = await seite.locator('#rechts .inhalt').textContent();
    pruefe(diff.includes('1 neu') && diff.includes('2 ungültig') && diff.includes('palme'), 'Vorschau: 1 neu, 2 ungültig mit Grund');
    await seite.screenshot({ path: path.join(AUSGABE, 'editor-7-ki-import.png') });
    const vorherObj = await seite.evaluate(() => window.mapEditor.zustand.karte.s('objekte').size);
    await seite.click('#rechts .inhalt button:has-text("Übernehmen")');
    pruefe((await seite.evaluate(() => window.mapEditor.zustand.karte.s('objekte').size)) === vorherObj + 1, 'nach Bestätigung übernommen');

    schritt('Phase 11: Gemini-Helfer (Antwort gemockt, Schlüssel nur im Header, Vorschau → Übernehmen)');
    let gemini = null;
    await seite.route('https://generativelanguage.googleapis.com/**', async (route) => {
      const req = route.request();
      gemini = { url: req.url(), schluessel: req.headers()['x-goog-api-key'], body: JSON.parse(req.postData()) };
      const antwort = 'Ein Busch passt super!\n```json\n[{"aktion":"setze","typ":"busch","x":31,"y":21},{"aktion":"typtextur","typ":"busch","farbe":"#2f6b2f","muster":"gras"}]\n```';
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ candidates: [{ content: { parts: [{ text: antwort }] }, finishReason: 'STOP' }] }) });
    });
    await seite.click('#schnell [data-befehl="ki.helfer"]');
    await seite.click('#ki [data-a="einst"]');
    await seite.fill('#dialog [name="schluessel"]', 'TESTKEY');
    await seite.click('#dialog button:has-text("Speichern")');
    await seite.evaluate(() => window.mapEditor.zeichner.springeZu(40, 16, 18));
    await ziehe([30, 10], [50, 22]);
    await seite.fill('#ki textarea', 'Setz mir einen Busch und färbe ihn grün');
    await seite.click('#ki [data-a="senden"]');
    await seite.waitForSelector('#ki .helfer-nachricht button:has-text("Änderungen prüfen")', { timeout: 10000 });
    pruefe(gemini?.schluessel === 'TESTKEY' && !gemini.url.includes('TESTKEY') && gemini.body.contents.at(-1).parts[0].text.includes('Setz mir einen Busch'), 'Anfrage: Schlüssel im Header, Frage + Kontext im Body');
    pruefe(!(await seite.locator('#ki .helfer-chat').textContent()).includes('```'), 'JSON-Block im Chat ausgeblendet');
    await seite.screenshot({ path: path.join(AUSGABE, 'editor-11-helfer.png') });
    const objVorher = await seite.evaluate(() => window.mapEditor.zustand.karte.s('objekte').size);
    await seite.click('#ki .helfer-nachricht button:has-text("Änderungen prüfen")');
    await seite.waitForSelector('#rechts .inhalt h3:has-text("KI-Änderungen")');
    await seite.click('#rechts .inhalt button:has-text("Übernehmen")');
    pruefe((await seite.evaluate(() => window.mapEditor.zustand.karte.s('objekte').size)) === objVorher + 1 && (await seite.evaluate(() => window.mapEditor.zustand.karte.s('texturen').get('busch')?.muster)) === 'gras', 'Vorschlag übernommen (Busch + Typ-Textur)');
    pruefe(await seite.isVisible('#ki .helfer'), 'Helfer bleibt nach dem Übernehmen offen');
    await seite.click('#schnell [data-befehl="ki.helfer"]');

    schritt('Phase 10: Boden bemalen, Gelände heben, 3D-Ansicht mit synchroner Auswahl');
    await seite.evaluate(() => window.mapEditor.zeichner.springeZu(42, 26, 16));
    await asset('werkzeug:farbe-pinsel');
    await ziehe([36, 27], [44, 27]);
    pruefe((await seite.evaluate(() => window.mapEditor.zustand.karte.s('bemalung').size)) >= 8, 'Boden bemalt');
    await asset('werkzeug:terrain-heben');
    for (let i = 0; i < 4; i++) await ziehe([40, 34], [41, 34]);
    pruefe((await seite.evaluate(() => window.mapEditor.zustand.karte.hoeheAn(40, 34))) > 0.5, 'Gelände gehoben');
    await seite.keyboard.press('Escape');
    await seite.keyboard.press('v');
    await seite.evaluate(() => {
      const k = window.mapEditor.zustand.karte;
      const [id] = [...k.s('objekte')].find(([, o]) => o.typ === 'werkbank') ?? [];
      if (id) window.mapEditor.zustand.waehle([{ s: 'objekte', k: id }]);
    });
    await seite.keyboard.press('3');
    await seite.waitForTimeout(2500);
    pruefe(await seite.isVisible('#leinwand3d'), '3D-Fläche sichtbar');
    pruefe((await seite.evaluate(() => window.mapEditor.zustand.auswahl.size)) === 1, 'Auswahl bleibt beim Umschalten erhalten');
    await seite.screenshot({ path: path.join(AUSGABE, 'editor-3-3d.png') });
    await seite.keyboard.press('3');
  }

  if (!nurBis) {
    schritt('Karte testen (Phase 9): Entwurf im Spiel, zurück ohne Verlust');
    await seite.evaluate(() => window.mapEditor.zustand.aktiviere('testzone'));
    await seite.waitForTimeout(500);
    await seite.click('#schnell [data-befehl="zone.testen"]');
    // Bei Warnungen (z. B. „keine Lichtquelle“) fragt der Editor nach – sonst geht es direkt ins Spiel
    const weiter = await Promise.race([seite.waitForURL(/editorTest=1/, { timeout: 20000 }).then(() => 'spiel'), seite.waitForSelector('#dialog button:has-text("Starten")', { timeout: 20000 }).then(() => 'dialog')]);
    if (weiter === 'dialog') await seite.click('#dialog button:has-text("Starten")');
    await seite.waitForURL(/editorTest=1/, { timeout: 15000 });
    await seite.waitForSelector('#editor-test-banner', { timeout: 30000 });
    await seite.waitForFunction(() => window.browserSurvival?.spiel && window.browserSurvival.server, null, { timeout: 90000 });
    const zone = await seite.evaluate(() => ({ id: window.browserSurvival.server.startZone.id, breite: window.browserSurvival.server.startZone.spielWelt.welt.breite }));
    pruefe(zone.id === 'testzone', `Spiel läuft mit dem Entwurf (${JSON.stringify(zone)})`);
    await seite.waitForTimeout(1500);
    await seite.screenshot({ path: path.join(AUSGABE, 'editor-8-test-im-spiel.png') });
    await seite.click('#editor-test-banner a');
    await seite.waitForFunction(() => window.mapEditor?.zustand.karte, null, { timeout: 20000 });
    const zurueck = await seite.evaluate(() => ({ id: window.mapEditor.zustand.aktivId, zonen: window.mapEditor.zustand.zonen.size }));
    pruefe(zurueck.id === 'testzone' && zurueck.zonen >= 3, `zurück im Editor, alles da (${JSON.stringify(zurueck)})`);
  }

  if (!nurBis) {
    schritt('Touch (Handy): Ansehen + Schwenken mit dem Finger');
    const handy = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    const h = await handy.newPage();
    h.on('pageerror', (e) => fehler.push(`Seitenfehler (Handy): ${e.message}`));
    await h.goto(`${basis}/editor/`);
    await h.waitForFunction(() => window.mapEditor, null, { timeout: 15000 });
    await h.evaluate(() => window.mapEditor.oeffneSpielzone('waldweg'));
    await h.evaluate(() => window.mapEditor.aktionen.werkzeug('hand'));
    const vorher = await h.evaluate(() => ({ ...window.mapEditor.zeichner.kamera }));
    const box = await h.locator('#leinwand2d').boundingBox();
    const cdp = await handy.newCDPSession(h);
    const punkt = (x, y) => [{ x, y }];
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: punkt(box.x + 200, box.y + 200) });
    for (let i = 1; i <= 5; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: punkt(box.x + 200 - i * 20, box.y + 200 - i * 10) });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    const nachher = await h.evaluate(() => ({ ...window.mapEditor.zeichner.kamera }));
    pruefe(nachher.x > vorher.x && nachher.y > vorher.y, `mit dem Finger geschwenkt (${vorher.x.toFixed(1)} → ${nachher.x.toFixed(1)})`);
    await h.screenshot({ path: path.join(AUSGABE, 'editor-9-handy.png') });
    await handy.close();
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
