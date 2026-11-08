#!/usr/bin/env node
/**
 * KI-Werkzeug (Runde 45): Tests mit knapper Ausgabe (werkzeuge/ki/kurzReporter.mjs) – bei Erfolg 1 Zeile, sonst nur Fehlschläge.
 *   npm run t                      alle Tests
 *   npm run t -- runde45 zonen     nur tests/runde45.test.js + tests/zonen.test.js (Kurzname oder Pfad)
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const namen = process.argv.slice(2);
const dateien = namen.length
  ? namen.map((n) => (existsSync(path.resolve(WURZEL, n)) ? n : `tests/${n.replace(/\.test\.js$/, '')}.test.js`))
  : ['tests/**/*.test.js'];
const fehlend = dateien.filter((d) => !d.includes('*') && !existsSync(path.resolve(WURZEL, d)));
if (fehlend.length) {
  console.log(`✗ nicht gefunden: ${fehlend.join(', ')}`);
  process.exit(1);
}
const lauf = spawnSync(process.execPath, ['--test', '--test-reporter=./werkzeuge/ki/kurzReporter.mjs', ...dateien], { cwd: WURZEL, stdio: 'inherit' });
process.exit(lauf.status ?? 1);
