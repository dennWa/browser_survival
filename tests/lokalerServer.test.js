import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pruefeSchreibPfad, pruefeListenOrdner, istLokalerHost, istErlaubterUrsprung, indexFuer } from '../werkzeuge/editor/pfade.mjs';
import { erstelleEditorServer } from '../werkzeuge/editor/lokalerServer.mjs';

test('Pfadprüfung: erlaubte Ordner und Endungen', () => {
  for (const p of ['client/audio/eigene/pistole.ogg', 'client/audio/eigene/hack_holz_2.wav', 'client/audio/eigene/einstellungen.json', 'client/musik/stadtrand/Regen über der Stadt (Teil 1).mp3', 'client/musik/einstellungen.json', 'client/audio/karten/waldweg/bach.ogg', 'client/assets/eigene/waldweg_haus.glb', 'server/spiel/karten/meinezone.js']) {
    assert.ok(pruefeSchreibPfad(p).ok, p);
  }
});

test('Pfadprüfung: Ausbruchsversuche und fremde Dateien werden abgelehnt', () => {
  for (const p of [
    '', '../x.ogg', 'client/audio/eigene/../../server/node/start.js', 'client/audio/eigene/./a.ogg', '/etc/passwd', 'C:/Windows/a.ogg', 'client\\audio\\eigene\\a.ogg',
    'client/audio/eigene//a.ogg', 'client/audio/eigene/a.exe', 'client/audio/eigene/sub/a.ogg', 'client/musik/a/b/c.ogg', 'client/kern/clientSpiel.js',
    'server/daten/konten.json', 'server/spiel/karten/kartenLader.js', 'client/audio/eigene/eigene.json', 'client/musik/musik.json', 'client/audio/eigene/a.ogg\u0000.js',
    'client/audio/eigene/.htaccess.ogg', 'client/audio/eigene/a.ogg ', 'x'.repeat(300),
    'server/spiel/karten/sub/x.js', 'client/audio/samples/pistole_0.ogg', null, 42,
  ]) {
    assert.equal(pruefeSchreibPfad(p).ok, false, String(p));
  }
});

test('Ordner-Liste, Host/Origin, Index-Zuordnung', () => {
  assert.equal(pruefeListenOrdner('client/musik'), 'client/musik/');
  assert.equal(pruefeListenOrdner('client/musik/stadtrand/'), 'client/musik/stadtrand/');
  assert.equal(pruefeListenOrdner('client/musik/../../'), null);
  assert.equal(pruefeListenOrdner('client/kern/'), null);
  assert.ok(istLokalerHost('localhost:8090') && istLokalerHost('127.0.0.1') && istLokalerHost('[::1]:80'));
  assert.ok(!istLokalerHost('boese.de') && !istLokalerHost('localhost.boese.de:8090'));
  assert.ok(istErlaubterUrsprung(undefined, 'localhost:8090'));
  assert.ok(istErlaubterUrsprung('http://localhost:8090', 'localhost:8090'));
  assert.ok(!istErlaubterUrsprung('https://dennwa.github.io', 'localhost:8090'));
  assert.ok(!istErlaubterUrsprung('http://localhost:9999', 'localhost:8090'));
  assert.equal(indexFuer('client/audio/eigene/a.ogg'), 'sounds');
  assert.equal(indexFuer('client/musik/x/a.ogg'), 'musik');
  assert.equal(indexFuer('client/assets/eigene/a.glb'), null);
});

