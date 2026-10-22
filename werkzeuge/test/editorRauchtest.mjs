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
 * Editor 2.0: Menüleiste, Asset-Browser (Suche), Kontextmenü, Ebenen sperren, Hilfe mit Suche, Modell-Bibliothek (Phase 3),
 * Audio-Bibliothek + Klänge (Phase 4), Modell-Werkstatt (5.1) mit Material/Malen/Aufklebern (5.2) und Animationen/Gelenken (5.3, auch im Spiel), Werkstatt-KI gemockt (5.4), Free-Modus (5.5), Audio-Zentrale + lokaler Editor-Server (Phase 10).
 */
import { spawn, execSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { deflateSync, crc32 } from 'node:zlib';
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
  await seite.evaluate(() => window.mapEditor.bereit);
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
    await seite.evaluate((id) => window.mapEditor.assets.zeigeEintrag(id), id); // Gruppen-Chips (10.7): passende Gruppe öffnen
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

  schritt('Wände ziehen (2.2): Zaun am Stück, Raum-Umriss mit Strg');
  await asset('bauwerk:zaun');
  await ziehe([1, 11], [6, 11]);
  const zaeune = await seite.evaluate(() => [...window.mapEditor.zustand.karte.s('bauwerke').values()].filter((b) => b.typ === 'zaun').length);
  pruefe(zaeune === 6, `Zaun am Stück gezogen (${zaeune} Teile)`);
  await asset('kachel:#');
  await seite.keyboard.down('Control');
  await ziehe([12, 2], [16, 6]);
  await seite.keyboard.up('Control');
  const raum = await seite.evaluate(() => {
    const k = window.mapEditor.zustand.karte;
    return [k.kachelAn(12, 2), k.kachelAn(16, 6), k.kachelAn(14, 4)].join('');
  });
  pruefe(raum === '##,', `Raum-Umriss mit Strg (${raum})`);

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
  // 7.1: eigene Taste belegen (nächster Tastendruck), Konflikt, zurücksetzen
  await seite.click('#dialog .hilfe-zeile[data-id="bearbeiten.duplizieren"] [data-k="belegen"]');
  await seite.keyboard.press('Shift+Q');
  await seite.waitForSelector('#dialog .hilfe-zeile.geaendert[data-id="bearbeiten.duplizieren"]');
  pruefe(await seite.evaluate(() => window.mapEditor.befehle.finde('Umschalt+Q')?.id === 'bearbeiten.duplizieren' && JSON.parse(localStorage.getItem('browserSurvival.editorKuerzel'))['bearbeiten.duplizieren'][0] === 'Umschalt+Q'), 'Eigene Taste belegt und gespeichert');
  await seite.click('#dialog .hilfe-zeile[data-id="bearbeiten.duplizieren"] [data-k="standard"]');
  pruefe(await seite.evaluate(() => window.mapEditor.befehle.finde('Strg+D')?.id === 'bearbeiten.duplizieren' && !localStorage.getItem('browserSurvival.editorKuerzel')), 'Zurücksetzen stellt Strg+D wieder her');
  await seite.keyboard.press('Escape');
  // Befehlspalette
  await seite.keyboard.press('Control+k');
  await seite.waitForSelector('#dialog .palette-suche');
  await seite.fill('#dialog .palette-suche', 'ebenen ein');
  await seite.keyboard.press('Enter');
  await seite.waitForFunction(() => window.mapEditor.rechts.aktiv === 'Ebenen');
  pruefe(true, 'Befehlspalette (Strg+K): suchen + Enter führt aus');
  // 7.2: Mehrfachauswahl ausrichten + spiegeln (je 1 Undo-Schritt)
  const anordnenVorher = await seite.evaluate(() => {
    const z = window.mapEditor.zustand;
    const nr = z.karte.naechsteId;
    z.ausfuehren('Zwei Kisten', [{ s: 'objekte', k: nr, neu: { typ: 'kiste', x: 2, y: 2, b: 1, h: 1, blockiert: true } }, { s: 'objekte', k: nr + 1, neu: { typ: 'kiste', x: 6, y: 4, b: 1, h: 1, blockiert: true } }]);
    z.waehle([{ s: 'objekte', k: nr }, { s: 'objekte', k: nr + 1 }]);
    return { nr, schritte: z.verlauf.zurueck.length };
  });
  await seite.click('#rechts [data-reiter="Inspektor"]');
  await seite.click('#rechts button[data-befehl="anordnen.oben"]');
  const ausgerichtet = await seite.evaluate(({ nr }) => [window.mapEditor.zustand.karte.s('objekte').get(nr).y, window.mapEditor.zustand.karte.s('objekte').get(nr + 1).y], anordnenVorher);
  pruefe(ausgerichtet[0] === 2 && ausgerichtet[1] === 2, `Mehrfachauswahl oben ausgerichtet (${ausgerichtet})`);
  await seite.waitForTimeout(400); // Inspektor zeichnet nach der Änderung kurz verzögert neu
  await seite.click('#rechts button[data-befehl="anordnen.spiegelnH"]');
  const gespiegelt = await seite.evaluate(({ nr }) => [window.mapEditor.zustand.karte.s('objekte').get(nr).x, window.mapEditor.zustand.karte.s('objekte').get(nr + 1).x], anordnenVorher);
  pruefe(gespiegelt[0] === 6 && gespiegelt[1] === 2, `Waagerecht gespiegelt (${gespiegelt})`);
  for (let i = 0; i < 3; i++) await seite.keyboard.press('Control+z');
  pruefe(await seite.evaluate(({ schritte }) => window.mapEditor.zustand.verlauf.zurueck.length === schritte - 1, anordnenVorher), 'Ausrichten/Spiegeln je ein Undo-Schritt');
  await seite.keyboard.press('Escape');
  // 7.3: Hilfslinie aus dem oberen Lineal ziehen (1 Undo-Schritt) + Maßband (M, zwei Klicks, Enter)
  {
    const box = await seite.locator('#leinwand2d').boundingBox();
    const bild = (x, y) => seite.evaluate(([x, y]) => window.mapEditor.zeichner.zuBild(x, y), [x, y]);
    const ziel = await bild(5, 5);
    const vorher = await seite.evaluate(() => window.mapEditor.zustand.verlauf.zurueck.length);
    await seite.mouse.move(box.x + ziel.x, box.y + 10);
    await seite.mouse.down();
    await seite.mouse.move(box.x + ziel.x, box.y + ziel.y, { steps: 4 });
    await seite.mouse.up();
    const hl = await seite.evaluate(() => window.mapEditor.zustand.karte.werte.hilfslinien);
    pruefe(hl?.y?.length === 1 && Math.abs(hl.y[0] - 5) <= 0.5, `Hilfslinie aus dem Lineal gezogen (${JSON.stringify(hl)})`);
    await seite.keyboard.press('m');
    const a = await bild(2, 2);
    const b = await bild(5, 6);
    await seite.mouse.click(box.x + a.x, box.y + a.y);
    await seite.mouse.click(box.x + b.x, box.y + b.y);
    await seite.keyboard.press('Enter');
    const mb = await seite.evaluate(() => window.mapEditor.zeichner.massband);
    pruefe(mb?.fertig && mb.punkte.length === 2, `Maßband: 2 Punkte, fertig (${JSON.stringify(mb?.punkte)})`);
    await seite.keyboard.press('Escape');
    await seite.keyboard.press('v');
    await seite.keyboard.press('Control+z');
    pruefe(await seite.evaluate((v) => window.mapEditor.zustand.verlauf.zurueck.length === v && !window.mapEditor.zustand.karte.werte.hilfslinien, vorher), 'Hilfslinie: ein Undo-Schritt, Maßband ändert die Karte nicht');
  }
  // 7.4: Bibliothek – Prefabs im Asset-Browser (Vorschaubild, Suche) und per Ziehen auf der Karte ablegen
  {
    await seite.evaluate(() => window.mapEditor.layout.zeigeReiter('links', '🧱 Assets'));
    await seite.fill('.asset-suche', 'wohnhaus');
    const treffer = await seite.locator('.asset-liste button.asset[data-id^="prefab:"]').count();
    const bild = await seite.locator('.asset-liste button.asset[data-id^="prefab:"] img.vorschau').count();
    pruefe(treffer >= 1 && bild >= 1, `Prefab „Wohnhaus“ in der Asset-Suche mit Vorschaubild (${treffer}/${bild})`);
    const id = await seite.locator('.asset-liste button.asset[data-id^="prefab:"]').first().getAttribute('data-id');
    await seite.fill('.asset-suche', '');
    const vorher = await seite.evaluate(() => ({ n: window.mapEditor.zustand.verlauf.zurueck.length, obj: window.mapEditor.zustand.karte.s('objekte').size }));
    await seite.evaluate((id) => {
      const lw = document.getElementById('leinwand2d');
      const p = window.mapEditor.zeichner.zuBild(15, 12);
      const r = lw.getBoundingClientRect();
      const dt = new DataTransfer();
      dt.setData('application/x-editor-asset', id);
      lw.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, clientX: r.left + p.x, clientY: r.top + p.y, bubbles: true, cancelable: true }));
    }, id);
    const nachher = await seite.evaluate(() => ({ n: window.mapEditor.zustand.verlauf.zurueck.length, obj: window.mapEditor.zustand.karte.s('objekte').size }));
    pruefe(nachher.n === vorher.n + 1 && nachher.obj > vorher.obj, `Prefab auf die Karte gezogen = 1 Undo-Schritt (${JSON.stringify([vorher, nachher])})`);
    await seite.evaluate(() => document.activeElement?.blur());
    await seite.keyboard.press('Control+z');
    pruefe((await seite.evaluate(() => window.mapEditor.zustand.karte.s('objekte').size)) === vorher.obj, 'Ablegen rückgängig gemacht');
    await seite.keyboard.press('Escape');
  }
  // 7.5: Version (automatisch wie beim Export), Änderung, Diff auf der Karte, Wiederherstellungspunkt = 1 Undo-Schritt
  {
    await seite.evaluate(() => window.mapEditor.aktionen.versionAuto('export'));
    const vorher = await seite.evaluate(() => {
      const z = window.mapEditor.zustand;
      const nr = z.karte.naechsteId;
      z.ausfuehren('Kiste', [{ s: 'objekte', k: nr, neu: { typ: 'kiste', x: 8, y: 8, b: 1, h: 1, blockiert: true } }]);
      return { obj: z.karte.s('objekte').size - 1, n: z.verlauf.zurueck.length };
    });
    await seite.evaluate(() => window.mapEditor.aktionen.versionen());
    await seite.waitForSelector('#rechts button[data-v="diff"]');
    await seite.click('#rechts button[data-v="diff"]');
    const diff = await seite.evaluate(() => window.mapEditor.zeichner.ueberlagerungen.map((u) => u.farbe));
    pruefe(diff.includes('#4caf50'), `Diff zur Version: neue Kiste grün markiert (${diff.length})`);
    const seit = await seite.evaluate(() => window.mapEditor.aktionen.aenderungenSeitExport().then((x) => x?.zeilen));
    pruefe(seit?.some((z) => z.startsWith('Objekte: +1')), `Änderungen seit dem letzten Export (${JSON.stringify(seit)})`);
    await seite.waitForTimeout(400);
    await seite.click('#rechts button[data-v="laden"]');
    await seite.click('#dialog button.akzent');
    await seite.waitForFunction((n) => window.mapEditor.zustand.karte.s('objekte').size === n, vorher.obj);
    pruefe(await seite.evaluate((v) => window.mapEditor.zustand.verlauf.zurueck.length === v.n + 1, vorher), 'Wiederherstellungspunkt geladen = 1 Undo-Schritt');
    await seite.evaluate(() => document.activeElement?.blur());
    await seite.keyboard.press('Control+z');
    await seite.keyboard.press('Control+z');
    pruefe((await seite.evaluate(() => window.mapEditor.zustand.karte.s('objekte').size)) === vorher.obj, 'Versionstest rückgängig gemacht');
    await seite.keyboard.press('Escape');
  }

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

  schritt('Phase 3: Modell-Bibliothek – .glb/.obj hochladen, platzieren, Poly Pizza (gemockt), Löschen mit Abhängigkeit');
  const { gltfZuGlb, bytesZuBase64 } = await import('../../editor/kern/bibliothek.js');
  const wuerfel = (farbe) => {
    const pos = new Float32Array([-0.5, 0, -0.5, 0.5, 0, -0.5, 0.5, 1.5, -0.5, -0.5, 1.5, -0.5, -0.5, 0, 0.5, 0.5, 0, 0.5, 0.5, 1.5, 0.5, -0.5, 1.5, 0.5]);
    const ind = new Uint16Array([0, 1, 2, 0, 2, 3, 4, 6, 5, 4, 7, 6, 0, 4, 5, 0, 5, 1, 3, 2, 6, 3, 6, 7, 0, 3, 7, 0, 7, 4, 1, 5, 6, 1, 6, 2]);
    const puffer = Buffer.concat([Buffer.from(pos.buffer), Buffer.from(ind.buffer)]);
    return gltfZuGlb({ asset: { version: '2.0' }, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0 }], materials: [{ pbrMetallicRoughness: { baseColorFactor: farbe } }],
      meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1, material: 0 }] }],
      accessors: [{ bufferView: 0, componentType: 5126, count: 8, type: 'VEC3', min: [-0.5, 0, -0.5], max: [0.5, 1.5, 0.5] }, { bufferView: 1, componentType: 5123, count: 36, type: 'SCALAR' }],
      bufferViews: [{ buffer: 0, byteLength: pos.byteLength }, { buffer: 0, byteOffset: pos.byteLength, byteLength: ind.byteLength }],
      buffers: [{ byteLength: puffer.length, uri: `data:application/octet-stream;base64,${bytesZuBase64(new Uint8Array(puffer))}` }] });
  };
  const glbPfad = path.join(AUSGABE, 'rauchtest_saeule.glb');
  writeFileSync(glbPfad, wuerfel([0.8, 0.2, 0.2, 1]));
  const objPfad = path.join(AUSGABE, 'rauchtest_kiste.obj');
  writeFileSync(objPfad, 'v -1 0 -1\nv 1 0 -1\nv 1 0 1\nv -1 0 1\nv -1 1 -1\nv 1 1 -1\nv 1 1 1\nv -1 1 1\nf 1 2 3 4\nf 5 8 7 6\nf 1 5 6 2\nf 2 6 7 3\nf 3 7 8 4\nf 4 8 5 1\n');
  await seite.evaluate(async () => {
    for (const m of window.mapEditor.bibliothek.liste) await window.mapEditor.bibliothek.entferne(m.id);
  });
  await seite.click('#links [data-reiter="📦 Modelle"]');
  const [modellWahl] = await Promise.all([seite.waitForEvent('filechooser'), seite.click('#links [data-waehlen]')]);
  await modellWahl.setFiles([glbPfad, objPfad]);
  await seite.waitForSelector('#dialog h2:has-text("Hochladen")', { timeout: 20000 }); // Hinweis: OBJ umgewandelt
  await seite.click('#dialog button:has-text("OK")');
  const bib = await seite.evaluate(() => window.mapEditor.bibliothek.liste.map((m) => ({ name: m.name, masse: m.masse, vorschau: !!m.vorschau })));
  pruefe(bib.length === 2 && bib.every((m) => m.vorschau) && bib.find((m) => m.name === 'rauchtest saeule')?.masse.hoehe === 1.5, `2 Modelle mit Maßen + Vorschaubild (${JSON.stringify(bib)})`);
  await seite.click('#links .modell:has-text("rauchtest saeule")');
  await klick(14, 4); // frei: im Raum aus Schritt 2.2
  await seite.keyboard.press('Escape');
  const typ = await seite.evaluate(() => [...window.mapEditor.zustand.karte.s('typen').values()].find((t) => t.asset));
  pruefe(typ && !typ.glb && (await seite.evaluate(() => [...window.mapEditor.zustand.karte.s('objekte').values()].some((o) => o.typ.startsWith('m_')))), 'Modell platziert, Typ verweist nur per asset-ID');
  const exportGlb = await seite.evaluate(async () => Object.values((await import('/editor/kern/format.js')).nachDefinition(window.mapEditor.zustand.karte).typen ?? {}).some((t) => t.glb?.startsWith('data:model/gltf-binary;base64,')));
  pruefe(exportGlb, 'Export/Test betten das Modell ein');
  await seite.fill('#links .modelle-filter input', '#keintreffer');
  pruefe((await seite.locator('#links .modell').count()) === 0, 'Suche filtert');
  await seite.fill('#links .modelle-filter input', '');
  // Poly Pizza: API + Download gemockt – Schlüssel nur im Header
  let pizza = null;
  await seite.route('https://api.poly.pizza/**', async (route) => {
    pizza = { url: route.request().url(), schluessel: route.request().headers()['x-auth-token'] };
    await route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ total: 2, results: [{ ID: 'tst', Title: 'Blauer Pfeiler', Licence: 'CC-BY 3.0', Creator: { Username: 'Testerin' }, Download: 'https://static.poly.pizza/tst.glb', Thumbnail: '' }, { ID: 'nc', Title: 'Verboten', Licence: 'CC-BY-NC 4.0', Download: 'https://static.poly.pizza/nc.glb' }] }) });
  });
  await seite.route('https://static.poly.pizza/**', (route) => route.fulfill({ status: 200, contentType: 'model/gltf-binary', headers: { 'access-control-allow-origin': '*' }, body: Buffer.from(wuerfel([0.2, 0.3, 0.9, 1])) }));
  await seite.click('#links [data-poly]');
  await seite.fill('#dialog [name="schluessel"]', 'PIZZAKEY');
  await seite.fill('#dialog [name="suche"]', 'pillar');
  await seite.click('#dialog [data-suchen]');
  await seite.waitForSelector('#dialog .quelle-liste .modell', { timeout: 10000 });
  pruefe((await seite.locator('#dialog .quelle-liste .modell').count()) === 1 && pizza?.schluessel === 'PIZZAKEY' && !pizza.url.includes('PIZZAKEY'), 'Poly Pizza: nur CC0/CC-BY, Schlüssel im Header');
  await seite.click('#dialog .quelle-liste .modell');
  await seite.waitForFunction(() => window.mapEditor.bibliothek.liste.some((m) => m.urheber === 'Testerin'), null, { timeout: 15000 });
  await seite.screenshot({ path: path.join(AUSGABE, 'editor-12-polypizza.png') });
  await seite.click('#dialog button:has-text("Schließen")');
  const pfeiler = await seite.evaluate(() => window.mapEditor.bibliothek.liste.find((m) => m.urheber === 'Testerin'));
  pruefe(pfeiler?.lizenz === 'CC-BY 3.0' && pfeiler.quelle === 'https://poly.pizza/m/tst', 'Übernommen mit Lizenz, Urheber, Quelle');
  // Löschen: unbenutzt → einfache Rückfrage; benutzt → Abhängigkeiten (hier: ersetzen durch den Pfeiler)
  await seite.click('#links .modell:has-text("rauchtest saeule") [data-bearbeiten]');
  await seite.click('#dialog button:has-text("Löschen")');
  await seite.waitForSelector('#dialog h2:has-text("Modell löschen")');
  pruefe((await seite.locator('#dialog').textContent()).includes('1 Objekt'), 'Löschen zeigt die Verwendung');
  await seite.selectOption('#dialog [name="ersatz"]', pfeiler.id);
  await seite.click('#dialog button:has-text("Ersetzen & löschen")');
  const nachErsatz = await seite.evaluate((id) => ({ n: window.mapEditor.bibliothek.liste.length, typ: [...window.mapEditor.zustand.karte.s('typen').values()].find((t) => t.asset)?.asset === id }), pfeiler.id);
  pruefe(nachErsatz.n === 2 && nachErsatz.typ, `Modell ersetzt und gelöscht (${JSON.stringify(nachErsatz)})`);
  await seite.click('#links [data-reiter="🧱 Assets"]');

  schritt('Phase 4: Audio hochladen (WAV), Punkt-Klang setzen, Hörweite per Griff, Trimmen, kaputte Datei abgelehnt');
  const wav = (sek, hz) => {
    const rate = 8000;
    const n = Math.floor(sek * rate);
    const b = Buffer.alloc(44 + n * 2);
    b.write('RIFF', 0);
    b.writeUInt32LE(36 + n * 2, 4);
    b.write('WAVEfmt ', 8);
    b.writeUInt32LE(16, 16);
    b.writeUInt16LE(1, 20);
    b.writeUInt16LE(1, 22);
    b.writeUInt32LE(rate, 24);
    b.writeUInt32LE(rate * 2, 28);
    b.writeUInt16LE(2, 32);
    b.writeUInt16LE(16, 34);
    b.write('data', 36);
    b.writeUInt32LE(n * 2, 40);
    for (let i = 0; i < n; i++) b.writeInt16LE(Math.round(Math.sin((2 * Math.PI * hz * i) / rate) * 9000), 44 + i * 2);
    return b;
  };
  const wavPfad = path.join(AUSGABE, 'rauchtest_huhn.wav');
  writeFileSync(wavPfad, wav(1, 660));
  const kaputtPfad = path.join(AUSGABE, 'rauchtest_kaputt.mp3');
  writeFileSync(kaputtPfad, 'kein audio');
  await seite.evaluate(async () => {
    for (const m of window.mapEditor.audioBibliothek.liste) await window.mapEditor.audioBibliothek.entferne(m.id);
  });
  await seite.click('#links [data-reiter="🔊 Audio"]');
  const [audioWahl] = await Promise.all([seite.waitForEvent('filechooser'), seite.click('#links .audio [data-waehlen]')]);
  await audioWahl.setFiles([wavPfad, kaputtPfad]);
  await seite.waitForSelector('#dialog h2:has-text("Hochladen")', { timeout: 20000 });
  pruefe((await seite.locator('#dialog').textContent()).includes('rauchtest_kaputt.mp3'), 'Kaputte Datei abgelehnt (Signatur)');
  await seite.click('#dialog button:has-text("OK")');
  const audioMeta = await seite.evaluate(() => window.mapEditor.audioBibliothek.liste.map((m) => ({ dauer: m.dauer, welle: m.wellenform.length })));
  pruefe(audioMeta.length === 1 && Math.abs(audioMeta[0].dauer - 1) < 0.05 && audioMeta[0].welle > 50, `WAV dekodiert: Dauer + Wellenform (${JSON.stringify(audioMeta)})`);
  await seite.click('#links .audio-zeile [data-a="punkt"]');
  await klick(8, 4);
  await seite.keyboard.press('Escape');
  await seite.keyboard.press('v');
  const klangId = await seite.evaluate(() => [...window.mapEditor.zustand.karte.s('klaenge').keys()][0]);
  await seite.evaluate((id) => window.mapEditor.zustand.waehle([{ s: 'klaenge', k: id }]), klangId);
  const griff = await kachel(8.5 + 10 - 0.5, 4);
  const griffZiel = await kachel(8.5 + 6 - 0.5, 4);
  await seite.mouse.move(griff.x, griff.y);
  await seite.mouse.down();
  await seite.mouse.move(griffZiel.x, griffZiel.y, { steps: 5 });
  await seite.mouse.up();
  // Inspektor baut nach Kartenänderungen verzögert (120 ms) neu – erst danach die Wellenform greifen
  await seite.waitForTimeout(400);
  await seite.waitForSelector('#rechts canvas.wellen-editor');
  const welle = await seite.locator('#rechts canvas.wellen-editor').boundingBox();
  await seite.mouse.move(welle.x + 2, welle.y + welle.height / 2);
  await seite.mouse.down();
  await seite.mouse.move(welle.x + welle.width * 0.3, welle.y + welle.height / 2, { steps: 4 });
  await seite.mouse.up();
  const klang = await seite.evaluate((id) => window.mapEditor.zustand.karte.s('klaenge').get(id), klangId);
  pruefe(klang?.art === 'punkt' && klang.aussen === 6 && klang.start > 0.2, `Klang gesetzt, Hörweite gezogen, getrimmt (${JSON.stringify({ x: klang?.x, aussen: klang?.aussen, start: klang?.start })})`);
  await seite.screenshot({ path: path.join(AUSGABE, 'editor-13-audio.png') });
  await seite.keyboard.press('3');
  await seite.waitForTimeout(1500);
  const klang3d = await seite.evaluate((id) => window.mapEditor.teile?.ansicht3d?.boxen.has(`klaenge|${id}`) ?? 'ohne WebGL', klangId);
  pruefe(klang3d === true || klang3d === 'ohne WebGL', `Klang-Marker in 3D (${klang3d})`);
  await seite.screenshot({ path: path.join(AUSGABE, 'editor-14-audio-3d.png') });
  await seite.keyboard.press('3');
  await seite.keyboard.press('Escape');
  await seite.click('#links [data-reiter="🧱 Assets"]');

  schritt('Phase 5.1: Modell-Werkstatt – Zahlenfelder, Auf den Boden, Teil ausblenden, Undo/Redo, neue Version, Typen umstellen');
  await seite.click('#links [data-reiter="📦 Modelle"]');
  await seite.click('#links .modell:has-text("Blauer Pfeiler") [data-werkstatt]');
  await seite.waitForSelector('.werkstatt canvas');
  const info = () => seite.locator('.werkstatt-info').textContent();
  const feld = async (name, wert) => {
    await seite.fill(`.werkstatt [name="${name}"]`, String(wert));
    await seite.locator(`.werkstatt [name="${name}"]`).dispatchEvent('change');
    await seite.evaluate(() => document.activeElement?.blur());
  };
  await feld('sx', 2);
  await feld('py', 1);
  pruefe((await info()).includes('schwebt') && (await info()).includes('2 × 1'), `Größe + Höhe über Zahlenfelder (${await info()})`);
  await seite.click('.werkstatt [data-a="boden"]');
  pruefe(!(await info()).includes('schwebt'), 'Auf den Boden');
  const kartenSchritte = () => seite.evaluate(() => window.mapEditor.zustand.verlauf.zurueck.length);
  const vorher = await kartenSchritte();
  await seite.keyboard.press('Control+z');
  pruefe((await info()).includes('schwebt') && (await kartenSchritte()) === vorher, 'Strg+Z in der Werkstatt (Karten-Verlauf unberührt)');
  await seite.keyboard.press('Control+y');
  await seite.click('.werkstatt-teile [data-teil="0"] [data-auge]');
  pruefe((await info()).includes('0 Dreiecke'), 'Teil ausgeblendet');
  await seite.keyboard.press('Control+z');
  pruefe((await info()).includes('12 Dreiecke') && !(await info()).includes('schwebt'), `Undo blendet wieder ein (${await info()})`);
  const buehne = await seite.locator('.werkstatt-buehne').boundingBox();
  await seite.mouse.move(buehne.x + 40, buehne.y + buehne.height - 60);
  await seite.mouse.down();
  await seite.mouse.move(buehne.x + 140, buehne.y + buehne.height - 90, { steps: 5 });
  await seite.mouse.up();
  await seite.screenshot({ path: path.join(AUSGABE, 'editor-15-werkstatt.png') });
  await seite.click('.werkstatt [data-a="speichern"]');
  await seite.waitForSelector('#dialog h2:has-text("gespeichert")', { timeout: 15000 });
  await seite.check('#dialog [name="groesse"]');
  await seite.click('#dialog button:has-text("Umstellen")');
  await seite.waitForSelector('.werkstatt', { state: 'detached' });
  const version = await seite.evaluate((altId) => {
    const m = window.mapEditor.bibliothek.liste.find((x) => x.basis === altId);
    const t = [...window.mapEditor.zustand.karte.s('typen').values()].find((x) => x.asset === m?.id);
    return { name: m?.name, b: m?.masse.b, original: !!window.mapEditor.bibliothek.meta(altId), typB: t?.b };
  }, pfeiler.id);
  pruefe(version.name === 'Blauer Pfeiler v2' && version.b === 2 && version.original && version.typB === 2, `Neue Version, Original bleibt, Typ umgestellt (${JSON.stringify(version)})`);

  schritt('Phase 5.2: Werkstatt – Material, Malen (3D), Undo, Aufkleber, Speichern mit Texturen');
  // senkrechte Platte 1 × 1 m mit UVs + Normalen (Vorderseite +z)
  const platte = () => {
    const pos = new Float32Array([-0.5, 0, 0, 0.5, 0, 0, 0.5, 1, 0, -0.5, 1, 0]);
    const nor = new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1]);
    const uv = new Float32Array([0, 1, 1, 1, 1, 0, 0, 0]);
    const ind = new Uint16Array([0, 1, 2, 0, 2, 3]);
    const teile = [pos, nor, uv, ind].map((a) => Buffer.from(a.buffer));
    const puffer = Buffer.concat(teile);
    let ab = 0;
    const sichten = teile.map((t) => ({ buffer: 0, byteOffset: (ab += t.length) - t.length, byteLength: t.length }));
    return gltfZuGlb({ asset: { version: '2.0' }, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0, name: 'Schild' }], materials: [{ name: 'Holz', doubleSided: true, pbrMetallicRoughness: { baseColorFactor: [0.6, 0.6, 0.6, 1] } }],
      meshes: [{ primitives: [{ attributes: { POSITION: 0, NORMAL: 1, TEXCOORD_0: 2 }, indices: 3, material: 0 }] }],
      accessors: [{ bufferView: 0, componentType: 5126, count: 4, type: 'VEC3', min: [-0.5, 0, 0], max: [0.5, 1, 0] }, { bufferView: 1, componentType: 5126, count: 4, type: 'VEC3' }, { bufferView: 2, componentType: 5126, count: 4, type: 'VEC2' }, { bufferView: 3, componentType: 5123, count: 6, type: 'SCALAR' }],
      bufferViews: sichten, buffers: [{ byteLength: puffer.length, uri: `data:application/octet-stream;base64,${bytesZuBase64(new Uint8Array(puffer))}` }] });
  };
  // kleines PNG (RGBA, einfarbig) für den Aufkleber
  const png = (b, h, rgba) => {
    const block = (typ, daten) => {
      const laenge = Buffer.alloc(4);
      laenge.writeUInt32BE(daten.length);
      const inhalt = Buffer.concat([Buffer.from(typ), daten]);
      const pruef = Buffer.alloc(4);
      pruef.writeUInt32BE(crc32(inhalt));
      return Buffer.concat([laenge, inhalt, pruef]);
    };
    const kopf = Buffer.alloc(13);
    kopf.writeUInt32BE(b, 0);
    kopf.writeUInt32BE(h, 4);
    kopf.set([8, 6, 0, 0, 0], 8);
    const zeile = Buffer.concat([Buffer.from([0]), Buffer.alloc(b * 4).fill(Buffer.from(rgba))]);
    return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), block('IHDR', kopf), block('IDAT', deflateSync(Buffer.concat(Array(h).fill(zeile)))), block('IEND', Buffer.alloc(0))]);
  };
  const plattePfad = path.join(AUSGABE, 'rauchtest_schild.glb');
  writeFileSync(plattePfad, platte());
  const pngPfad = path.join(AUSGABE, 'rauchtest_logo.png');
  writeFileSync(pngPfad, png(16, 8, [30, 90, 230, 255]));
  const [schildWahl] = await Promise.all([seite.waitForEvent('filechooser'), seite.click('#links [data-waehlen]')]);
  await schildWahl.setFiles([plattePfad]);
  await seite.waitForSelector('#dialog h2:has-text("rauchtest schild")', { timeout: 20000 });
  await seite.click('#dialog button:has-text("Werkstatt")');
  await seite.waitForSelector('.werkstatt canvas');
  const ws = (f) => seite.evaluate(async (quelle) => new Function('w', `return (${quelle})(w)`)((await import('/editor/ui/werkstatt.js')).aktiveWerkstatt()), f.toString());
  await seite.click('.werkstatt-materialien [data-material] button.name');
  await seite.fill('.werkstatt-matfeld [data-f="farbe"]', '#ffcc00');
  pruefe((await ws((w) => w.materialien()[0].color.getHexString())) === 'ffcc00', 'Materialfarbe geändert');
  await seite.keyboard.press('b');
  const wsBuehne = await seite.locator('.werkstatt-buehne').boundingBox();
  const mx = wsBuehne.x + wsBuehne.width / 2;
  const my = wsBuehne.y + wsBuehne.height / 2;
  await seite.mouse.move(mx - 40, my);
  await seite.mouse.down();
  await seite.mouse.move(mx + 40, my, { steps: 8 });
  await seite.mouse.up();
  const bemalt = await ws((w) => {
    const m = w.materialien()[0];
    const c = m.map?.image;
    const d = c?.getContext?.('2d').getImageData(c.width / 2, c.height / 2, 1, 1).data;
    return { leinwand: !!d, farbe: d ? [...d.slice(0, 3)] : null, kamera: w.orbit.enabled };
  });
  pruefe(bemalt.leinwand && bemalt.farbe[0] > 150 && bemalt.farbe[1] < 100 && bemalt.kamera, `Auf das Modell gemalt (${JSON.stringify(bemalt)})`);
  await seite.keyboard.press('Control+z');
  const nachUndo = await ws((w) => ({ map: !!w.materialien()[0].map, farbe: w.materialien()[0].color.getHexString() }));
  pruefe(!nachUndo.map && nachUndo.farbe === 'ffcc00', `Undo nimmt den Strich zurück (${JSON.stringify(nachUndo)})`);
  await seite.keyboard.press('Control+y');
  pruefe(await ws((w) => !!w.materialien()[0].map), 'Redo malt wieder');
  await seite.keyboard.press('k');
  const [logoWahl] = await Promise.all([seite.waitForEvent('filechooser'), seite.click('.werkstatt-optionen [data-bild]')]);
  await logoWahl.setFiles([pngPfad]);
  await seite.waitForSelector('.werkstatt-optionen:has-text("rauchtest_logo.png")');
  await seite.mouse.click(mx, my - 20);
  const aufkleber = await ws((w) => w.teile.filter((t) => t.userData.aufkleber && t.visible).map((t) => t.geometry.attributes.position.count));
  pruefe(aufkleber.length === 1 && aufkleber[0] > 0, `Aufkleber projiziert (${JSON.stringify(aufkleber)})`);
  await seite.screenshot({ path: path.join(AUSGABE, 'editor-16-werkstatt-malen.png') });
  await seite.keyboard.press('Control+s');
  await seite.waitForSelector('.werkstatt', { state: 'detached', timeout: 15000 });
  const schild = await seite.evaluate(async () => {
    const B = await import('/editor/kern/bibliothek.js');
    const m = window.mapEditor.bibliothek.liste.find((x) => x.name === 'rauchtest schild v2');
    const j = m && B.glbJson(B.dataUrlZuBytes(window.mapEditor.bibliothek.url(m.id)));
    return { da: !!m, bilder: j?.images?.length ?? 0, netze: j?.meshes?.length ?? 0, original: window.mapEditor.bibliothek.liste.some((x) => x.name === 'rauchtest schild') };
  });
  pruefe(schild.da && schild.bilder >= 2 && schild.netze === 2 && schild.original, `Neue Version mit gemalter Textur + Aufkleber (${JSON.stringify(schild)})`);

  schritt('Phase 5.3: Werkstatt – Gelenk an der Kante, Pendeln erzeugen, Vorschau, Undo, Leerlauf, im Spiel animiert');
  await seite.click('#links .modell:has-text("rauchtest schild"):not(:has-text("v2")) [data-werkstatt]');
  await seite.waitForSelector('.werkstatt canvas');
  await seite.click('.werkstatt-teile [data-teil="0"] button.name');
  await seite.click('.werkstatt-animation [data-c="gelenk"]');
  await seite.selectOption('#dialog [name="ort"]', 'links');
  await seite.click('#dialog button:has-text("Einfügen")');
  const gelenk = await ws((w) => ({ gewaehlt: w.gewaehlt.userData.gelenk === true, x: Math.round(w.gewaehlt.position.x * 100) / 100, kind: w.gewaehlt.children[0]?.name }));
  pruefe(gelenk.gewaehlt && gelenk.x === -0.5 && gelenk.kind === 'Schild', `Gelenk an der linken Kante, Teil hängt daran (${JSON.stringify(gelenk)})`);
  await seite.click('.werkstatt-animation [data-c="neu"]');
  await seite.selectOption('#dialog [name="art"]', 'pendeln');
  await seite.click('#dialog button:has-text("Erzeugen")');
  await seite.waitForTimeout(400);
  const laeuft = await ws((w) => ({ clips: w.clips.map((c) => c.name), leerlauf: w.animwerk.leerlauf, dreht: Math.abs(w.gewaehlt.quaternion.y) > 0.01 }));
  pruefe(laeuft.clips.length === 1 && laeuft.leerlauf === laeuft.clips[0] && laeuft.dreht, `Pendeln erzeugt, Vorschau läuft, Leerlauf gesetzt (${JSON.stringify(laeuft)})`);
  await seite.click('.werkstatt-animation [data-c="spielen"]');
  pruefe(await ws((w) => Math.abs(w.gewaehlt.quaternion.y) < 1e-6 && !w.animwerk.vorschau), 'Stopp stellt die Pose wieder her');
  await seite.keyboard.press('Control+z');
  pruefe((await ws((w) => w.clips.length)) === 0, 'Undo entfernt die Animation');
  await seite.keyboard.press('Control+y');
  await seite.screenshot({ path: path.join(AUSGABE, 'editor-18-werkstatt-animation.png') });
  await seite.keyboard.press('Control+s');
  await seite.waitForSelector('.werkstatt', { state: 'detached', timeout: 15000 });
  const animiert = await seite.evaluate(async () => {
    const B = await import('/editor/kern/bibliothek.js');
    const m = window.mapEditor.bibliothek.liste.find((x) => x.name === 'rauchtest schild v3');
    const j = m && B.glbJson(B.dataUrlZuBytes(window.mapEditor.bibliothek.url(m.id)));
    return { id: m?.id, leerlauf: m?.leerlauf, animationen: j?.animations?.length ?? 0, gelenk: !!j?.nodes?.some((n) => n.name?.startsWith('Gelenk')) };
  });
  pruefe(animiert.leerlauf && animiert.animationen === 1 && animiert.gelenk, `Version mit Animation + Gelenk + Leerlauf (${JSON.stringify(animiert)})`);
  // ins Spiel: Typ (Feld animation) + ein Objekt in der Testzone
  const animTyp = await seite.evaluate((id) => {
    window.mapEditor.aktionen.verwendeModell(id);
    const z = window.mapEditor.zustand;
    const [typId, typ] = [...z.karte.s('typen')].find(([, t]) => t.asset === id);
    const nr = z.karte.naechsteId;
    z.ausfuehren('Rauchtest: animiertes Schild', [{ s: 'objekte', k: nr, neu: { typ: typId, x: 1, y: 1, b: typ.b, h: typ.h } }]);
    return { typId, animation: typ.animation, da: z.karte.s('objekte').has(nr) };
  }, animiert.id);
  pruefe(animTyp.animation === animiert.leerlauf && animTyp.da, `Typ übernimmt die Leerlauf-Animation (${JSON.stringify(animTyp)})`);
  await seite.keyboard.press('Escape');

  schritt('Phase 5.4: Werkstatt-KI (Gemini gemockt) – Farbschema verwerfen/übernehmen, Animation, Textur aus Text');
  const kiAnfragen = [];
  await seite.route('https://generativelanguage.googleapis.com/**', async (route) => {
    const req = route.request();
    const body = JSON.parse(req.postData());
    kiAnfragen.push({ url: req.url(), schluessel: req.headers()['x-goog-api-key'], body: req.postData() });
    const system = body.systemInstruction?.parts?.[0]?.text ?? '';
    const teile = req.url().includes('-image')
      ? [{ text: 'Textur' }, { inlineData: { mimeType: 'image/png', data: png(8, 8, [40, 160, 60, 255]).toString('base64') } }]
      : [{ text: system.includes('Farbschema') ? '{"materialien":[{"material":"Holz","farbe":"#a0522d","rauheit":0.9}],"erklaerung":"Rostbraun."}' : '{"animationen":[{"art":"wippen","ziel":"Schild","achse":"y","dauer":1.5,"staerke":0.05}],"erklaerung":"Wippt leicht."}' }];
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ candidates: [{ content: { parts: teile }, finishReason: 'STOP' }] }) });
  });
  const alterSchluessel = await seite.evaluate(() => {
    const alt = localStorage.getItem('browserSurvival.editorGemini');
    localStorage.setItem('browserSurvival.editorGemini', JSON.stringify({ schluessel: 'WERKSTATTKEY', modell: 'gemini-2.5-flash' }));
    return alt;
  });
  await seite.click('#links [data-reiter="📦 Modelle"]');
  await seite.click('#links .modell:has-text("rauchtest schild"):not(:has-text("v2")):not(:has-text("v3")) [data-werkstatt]');
  await seite.waitForSelector('.werkstatt canvas');
  const kiFrage = async (aufgabe) => {
    await seite.click('.werkstatt [data-a="ki"]');
    await seite.selectOption('#dialog [name="aufgabe"]', aufgabe);
    await seite.fill('#dialog [name="wunsch"]', 'rostig');
    await seite.click('#dialog button:has-text("Fragen")');
  };
  const holzFarbe = () => ws((w) => w.materialien()[0].color.getHexString());
  const farbeVorher = await holzFarbe();
  await kiFrage('farben');
  await seite.waitForSelector('#dialog h2:has-text("Farbschema")', { timeout: 15000 });
  pruefe((await holzFarbe()) === 'a0522d', 'Farbschema als Vorschau angewendet');
  await seite.click('#dialog button:has-text("Verwerfen")');
  pruefe((await holzFarbe()) === farbeVorher && !(await ws((w) => w.verlauf.kannZurueck)), 'Verwerfen stellt zurück (kein Undo-Schritt)');
  await kiFrage('farben');
  await seite.waitForSelector('#dialog h2:has-text("Farbschema")', { timeout: 15000 });
  await seite.click('#dialog button:has-text("Übernehmen")');
  await seite.keyboard.press('Control+z');
  const nachKiUndo = await holzFarbe();
  await seite.keyboard.press('Control+y');
  pruefe(nachKiUndo === farbeVorher && (await holzFarbe()) === 'a0522d', 'Übernehmen = 1 Undo-Schritt');
  await kiFrage('animation');
  await seite.waitForSelector('#dialog h2:has-text("Animation")', { timeout: 15000 });
  pruefe(await ws((w) => w.clips.length === 1 && !!w.animwerk.vorschau), 'KI-Animation läuft als Vorschau');
  await seite.click('#dialog button:has-text("Übernehmen")');
  await seite.click('.werkstatt-materialien [data-material] button.name');
  await kiFrage('textur');
  await seite.waitForSelector('#dialog h2:has-text("Textur aus Text")', { timeout: 15000 });
  await seite.click('#dialog button:has-text("Übernehmen")');
  const kiErgebnis = await ws((w) => ({ clips: w.clips.length, textur: !!w.materialien()[0].map?.image }));
  const gesendet = kiAnfragen.map((a) => a.body).join(' ');
  pruefe(kiErgebnis.clips === 1 && kiErgebnis.textur && kiAnfragen.length === 4 && kiAnfragen.every((a) => a.schluessel === 'WERKSTATTKEY' && !a.url.includes('WERKSTATTKEY')) && gesendet.includes('Holz') && !gesendet.includes('testzone') && !gesendet.includes('WERKSTATTKEY'), `KI: Animation + Textur übernommen, nur das Modell gesendet (${JSON.stringify({ ...kiErgebnis, anfragen: kiAnfragen.length })})`);
  await seite.screenshot({ path: path.join(AUSGABE, 'editor-19-werkstatt-ki.png') });
  await seite.click('.werkstatt [data-a="abbrechen"]');
  await seite.click('#dialog button:has-text("Verwerfen")');
  await seite.waitForSelector('.werkstatt', { state: 'detached' });
  await seite.unroute('https://generativelanguage.googleapis.com/**');
  await seite.evaluate((alt) => (alt === null ? localStorage.removeItem('browserSurvival.editorGemini') : localStorage.setItem('browserSurvival.editorGemini', alt)), alterSchluessel);
  await seite.click('#links [data-reiter="🧱 Assets"]');

  schritt('Phase 5.5: Free-Modus – frei platzieren mit Winkel, Alt+Rad, Drehgriff, Undo, gedrehte Kollision');
  await asset('objekt:tisch');
  await seite.check('#optionen [data-o="frei"]');
  await seite.fill('#optionen [data-o="winkel"]', '30');
  const freiStelle = await seite.evaluate(async () => {
    const { pruefeObjekt } = await import('/editor/kern/platzierung.js');
    const w = window.mapEditor.werkzeuge;
    const k = window.mapEditor.zustand.karte;
    // freie Stelle suchen: Vorschau-Objekt muss gültig sein
    for (let y = 2; y < k.hoehe - 2; y++)
      for (let x = 2; x < k.breite - 2; x++) {
        const p = { wx: x + 0.37, wy: y + 0.61, tx: x, ty: y };
        const o = w.neuesObjekt(p);
        if (o.drehung === 30 && pruefeObjekt(k, o).ok) return { x: x + 0.37, y: y + 0.61, o };
      }
    return null;
  });
  pruefe(!!freiStelle && !Number.isInteger(freiStelle.o.x), `Freie Stelle, stufenlose Position (${JSON.stringify(freiStelle?.o)})`);
  const bildPunkt = (x, y) => seite.evaluate(([x, y]) => {
    const p = window.mapEditor.zeichner.zuBild(x, y);
    const r = document.getElementById('leinwand2d').getBoundingClientRect();
    return { x: r.left + p.x, y: r.top + p.y };
  }, [x, y]);
  const freiZiel = await bildPunkt(freiStelle.x, freiStelle.y);
  await seite.mouse.click(freiZiel.x, freiZiel.y);
  await seite.keyboard.press('Escape');
  await seite.keyboard.press('v');
  const tischId = await seite.evaluate(() => {
    const k = window.mapEditor.zustand.karte;
    const [id] = [...k.s('objekte')].find(([, o]) => o.typ === 'tisch' && o.drehung === 30) ?? [];
    if (id) window.mapEditor.zustand.waehle([{ s: 'objekte', k: id }]);
    return id;
  });
  pruefe(!!tischId, 'Tisch mit 30° gesetzt');
  const freiTisch = () => seite.evaluate((id) => window.mapEditor.zustand.karte.s('objekte').get(id), tischId);
  await seite.mouse.move(freiZiel.x, freiZiel.y);
  await seite.keyboard.down('Alt');
  await seite.mouse.wheel(0, 120);
  await seite.keyboard.up('Alt');
  pruefe((await freiTisch()).drehung === 35, `Alt+Rad dreht um 5° (${(await freiTisch()).drehung}°)`);
  await seite.waitForTimeout(700); // Rad-Folge abschließen (1 Undo-Schritt)
  const vorGriff = await freiTisch();
  const dGriff = await seite.evaluate(async (o) => (await import('/editor/kern/bearbeiten.js')).drehGriff(o), vorGriff);
  const gStart = await bildPunkt(dGriff.x, dGriff.y);
  const gRadius = Math.hypot(dGriff.x - dGriff.cx, dGriff.y - dGriff.cy);
  // Griff um die Mitte ziehen: von „oben“ nach „rechts“ (+90°), Umschalt = 15°-Raster
  const winkelNeu = Math.atan2(dGriff.y - dGriff.cy, dGriff.x - dGriff.cx) + Math.PI / 2;
  const gZiel = await bildPunkt(dGriff.cx + Math.cos(winkelNeu) * gRadius, dGriff.cy + Math.sin(winkelNeu) * gRadius);
  await seite.mouse.move(gStart.x, gStart.y);
  await seite.mouse.down();
  await seite.keyboard.down('Shift');
  await seite.mouse.move(gZiel.x, gZiel.y, { steps: 8 });
  await seite.keyboard.up('Shift');
  await seite.mouse.up();
  const nachGriff = await freiTisch();
  pruefe(nachGriff.drehung === 120 && nachGriff.b === vorGriff.h && nachGriff.h === vorGriff.b, `Drehgriff: 15°-Raster, längs → quer tauscht b/h (${JSON.stringify({ d: nachGriff.drehung, b: nachGriff.b, h: nachGriff.h })})`);
  await seite.screenshot({ path: path.join(AUSGABE, 'editor-20-frei.png') });
  await seite.keyboard.press('Control+z');
  const nachGriffUndo = await freiTisch();
  pruefe(nachGriffUndo.drehung === 35, `Undo: Griff-Zug = 1 Schritt (${nachGriffUndo.drehung}° · ${await seite.evaluate(() => JSON.stringify({ fokus: document.activeElement?.tagName + (document.activeElement?.dataset?.o ? ':' + document.activeElement.dataset.o : ''), z: window.mapEditor.zustand.verlauf.zurueck.slice(-3).map((e) => e.name), m: document.getElementById('status-meldung').textContent }))})`);
  const freiKollision = await seite.evaluate(async (o) => {
    const { Welt } = await import('/gemeinsam/welt/welt.js');
    const { bedeckteKacheln } = await import('/gemeinsam/welt/drehung.js');
    const k = window.mapEditor.zustand.karte;
    const welt = new Welt({ id: 'x', name: 'x', breite: k.breite, hoehe: k.hoehe, kacheln: Array.from({ length: k.hoehe }, () => '.'.repeat(k.breite)), objekte: [{ ...o, blockiert: true }], kachelGroesse: 32 });
    return bedeckteKacheln(o, k.breite).every((i) => welt.istBlockiert(i % k.breite, Math.floor(i / k.breite)));
  }, await freiTisch());
  pruefe(freiKollision, 'Spiel-Welt blockiert die Kacheln des gedrehten Tischs');
  await seite.uncheck('#optionen [data-o="frei"]');
  await seite.keyboard.press('Escape');
  await seite.click('#links [data-reiter="🧱 Assets"]');

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
    await seite.evaluate(() => window.mapEditor.layout.zeigeReiter('links', '🏠 Prefabs'));
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
    await seite.evaluate(() => window.mapEditor.layout.zeigeReiter('links', '🗺 Zonen'));
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
    await seite.waitForTimeout(250); // Optionsleiste baut nach dem Werkzeugwechsel neu (kann die Karte verschieben)
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
    const klaengeImSpiel = await seite.evaluate(() => ({ spiel: window.browserSurvival.spiel.klaenge?.eintraege.length, daten: window.browserSurvival.server.startZone.spielWelt.karte.daten.klaenge?.[0]?.daten?.slice(0, 14) }));
    pruefe(klaengeImSpiel.spiel === 1 && klaengeImSpiel.daten === 'data:audio/wav', `Klang im Testlauf eingebettet und geladen (${JSON.stringify(klaengeImSpiel)})`);
    const mischer = await seite.waitForFunction(() => window.browserSurvival.spiel?.renderer?.karte?.mischer?.length, null, { timeout: 15000 }).then((h) => h.jsonValue()).catch(() => 0);
    pruefe(mischer >= 1, `Eigenes Modell spielt im Spiel seine Leerlauf-Animation (${mischer} Mixer)`);
    await seite.waitForTimeout(1500);
    await seite.screenshot({ path: path.join(AUSGABE, 'editor-8-test-im-spiel.png') });

    schritt('Debug-Testlauf (8.1): Zeitlupe, Pause, Schritte, Overlays, Zombie-Info');
    pruefe(await seite.locator('#debug-lauf').count() === 1, 'Debug-Panel im Editor-Test sichtbar');
    // Zombie neben den Spieler setzen (Testzone hat evtl. keinen Spawn) – über den Server im selben Tab
    const zid = await seite.evaluate(async () => {
      const { erzeugeZombie } = await import('/server/spiel/entitaeten/zombie.js');
      const bs = window.browserSurvival;
      const w = bs.server.weltVon(bs.spiel.benutzername);
      const ich = w.holen(bs.spiel.eigeneId);
      const z = w.hinzufuegen(erzeugeZombie({ id: w.neueId(), x: ich.x + 64, y: ich.y, konfiguration: w.konfiguration }));
      return z.id;
    });
    const tickJetzt = () => seite.evaluate(() => window.browserSurvival.server.startZone.spielWelt.tick);
    // Echte Ticks/s lassen sich hier nicht messen (Software-Grafik blockiert die Seite, schon 1× schafft nur ~3 Ticks/s) –
    // geprüft wird der gemeinsame Takt; dass der Taktgeber ihn einhält, prüft tests/debugLauf.test.js
    await seite.click('#debug-lauf [data-tempo="0.25"]');
    const takt = await seite.evaluate(() => ({ server: window.browserSurvival.server.taktgeber.tickDauerMs, client: window.browserSurvival.spiel.schleife.tickDauerMs, laeuft: window.browserSurvival.server.taktgeber.laeuft }));
    pruefe(Math.abs(takt.server - 133.3) < 1 && takt.server === takt.client && takt.laeuft, `Zeitlupe 0,25×: Server + Client im selben Takt (${takt.server.toFixed(1)} ms statt 33,3)`);
    await seite.click('#debug-lauf [data-d="pause"]');
    const p0 = await tickJetzt();
    await seite.waitForTimeout(600);
    const p1 = await tickJetzt();
    await seite.click('#debug-lauf [data-schritt="10"]');
    const p2 = await tickJetzt();
    pruefe(p1 === p0 && p2 === p1 + 10, `Pause hält die Welt an, +10 = genau 10 Ticks (${p0} → ${p1} → ${p2})`);
    await seite.click('#debug-lauf [data-schritt="1"]');
    pruefe((await tickJetzt()) === p2 + 1, '+1 = ein Tick');
    await seite.waitForTimeout(300);
    const snap = await seite.evaluate((id) => {
      const s = window.browserSurvival.debug.schnappschuss;
      return { zombie: s.zombies.some((z) => z.id === id), radien: s.radien, spawns: s.spawns.length, loot: s.loot.length };
    }, zid);
    pruefe(snap.zombie && snap.radien.bemerk > 0, `Overlay-Daten: Zombie + Radien (${JSON.stringify(snap)})`);
    // Info: 🔍 an, auf den Zombie klicken → Info-Karte, kein Schuss
    await seite.click('#debug-lauf [data-d="info"]');
    const zp = await seite.evaluate((id) => {
      const bs = window.browserSurvival;
      const z = bs.server.weltVon(bs.spiel.benutzername).holen(id);
      const p = bs.spiel.renderer.kamera.weltZuBildschirm(z.x, z.y);
      const r = document.getElementById('spielflaeche').getBoundingClientRect();
      return { x: r.left + p.x, y: r.top + p.y };
    }, zid);
    const schuesseVor = await seite.evaluate(() => window.browserSurvival.server.weltVon(window.browserSurvival.spiel.benutzername).holen(window.browserSurvival.spiel.eigeneId).inventar.map((e) => e?.magazin ?? 0).join(','));
    await seite.mouse.click(zp.x, zp.y);
    await seite.waitForTimeout(400);
    const infoText = await seite.locator('#debug-lauf .dl-karte').textContent();
    pruefe(infoText.includes(`#${zid}`) && infoText.includes('Leben'), `Klick auf Zombie zeigt die Info-Karte (${infoText.split('\n')[0]})`);
    const schuesseNach = await seite.evaluate(() => window.browserSurvival.server.weltVon(window.browserSurvival.spiel.benutzername).holen(window.browserSurvival.spiel.eigeneId).inventar.map((e) => e?.magazin ?? 0).join(','));
    pruefe(schuesseVor === schuesseNach, 'Info-Klick schießt nicht');
    await seite.screenshot({ path: path.join(AUSGABE, 'editor-21-debuglauf.png') });
    await seite.click('#debug-lauf [data-d="info"]');
    await seite.click('#debug-lauf [data-d="pause"]');
    await seite.click('#debug-lauf [data-tempo="1"]');
    pruefe(await seite.evaluate(() => window.browserSurvival.server.taktgeber.laeuft && window.browserSurvival.server.taktgeber.tickDauerMs < 34), 'Weiter mit 1× läuft wieder normal');
    await seite.click('#editor-test-banner a');
    await seite.waitForFunction(() => window.mapEditor?.zustand.karte, null, { timeout: 20000 });
    const zurueck = await seite.evaluate(() => ({ id: window.mapEditor.zustand.aktivId, zonen: window.mapEditor.zustand.zonen.size }));
    pruefe(zurueck.id === 'testzone' && zurueck.zonen >= 3, `zurück im Editor, alles da (${JSON.stringify(zurueck)})`);
  }

  if (!nurBis) {
    schritt('Phase 6.1: Zonen-Manager – ausblenden/sperren je Zone, Farbe, Undo, Ablage + Einsetzen, Zone archivieren + zurückholen');
    const zm = (code, arg) => seite.evaluate(code, arg);
    await zm(() => {
      const z = window.mapEditor.zustand;
      z.ausfuehren('Hasen für den Test', [{ s: 'tierBereiche', k: z.karte.naechsteId, neu: { x: 1, y: 1, b: 3, h: 3, art: 'hase', anzahl: 1 } }]);
    });
    await seite.click('#rechts [data-reiter="▭ Bereiche"]');
    await seite.waitForSelector('#rechts .zonen-liste [data-schl^="tierBereiche|"]');
    const tierSchl = await seite.getAttribute('#rechts .zonen-liste [data-schl^="tierBereiche|"]', 'data-schl');
    const tierId = Number(tierSchl.split('|')[1]);
    // Schalter klicken, bis die Liste den neuen Zustand zeigt (der Reiter zeichnet nach Kartenänderungen verzögert neu)
    const schalte = async (feld, ziel) => {
      for (let i = 0; i < 3; i++) {
        await seite.click(`#rechts [data-schl="${tierSchl}"] [data-z="${feld}"]`);
        if (await seite.waitForSelector(`#rechts [data-schl="${tierSchl}"] [data-z="${feld}"][aria-pressed="${ziel}"]`, { timeout: 2000 }).then(() => true).catch(() => false)) return;
      }
    };
    await schalte('aus', 'false');
    pruefe(!(await zm((id) => window.mapEditor.zustand.zoneFrei('tierBereiche', id), tierId)), 'Zone ausgeblendet → nicht anklickbar');
    await seite.keyboard.press('Control+z');
    pruefe(await zm((id) => window.mapEditor.zustand.zoneFrei('tierBereiche', id), tierId), 'Ausblenden ist rückgängig machbar');
    await seite.waitForSelector(`#rechts [data-schl="${tierSchl}"] [data-z="aus"][aria-pressed="true"]`);
    await schalte('sperre', 'true');
    const gesperrt = await zm((id) => {
      const z = window.mapEditor.zustand;
      z.ausfuehren('Versuch', [{ s: 'tierBereiche', k: id, neu: null }]);
      return z.karte.s('tierBereiche').has(id);
    }, tierId);
    pruefe(gesperrt, 'Gesperrte Zone bleibt bei Änderungen unverändert');
    await schalte('sperre', 'false');
    await seite.locator(`#rechts [data-schl="${tierSchl}"] input[data-z="farbe"]`).evaluate((f) => {
      f.value = '#ff00aa';
      f.dispatchEvent(new Event('change', { bubbles: true }));
    });
    pruefe((await zm(() => window.mapEditor.zustand.karte.werte.zonenAnzeige)) && JSON.stringify(await zm(() => window.mapEditor.zustand.karte.werte.zonenAnzeige)).includes('#ff00aa'), 'Zonen-Farbe gespeichert');
    await seite.click(`#rechts [data-schl="${tierSchl}"] [data-z="ablage"]`);
    await seite.click(`#rechts [data-schl="${tierSchl}"] [data-z="loeschen"]`);
    await seite.click('#dialog button:has-text("Löschen")');
    pruefe((await zm(() => window.mapEditor.zustand.karte.s('tierBereiche').size)) === 0, 'Zone gelöscht');
    await seite.click('#rechts .ablage-liste [data-a="einsetzen"]');
    pruefe((await zm(() => window.mapEditor.zustand.karte.s('tierBereiche').size)) === 1, 'Aus der Ablage wieder eingesetzt');
    await seite.screenshot({ path: path.join(AUSGABE, 'editor-15-bereiche.png') });
    // Welt-Zone archivieren statt löschen und zurückholen
    await zm(() => {
      window.mapEditor.aktionen.zoneEntfernen('waldweg'); // nicht abwarten: wartet auf die Dialog-Antwort
    });
    await seite.click('#dialog button:has-text("Archivieren")');
    await seite.waitForFunction(() => !window.mapEditor.zustand.zonen.has('waldweg'));
    pruefe((await zm(async () => Object.keys(await window.mapEditor.zustand.archiv()))).includes('waldweg'), 'Zone archiviert (nicht gelöscht)');
    await seite.evaluate(() => window.mapEditor.layout.zeigeReiter('links', '🗺 Zonen'));
    await seite.click('#links [data-archiv="waldweg"] [data-a="zurueck"]');
    await seite.waitForFunction(() => window.mapEditor.zustand.zonen.has('waldweg'));
    pruefe((await zm(async () => Object.keys(await window.mapEditor.zustand.archiv()).length)) === 0, 'Zone aus dem Archiv zurückgeholt');
    await zm(() => window.mapEditor.zustand.aktiviere('testzone'));
    await seite.click('#links [data-reiter="🧱 Assets"]');
  }

  if (!nurBis) {
    schritt('Phase 6.2: Loot-Zone ziehen, Item-Chancen, erwartete Ausbeute, Prüfung');
    await seite.evaluate(() => window.mapEditor.zeichner.einpassen());
    await asset('bereich:loot');
    await ziehe([1, 1], [5, 3]);
    const lz = await seite.evaluate(() => [...window.mapEditor.zustand.karte.s('lootZonen')].map(([id, z]) => ({ id, b: z.b, h: z.h, n: z.eintraege.length }))[0]);
    pruefe(lz && lz.b === 5 && lz.h === 3 && lz.n > 0, `Loot-Zone gezogen mit Startliste (${JSON.stringify(lz)})`);
    await seite.click('#rechts [data-reiter="Inspektor"]');
    await seite.waitForSelector('#rechts .loot-ausbeute table');
    await seite.selectOption('#rechts [name="modus"]', 'chance');
    await seite.waitForFunction((id) => window.mapEditor.zustand.karte.s('lootZonen').get(id).modus === 'chance', lz.id);
    const summe = await seite.evaluate((id) => window.mapEditor.zustand.karte.s('lootZonen').get(id).eintraege.reduce((s, e) => s + e.chance, 0), lz.id);
    pruefe(Math.abs(summe - 100) < 1, `Wechsel auf exakte Chancen ergibt ~100 % (${summe})`);
    await seite.evaluate((id) => {
      const z = window.mapEditor.zustand;
      const alt = z.karte.s('lootZonen').get(id);
      z.ausfuehren('Test', [{ s: 'lootZonen', k: id, neu: { ...alt, eintraege: [...alt.eintraege, { id: 'gibtsnicht', chance: 50 }] } }]);
    }, lz.id);
    const codes = await seite.evaluate(async () => (await import('/editor/kern/validierung.js')).validiere(window.mapEditor.zustand.karte).filter((p) => p.code.startsWith('loot-zone')).map((p) => p.text));
    pruefe(codes.some((t) => t.includes('gibtsnicht')), `Prüfung meldet unbekanntes Item (${codes.length} Meldungen)`);
    await seite.keyboard.press('Control+z');
    await seite.screenshot({ path: path.join(AUSGABE, 'editor-16-lootzone.png') });

    schritt('Phase 6.3/6.4: Loot-Vorlage speichern + verknüpfen + nachziehen, Loot per Taste O ausblenden, Dichte-Heatmap');
    await seite.click('#rechts .loot-vorlage [data-v="speichern"]');
    await seite.fill('#dialog [name="name"]', 'Rauchtest-Vorlage');
    await seite.click('#dialog button:has-text("Speichern")');
    await seite.waitForFunction((id) => window.mapEditor.zustand.karte.s('lootZonen').get(id).vorlage, lz.id);
    const vid = await seite.evaluate((id) => window.mapEditor.zustand.karte.s('lootZonen').get(id).vorlage, lz.id);
    // zweite Zone verknüpfen, dann Vorlage aus der ersten aktualisieren → zweite zieht nach
    const zweite = await seite.evaluate((vorlage) => {
      const z = window.mapEditor.zustand;
      const nr = z.karte.naechsteId;
      z.ausfuehren('Zweite Zone', [{ s: 'lootZonen', k: nr, neu: { name: 'Zwei', x: 10, y: 8, b: 3, h: 3, modus: 'gewicht', punkte: 2, ort: 'alle', eintraege: [{ id: 'apfel', gewicht: 1 }], vorlage } }]);
      return nr;
    }, vid);
    await seite.evaluate((id) => {
      const z = window.mapEditor.zustand;
      const alt = z.karte.s('lootZonen').get(id);
      z.ausfuehren('Chance ändern', [{ s: 'lootZonen', k: id, neu: { ...alt, eintraege: [{ id: 'verband', chance: 42 }] } }]);
    }, lz.id);
    await seite.evaluate((id) => window.mapEditor.zustand.waehle([{ s: 'lootZonen', k: id }]), lz.id);
    await seite.waitForSelector('#rechts .loot-vorlage [data-v="aktualisieren"]');
    await seite.click('#rechts .loot-vorlage [data-v="aktualisieren"]');
    await seite.click('#dialog button:has-text("Aktualisieren")');
    await seite.waitForFunction((n) => window.mapEditor.zustand.karte.s('lootZonen').get(n).eintraege[0]?.chance === 42, zweite);
    pruefe(true, 'Vorlage aktualisiert → verknüpfte Zone zieht nach');
    await seite.keyboard.press('Escape');
    await seite.mouse.click(5, 450);
    await seite.keyboard.press('o');
    pruefe(!(await seite.evaluate(() => window.mapEditor.zustand.sichtbar('loot'))), 'Taste O blendet Loot aus');
    await seite.keyboard.press('o');
    await seite.keyboard.press('Shift+O');
    pruefe(await seite.evaluate(() => window.mapEditor.zustand.sichtbar('lootDichte')), 'Umschalt+O zeigt die Dichte-Heatmap');
    await seite.screenshot({ path: path.join(AUSGABE, 'editor-17-lootdichte.png') });
    await seite.keyboard.press('Shift+O');
    await seite.keyboard.press('Escape');
  }

  if (!nurBis) {
    schritt('Auto-Fix (8.2): Vorschau, alle eindeutigen beheben = 1 Undo-Schritt');
    const af = await seite.evaluate(() => {
      const m = window.mapEditor;
      const k = m.zustand.karte;
      // Zombie-Spawn unter einem Tisch (marker-blockiert) + Tisch über den Rand (objekt-rand)
      let frei = null;
      for (let y = 2; y < k.hoehe - 2 && !frei; y++) for (let x = 2; x < k.breite - 3 && !frei; x++) if (k.kachelAn(x, y) === ',' && !k.markerAn(x, y) && !k.objektBei(x + 0.5, y + 0.5)) frei = { x, y };
      m.zustand.ausfuehren('Testfälle', [
        { s: 'marker', k: m.markerSchluessel(frei.x, frei.y), neu: { art: 'zombie' } },
        { s: 'objekte', k: k.naechsteId, neu: { typ: 'tisch', x: frei.x, y: frei.y, b: 1, h: 1, blockiert: true } },
        { s: 'objekte', k: k.naechsteId + 1, neu: { typ: 'tisch', x: k.breite - 1, y: k.hoehe - 1, b: 2, h: 1, blockiert: true } },
      ]);
      return { frei, schritte: m.zustand.verlauf.zurueck.length };
    });
    await seite.waitForTimeout(600); // Prüfung läuft verzögert
    await seite.click('#rechts [data-reiter^="Prüfung"]');
    await seite.waitForSelector('#rechts .auto-fix-alle');
    await seite.click('#rechts .auto-fix-alle');
    await seite.waitForSelector('#dialog button.akzent:has-text("Übernehmen")');
    const vorschauText = await seite.locator('#dialog').textContent();
    const markiert = await seite.evaluate(() => window.mapEditor.zeichner.ueberlagerungen.length);
    pruefe(vorschauText.includes('Zombie-Spawn') && vorschauText.includes('in die Zone') && markiert >= 4, `Vorschau listet beide Fälle und markiert sie (${markiert} Markierungen)`);
    await seite.screenshot({ path: path.join(AUSGABE, 'editor-22-autofix.png') });
    await seite.click('#dialog button.akzent:has-text("Übernehmen")');
    await seite.waitForTimeout(600);
    const nachFix = await seite.evaluate(({ frei }) => {
      const m = window.mapEditor;
      return { marker: !!m.zustand.karte.markerAn(frei.x, frei.y), schritte: m.zustand.verlauf.zurueck.length, offen: m.zustand.validierung.filter((e) => ['marker-blockiert', 'objekt-rand'].includes(e.code)).length };
    }, af);
    pruefe(!nachFix.marker && nachFix.offen === 0 && nachFix.schritte === af.schritte + 1, `Beide behoben in einem Undo-Schritt (${JSON.stringify(nachFix)})`);
    await seite.keyboard.press('Escape');
    await seite.click('#leinwand2d', { position: { x: 5, y: 450 } }).catch(() => {});
    await seite.keyboard.press('Control+z');
    pruefe(await seite.evaluate(({ frei }) => !!window.mapEditor.zustand.karte.markerAn(frei.x, frei.y), af), 'Strg+Z nimmt den Auto-Fix zurück');
    await seite.keyboard.press('Control+z');
  }

  if (!nurBis) {
    schritt('Touch (Handy): Ansehen + Schwenken mit dem Finger');
    const handy = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    const h = await handy.newPage();
    h.on('pageerror', (e) => fehler.push(`Seitenfehler (Handy): ${e.message}`));
    await h.goto(`${basis}/editor/`);
    await h.waitForFunction(() => window.mapEditor, null, { timeout: 15000 });
    await h.evaluate(() => window.mapEditor.bereit);
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

    schritt('Touch-Bauen (7.6): Geist + ✓ Setzen, Griff skalieren, Langdruck-Menü, Pinsel mit Fadenkreuz');
    const finger = async (art, x, y) => cdp.send('Input.dispatchTouchEvent', { type: art, touchPoints: art === 'touchEnd' ? [] : punkt(x, y) });
    const tippe = async (x, y, ms = 60) => {
      await finger('touchStart', x, y);
      await h.waitForTimeout(ms);
      await finger('touchEnd');
      await h.waitForTimeout(120);
    };
    const ziehe = async (x0, y0, x1, y1, { schritte = 8, bild = null } = {}) => {
      await finger('touchStart', x0, y0);
      for (let i = 1; i <= schritte; i++) await finger('touchMove', x0 + ((x1 - x0) * i) / schritte, y0 + ((y1 - y0) * i) / schritte);
      if (bild) await h.screenshot({ path: path.join(AUSGABE, bild) });
      await finger('touchEnd');
      await h.waitForTimeout(150);
    };
    // Freie Stelle für einen Tisch suchen und dorthin zoomen (Bildmitte = Fadenkreuz-Ziel)
    const ort = await h.evaluate(async () => {
      const m = window.mapEditor;
      const { pruefeObjekt } = await import('/editor/kern/platzierung.js');
      m.aktionen.werkzeug('auswahl');
      m.assets.waehleId('objekt:tisch');
      const e = m.zustand.eintrag;
      const k = m.zustand.karte;
      for (let y = 20; y < k.hoehe - 20; y++)
        for (let x = 20; x < k.breite - 20; x++)
          if ([0, 1, 2, 3].every((d) => pruefeObjekt(k, { typ: e.typ, x: x - 2 + d, y, b: e.b, h: e.h }).ok)) {
            m.zeichner.springeZu(x, y, 24);
            return { x, y, b: e.b, h: e.h };
          }
      return null;
    });
    pruefe(!!ort, 'freie Stelle für den Tisch gefunden');
    await h.waitForTimeout(150);
    const bildpunkt = (x, y) => h.evaluate(([x, y]) => window.mapEditor.zeichner.zuBild(x, y), [x, y]);
    const lw = await h.locator('#leinwand2d').boundingBox();
    const mitteB = await bildpunkt(ort.x + 0.5, ort.y + 0.5);
    const [cx, cy] = [lw.x + mitteB.x, lw.y + mitteB.y];
    const objZahl = () => h.evaluate(() => window.mapEditor.zustand.karte.s('objekte').size);
    const vorObj = await objZahl();
    await tippe(cx, cy + 64); // Finger unter dem Ziel → Fadenkreuz trifft die Mitte
    const geist = await h.evaluate(() => ({ leiste: !document.querySelector('.touch-bestaetigen').hidden, gueltig: window.mapEditor.zeichner.vorschau?.gueltig, offen: !!window.mapEditor.touch.offen }));
    pruefe(geist.leiste && geist.offen && (await objZahl()) === vorObj, `Tippen zeigt nur den Geist + ✓/✕ (${JSON.stringify(geist)})`);
    pruefe(geist.gueltig === true, 'Geist liegt unter dem Fadenkreuz auf freiem Platz (grün)');
    await h.screenshot({ path: path.join(AUSGABE, 'editor-18-touch-geist.png') });
    await h.tap('.touch-bestaetigen [data-t="setzen"]');
    await h.waitForTimeout(150);
    const gesetzt = await h.evaluate(() => {
      const m = window.mapEditor;
      const g = m.zustand.gewaehlte()[0];
      return { n: m.zustand.karte.s('objekte').size, g: g?.wert, k: g?.k, leiste: !document.querySelector('.touch-bestaetigen').hidden };
    });
    pruefe(gesetzt.n === vorObj + 1 && !gesetzt.leiste, '✓ Setzen legt den Tisch an');
    pruefe(gesetzt.g && Math.abs(gesetzt.g.x + gesetzt.g.b / 2 - (ort.x + 0.5)) <= 1 && Math.abs(gesetzt.g.y + gesetzt.g.h / 2 - (ort.y + 0.5)) <= 1, `Tisch sitzt am Fadenkreuz, nicht unter dem Finger (${JSON.stringify(gesetzt.g)})`);
    // Griffe: Auswahl-Werkzeug, Skalier-Griff ziehen (+2 Kacheln) = 1 Undo-Schritt
    await h.evaluate(() => window.mapEditor.aktionen.werkzeug('auswahl'));
    await h.waitForTimeout(100);
    const griffe = await h.evaluate(() => window.mapEditor.touch.griffe());
    pruefe(['bewegen', 'drehen', 'skalieren'].every((id) => griffe.some((g) => g.id === id)), `große Griffe am gewählten Tisch (${griffe.map((g) => g.id).join(', ')})`);
    const sk = griffe.find((g) => g.id === 'skalieren');
    if (sk) {
      await ziehe(lw.x + sk.x, lw.y + sk.y, lw.x + sk.x + 48, lw.y + sk.y, { bild: 'editor-18-touch-griff.png' });
      const breite = await h.evaluate((k) => window.mapEditor.zustand.karte.s('objekte').get(k).b, gesetzt.k);
      pruefe(breite === gesetzt.g.b + 2, `Skalier-Griff macht den Tisch 2 Kacheln breiter (${gesetzt.g.b} → ${breite})`);
      await h.tap('#handy-leiste [data-befehl="bearbeiten.rueckgaengig"]');
      await h.waitForTimeout(400); // Tipp direkt nach dem Wisch: Klick kommt ggf. erst über den Editor-Ersatz (main.js fingerTipp, 300 ms)
      const zurueck = await h.evaluate((k) => window.mapEditor.zustand.karte.s('objekte').get(k).b, gesetzt.k);
      pruefe(zurueck === gesetzt.g.b, 'Handy-Leiste ↶ nimmt das Skalieren in einem Schritt zurück');
    }
    // Langdruck auf den Tisch = Kontextmenü
    await finger('touchStart', cx, cy);
    await h.waitForTimeout(800);
    await finger('touchEnd');
    await h.waitForTimeout(150);
    pruefe(await h.locator('.menue-liste [data-befehl="bearbeiten.duplizieren"]').count() === 1, 'Langdruck öffnet das Kontextmenü');
    pruefe((await objZahl()) === vorObj + 1, 'Langdruck hat nichts verschoben/gesetzt');
    await h.keyboard.press('Escape');
    pruefe(await h.locator('.menue-liste').count() === 0, 'Esc schließt das Kontextmenü');
    // Pinsel: Strich mit dem Finger 2 Kacheln unter der Zielreihe → gemalt wird in der Reihe am Fadenkreuz
    const mal = await h.evaluate(([x, y]) => {
      const m = window.mapEditor;
      const k = m.zustand.karte;
      m.zustand.leereAuswahl();
      const zeichen = ['_', '=', '-', '.'].find((z) => [x - 1, x, x + 1].every((xx) => k.kachelAn(xx, y + 3) !== z));
      m.assets.waehleId(`kachel:${zeichen}`);
      m.zustand.malModus = 'pinsel';
      m.zustand.pinselGroesse = 1;
      return { zeichen, unten: [x - 1, x, x + 1].map((xx) => k.kachelAn(xx, y + 6)) };
    }, [ort.x, ort.y]);
    const reihe = await bildpunkt(ort.x + 0.5, ort.y + 3.5);
    await ziehe(cx - 24, lw.y + reihe.y + 64, cx + 24, lw.y + reihe.y + 64, { bild: 'editor-18-touch-lupe.png' });
    const gemalt = await h.evaluate(([x, y]) => [x - 1, x, x + 1].map((xx) => window.mapEditor.zustand.karte.kachelAn(xx, y + 3)), [ort.x, ort.y]);
    pruefe(gemalt.every((z) => z === mal.zeichen), `Pinsel malt am Fadenkreuz (${gemalt.join('')} statt ${mal.zeichen.repeat(3)})`);
    const unten = await h.evaluate(([x, y]) => [x - 1, x, x + 1].map((xx) => window.mapEditor.zustand.karte.kachelAn(xx, y + 6)), [ort.x, ort.y]);
    pruefe(unten.join('') === mal.unten.join(''), 'unter dem Finger bleibt alles unverändert');
    // Werkstatt am Handy: Bühne + Seite gestapelt, mit dem Finger malen
    const schildId = await h.evaluate(async (bytes) => (await window.mapEditor.bibliothek.fuegeHinzu(new Uint8Array(bytes), { name: 'Handy-Schild' })).meta.id, [...platte()]);
    await h.evaluate((id) => void window.mapEditor.aktionen.werkstatt(id), schildId);
    await h.waitForSelector('.werkstatt canvas');
    await h.tap('.werkstatt [data-modus="malen"]');
    await h.waitForTimeout(400); // wie oben: Tipp nach dem Pinsel-Wisch (fingerTipp-Ersatz)
    const hb = await h.locator('.werkstatt-buehne').boundingBox();
    const mitte = [hb.x + hb.width / 2, hb.y + hb.height / 2];
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: punkt(mitte[0] - 20, mitte[1]) });
    for (let i = 1; i <= 4; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: punkt(mitte[0] - 20 + i * 10, mitte[1]) });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    const handyMalen = await h.evaluate(async () => {
      const w = (await import('/editor/ui/werkstatt.js')).aktiveWerkstatt();
      return { map: !!w?.materialien()[0].map, speichern: !!document.querySelector('.werkstatt [data-a="speichern"]')?.getBoundingClientRect().width };
    });
    pruefe(handyMalen.map && handyMalen.speichern, `Werkstatt am Handy: mit dem Finger gemalt (${JSON.stringify(handyMalen)})`);
    await h.screenshot({ path: path.join(AUSGABE, 'editor-17-werkstatt-handy.png') });
    await handy.close();
  }

  {
    schritt('Audio-Zentrale + lokaler Editor-Server (Phase 10): WAV hochladen → kürzen → speichern → Spiel spielt sie');
    const lokalPort = port + 1;
    const lokal = spawn(process.execPath, ['werkzeuge/editor/lokalerServer.mjs', '--port', String(lokalPort)], { cwd: WURZEL, stdio: ['ignore', 'pipe', 'pipe'] });
    let lokalLog = '';
    lokal.stdout.on('data', (d) => (lokalLog += d));
    lokal.stderr.on('data', (d) => (lokalLog += d));
    const testDatei = path.join(WURZEL, 'client/audio/eigene/ui_klick.ogg');
    try {
      for (let i = 0; i < 50 && !lokalLog.includes('läuft'); i++) await new Promise((r) => setTimeout(r, 100));
      pruefe(!existsSync(testDatei), 'vorher keine eigene ui_klick-Datei (Test räumt selbst auf)');
      const az = await browser.newPage({ viewport: { width: 1400, height: 900 } });
      az.on('pageerror', (e) => fehler.push(`Seitenfehler (Audio): ${e.message}`));
      const lb = `http://localhost:${lokalPort}`;
      await az.goto(`${lb}/editor/`);
      await az.waitForFunction(() => window.mapEditor, null, { timeout: 15000 });
      await az.evaluate(() => window.mapEditor.bereit);
      await az.keyboard.press('Shift+A');
      await az.waitForSelector('.audiozentrale .az-zeile');
      pruefe(await az.waitForSelector('.az-lokal.ok', { timeout: 8000 }).then(() => true, () => false), 'Audio-Zentrale erkennt den lokalen Server');
      const zahlen = await az.evaluate(() => [...document.querySelectorAll('.az-gruppen button')].map((b) => b.textContent.trim()));
      pruefe(zahlen.length === 11 && zahlen.some((t) => t.includes('Tiere')) && zahlen.some((t) => t.includes('Musik')), `Gruppen links (${zahlen.length})`);
      await az.fill('.az-suche', 'klick');
      pruefe(await az.locator('.az-zeile[data-id="ereignis:ui_klick"]').count() === 1, 'Suche findet „Klick“');
      await az.click('.az-zeile[data-id="ereignis:ui_klick"] .az-name');
      // WAV (2 s, Ton) über das Datei-Feld hochladen
      const rate = 22050;
      const n = rate * 2;
      const wav = Buffer.alloc(44 + n * 2);
      wav.write('RIFF', 0);
      wav.writeUInt32LE(36 + n * 2, 4);
      wav.write('WAVEfmt ', 8);
      wav.writeUInt32LE(16, 16);
      wav.writeUInt16LE(1, 20);
      wav.writeUInt16LE(1, 22);
      wav.writeUInt32LE(rate, 24);
      wav.writeUInt32LE(rate * 2, 28);
      wav.writeUInt16LE(2, 32);
      wav.writeUInt16LE(16, 34);
      wav.write('data', 36);
      wav.writeUInt32LE(n * 2, 40);
      for (let i = 0; i < n; i++) wav.writeInt16LE(Math.round(Math.sin((2 * Math.PI * 660 * i) / rate) * 9000), 44 + i * 2);
      await az.setInputFiles('.az-datei', { name: 'klick test.wav', mimeType: 'audio/wav', buffer: wav });
      await az.waitForSelector('.az-werkbank canvas');
      // Kürzen: Start 0,2 s, Ende 0,7 s per Feld
      await az.fill('.az-felder [data-f=start]', '0.2');
      await az.press('.az-felder [data-f=start]', 'Tab');
      await az.fill('.az-felder [data-f=ende]', '0.7');
      await az.press('.az-felder [data-f=ende]', 'Tab');
      const ergebnis = await az.locator('.az-ergebnis').textContent();
      pruefe(/0,5 s/.test(ergebnis), `Ergebnis-Anzeige nach dem Kürzen (${ergebnis.trim()})`);
      await az.click('.az-werkbank [data-a=undo]');
      pruefe(/1,8 s/.test(await az.locator('.az-ergebnis').textContent()), 'Rückgängig in der Werkbank (Ende wieder ganz → 1,8 s)');
      await az.click('.az-werkbank [data-a=redo]');
      await az.click('.az-werkbank [data-a=vor]');
      await az.screenshot({ path: path.join(AUSGABE, 'editor-19-audiozentrale.png') });
      await az.click('.az-werkbank [data-a=ersatz]');
      await az.waitForFunction(() => /Gespeichert/.test(document.getElementById('status-meldung').textContent), null, { timeout: 15000 });
      const gespeichert = await az.evaluate(async () => {
        const r = await fetch('/client/audio/eigene/ui_klick.ogg', { cache: 'no-store' });
        const b = await r.arrayBuffer();
        const groesse = b.byteLength;
        const p = await new AudioContext().decodeAudioData(b);
        const index = await (await fetch('/client/audio/eigene/eigene.json', { cache: 'no-store' })).json();
        return { ok: r.ok, groesse, dauer: p.duration, index: index.ui_klick?.dateien };
      });
      pruefe(gespeichert.ok && Math.abs(gespeichert.dauer - 0.5) < 0.02, `Datei liegt gekürzt im Ordner (${gespeichert.dauer?.toFixed(3)} s, ${gespeichert.groesse} B)`);
      pruefe(gespeichert.groesse < 20000, 'kompakt gespeichert (< 20 KB statt ~88 KB WAV)');
      pruefe(JSON.stringify(gespeichert.index) === '["ui_klick.ogg"]', 'eigene.json automatisch neu gebaut');
      // Spiel: lädt die eigene Datei
      await az.goto(`${lb}/client/`);
      await az.waitForSelector('#login-editor', { state: 'attached', timeout: 20000 });
      await az.mouse.click(10, 10);
      await az.waitForFunction(() => window.browserSurvival?.sound?.quelleVon('ui_klick') === 'eigen', null, { timeout: 15000 }).catch(() => {});
      pruefe(await az.evaluate(() => window.browserSurvival.sound.quelleVon('ui_klick')) === 'eigen', 'Spiel spielt die neue Datei (Quelle „eigen“)');
      // ↺ Original über die Zentrale
      await az.goto(`${lb}/editor/`);
      await az.evaluate(() => window.mapEditor.bereit);
      await az.evaluate(() => window.mapEditor.aktionen.audioZentrale('ereignis:ui_klick').bereit);
      await az.click('.az-detail [data-a=original]');
      await az.click('#dialog .knopfreihe button.gefahr, #dialog .knopfreihe button.akzent');
      await az.waitForFunction(() => /Original/.test(document.getElementById('status-meldung').textContent), null, { timeout: 10000 });
      pruefe(!existsSync(testDatei), '↺ Original löscht die Datei wieder');
      await az.close();
    } finally {
      lokal.kill();
      if (existsSync(testDatei)) {
        rmSync(testDatei);
        execSync('npm run sounds', { cwd: WURZEL, stdio: 'ignore' });
      }
    }
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
