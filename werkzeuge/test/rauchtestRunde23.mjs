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

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
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

  // ---------------------------------------------------------------- Phase 2
  if (phaseAn(2)) {
    // Icons aus dem Sprite sind da
    pruefe(await seite.evaluate(() => !!document.getElementById('i-leben') && !!document.getElementById('i-bauen')), 'UI-Icon-Sprite geladen');
    pruefe(await seite.evaluate(() => !document.getElementById('hud-bauen').textContent.includes('BUILD')), 'kein „BUILD“-Text mehr');
    pruefe(await seite.evaluate(() => getComputedStyle(document.getElementById('hud-karte')).display === 'none'), 'Karten-Knopf am PC ausgeblendet');
    // Neues Inventar: Charakter links
    await seite.keyboard.press('Tab');
    await seite.waitForTimeout(1500);
    pruefe(await seite.evaluate(() => document.querySelectorAll('#inventar .ausr-slot').length === 6), 'Inventar: 6 Ausrüstungs-Slots');
    await bild('2_inventar');
    await seite.keyboard.press('Tab');
    // Minikarte anklicken → Karte
    const mk = await seite.evaluate(() => {
      const r = document.getElementById('minikarte').getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2, sichtbar: r.width > 0 };
    });
    if (mk.sichtbar) {
      await seite.mouse.click(mk.x, mk.y);
      await seite.waitForTimeout(500);
      pruefe(await seite.evaluate(() => browserSurvival.spiel.karte.offen), 'Klick auf Minikarte öffnet die Karte');
      await seite.keyboard.press('Escape');
    }
    // Chat: Tab schaltet Direkt ⇄ Global
    await seite.keyboard.press('KeyT');
    await seite.waitForTimeout(300);
    const vorher = await seite.evaluate(() => document.getElementById('chat-modus').textContent);
    await seite.keyboard.press('Tab');
    const nachher = await seite.evaluate(() => document.getElementById('chat-modus').textContent);
    pruefe(vorher !== nachher && !(await seite.evaluate(() => browserSurvival.spiel.hud.inventar.offen)), `Chat-Tab: ${vorher} → ${nachher} (Inventar bleibt zu)`);
    await bild('2_chat');
    await seite.keyboard.press('Tab');
    await seite.keyboard.press('Escape');
    // Baum fällen: Balken über dem Baum, danach „+N“-Popup
    const baum = await seite.evaluate(() => {
      const ich = browserSurvival.spiel.lokal;
      const r = browserSurvival.spiel.welt.ressourcen.filter((r) => r.art === 'holz').sort((a, b) => Math.hypot(a.x - ich.x, a.y - ich.y) - Math.hypot(b.x - ich.x, b.y - ich.y))[0];
      return r ? { x: r.x, y: r.y } : null;
    });
    if (baum) {
      await seite.evaluate(({ x, y }) => browserSurvival.tp((x + 30) / 32, y / 32), baum);
      await seite.waitForTimeout(1200);
      await seite.keyboard.press('KeyE');
      await seite.waitForTimeout(2500);
      pruefe(await seite.evaluate(() => !document.querySelector('.welt-balken').hidden && document.getElementById('hud-arbeit').hidden), 'Abbau-Balken über dem Baum (kein Text)');
      await bild('2_baum_balken');
      await seite.waitForFunction(() => document.querySelector('.welt-plus'), null, { timeout: 15000 });
      await seite.waitForTimeout(600);
      await bild('2_baum_plus');
      schritt('„+N“-Popup nach dem Fällen');
    }
  }

  // ---------------------------------------------------------------- Phase 3 (Wetter) + 4/5 (Audio)
  if (phaseAn(3) || phaseAn(4)) {
    // Sounds aus dem Netz geladen (eigene Dateien haben Vorrang)?
    await seite.waitForTimeout(2500);
    const quellen = await seite.evaluate(() => {
      const s = browserSurvival.spiel.sound;
      return Object.fromEntries(['sturm', 'schneesturm', 'regen_stark', 'tag', 'nacht', 'donner', 'donner_nah', 'zombie_schrei', 'zombie_angriff', 'zombie_tod', 'hack_holz', 'hack_felsen', 'hack_stein', 'ueberfahren', 'aufprall', 'eule', 'zaehneklappern'].map((n) => [n, s?.quelleVon(n)]));
    });
    const fehlt = Object.entries(quellen).filter(([n, q]) => q !== 'eigen' && !(n === 'zaehneklappern' && q === 'synth'));
    pruefe(fehlt.length === 0, `Sounds geladen (${fehlt.map(([n, q]) => `${n}:${q}`).join(', ') || 'alle eigen'})`);
    for (const art of ['gewitter', 'sturm']) {
      await seite.evaluate((a) => browserSurvival.wetter(a), art);
      await seite.waitForTimeout(4500);
      if (art === 'gewitter') {
        await seite.evaluate(() => {
          const w = browserSurvival.spiel.renderer.wetterEffekt;
          const alt = w.beiBlitz;
          w.blitzZaehler = 0;
          w.beiBlitz = (...a) => {
            w.blitzZaehler++;
            alt?.(...a);
          };
          w.gewitter = 1;
          w.naechsterBlitz = 0;
        });
        await seite.waitForTimeout(1500);
        pruefe(await seite.evaluate(() => browserSurvival.spiel.renderer.wetterEffekt.blitzZaehler > 0), 'Gewitter: Blitz (+ Donner-Haken)');
      }
      const w = await seite.evaluate(() => {
        const e = browserSurvival.spiel.renderer.wetterEffekt;
        return { art: e.art, regen: e.regen, sturm: e.sturm, wind: e.windStufe };
      });
      pruefe(w.art === art && (art !== 'sturm' || w.sturm > 0.5), `Wetter ${art} (${JSON.stringify(w, (k, v) => (typeof v === 'number' ? Math.round(v * 100) / 100 : v))})`);
      await bild(`3_wetter_${art}`);
    }
    await zone('schneeland');
    await seite.evaluate(() => browserSurvival.wetter('schneesturm'));
    await seite.waitForTimeout(4500);
    pruefe(await seite.evaluate(() => browserSurvival.spiel.renderer.wetterEffekt.art === 'schneesturm' && browserSurvival.spiel.renderer.wetterEffekt.schnee > 0.1), 'Schneesturm: Schnee fällt');
    await bild('3_wetter_schneesturm');
    await seite.evaluate(() => browserSurvival.wetter('klar'));
    await zone('stadtrand');
    // Holzhacken: Hack-Sound kommt aus der Animation (renderer.aufschlaege)
    const baum = await seite.evaluate(() => {
      const ich = browserSurvival.spiel.lokal;
      const r = browserSurvival.spiel.welt.ressourcen.filter((r) => r.art === 'holz' && browserSurvival.spiel.welt.istRessourceDa(r.id)).sort((a, b) => Math.hypot(a.x - ich.x, a.y - ich.y) - Math.hypot(b.x - ich.x, b.y - ich.y))[0];
      return r ? { x: r.x, y: r.y } : null;
    });
    if (baum) {
      await seite.evaluate(({ x, y }) => browserSurvival.tp((x + 30) / 32, y / 32), baum);
      await seite.waitForTimeout(1200);
      await seite.evaluate(() => {
        const r = browserSurvival.spiel.renderer;
        r.aufschlagZaehler = 0;
        const alt = r.aufschlaege.push.bind(r.aufschlaege);
        r.aufschlaege.push = (...a) => {
          r.aufschlagZaehler++;
          return alt(...a);
        };
      });
      await seite.keyboard.press('KeyE');
      await seite.waitForTimeout(4000);
      pruefe((await seite.evaluate(() => browserSurvival.spiel.renderer.aufschlagZaehler)) > 0, 'Axt-Schläge aus der Animation erkannt (Hack-Sound synchron)');
    }
  }

  // ---------------------------------------------------------------- Phase 6 (Hase)
  if (phaseAn(6)) {
    const pos = await amServer(`
      const t = [...welt.alleVomTyp('tier')][0];
      if (!t) return null;
      ich.x = t.x - 420; ich.y = t.y; // außerhalb des Scheu-Radius
      return { x: t.x, y: t.y, id: t.id };`);
    if (pos) {
      await seite.waitForTimeout(3000);
      const glb = await seite.evaluate((id) => {
        const t = browserSurvival.spiel.renderer.tiere.get(id);
        let skinned = 0;
        t?.gruppe.traverse((o) => o.isSkinnedMesh && skinned++);
        return skinned;
      }, pos.id);
      pruefe(glb > 0, 'Hase: echtes GLB-Modell (Skelett) geladen');
      await bild('6_hase_ruhend');
      await amServer(`const t = welt.holen(a.id); ich.x = t.x - 150; ich.y = t.y;`, pos);
      await seite.waitForTimeout(1500);
      const zustand = await amServer(`return welt.holen(a.id)?.zustand;`, pos);
      pruefe(zustand === 'flucht', `Hase flieht bei 150 px (${zustand})`);
      await bild('6_hase_flucht');
    } else fehler.push('Prüfung: kein Hase in der Zone');
  }

  // ---------------------------------------------------------------- Phase 7 (Häuser)
  if (phaseAn(7)) {
    // draußen vor einem Haus (Dächer zu) und drinnen (Wände durchsichtig, Ziegel-Textur)
    await amServer('ich.gottmodus = true;');
    await seite.evaluate(() => browserSurvival.tp(20, 30));
    await seite.waitForTimeout(2500);
    await bild('7_haeuser_aussen');
    const texturen = await seite.evaluate(() => {
      let anzahl = 0;
      browserSurvival.spiel.renderer.szene.traverse((o) => {
        for (const m of [].concat(o.material ?? [])) if (m?.userData?.wandTextur) anzahl++;
      });
      return anzahl;
    });
    pruefe(texturen > 0, `Wand-/Holz-Texturen im Einsatz (${texturen} Materialien)`);
    const start = await seite.evaluate(() => {
      const r = browserSurvival.spiel.welt.raeume[0];
      return r ? { tx: Math.floor(r.x / 32), ty: Math.floor(r.y / 32) } : null;
    });
    if (start) {
      await seite.evaluate(({ tx, ty }) => browserSurvival.tp(tx, ty), start);
      await seite.waitForTimeout(2500);
      await bild('7_haus_innen');
      await seite.evaluate(({ tx, ty }) => browserSurvival.tp(tx, ty + 8), start);
      await seite.waitForTimeout(2500);
      await bild('7_haus_dach');
    }
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