test('Server: schreiben, Index neu, löschen, fremder Ursprung abgelehnt', async () => {
  const wurzel = mkdtempSync(path.join(tmpdir(), 'editorserver-'));
  mkdirSync(path.join(wurzel, 'client/audio/eigene'), { recursive: true });
  mkdirSync(path.join(wurzel, 'client/musik/stadtrand'), { recursive: true });
  writeFileSync(path.join(wurzel, 'client/audio/eigene/README.vorlage.md'), '# x\n{{EREIGNISSE}}\n');
  const server = erstelleEditorServer({ wurzel });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const basis = `http://127.0.0.1:${server.address().port}`;
  const kopf = { 'X-Editor': '1' };
  try {
    let r = await fetch(`${basis}/api/editor/status`, { headers: kopf });
    assert.equal((await r.json()).ok, true);
    // ohne Kopf / mit fremdem Ursprung: nein
    assert.equal((await fetch(`${basis}/api/editor/status`)).status, 403);
    assert.equal((await fetch(`${basis}/api/editor/datei?pfad=client/audio/eigene/pistole.ogg`, { method: 'PUT', headers: { ...kopf, Origin: 'https://boese.example' }, body: 'x' })).status, 403);
    // Ausbruch: nein
    r = await fetch(`${basis}/api/editor/datei?pfad=${encodeURIComponent('client/audio/eigene/../../../x.js')}`, { method: 'PUT', headers: kopf, body: 'x' });
    assert.equal(r.status, 400);
    // schreiben → Index
    r = await fetch(`${basis}/api/editor/datei?pfad=client/audio/eigene/pistole.ogg`, { method: 'PUT', headers: kopf, body: new Uint8Array([1, 2, 3]) });
    const d = await r.json();
    assert.equal(d.ok, true);
    assert.equal(d.index.art, 'sounds');
    assert.deepEqual(JSON.parse(readFileSync(path.join(wurzel, 'client/audio/eigene/eigene.json'), 'utf8')).pistole.dateien, ['pistole.ogg']);
    // kaputtes JSON wird nicht abgelegt
    r = await fetch(`${basis}/api/editor/datei?pfad=client/audio/eigene/einstellungen.json`, { method: 'PUT', headers: kopf, body: '{kaputt' });
    assert.equal(r.status, 400);
    assert.ok(!existsSync(path.join(wurzel, 'client/audio/eigene/einstellungen.json')));
    // Musik + Liste
    await fetch(`${basis}/api/editor/datei?pfad=client/musik/stadtrand/b.ogg`, { method: 'PUT', headers: kopf, body: 'x' });
    await fetch(`${basis}/api/editor/datei?pfad=client/musik/stadtrand/a.ogg`, { method: 'PUT', headers: kopf, body: 'x' });
    await fetch(`${basis}/api/editor/datei?pfad=client/musik/einstellungen.json`, { method: 'PUT', headers: kopf, body: JSON.stringify({ stadtrand: { reihenfolge: ['b.ogg'], zufall: false } }) });
    const musik = JSON.parse(readFileSync(path.join(wurzel, 'client/musik/musik.json'), 'utf8'));
    assert.deepEqual(musik.stadtrand, ['b.ogg', 'a.ogg']);
    assert.deepEqual(musik._optionen, { stadtrand: { zufall: false } });
    const liste = await (await fetch(`${basis}/api/editor/liste?ordner=client/musik/`, { headers: kopf })).json();
    assert.ok(liste.dateien.some((x) => x.pfad === 'client/musik/stadtrand/a.ogg' && x.groesse === 1));
    // löschen → Index ohne Datei
    r = await fetch(`${basis}/api/editor/datei?pfad=client/audio/eigene/pistole.ogg`, { method: 'DELETE', headers: kopf });
    assert.equal((await r.json()).ok, true);
    assert.ok(!existsSync(path.join(wurzel, 'client/audio/eigene/pistole.ogg')));
    assert.deepEqual(JSON.parse(readFileSync(path.join(wurzel, 'client/audio/eigene/eigene.json'), 'utf8')), {});
    // statisch: server/node nie
    assert.equal((await fetch(`${basis}/server/node/start.js`)).status, 404);
  } finally {
    server.close();
    rmSync(wurzel, { recursive: true, force: true });
  }
});

test('Spielserver: Editor-API nur vom eigenen Rechner, nie über Proxy/fremden Host', async () => {
  const { erstelleStatischenServer } = await import('../server/node/statischerServer.js');
  const wurzel = mkdtempSync(path.join(tmpdir(), 'spielserver-'));
  mkdirSync(path.join(wurzel, 'client/audio/eigene'), { recursive: true });
  mkdirSync(path.join(wurzel, 'client/musik'), { recursive: true });
  const server = erstelleStatischenServer(wurzel);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const basis = `http://127.0.0.1:${server.address().port}`;
  const kopf = { 'X-Editor': '1' };
  try {
    assert.equal((await fetch(`${basis}/api/editor/status`, { headers: kopf })).status, 200);
    const r = await fetch(`${basis}/api/editor/datei?pfad=client/musik/test.ogg`, { method: 'PUT', headers: kopf, body: 'x' });
    assert.equal((await r.json()).ok, true);
    assert.ok(existsSync(path.join(wurzel, 'client/musik/test.ogg')));
    // über einen Proxy (X-Forwarded-For) → nein, auch mit passendem Host
    assert.equal((await fetch(`${basis}/api/editor/status`, { headers: { ...kopf, 'X-Forwarded-For': '8.8.8.8' } })).status, 403);
    // Ohne Editor-Kopf → nein
    assert.equal((await fetch(`${basis}/api/editor/status`)).status, 403);
  } finally {
    server.close();
    rmSync(wurzel, { recursive: true, force: true });
  }
});
