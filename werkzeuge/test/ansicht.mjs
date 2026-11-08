#!/usr/bin/env node
/**
 * Browser-Prüfung in EINEM Befehl (Runde 45, für KI-Sitzungen): Spiel starten (Singleplayer, Gottmodus), Zustand herstellen,
 * Screenshots aus frei wählbaren Kameras um die eigene Figur + Konsolenfehler. Ersetzt das ständige Neuschreiben von Playwright-Skripten.
 *
 *   npm run ansicht -- [optionen]
 *     --zone <id>        Zone wechseln (lager · stadtrand · waldweg · waldsee · schneeland); Start = lager (neue Figur)
 *     --tp <tx,ty>       auf Kachel teleportieren
 *     --zeit <stunde>    Uhrzeit (z. B. 22 = Nacht; Zonen mit festeZeit ignorieren das optisch)
 *     --sitzen           auf den nächsten Stuhl/Bank setzen (keiner in Reichweite → erster Sitz der Zone)
 *     --js "<code>"      eigener Code im Spiel (async ok, mehrfach möglich; Rückgabe wird ausgegeben). Vorhanden: bs (=browserSurvival),
 *                        spiel, welt (Server-SpielWelt der eigenen Zone), ich (Server-Spieler), figur (Renderer-Figur), THREE
 *     --warte <ms>       nach dem Aufbau warten (Standard 2500)
 *     --kamera <liste>   spiel (normales Bild mit HUD) · seite · vorn · hinten · oben · nah (rechte Hand) · weit – Standard: spiel
 *     --aus <ordner>     Ausgabe (Standard werkzeuge/test/ausgabe/ansicht) · --name <präfix> (Standard: ansicht)
 *     --groesse <BxH>    Fenstergröße (Standard 1000x640) · --port <n> (Standard 8097)
 *
 * Beispiele:  npm run ansicht -- --sitzen --kamera seite,vorn,nah
 *             npm run ansicht -- --zone waldsee --tp 120,60 --zeit 22 --kamera spiel,oben
 *             npm run ansicht -- --js "ich.leben = 10; return ich.leben"
 * Hinweis: Software-GL ist langsam (≈2–10 FPS) – für Bewegungs-/Zitter-Messungen per --js über Frames messen (requestAnimationFrame).
 */
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { hauptmenueAbwarten, singleplayerStarten } from './menueHelfer.mjs';

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const args = process.argv.slice(2);
const wert = (name, standard = null) => (args.includes(name) ? args[args.indexOf(name) + 1] : standard);
const alle = (name) => args.flatMap((a, i) => (a === name ? [args[i + 1]] : []));
const port = Number(wert('--port', 8097));
const [breite, hoehe] = wert('--groesse', '1000x640').split('x').map(Number);
const aus = path.resolve(WURZEL, wert('--aus', 'werkzeuge/test/ausgabe/ansicht'));
const praefix = wert('--name', 'ansicht');
const kameras = wert('--kamera', 'spiel').split(',');
/** Kamera relativ zur Figur: [seitlich (+ = linke Körperseite), vorn, hoch, Abstand, Ziel 'schulter'|'hand'|'figur'] */
const KAMERAS = {
  seite: [1, 0.25, 18, 95, 'schulter'],
  vorn: [0.2, 1, 18, 95, 'schulter'],
  hinten: [0.2, -1, 30, 110, 'schulter'],
  oben: [0.01, 0.15, 160, 60, 'figur'],
  nah: [-0.6, 0.6, 10, 40, 'hand'],
  weit: [0.5, 1, 260, 420, 'figur'],
};

const require = createRequire(path.join(WURZEL, 'package.json'));
const { chromium } = require('playwright');
mkdirSync(aus, { recursive: true });
const server = spawn(process.execPath, ['server/node/start.js', '--gast'], { cwd: WURZEL, env: { ...process.env, PORT: String(port) }, stdio: ['ignore', 'pipe', 'pipe'] });
let log = '';
server.stdout.on('data', (d) => (log += d));
server.stderr.on('data', (d) => (log += d));
await new Promise((ok, f) => {
  const t = setTimeout(() => f(new Error(`Server startet nicht:\n${log}`)), 15000);
  server.stdout.on('data', () => /läuft|localhost/.test(log) && (clearTimeout(t), ok()));
});

