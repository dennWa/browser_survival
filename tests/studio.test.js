/**
 * Browser Survival Studio (studio/): Bau-Aktionen, Dokument (Undo, Entwurf, Definition), Projekt-Dateien (Zonen, Entwurf,
 * Vorlage, Modell-Import mit Credits, Klang für Zone, Ins Spiel), MCP-Server (tools/list, Token), KI-Assistent-Schleifen
 * (Claude/OpenAI-kompatibel/Gemini mit Attrappen). Kein Electron nötig. Oberfläche: `npm run rauchtest:studio`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync, writeFileSync, existsSync, mkdirSync, cpSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as A from '../studio/kern/aktionen.js';
import { Dokument } from '../studio/kern/dokument.js';
import { Befehle, normaleTaste } from '../studio/kern/befehle.js';
import { KI_WERKZEUGE } from '../studio/kern/kiWerkzeuge.js';
import { Projekt } from '../studio/main/projekt.mjs';
import { starteMcp, alsMcpInhalt } from '../studio/main/mcp.mjs';
import { KiAssistent } from '../studio/main/ki.mjs';
import { EditorKarte } from '../editor/kern/karte.js';
import { verarbeiteKarte } from '../server/spiel/karten/kartenLader.js';

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function testKarte() {
  const k = new EditorKarte({ id: 'studio_t', name: 'T', breite: 40, hoehe: 30 });
  k.anwenden(A.markerOps(k, 'start', 2, 2));
  return k;
}

test('Aktionen: Raum (Wände, Boden, Tür, Loot-Punkte, Raumfläche), Wand, Rechteck, Füllen', () => {
  const k = testKarte();
  const { ops, raum } = A.raumOps(k, { x: 5, y: 5, b: 8, h: 6, name: 'Küche', lootTabelle: 'kueche', tuer: 's' });
  k.anwenden(ops);
  assert.equal(raum, 'a');
  assert.equal(k.kachelAn(5, 5), '#');
  assert.equal(k.kachelAn(6, 6), '.');
  assert.equal(k.kachelAn(9, 10), 'T', 'Tür in der Mitte der Südwand');
  assert.ok([...k.s('marker').values()].filter((m) => m.art === 'loot').length >= 1);
  assert.equal(k.s('raumFlaechen').size, 1);
  assert.throws(() => A.raumOps(k, { x: 0, y: 0, b: 2, h: 2 }), /3 × 3/);
  k.anwenden(A.wandOps(k, { x: 20, y: 2 }, { x: 27, y: 3 }, 'fenster'));
  assert.equal(k.kachelAn(27, 2), 'F', 'rastet waagerecht ein');
  k.anwenden(A.rechteckOps(k, { x: 30, y: 20, b: 3, h: 2 }, '~'));
  assert.equal(k.kachelAn(32, 21), '~');
  assert.throws(() => A.rechteckOps(k, { x: 0, y: 0, b: 1, h: 1 }, 'Q'), /Unbekannte Kachel/);
  const fuell = A.fuellOps(k, 6, 6, '+');
  assert.ok(fuell.length >= 24 && fuell.length <= 30, 'füllt nur das Rauminnere');
});

test('Aktionen: Objekt mit Drehung und Skalierung (Grundfläche wächst mit), skalieren/drehen hält die Mitte', () => {
  const k = testKarte();
  const { ops, id } = A.objektOps(k, 'objekt:tisch', 10, 10, { drehung: 90, skalierung: 2 });
  k.anwenden(ops);
  const o = k.s('objekte').get(id);
  assert.deepEqual([o.b, o.h, o.drehung, o.skalierung], [2, 4, 90, 2], 'Tisch 2×1 → gedreht 1×2 → ×2');
  const klein = A.skaliertesObjekt(o, 1);
  assert.equal(klein.skalierung, undefined);
  assert.equal(klein.x + klein.b / 2, o.x + o.b / 2, 'Mitte bleibt');
  const quer = A.gedrehtesObjekt(klein, 0);
  assert.deepEqual([quer.b, quer.h, quer.drehung], [2, 1, undefined]);
  assert.throws(() => A.objektOps(k, 'objekt:gibtsnicht', 1, 1), /Unbekanntes Objekt/);
});

test('Aktionen: Marker (nur EIN Start), Spawnpunkt, Bereiche, Punktklang, Verschieben, Duplizieren, Löschen', () => {
  const k = testKarte();
  k.anwenden(A.markerOps(k, 'start', 8, 8));
  assert.equal([...k.s('marker').values()].filter((m) => m.art === 'start').length, 1);
  k.anwenden(A.markerOps(k, 'ankunft', 0, 15, { name: 'von_wald' }));
  assert.deepEqual(k.s('ankuenfte').get('von_wald'), { x: 0, y: 15 });
  const sp = A.spawnpunktOps(k, { x: 4.5, y: 4.5, inhalt: 'apfel', chance: 30, intervall: 5, hoehe: 0.8 });
  k.anwenden(sp.ops);
  assert.equal(k.s('spawnpunkte').get(sp.id).hoehe, 0.8);
  assert.throws(() => A.spawnpunktOps(k, { x: 1, y: 1, inhalt: 'quatsch' }), /unbekannter Inhalt/);
  const loot = A.flaecheOps(k, 'loot', { x: 20, y: 10, b: 10, h: 10 }, { tabelle: 'lager' });
  k.anwenden(loot.ops);
  assert.ok(k.s('lootZonen').get(loot.id).eintraege.length > 3);
  assert.throws(() => A.flaecheOps(k, 'uebergang', { x: 0, y: 0, b: 1, h: 5 }, {}), /Zielzone/);
  const kl = A.punktKlangOps(k, 15, 15, { datei: 'audio/karten/studio_t/feuer.ogg' });
  k.anwenden(kl.ops);
  assert.equal(k.s('klaenge').get(kl.id).art, 'punkt');
  k.anwenden(A.verschiebeOps(k, [{ s: 'spawnpunkte', k: sp.id }, { s: 'marker', k: '8,8' }], 2, 1));
  assert.equal(k.s('spawnpunkte').get(sp.id).x, 6.5);
  assert.ok(k.s('marker').has('10,9'));
  const { ops, neue } = A.duplizierOps(k, [{ s: 'spawnpunkte', k: sp.id }]);
  k.anwenden(ops);
  assert.equal(k.s('spawnpunkte').size, 2);
  k.anwenden(A.loeschOps(neue));
  assert.equal(k.s('spawnpunkte').size, 1);
});

test('Aktionen: Vorlage aus Rechteck (inkl. Spawnpunkte & Klänge) und wieder einsetzen', () => {
  const k = testKarte();
  k.anwenden(A.raumOps(k, { x: 5, y: 5, b: 6, h: 5, name: 'Haus', lootTabelle: 'wohnung' }).ops);
  k.anwenden(A.spawnpunktOps(k, { x: 7.5, y: 7.5, inhalt: 'verband', chance: 20, intervall: 15 }).ops);
  const v = A.vorlageAus(k, { x: 5, y: 5, b: 6, h: 5 }, 'Haus');
  assert.equal(v.spawnpunkte.length, 1);
  assert.deepEqual([v.spawnpunkte[0].x, v.spawnpunkte[0].y], [2.5, 2.5]);
  const { ops } = A.vorlageOps(k, v, 25, 15);
  k.anwenden(ops);
  assert.equal(k.kachelAn(25, 15), '#');
  assert.equal(k.s('spawnpunkte').size, 2);
  assert.equal([...k.s('marker').values()].filter((m) => m.art === 'loot').length % 2, 0, 'Loot-Punkte mitkopiert');
});

test('Aktionen: Klang am Objekt → Punktklang beim Export, beim Öffnen wieder entfernt', () => {
  const k = testKarte();
  const { ops, id } = A.objektOps(k, 'objekt:fass', 10, 10);
  k.anwenden(ops);
  k.anwenden(A.aenderOps(k, 'objekte', id, { klang: { datei: 'audio/karten/studio_t/tropfen.ogg', aussen: 6 } }));
  const kl = A.objektKlaenge(k);
  assert.equal(kl.length, 1);
  assert.ok(kl[0].name.endsWith(A.OBJEKT_KLANG_SUFFIX));
  k.anwenden(kl.map((c, i) => ({ s: 'klaenge', k: 900 + i, neu: c })));
  assert.equal(A.entferneObjektKlaenge(k).length, 1);
});

test('Dokument: neue Zone, ändern = 1 Undo-Schritt, Gruppe, Auswahl bereinigt sich, Definition lädt im Spiel', async () => {
  const gespeichert = {};
  const nativ = { aufruf: async (a, d) => (a === 'projekt.speichereEntwurf' ? (gespeichert[d.id] = d.inhalt) : null) };
  const dok = new Dokument(nativ);
  const meldungen = [];
  dok.bei('aenderung', ({ ops }) => meldungen.push(ops.length));
  dok.neu({ id: 'studio_t', name: 'T', breite: 30, hoehe: 20 });
  dok.aendere('Start', A.markerOps(dok.karte, 'start', 3, 3));
  const r = A.objektOps(dok.karte, 'objekt:kiste', 6, 6);
  dok.aendere('Kiste', r.ops);
  dok.waehle([{ s: 'objekte', k: r.id }]);
  dok.gruppe('Zwei Spawnpunkte', () => {
    dok.aendere('a', A.spawnpunktOps(dok.karte, { x: 10, y: 10, inhalt: 'apfel' }).ops);
    dok.aendere('b', A.spawnpunktOps(dok.karte, { x: 11, y: 10, inhalt: 'apfel' }).ops);
  });
  assert.equal(dok.karte.s('spawnpunkte').size, 2);
  dok.rueckgaengig();
  assert.equal(dok.karte.s('spawnpunkte').size, 0, 'Gruppe = ein Schritt');
  dok.rueckgaengig();
  assert.equal(dok.auswahl.length, 0, 'Auswahl auf gelöschtes Objekt verschwindet');
  dok.wiederholen();
  assert.ok(meldungen.length >= 5);
  assert.ok(dok.geaendert);
  await dok.speichereEntwurf();
  assert.equal(gespeichert.studio_t.format, 'browser-survival-entwurf');
  assert.equal(dok.geaendert, false);
  const v = verarbeiteKarte(dok.definition());
  assert.equal(v.spielerStarts.length, 1);
});

test('Befehle: registrieren, aktiv, Tastenkürzel, Suche', async () => {
  const b = new Befehle();
  let n = 0;
  b.registriere({ id: 'a.eins', gruppe: 'Datei', titel: 'Speichern', kuerzel: 'Strg+S', ausfuehren: () => n++ }, { id: 'a.zwei', gruppe: 'Ansicht', titel: 'Raster', aktiv: () => false, ausfuehren: () => n++ });
  assert.equal(normaleTaste({ ctrlKey: true, key: 's' }), 'Strg+S');
  assert.equal(b.zuTaste({ ctrlKey: true, key: 's' }).id, 'a.eins');
  await b.aus('a.eins');
  await b.aus('a.zwei');
  assert.equal(n, 1, 'inaktive Befehle laufen nicht');
  assert.deepEqual(b.suche('rast').map((x) => x.id), ['a.zwei']);
  assert.throws(() => b.registriere({ id: 'a.eins' }), /doppelt/);
});

test('KI-Werkzeuge: eindeutige Namen, Schemas mit Pflichtfeldern aus den Eigenschaften', () => {
  const namen = KI_WERKZEUGE.map((w) => w.name);
  assert.equal(new Set(namen).size, namen.length);
  for (const w of KI_WERKZEUGE) {
    assert.equal(w.schema.type, 'object', w.name);
    for (const p of w.schema.required ?? []) assert.ok(w.schema.properties[p], `${w.name}: ${p}`);
    assert.ok(/^[a-z_]+$/.test(w.name));
  }
});

test('Projekt: Zonen lesen (registriert/Datei), Entwurf, Vorlage, Modell-Import mit Credits, Klang für Zone', async () => {
  const tmp = mkdtempSync(path.join(tmpdir(), 'studio-projekt-'));
  try {
    // Mini-Spielordner: Karten-Ordner kopieren + nötige Ordner
    cpSync(path.join(WURZEL, 'server/spiel/karten'), path.join(tmp, 'server/spiel/karten'), { recursive: true });
    mkdirSync(path.join(tmp, 'client/assets/eigene'), { recursive: true });
    mkdirSync(path.join(tmp, 'client/audio/eigene'), { recursive: true });
    writeFileSync(path.join(tmp, 'client/audio/eigene/tropfen.ogg'), 'OggS');
    writeFileSync(path.join(tmp, 'package.json'), '{"version":"9.9.9"}');
    const p = new Projekt(tmp);
    assert.equal(p.info().version, '9.9.9');
    const zonen = await p.zonen();
    assert.ok(zonen.find((z) => z.id === 'waldweg')?.registriert);
    assert.equal(zonen.find((z) => z.id === 'tutorial')?.registriert, false);
    assert.equal((await p.definition('stadtrand')).id, 'stadtrand');
    p.speichereEntwurf('neu_zone', { karte: { werte: { id: 'neu_zone', name: 'Neu' }, breite: 10, hoehe: 10 } });
    assert.ok((await p.zonen()).find((z) => z.id === 'neu_zone')?.entwurf);
    p.loescheEntwurf('neu_zone');
    p.speichereVorlage({ id: 'haus', name: 'Haus', vorlage: { b: 1, h: 1, zellen: ['.'] } });
    assert.equal(p.vorlagen()[0].name, 'Haus');
    assert.throws(() => p.importiereModell({ bytes: new Uint8Array([1, 2, 3, 4]) }, { stem: 'kaputt' }), /glTF/);
    const glb = new Uint8Array([0x67, 0x6c, 0x54, 0x46, 2, 0, 0, 0]);
    p.importiereModell({ bytes: glb }, { stem: 'mein-stuhl', name: 'Mein Stuhl', kategorie: 'moebel', masse: { b: 0.5, h: 0.5, hoehe: 1 }, zielHoehe: 0.9, urheber: 'Ich', lizenz: 'CC0', url: 'https://example.org', vorschau: new Uint8Array([1]) });
    assert.equal(p.modellIndex()[0].datei, 'mein-stuhl.glb');
    assert.equal(p.credits()[0].urheber, 'Ich');
    assert.ok(existsSync(path.join(tmp, 'client/assets/eigene/vorschau/mein-stuhl.png')));
    assert.throws(() => p.importiereModell({ bytes: glb }, { stem: 'mein-stuhl' }), /gibt es schon/);
    assert.throws(() => p.importiereModell({ bytes: glb }, { stem: '../boese' }), /Dateiname/);
    const ziel = p.klangFuerZone('audio/eigene/tropfen.ogg', 'waldweg');
    assert.equal(ziel, 'audio/karten/waldweg/tropfen.ogg');
    assert.ok(p.klangDateien().some((d) => d.pfad === ziel));
    assert.throws(() => p.klangFuerZone('../../etc/passwd', 'waldweg'));
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('Projekt: Ins Spiel schreibt die Kartendatei (mit Spawnpunkten) und trägt sie in KARTEN ein – auf einer Kopie', async () => {
  const tmp = mkdtempSync(path.join(tmpdir(), 'studio-insspiel-'));
  try {
    for (const o of ['server/spiel', 'gemeinsam', 'editor/kern', 'werkzeuge/karten', 'client/darstellung', 'client/audio']) cpSync(path.join(WURZEL, o), path.join(tmp, o), { recursive: true });
    writeFileSync(path.join(tmp, 'package.json'), '{"type":"module"}');
    const p = new Projekt(tmp);
    const k = testKarte();
    k.anwenden([{ s: 'wert', pfad: 'id', neu: 'studio_testzone' }]);
    k.anwenden(A.spawnpunktOps(k, { x: 5.5, y: 5.5, inhalt: 'apfel' }).ops);
    const { nachDefinition } = await import('../editor/kern/format.js');
    const r = await p.insSpiel(nachDefinition(k));
    assert.equal(r.datei, 'server/spiel/karten/studio_testzone.js');
    assert.equal(r.registriert, true);
    assert.ok(readFileSync(path.join(tmp, 'server/spiel/karten/kartenLader.js'), 'utf8').includes('studio_testzone: STUDIO_TESTZONE'));
    assert.ok(readFileSync(path.join(tmp, r.datei), 'utf8').includes('spawnpunkte'));
    assert.equal((await p.zonen()).find((z) => z.id === 'studio_testzone')?.registriert, true);
    await assert.rejects(p.insSpiel({ id: 'kartenLader' }), /a–z|reserviert/);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('MCP-Server: tools/list, tools/call (Bild + Text), Token-Pflicht, nur lokal', async () => {
  const aufrufe = [];
  const mcp = await starteMcp({ port: 0, token: 'geheim', fuehreAus: async (name, a) => (aufrufe.push(name), name === 'ansicht_bild' ? { ok: true, text: 'bild', bild: 'AAAA' } : { ok: true, daten: { a } }) });
  try {
    const url = `http://127.0.0.1:${mcp.port}/mcp`;
    const kopf = { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', Authorization: 'Bearer geheim' };
    const liste = await (await fetch(url, { method: 'POST', headers: kopf, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }) })).json();
    assert.equal(liste.result.tools.length, KI_WERKZEUGE.length);
    assert.ok(liste.result.tools.find((t) => t.name === 'raum_bauen').inputSchema.properties.lootTabelle);
    const bild = await (await fetch(url, { method: 'POST', headers: kopf, body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'ansicht_bild', arguments: {} } }) })).json();
    assert.equal(bild.result.content[0].type, 'image');
    assert.deepEqual(aufrufe, ['ansicht_bild']);
    assert.equal((await fetch(url, { method: 'POST', headers: { ...kopf, Authorization: 'Bearer falsch' }, body: '{}' })).status, 401);
    assert.equal((await fetch(url, { method: 'POST', headers: { ...kopf, Origin: 'https://boese.example' }, body: '{}' })).status, 403);
    assert.deepEqual(alsMcpInhalt({ ok: false, text: 'nein' }), { content: [{ type: 'text', text: 'nein' }], isError: true });
  } finally {
    await mcp.schliessen();
  }
});

test('KI-Assistent: Werkzeug-Schleifen für Claude (SDK-Attrappe), OpenAI-kompatibel und Gemini (fetch-Attrappe)', async () => {
  const ausgefuehrt = [];
  const fuehreAus = async (name, a) => (ausgefuehrt.push([name, a]), { ok: true, text: 'erledigt' });
  // Claude: erst tool_use, dann Text
  const antworten = [
    { stop_reason: 'tool_use', content: [{ type: 'text', text: 'Ich baue.' }, { type: 'tool_use', id: 't1', name: 'raum_bauen', input: { x: 1, y: 1, b: 5, h: 5 } }] },
    { stop_reason: 'end_turn', content: [{ type: 'text', text: 'Fertig: Raum gebaut.' }] },
  ];
  const anfragen = [];
  const anthropic = { beta: { messages: { create: async (a) => (anfragen.push(a), antworten.shift()) } }, messages: { create: async () => antworten.shift() } };
  const claude = new KiAssistent({ anbieter: 'claude', schluessel: 'x', fuehreAus, anthropic });
  assert.equal(await claude.senden('Bau einen Raum'), 'Fertig: Raum gebaut.');
  assert.equal(anfragen[0].model, 'claude-opus-5-5');
  assert.equal(anfragen[0].tools.length, KI_WERKZEUGE.length);
  assert.ok(anfragen[1].messages.some((m) => m.role === 'user' && m.content?.[0]?.type === 'tool_result'), 'Werkzeug-Ergebnis geht zurück');
  // OpenAI-kompatibel (DeepSeek)
  let runde = 0;
  const holen = async (url, opt) => {
    const body = JSON.parse(opt.body);
    runde++;
    const json = url.includes('generativelanguage')
      ? runde % 2 ? { candidates: [{ content: { role: 'model', parts: [{ functionCall: { name: 'zone_info', args: {} } }] } }] } : { candidates: [{ content: { role: 'model', parts: [{ text: 'Gemini fertig' }] } }] }
      : runde % 2 ? { choices: [{ message: { role: 'assistant', content: null, tool_calls: [{ id: 'c1', type: 'function', function: { name: 'pruefen', arguments: '{}' } }] } }] } : { choices: [{ message: { role: 'assistant', content: 'OpenAI fertig' } }] };
    assert.ok(body.tools?.length);
    return { ok: true, status: 200, text: async () => JSON.stringify(json) };
  };
  assert.equal(await new KiAssistent({ anbieter: 'deepseek', schluessel: 'x', fuehreAus, holen }).senden('prüf mal'), 'OpenAI fertig');
  runde = 0;
  assert.equal(await new KiAssistent({ anbieter: 'gemini', schluessel: 'x', fuehreAus, holen }).senden('info'), 'Gemini fertig');
  assert.deepEqual(ausgefuehrt.map(([n]) => n), ['raum_bauen', 'pruefen', 'zone_info']);
  assert.throws(() => new KiAssistent({ anbieter: 'grok', schluessel: '', fuehreAus }), /API-Schlüssel/);
});
