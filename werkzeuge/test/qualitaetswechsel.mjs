/**
 * Regressionstest „Schwarz-/Nebel-Bug beim Qualitätswechsel“ (Runde 36): Nachts Profil wechseln (niedrig→hoch/mittel) und
 * Bild-Größe (PNG-Bytes der Mitte) mit frisch gestartetem Profil vergleichen. Kaputt = ~12 KB statt ~36–40 KB.
 * Aufruf: node werkzeuge/test/qualitaetswechsel.mjs  (Playwright + Chromium nötig, Port 8098)
 */
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { hauptmenueAbwarten, singleplayerStarten } from './menueHelfer.mjs';
const { chromium } = createRequire(import.meta.url)('playwright');
const AUS = new URL('./ausgabe/', import.meta.url).pathname;
const port = 8098;
const server = spawn(process.execPath, ['server/node/start.js', '--gast'], { cwd: process.cwd(), env: { ...process.env, PORT: String(port) }, stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 2500));
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
async function lauf(start, wechsel) {
  const ctx = await browser.newContext({ viewport: { width: 1000, height: 620 } });
  const s = await ctx.newPage();
  await s.addInitScript((g) => { try { localStorage.setItem('browserSurvival.grafik', g); } catch {} }, start);
  s.on('pageerror', (e) => console.log('PAGEERR', e.message));
  await s.goto(`http://localhost:${port}/`);
  await hauptmenueAbwarten(s);
  await singleplayerStarten(s, 'N' + (Date.now() % 1000));
  await s.waitForSelector('#laden', { state: 'hidden', timeout: 90000 });
  await s.evaluate(() => { const w = browserSurvival.spiel.welt; browserSurvival.tp(2, 2); browserSurvival.zeit(23); });
  await s.waitForTimeout(3500);
  const tag = `${start}${wechsel ? '_zu_' + wechsel : ''}`;
  if (wechsel) { await s.evaluate((g) => browserSurvival.spiel.renderer.setzeGrafik(g), wechsel); await s.waitForTimeout(2500); }
  const info = await s.evaluate(() => { const r = browserSurvival.spiel.renderer; return { g: r.grafik, st: r.stufe, mondI: +r.mond.intensity.toFixed(2), umgI: +r.umgebung.intensity.toFixed(3), shadowMap: !!r.mond.shadow.map, sSize: r.mond.shadow.mapSize.x, lichter: r.szene.children.filter(c => c.isLight).map(l => l.type[0] + (l.intensity ?? 0).toFixed(1)).join(',') }; });
  const buf = await s.screenshot({ path: `${AUS}/v_${tag}.png`, clip: { x: 300, y: 200, width: 400, height: 300 } });
  console.log(tag.padEnd(16), buf.length, JSON.stringify(info));
  await ctx.close();
}
try {
  await lauf('niedrig'); await lauf('hoch'); await lauf('mittel');
  await lauf('niedrig', 'hoch'); await lauf('hoch', 'niedrig'); await lauf('niedrig', 'mittel');
} finally { await browser.close(); server.kill(); }
