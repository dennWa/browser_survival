import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { KontenAuthentifizierung } from '../server/node/kontenAuthentifizierung.js';
import { hashePasswort } from '../server/node/passwort.js';

test('Konten-Login prüft Passwörter korrekt', async (t) => {
  const ordner = await mkdtemp(path.join(tmpdir(), 'konten-'));
  t.after(() => rm(ordner, { recursive: true, force: true }));
  const datei = path.join(ordner, 'konten.json');
  await writeFile(datei, JSON.stringify({ konten: [{ benutzername: 'Anna', passwortHash: await hashePasswort('geheim123') }] }));

  const auth = new KontenAuthentifizierung(datei);
  assert.deepEqual(await auth.pruefe('anna', 'geheim123'), { ok: true, benutzername: 'Anna' });
  assert.equal((await auth.pruefe('Anna', 'falsch')).ok, false);
  assert.equal((await auth.pruefe('Bob', 'geheim123')).ok, false);
  assert.equal((await auth.pruefe('Anna', '')).ok, false);
});

test('Fehlende Kontendatei → niemand kann sich einloggen (kein Absturz)', async () => {
  const auth = new KontenAuthentifizierung('/gibt/es/nicht.json');
  assert.equal((await auth.pruefe('Anna', 'x')).ok, false);
});
