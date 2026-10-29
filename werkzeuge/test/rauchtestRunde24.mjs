#!/usr/bin/env node
/**
 * Rauchtest Runde 24 (Lokal-Modus, echter Browser): prüft die Neuerungen je Phase und macht Screenshots.
 *
 *   npm run rauchtest:r24                 alle Phasen
 *   npm run rauchtest:r24 -- --phase 1    nur Phase 1 (mehrere: --phase 1,2; Phasen siehe KONZEPT_RUNDE24.md)
 *
 * Screenshots: werkzeuge/test/ausgabe/r24_*.png · Exit-Code 1 bei Seiten-/Konsolenfehlern oder fehlgeschlagener Prüfung.
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
const port = Number(argumente[argumente.indexOf('--port') + 1]) || 8095;
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

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
try {
  const seite = await browser.newPage({ viewport: { width: 1100, height: 680 } });
  seite.on('pageerror', (e) => fehler.push(`pageerror: ${e.message}`));
  seite.on('console', (m) => m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text()) && fehler.push(`console: ${m.text()}`));
  const bild = (name) => seite.screenshot({ path: path.join(AUSGABE, `r24_${name}.png`) });
  /** Server-Spieler (eigene Figur) in der aktuellen Zone → fn(ich, welt) im Browser */
  const amServer = (fn, arg) =>
    seite.evaluate(
      ([quelle, a]) => {
        const srv = browserSurvival.server;
        for (const z of srv.zonen.values()) {
          if (z.spielWelt.karte.daten.id !== browserSurvival.spiel.welt.id) continue; // IDs gibt es in jeder Zone
          const ich = z.spielWelt.holen(browserSurvival.spiel.eigeneId);
          if (ich?.typ === 'spieler') return new Function('ich', 'welt', 'a', quelle)(ich, z.spielWelt, a);
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
  await seite.fill('#login-name', `R24_${Date.now() % 1000}`);
  await seite.click('#login-knopf');
  await seite.waitForSelector('#laden', { state: 'hidden', timeout: 60000 });
  await amServer('ich.gottmodus = true;');
  schritt('im Spiel (lokal)');

  // ---------------------------------------------------------------- Phase 1 (Wind & Wände)
  if (phaseAn(1)) {
    await seite.mouse.click(550, 340); // Ton entsperren
    await seite.waitForTimeout(4000);
    const wind = await seite.evaluate(() => ({ quelle: browserSurvival.sound?.quelleVon('wind_leicht'), stufe: browserSurvival.spiel.renderer.wetterEffekt.windStufe, grund: browserSurvival.spiel.renderer.wetterEffekt.grundWind }));
    pruefe(wind.quelle === 'eigen', `Windaufnahme geladen (${wind.quelle})`);
    pruefe(Number.isFinite(wind.stufe) && wind.grund >= 0, `Windstufe ${wind.stufe?.toFixed?.(2)} aus Grundwind ${wind.grund}`);
    await amServer(`welt.wetter.wind = welt.wetter.windZiel = 1; welt.wetter.windRest = 999;`);
    await seite.waitForTimeout(5000);
    const stark = await seite.evaluate(() => browserSurvival.spiel.renderer.wetterEffekt.windStufe);
    pruefe(stark > 2, `starker Wind → Bäume schwanken stark (Stufe ${stark.toFixed(2)})`);
    await bild('1_wind_stark');
  }
  // ---------------------------------------------------------------- Phase 2 (Progression & Sonder-Zombies)
  if (phaseAn(2)) {
    const gesetzt = await seite.evaluate(async () => {
      const { erzeugeZombie } = await import('/server/spiel/entitaeten/zombie.js');
      const srv = browserSurvival.server;
      for (const z of srv.zonen.values()) {
        if (z.spielWelt.karte.daten.id !== browserSurvival.spiel.welt.id) continue;
        const w = z.spielWelt;
        const ich = w.holen(browserSurvival.spiel.eigeneId);
        ['sprinter', 'spucker', 'gepanzert', 'explosiv'].forEach((v, i) => {
          const zz = erzeugeZombie({ id: w.neueId(), x: ich.x - 90 + i * 60, y: ich.y - 70, konfiguration: w.konfiguration, variante: v });
          zz.gefesselt = true;
          w.hinzufuegen(zz);
        });
        return true;
      }
      return false;
    });
    pruefe(gesetzt, 'vier Sonder-Zombies gesetzt');
    await seite.waitForTimeout(2500);
    await bild('2_sonderzombies');
    // Explosion auslösen
    await amServer(`for (const z of welt.alleVomTyp('zombie')) if (z.variante === 'explosiv') { z.gefesselt = false; z.zuendung = 0.6; }`);
    await seite.waitForTimeout(350);
    await bild('2_zuendung');
    await seite.waitForTimeout(500);
    await bild('2_explosion');
    pruefe(await amServer(`return ![...welt.alleVomTyp('zombie')].some((z) => z.variante === 'explosiv');`), 'Explosiv-Zombie explodiert');
    // Blutmond
    await amServer(`welt.istNacht = true; welt.nachtArt = 'blutmond'; const { tagSekunden } = welt.tageszeitDauer(); welt.zeit = tagSekunden + 30;`);
    await seite.waitForTimeout(5000);
    pruefe(await seite.evaluate(() => browserSurvival.spiel.renderer.blutmond > 0.2), 'Blutmond färbt die Nacht');
    await bild('2_blutmond');
    await amServer(`welt.nachtArt = 'normal'; welt.zeit = 10; for (const z of [...welt.alleVomTyp('zombie')]) if (z.gefesselt) welt.entfernen(z.id);`);
  }

  // ---------------------------------------------------------------- Phase 3+4 (Waffen, Reparatur, Mods)
  if (phaseAn(3) || phaseAn(4)) {
    for (const [waffe, extra] of [['baseballschlaeger', {}], ['speer', {}], ['gewehr', { mods: ['zielfernrohr', 'schalldaempfer', 'magazin'] }], ['bogen', {}], ['armbrust', {}]]) {
      await amServer(`const def = a.def; ich.inventar[0] = { defId: a.waffe, menge: 1, ...(def.kategorie === 'fernkampf' ? { magazin: def.magazin } : {}), ...a.extra }; ich.ausgeruestet = 0; ich.ausruestung = def.ausruestung;`, { waffe, extra, def: await seite.evaluate((w) => browserSurvival.spiel.itemDefinitionen[w], waffe) });
      await seite.waitForTimeout(900);
      await bild(`3_${waffe}`);
    }
    // Bogen schießen: Pfeil fliegt, kein Fehler
    await amServer(`ich.inventar[0] = { defId: 'bogen', menge: 1, magazin: 1 }; ich.inventar[1] = { defId: 'pfeil', menge: 10 }; ich.ausgeruestet = 0; ich.ausruestung = 'schrotflinte';`);
    await seite.mouse.move(800, 300);
    await seite.mouse.down();
    await seite.waitForTimeout(700);
    await seite.mouse.up();
    pruefe((await amServer(`return ich.inventar[0].magazin;`)) === 0, 'Bogen hat geschossen');
    // Inventar-Info zeigt Aufsätze
    await amServer(`ich.inventar[2] = { defId: 'gewehr', menge: 1, magazin: 5, mods: ['zielfernrohr'] };`);
    await seite.keyboard.press('Tab');
    await seite.waitForTimeout(800);
    await seite.hover('#inventar .inv-slot[data-slot="2"]');
    await seite.waitForTimeout(300);
    pruefe(await seite.evaluate(() => /Zielfernrohr/.test(document.getElementById('inventar-info').textContent) && !!document.querySelector('#inventar-info .inv-mod-ab')), 'Inventar zeigt Aufsatz + Abnehmen-Knopf');
    await bild('4_inventar_mods');
    await seite.keyboard.press('Tab');
  }

  // ---------------------------------------------------------------- Phase 5+6 (Sprengstoff, Fallen, Rüstung)
  if (phaseAn(5) || phaseAn(6)) {
    // Fallen rund um die Figur
    await seite.evaluate(async () => {
      const { neuesBauwerk } = await import('/server/spiel/systeme/bauSystem.js');
      const srv = browserSurvival.server;
      for (const z of srv.zonen.values()) {
        if (z.spielWelt.karte.daten.id !== browserSurvival.spiel.welt.id) continue;
        const w = z.spielWelt;
        const ich = w.holen(browserSurvival.spiel.eigeneId);
        const tx = Math.floor(ich.x / 32);
        const ty = Math.floor(ich.y / 32);
        ['sprengfalle', 'stacheldraht', 'fallgrube', 'dosenalarm'].forEach((typ, i) => w.welt.setzeBauwerk(neuesBauwerk(w, typ, tx - 2 + i * 1, ty + 2, ich.name)));
      }
    });
    await seite.waitForTimeout(1500);
    await bild('5_fallen');
    // Molotow werfen
    await amServer(`ich.inventar[0] = { defId: 'molotow', menge: 2 }; ich.ausgeruestet = 0; ich.ausruestung = 'wurf'; ich.zielAbstand = 150;`);
    await seite.mouse.move(850, 340);
    await seite.mouse.down();
    await seite.waitForTimeout(650);
    await seite.mouse.up();
    await seite.waitForTimeout(1200);
    pruefe(await amServer(`return welt.braende.length > 0;`), 'Molotow brennt');
    await bild('5_molotow');
    await seite.waitForTimeout(9000);
    // Rüstung anziehen
    await amServer(`ich.kleidung.kopf = 'motorradhelm'; ich.kleidung.oberkoerper = 'schutzweste';`);
    await seite.keyboard.press('Tab');
    await seite.waitForTimeout(1200);
    pruefe(await seite.evaluate(() => /Schutz/.test(document.getElementById('inventar-werte').textContent)), 'Inventar zeigt Schutz');
    await bild('6_ruestung');
    await seite.keyboard.press('Tab');
  }

  const info = await seite.evaluate(() => browserSurvival.spiel?.renderer.statistik() ?? '');
  if (info) console.log(`  Grafik: ${info}`);
} catch (e) {
  fehler.push(`Ablauf: ${e.message.split('\n')[0]}`);
} finally {
  await browser.close();
  server.kill();
}

console.log(`\nScreenshots: ${path.relative(WURZEL, AUSGABE)}/r24_*.png`);
if (fehler.length) {
  console.log(`✗ ${fehler.length} Fehler:\n${fehler.map((f) => `  - ${f}`).join('\n')}`);
  process.exitCode = 1;
} else console.log(`✓ Rauchtest Runde 24 ok (${schritte} Schritte)`);