const fehler = [];
const bilder = [];
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
try {
  const seite = await browser.newPage({ viewport: { width: breite, height: hoehe } });
  seite.on('pageerror', (e) => fehler.push(`pageerror: ${e.message}`));
  seite.on('console', (m) => m.type() === 'error' && fehler.push(`console: ${m.text()}`));
  await seite.goto(`http://localhost:${port}/`);
  await hauptmenueAbwarten(seite);
  await singleplayerStarten(seite, `Ansicht${Date.now() % 1000}`);
  await seite.waitForSelector('#laden', { state: 'hidden', timeout: 90000 });
  // Helfer im Seitenkontext: Server-Zone der eigenen Figur, Gottmodus
  await seite.evaluate(() => {
    window.__ansicht = {
      zone() {
        const bs = window.browserSurvival;
        for (const z of bs.server?.zonen.values() ?? []) if (z.spielWelt.welt.id === bs.spiel.welt.id) return z.spielWelt;
        return null;
      },
    };
    const welt = window.__ansicht.zone();
    const ich = welt?.holen(window.browserSurvival.spiel.eigeneId);
    if (ich) ich.gottmodus = true;
  });
  const zone = wert('--zone');
  if (zone) {
    await seite.evaluate((z) => window.browserSurvival.zone(z), zone);
    await seite.waitForFunction((z) => window.browserSurvival.spiel?.welt.id === z, zone, { timeout: 30000 });
    await seite.waitForTimeout(2000);
    await seite.waitForSelector('#laden', { state: 'hidden', timeout: 60000 });
    await seite.evaluate(() => {
      const ich = window.__ansicht.zone()?.holen(window.browserSurvival.spiel.eigeneId);
      if (ich) ich.gottmodus = true;
    });
  }
  const tp = wert('--tp');
  if (tp) {
    const [tx, ty] = tp.split(',').map(Number);
    await seite.evaluate(([x, y]) => window.browserSurvival.tp(x, y), [tx, ty]);
    await seite.waitForTimeout(800);
  }
  const zeit = wert('--zeit');
  if (zeit !== null) await seite.evaluate((h) => window.browserSurvival.zeit(h), Number(zeit));
  if (args.includes('--sitzen')) {
    const sitz = await seite.evaluate(async () => {
      const { setzeHin } = await import('/server/spiel/systeme/stationSystem.js');
      const { findeSitz } = await import('/gemeinsam/welt/sitze.js');
      const welt = window.__ansicht.zone();
      const ich = welt.holen(window.browserSurvival.spiel.eigeneId);
      let p = findeSitz(welt.welt, ich.x, ich.y);
      const g = welt.welt.kachelGroesse;
      for (const o of welt.welt.objekte) {
        if (p) break;
        p = findeSitz(welt.welt, (o.x + o.b / 2) * g, (o.y + o.h / 2) * g);
      }
      if (!p) return null;
      ich.x = p.x;
      ich.y = p.y;
      setzeHin(welt, ich);
      return { x: Math.round(p.x), y: Math.round(p.y), sitzt: ich.arbeit?.art === 'sitzen' };
    });
    console.log(`Sitz: ${JSON.stringify(sitz)}`);
  }
  await seite.waitForTimeout(Number(wert('--warte', 2500)));
  for (const code of alle('--js')) {
    const ergebnis = await seite.evaluate(async (quelltext) => {
      const THREE = await import('three');
      const bs = window.browserSurvival;
      const spiel = bs.spiel;
      const welt = window.__ansicht.zone();
      const ich = welt?.holen(spiel.eigeneId);
      const figur = spiel.renderer.figuren.get(spiel.eigeneId);
      const fn = new Function('bs', 'spiel', 'welt', 'ich', 'figur', 'THREE', `return (async () => { ${quelltext} })();`);
      try {
        return JSON.stringify(await fn(bs, spiel, welt, ich, figur, THREE)) ?? 'undefined';
      } catch (e) {
        return `FEHLER: ${e.message}`;
      }
    }, code);
    console.log(`js> ${ergebnis}`);
  }
  const lage = await seite.evaluate(() => {
    const s = window.browserSurvival.spiel;
    const ich = window.__ansicht.zone()?.holen(s.eigeneId);
    const g = s.welt.kachelGroesse;
    return { zone: s.welt.id, kachel: ich ? [Math.floor(ich.x / g), Math.floor(ich.y / g)] : null, arbeit: ich?.arbeit?.art ?? null, clip: s.renderer.figuren.get(s.eigeneId)?.aktuell ?? null, fps: s.schleife?.fps ?? null };
  });
  console.log(`Lage: ${JSON.stringify(lage)}`);
  for (const name of kameras) {
    const datei = path.join(aus, `${praefix}_${name}.png`);
    if (name === 'spiel') {
      await seite.screenshot({ path: datei });
      bilder.push(datei);
      continue;
    }
    const k = KAMERAS[name];
    if (!k) {
      fehler.push(`unbekannte Kamera "${name}" (bekannt: spiel, ${Object.keys(KAMERAS).join(', ')})`);
      continue;
    }
    await seite.evaluate(async ([seitlich, vorn, hoch, abstand, ziel, b, h]) => {
      const THREE = await import('three');
      const spiel = window.browserSurvival.spiel;
      const r = spiel.renderer;
      const f = r.figuren.get(spiel.eigeneId);
      spiel.schleife?.stoppen?.();
      for (const el of document.querySelectorAll('#hud, #touch, .tagebuch, .tut-panel, #minikarte')) el.style.visibility = 'hidden';
      f.gruppe.updateMatrixWorld(true);
      const punkt = new THREE.Vector3();
      if (ziel === 'hand' && f.knochen?.rechts) f.knochen.rechts[2].getWorldPosition(punkt);
      else if (ziel === 'schulter' && f.knochen?.rechts) f.knochen.rechts[0].getWorldPosition(punkt);
      else f.gruppe.getWorldPosition(punkt).add(new THREE.Vector3(0, 30, 0));
      const blick = new THREE.Vector3(0, 0, 1).applyQuaternion(f.gruppe.quaternion);
      const quer = new THREE.Vector3(1, 0, 0).applyQuaternion(f.gruppe.quaternion);
      const cam = new THREE.PerspectiveCamera(35, b / h, 1, 20000);
      cam.position.copy(punkt).addScaledVector(quer, abstand * seitlich).addScaledVector(blick, abstand * vorn).add(new THREE.Vector3(0, hoch, 0));
      cam.lookAt(punkt.clone().add(new THREE.Vector3(0, ziel === 'schulter' ? -14 : 0, 0)));
      r.gl.render(r.szene, cam);
    }, [...k, breite, hoehe]);
    await seite.screenshot({ path: datei });
    bilder.push(datei);
  }
  await seite.evaluate(() => {
    for (const el of document.querySelectorAll('#hud, #touch, .tagebuch, .tut-panel, #minikarte')) el.style.visibility = '';
    window.browserSurvival.spiel.schleife?.starten?.();
  });
} catch (e) {
  fehler.push(`Ablauf: ${e.message.split('\n')[0]}`);
} finally {
  await browser.close();
  server.kill();
}
for (const b of bilder) console.log(`Bild: ${path.relative(WURZEL, b)}`);
if (fehler.length) {
  console.log(`✗ ${fehler.length} Fehler:\n${fehler.map((f) => `  - ${f}`).join('\n')}`);
  process.exitCode = 1;
} else console.log('✓ keine Seiten-/Konsolenfehler');
