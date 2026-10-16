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
  assert.deepEqual(await auth.pruefe('anna', 'geheim123'), { ok: true, benutzername: 'Anna', admin: false });
  assert.equal((await auth.pruefe('Anna', 'falsch')).ok, false);
  assert.equal((await auth.pruefe('Bob', 'geheim123')).ok, false);
  assert.equal((await auth.pruefe('Anna', '')).ok, false);
});

test('Konten mit "admin": true bekommen Admin-Recht', async (t) => {
  const ordner = await mkdtemp(path.join(tmpdir(), 'konten-'));
  t.after(() => rm(ordner, { recursive: true, force: true }));
  const datei = path.join(ordner, 'konten.json');
  await writeFile(datei, JSON.stringify({ konten: [{ benutzername: 'Chef', passwortHash: await hashePasswort('geheim123'), admin: true }] }));
  assert.equal((await new KontenAuthentifizierung(datei).pruefe('chef', 'geheim123')).admin, true);
});

test('Fehlende Kontendatei → niemand kann sich einloggen (kein Absturz)', async () => {
  const auth = new KontenAuthentifizierung('/gibt/es/nicht.json');
  assert.equal((await auth.pruefe('Anna', 'x')).ok, false);
});

test('Accounts auch direkt als JSON (Umgebungsvariable KONTEN_JSON beim Online-Hoster)', async () => {
  const kontenJson = JSON.stringify({ konten: [{ benutzername: 'Online', passwortHash: await hashePasswort('geheim123') }] });
  const auth = new KontenAuthentifizierung('/gibt/es/nicht.json', { kontenJson });
  assert.equal((await auth.pruefe('online', 'geheim123')).ok, true);
  assert.equal((await auth.pruefe('online', 'falsch')).ok, false);
});
