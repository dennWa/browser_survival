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

test('Projekt: Item-Daten speichern (studioDaten.js) und KI-Anleitung als eigenen Prozess neu schreiben – auf einer Kopie', async () => {
  const tmp = mkdtempSync(path.join(tmpdir(), 'studio-items-'));
  try {
    for (const o of ['server/spiel', 'gemeinsam', 'editor/kern', 'werkzeuge/ki', 'client/darstellung', 'client/audio', 'client/assets/eigene/index.json', 'client/musik/musik.json']) cpSync(path.join(WURZEL, o), path.join(tmp, o), { recursive: true });
    writeFileSync(path.join(tmp, 'package.json'), '{"type":"module"}');
    mkdirSync(path.join(tmp, 'editor'), { recursive: true });
    const p = new Projekt(tmp);
    assert.deepEqual(await p.studioDaten(), { gegenstaende: {}, icons: {}, lootTabellen: {}, rezepte: {} });
    assert.throws(() => p.speichereStudioDaten({ gegenstaende: { 'Böse!': {} } }), /Ungültige ID/);
    assert.throws(() => p.speichereStudioDaten({ lootTabellen: { kaputt: [{ id: 'apfel', gewicht: 0 }] } }), /gewicht/);
    p.speichereStudioDaten({ gegenstaende: { dosenbrot: { name: 'Dosenbrot', kategorie: 'nahrung', naehrwert: 30 } }, icons: { dosenbrot: 'konservendose' }, lootTabellen: { kueche_neu: [{ id: 'dosenbrot', gewicht: 1 }] }, rezepte: {} });
    const daten = await p.studioDaten();
    assert.equal(daten.gegenstaende.dosenbrot.naehrwert, 30);
    assert.equal(await p.aktualisiereKiAnleitung(), true);
    assert.ok(readFileSync(path.join(tmp, 'editor/KI_KARTEN_ANLEITUNG.md'), 'utf8').length > 1000);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('Bau-Hilfen: Streuen (deterministisch, ohne Überlappen, nur Naturboden), Radieren, Straße, Ersetzen, Wald/Dorf laden im Spiel', async () => {
  const B = await import('../studio/kern/bauhilfen.js');
  const k = testKarte();
  k.anwenden(A.rechteckOps(k, { x: 0, y: 20, b: 40, h: 2 }, '_'));
  const a = B.streuOps(k, 20, 10, 8, { typen: B.STREU_SETS.wald.typen, dichte: 6, saat: 3 });
  const b = B.streuOps(k, 20, 10, 8, { typen: B.STREU_SETS.wald.typen, dichte: 6, saat: 3 });
  assert.deepEqual(a.ops, b.ops, 'gleiche Saat = gleiches Ergebnis');
  assert.ok(a.anzahl >= 5);
  k.anwenden(a.ops);
  assert.ok(B.streuOps(k, 20, 21, 1.5, { typen: ['objekt:stein'], dichte: 40 }).anzahl === 0, 'nicht auf Asphalt');
  assert.equal(B.radierOps(k, 20, 10, 9, { typen: B.STREU_SETS.wald.typen }).length, a.anzahl);
  k.anwenden(B.strassenOps(k, { x: 0, y: 26 }, { x: 39, y: 26 }, { fahrbahn: 4, gehweg: 1, laternen: 10 }).ops);
  assert.equal(k.kachelAn(5, 26), '=');
  assert.equal(k.kachelAn(5, 23), '-');
  assert.ok([...k.s('objekte').values()].some((o) => o.typ === 'licht' && o.mast));
  const vorher = [...k.s('objekte').values()].filter((o) => o.typ === 'busch').length;
  k.anwenden(B.ersetzOps(k, { vonTyp: 'busch', zu: 'objekt:stein' }));
  assert.equal([...k.s('objekte').values()].filter((o) => o.typ === 'busch').length, 0);
  assert.ok([...k.s('objekte').values()].filter((o) => o.typ === 'stein').length >= vorher);
  const gross = new EditorKarte({ id: 'gen', name: 'G', breite: 80, hoehe: 60 });
  gross.anwenden(A.markerOps(gross, 'start', 1, 1));
  gross.anwenden(B.verdichte(B.generiereWald(gross, { x: 0, y: 0, b: 40, h: 60 }, { saat: 2 }).ops));
  const d = B.generiereDorf(gross, { x: 40, y: 0, b: 40, h: 60 }, { haeuser: 4 });
  gross.anwenden(d.ops);
  assert.ok(d.haeuser >= 3);
  const { nachDefinition } = await import('../editor/kern/format.js');
  verarbeiteKarte(nachDefinition(gross));
});

test('Analysen: Laufweg findet Raum ohne Tür, Balance zählt Loot je Stunde; Vorlagen-Kopien aktualisieren; Notizen', async () => {
  const { laufweg, balance } = await import('../studio/kern/analyse.js');
  const { nachDefinition } = await import('../editor/kern/format.js');
  const k = testKarte();
  k.anwenden(A.raumOps(k, { x: 10, y: 10, b: 7, h: 6, name: 'Bunker', lootTabelle: 'lager', tuer: null }).ops);
  const l = laufweg(nachDefinition(k));
  assert.ok(l.befunde.some((b) => b.art === 'flaeche'));
  assert.ok(l.befunde.some((b) => b.art === 'loot'));
  assert.ok(l.anteil < 1);
  const bal = balance(nachDefinition(k));
  assert.ok(bal.jeStunde.essen + bal.jeStunde.material + bal.jeStunde.sonstiges > 0);
  // Vorlage verknüpft einsetzen, Vorlage ändern, Kopie aktualisieren
  const v = A.vorlageAus(k, { x: 10, y: 10, b: 7, h: 6 }, 'Bunker');
  const { ops, id } = A.verknuepfteVorlageOps(k, 'bunker', v, 25, 5);
  k.anwenden(ops);
  assert.equal(A.vorlagenInstanzen(k)[0].vorlage, 'bunker');
  const v2 = { ...v, objekte: [...v.objekte, { typ: 'fass', x: 2, y: 2, b: 0.9, h: 0.9, blockiert: true }] };
  k.anwenden(A.aktualisiereInstanzOps(k, A.vorlagenInstanzen(k)[0], v2));
  assert.equal([...k.s('objekte').values()].filter((o) => o.typ === 'fass').length, 1);
  k.anwenden(A.entkoppleOps(k, id));
  assert.equal(A.vorlagenInstanzen(k).length, 0);
  const n = A.notizOps(k, 3, 4, 'Hier fehlt eine Tankstelle');
  k.anwenden(n.ops);
  assert.equal(nachDefinition(k).notizen[0].text, 'Hier fehlt eine Tankstelle');
  assert.throws(() => A.notizOps(k, 1, 1, '  '), /leer/);
});

test('Phase 4.2: Pinsel = Vorschau-Fläche (quadratisch), Wände/Fenster/Türen beim Bodenmalen geschützt', async () => {
  const A = await import('../studio/kern/aktionen.js');
  const { EditorKarte } = await import('../editor/kern/karte.js');
  const k = new EditorKarte({ id: 'p', name: 'p', breite: 12, hoehe: 12 });
  for (const n of [1, 2, 3, 4, 5]) {
    const e = A.pinselEcke(6, 6, n);
    const ops = A.pinselOps(k, 6, 6, n, '$');
    const xs = ops.map((o) => o.i % 12);
    const ys = ops.map((o) => Math.floor(o.i / 12));
    assert.equal(ops.length, n * n, `${n}×${n} = ${n * n} Kacheln`);
    assert.deepEqual([Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)], [e.x, e.y, e.x + n - 1, e.y + n - 1], `Größe ${n}: Vorschau = Fläche`);
  }
  k.anwenden(A.wandOps(k, { x: 2, y: 2 }, { x: 8, y: 2 }, 'wand'));
  k.anwenden([{ s: 'kachel', i: k.index(4, 2), neu: 'T' }]);
  const geschuetzt = A.rechteckOps(k, { x: 0, y: 0, b: 12, h: 5 }, '$', { waendeSchuetzen: true });
  assert.equal(geschuetzt.length, 60 - 7, 'Wand (6) + Tür (1) bleiben');
  assert.equal(A.rechteckOps(k, { x: 0, y: 0, b: 12, h: 5 }, '$').length, 60);
  assert.equal(A.pinselOps(k, 4, 2, 3, '$', { waendeSchuetzen: true }).length, 6);
});

test('Phase 4.6: Veröffentlichen – Status, Tests, Commit, Pull, Push (lokales Test-Repo)', async () => {
  const { status, veroeffentliche, nachrichtVorschlag } = await import('../studio/main/veroeffentlichen.mjs');
  const { execFileSync } = await import('node:child_process');
  const tmp = mkdtempSync(path.join(tmpdir(), 'studio-git-'));
  try {
    const git = (cwd, ...a) => execFileSync('git', a, { cwd, stdio: 'pipe' }).toString();
    const fern = path.join(tmp, 'fern.git');
    const repo = path.join(tmp, 'repo');
    git(tmp, 'init', '-q', '--bare', '-b', 'main', fern);
    git(tmp, 'clone', '-q', fern, repo);
    for (const [k, v] of [['user.email', 't@t'], ['user.name', 'Test']]) git(repo, 'config', k, v);
    mkdirSync(path.join(repo, 'tests'), { recursive: true });
    writeFileSync(path.join(repo, 'tests/ok.test.js'), "import { test } from 'node:test'; test('ok', () => {});\n");
    git(repo, 'add', '-A');
    git(repo, 'commit', '-q', '-m', 'start');
    git(repo, 'push', '-q', 'origin', 'HEAD:main');
    mkdirSync(path.join(repo, 'server/spiel/karten'), { recursive: true });
    writeFileSync(path.join(repo, 'server/spiel/karten/neu.js'), 'export const X = 1;\n');
    const st = await status(repo);
    assert.equal(st.zweig, 'main');
    assert.deepEqual(st.aenderungen, [{ art: 'neu', datei: 'server/spiel/karten/neu.js' }]);
    assert.equal(st.vorschlag, 'Studio: Zonen aktualisiert');
    const r = await veroeffentliche(repo, { nachricht: 'Neue Zone' });
    assert.ok(r.ok, JSON.stringify(r.schritte));
    assert.match(git(fern, 'log', '-1', '--format=%s', 'main'), /Neue Zone/);
    // Tests rot → nichts wird hochgeladen
    writeFileSync(path.join(repo, 'tests/rot.test.js'), "import { test } from 'node:test'; test('rot', () => { throw new Error('x'); });\n");
    const r2 = await veroeffentliche(repo, { nachricht: 'kaputt' });
    assert.equal(r2.ok, false);
    assert.equal(r2.schritte.length, 1);
    assert.match(git(fern, 'log', '-1', '--format=%s', 'main'), /Neue Zone/, 'remote unverändert');
    assert.equal(nachrichtVorschlag([{ datei: 'client/audio/eigene/a.ogg' }, { datei: 'client/assets/eigene/b.glb' }]), 'Studio: Audio, Modelle aktualisiert');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('Phase 4.7: Vorschlagsmodus – Elemente, einzelne zurücknehmen, Rest übernehmen', async () => {
  const { Vorschlaege, rueckOps, mitKoordinaten } = await import('../studio/kern/vorschlaege.js');
  const A = await import('../studio/kern/aktionen.js');
  const { EditorKarte } = await import('../editor/kern/karte.js');
  const k = new EditorKarte({ id: 'v', name: 'v', breite: 10, hoehe: 10 });
  const v = new Vorschlaege();
  const e1 = v.merke('v', 'KI: Wiese', k.anwenden(A.rechteckOps(k, { x: 0, y: 0, b: 3, h: 2 }, '$')));
  const e2 = v.merke('v', 'KI: Bäume', k.anwenden([...A.objektOps(k, 'objekt:baum', 5, 5).ops]));
  const id2 = [...k.s('objekte').keys()][0];
  k.anwenden(A.objektOps(k, 'objekt:stein', 1, 1).ops); // von Hand, kein Vorschlag
  assert.deepEqual(e1.elemente.map((e) => e.text), ['6× Boden → rasen']);
  assert.equal(e2.elemente[0].art, 'neu');
  assert.match(e2.elemente[0].text, /Objekt baum/);
  assert.equal(mitKoordinaten(e1.elemente[0].orte, 10).length, 6);
  assert.equal(v.markierungen('v').length, 7);
  // Baum ablehnen → weg, Stein (von Hand) bleibt
  k.anwenden(rueckOps(k, v.nimm(`${e2.id}:${e2.elemente[0].id}`)));
  assert.equal(k.s('objekte').has(id2), false);
  assert.equal(k.s('objekte').size, 1);
  // Eine Rasen-Kachel von Hand übermalt → Rücknahme lässt sie stehen
  k.anwenden([{ s: 'kachel', i: k.index(0, 0), neu: '&' }]);
  const r = rueckOps(k, v.nimm(String(e1.id)));
  assert.equal(r.length, 5);
  k.anwenden(r);
  assert.equal(k.kachelAn(0, 0), '&');
  assert.equal(k.kachelAn(1, 0), ',');
  assert.equal(v.liste.length, 0);
  v.merke('v', 'x', k.anwenden(A.rechteckOps(k, { x: 0, y: 5, b: 1, h: 1 }, '$')));
  assert.equal(v.uebernimm('v'), 1);
  assert.equal(k.kachelAn(0, 5), '$', 'übernommen = bleibt');
});
