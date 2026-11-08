/**
 * Runde 45: Wächter für die KI-Doku (CLAUDE.md = Router, ki/<thema>.md = Wissen je Thema).
 * Verhindert, dass die Doku wieder verrottet: Router vollständig, Dateien kompakt (ersetzen statt anhängen!),
 * jeder genannte Dateipfad existiert, Gliederungs-Werkzeug läuft.
 * Rot? → Doku nachziehen (Pfad umbenannt/gelöscht → ki/<thema>.md anpassen; zu groß → Veraltetes kürzen).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lies = (p) => readFileSync(path.join(WURZEL, p), 'utf8');
const KI = readdirSync(path.join(WURZEL, 'ki')).filter((d) => d.endsWith('.md'));
/** Höchstgrößen (Bytes) – Themen-Dateien sollen in einem Zug lesbar bleiben */
const GRENZE = { 'CLAUDE.md': 9000, 'ki/editor.md': 60000, 'ki/studio.md': 20000, standard: 10000 };

const PRAEFIX = { 'S:': 'server/spiel/', 'C:': 'client/', 'G:': 'gemeinsam/', 'K:': 'server/spiel/konfiguration/' };
const BASEN = ['', 'editor/', 'studio/', 'client/', 'client/darstellung/', 'client/assets/', 'server/spiel/', 'gemeinsam/', 'werkzeuge/'];
const NUR_LOKAL = /^(server\/daten\/|\.studio\/|verteilen|!verteilen)/;

/** Dateipfade in `Backticks`, die es nicht gibt (Kürzel S:/C:/G:/K: und relative Pfade aus Editor/Studio werden aufgelöst). */
export function fehlendePfade(text) {
  const fehlend = [];
  for (const [, roh] of text.matchAll(/`([^`\n]+)`/g)) {
    for (let teil of roh.split(/\s+/)) {
      teil = teil.replace(/[),.;:]+$/, '').replace(/^\(/, '');
      if (!/\.(js|mjs|py|md|json|html|css|glb)$/.test(teil) || /[<>*{}|]/.test(teil) || !teil.includes('/')) continue;
      let prae = '';
      let rest = teil;
      for (const [p, ersatz] of Object.entries(PRAEFIX)) if (rest.startsWith(p)) (prae = ersatz), (rest = rest.slice(p.length));
      if (NUR_LOKAL.test(prae + rest)) continue;
      const kandidaten = [prae + rest, ...BASEN.map((b) => path.join(b, rest)), path.join('editor', rest)];
      if (!kandidaten.some((k) => existsSync(path.join(WURZEL, k)))) fehlend.push(teil);
    }
  }
  return fehlend;
}

test('KI-Doku: CLAUDE.md verweist auf jede ki/-Datei, und jede verwiesene gibt es', () => {
  const router = lies('CLAUDE.md');
  for (const d of KI) assert.ok(router.includes(`ki/${d}`), `ki/${d} fehlt in der Themenkarte von CLAUDE.md`);
  for (const [, name] of router.matchAll(/ki\/([a-z_0-9]+\.md)/g)) assert.ok(KI.includes(name), `CLAUDE.md nennt ki/${name}, die Datei fehlt`);
});

test('KI-Doku: Dateien bleiben kompakt (Stand ersetzen statt anhängen)', () => {
  for (const d of ['CLAUDE.md', ...KI.map((k) => `ki/${k}`)]) {
    const groesse = statSync(path.join(WURZEL, d)).size;
    const max = GRENZE[d] ?? GRENZE.standard;
    assert.ok(groesse <= max, `${d} ist ${groesse} Bytes (max ${max}) – Veraltetes kürzen, Historie gehört nach archiv/`);
  }
});

test('KI-Doku: jeder genannte Dateipfad existiert', () => {
  assert.deepEqual(fehlendePfade('`C:darstellung/gibtEsNicht.js` und `C:darstellung/renderer.js`'), ['C:darstellung/gibtEsNicht.js'], 'Prüfer selbst');
  for (const d of ['CLAUDE.md', ...KI.map((k) => `ki/${k}`)]) assert.deepEqual(fehlendePfade(lies(d)), [], `${d} nennt Dateien, die es nicht (mehr) gibt`);
});

test('KI-Werkzeug ki:gliederung findet Definitionen und gliedert Dateien', () => {
  const wo = spawnSync(process.execPath, ['werkzeuge/ki/gliederung.mjs', '--wo', 'stuhlSitz'], { cwd: WURZEL, encoding: 'utf8' });
  assert.match(wo.stdout, /client\/darstellung\/figurHaltung\.js:\d+ +stuhlSitz\(\)/);
  const g = spawnSync(process.execPath, ['werkzeuge/ki/gliederung.mjs', '--ohne-konst', 'client/darstellung/figurHaltung.js'], { cwd: WURZEL, encoding: 'utf8' });
  assert.match(g.stdout, /figurHaltung\.js \(\d+ Zeilen\)/);
  assert.match(g.stdout, /export aktualisiereHaltung\(\)/);
  assert.doesNotMatch(g.stdout, / HALTUNGEN/, '--ohne-konst blendet Konstanten aus');
});
