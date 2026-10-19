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
 * Audio-Bibliothek + Klänge (Phase 4), Modell-Werkstatt (5.1) mit Material/Malen/Aufklebern (5.2) und Animationen/Gelenken (5.3, auch im Spiel).
 */
import { spawn, execSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
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
    const klaengeImSpiel = await seite.evaluate(() => ({ spiel: window.browserSurvival.spiel.klaenge?.eintraege.length, daten: window.browserSurvival.server.startZone.spielWelt.karte.daten.klaenge?.[0]?.daten?.slice(0, 14) }));
    pruefe(klaengeImSpiel.spiel === 1 && klaengeImSpiel.daten === 'data:audio/wav', `Klang im Testlauf eingebettet und geladen (${JSON.stringify(klaengeImSpiel)})`);
    const mischer = await seite.waitForFunction(() => window.browserSurvival.spiel?.renderer?.karte?.mischer?.length, null, { timeout: 15000 }).then((h) => h.jsonValue()).catch(() => 0);
    pruefe(mischer >= 1, `Eigenes Modell spielt im Spiel seine Leerlauf-Animation (${mischer} Mixer)`);
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
    // Werkstatt am Handy: Bühne + Seite gestapelt, mit dem Finger malen
    const schildId = await h.evaluate(async (bytes) => (await window.mapEditor.bibliothek.fuegeHinzu(new Uint8Array(bytes), { name: 'Handy-Schild' })).meta.id, [...platte()]);
    await h.evaluate((id) => void window.mapEditor.aktionen.werkstatt(id), schildId);
    await h.waitForSelector('.werkstatt canvas');
    await h.tap('.werkstatt [data-modus="malen"]');
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
