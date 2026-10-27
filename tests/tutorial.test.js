import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SpielServer } from '../server/spiel/spielServer.js';
import { GastAuthentifizierung } from '../server/spiel/authentifizierung/gastAuthentifizierung.js';
import { TUTORIAL } from '../server/spiel/karten/tutorial.js';
import { KARTEN, verarbeiteKarte } from '../server/spiel/karten/kartenLader.js';
import { FUNK, KAPITEL } from '../server/spiel/tutorial/skript.js';
import { GEGENSTAENDE } from '../server/spiel/konfiguration/gegenstaende.js';
import { REZEPTE } from '../server/spiel/konfiguration/rezepte.js';
import { STANDARD_KONFIGURATION } from '../server/spiel/konfiguration/spielKonfiguration.js';
import { aktualisiereTutorial, tutorialAktion, tutorialFuerClient } from '../server/spiel/systeme/tutorialSystem.js';
import { fuegeSchadenZu, toeten } from '../server/spiel/systeme/kampfSystem.js';
import { fahrzeugAktion } from '../server/spiel/systeme/fahrzeugSystem.js';
import { findePfad } from '../gemeinsam/physik/pfadfindung.js';
import { TICK_DAUER_S } from '../gemeinsam/konstanten.js';

const stillerLog = { info() {}, warn() {}, error() {} };

function neuesTutorial() {
  const server = new SpielServer({ authentifizierung: new GastAuthentifizierung({ admin: true }), kartenDefinition: TUTORIAL, protokoll: stillerLog });
  const w = server.spielWelt;
  const s = w.spielerBetrittWelt('Gast-1000');
  w.aktualisiere(TICK_DAUER_S);
  return { w, s };
}
const tick = (w, n = 1) => {
  for (let i = 0; i < n; i++) w.aktualisiere(TICK_DAUER_S);
};

test('Tutorial: Skript verweist nur auf Vorhandenes (Orte, Items, Rezepte, Funk, Zombie-Varianten)', () => {
  const t = TUTORIAL.tutorial;
  const orte = new Set([...Object.keys(t.punkte), ...Object.keys(t.bereiche)]);
  const ids = new Set();
  const pruefeBed = (w, wo) => {
    if (!w) return;
    if (w.bereich) assert.ok(t.bereiche[w.bereich], `${wo}: Bereich ${w.bereich}`);
    for (const defId of Object.keys(w.hat ?? {})) assert.ok(GEGENSTAENDE[defId], `${wo}: Item ${defId}`);
    if (w.inHand) assert.ok(GEGENSTAENDE[w.inHand], `${wo}: Item ${w.inHand}`);
    if (w.wo?.rezept) assert.ok(REZEPTE[w.wo.rezept], `${wo}: Rezept ${w.wo.rezept}`);
  };
  const pruefeAktionen = (liste, wo) => {
    for (const a of liste ?? []) {
      if (a.boden) assert.ok(GEGENSTAENDE[a.boden.defId] && orte.has(a.boden.punkt), `${wo}: boden ${a.boden.defId}@${a.boden.punkt}`);
      if (a.zombies) {
        assert.ok(orte.has(a.zombies.punkt), `${wo}: zombies@${a.zombies.punkt}`);
        if (a.zombies.variante) assert.ok(STANDARD_KONFIGURATION.zombie.varianten[a.zombies.variante], `${wo}: Variante`);
      }
      for (const k of ['oeffne', 'sperre']) if (a[k]) assert.ok(t.tueren[a[k]], `${wo}: Tür ${a[k]}`);
      if (a.checkpoint) assert.ok(orte.has(a.checkpoint), `${wo}: checkpoint`);
      if (a.funk) assert.ok(FUNK[a.funk], `${wo}: funk ${a.funk}`);
    }
  };
  for (const k of KAPITEL) {
    assert.ok(orte.has(k.start), `Kapitel ${k.titel}: start`);
    for (const defId of Object.keys(k.sichere ?? {})) assert.ok(GEGENSTAENDE[defId], defId);
    for (const s of k.schritte) {
      assert.ok(!ids.has(s.id), `doppelte Schritt-ID ${s.id}`);
      ids.add(s.id);
      assert.ok(s.aufgaben.length > 0 && s.aufgaben.every((a) => a.text && a.wenn), s.id);
      for (const id of [...(s.funk ?? []), s.hilfe].filter(Boolean)) assert.ok(FUNK[id], `${s.id}: Funkzeile ${id}`);
      if (s.ziel) assert.ok(orte.has(s.ziel), `${s.id}: ziel`);
      s.aufgaben.forEach((a) => pruefeBed(a.wenn, s.id));
      pruefeAktionen(s.beiStart, s.id);
      pruefeAktionen(s.beiEnde, s.id);
    }
  }
  assert.ok(!Object.hasOwn(KARTEN, 'tutorial'), 'Tutorial-Karte gehört nicht in die Online-Welt');
});

test('Tutorial: Karte – alle Orte begehbar, Tore gefunden, Wege zwischen den Abschnitten', () => {
  const { w } = neuesTutorial();
  const t = TUTORIAL.tutorial;
  for (const [name, p] of Object.entries(w.tutorial.punkte)) assert.ok(!w.welt.istBlockiert(Math.floor(p.x / 32), Math.floor(p.y / 32)), `${name} blockiert`);
  assert.equal(Object.keys(w.tutorial.tueren).length, Object.keys(t.tueren).length, 'alle Tore sind Türen');
  // Nach Öffnen aller Tore: Bett → Ausfahrt erreichbar
  for (const id of w.tutorial.gesperrt) w.welt.setzeTuer(id, true);
  const von = w.tutorial.punkte.bett;
  for (const ziel of ['verband', 'hammer', 'pistole', 'notaufnahme', 'hof_start', 'baeume', 'beet', 'auto']) {
    const p = w.tutorial.punkte[ziel];
    assert.ok(findePfad(w.welt, von.x, von.y, p.x, p.y, { maxKnoten: 20000, tuerKosten: 1 }), `${ziel} nicht erreichbar`);
  }
});

/** Erfüllt die Aufgaben des aktuellen Schritts so direkt wie möglich (Bot) – prüft so die ganze Kette bis zum Ende. */
function erfuelle(w, s, a) {
  const tut = w.tutorial;
  const t = s.tutorial;
  const zuPunkt = (name) => {
    const p = tut.punkte[name];
    s.x = p.x;
    s.y = p.y;
  };
  const b = a.wenn;
  if (b.bereich && !b.imAuto) zuPunkt(b.bereich);
  if (b.hat) for (const [defId, n] of Object.entries(b.hat)) s.inventar[s.inventar.findIndex((e) => !e)] = { defId, menge: n, ...(GEGENSTAENDE[defId].kategorie === 'fernkampf' ? { magazin: 15 } : {}) };
  if (b.inHand) s.ausgeruestet = s.inventar.findIndex((e) => e?.defId === b.inHand);
  if (b.mindestens) Object.assign(s, b.mindestens);
  if (b.ui) tutorialAktion(w, s, 'ui', b.ui);
  if (b.sprint) t.merker.sprint = true;
  if (b.nachgeladen) t.merker.nachgeladen = true;
  if (b.skill) s.skills.tempo = 1;
  if (b.kills) {
    const zombies = [...w.alleVomTyp('zombie')].slice(0, b.kills);
    assert.equal(zombies.length, b.kills, `${t.kapitel}:${t.schritt} – Zombies zum Erledigen da`);
    for (const z of zombies) toeten(w, z, s);
  }
  if (b.ereignis) t.ereignisse.push({ typ: b.ereignis, ...(b.wo ?? {}) });
  if (b.imAuto && !s.fahrzeug) {
    const fz = [...w.alleVomTyp('fahrzeug')].find((f) => f.modell === 'transporter');
    s.x = fz.x;
    s.y = fz.y + 45;
    fahrzeugAktion(w, s);
    assert.ok(s.fahrzeug, 'eingestiegen');
  }
  if (b.bereich && b.imAuto) {
    const p = tut.punkte[b.bereich];
    Object.assign(s.fahrzeug, { x: p.x, y: p.y });
    Object.assign(s, { x: p.x, y: p.y });
  }
}

test('Tutorial: Durchspiel-Bot schafft alle Kapitel bis „fertig“', () => {
  const { w, s } = neuesTutorial();
  let schutz = 200;
  const besucht = new Set();
  while (!s.tutorial.fertig && schutz-- > 0) {
    const { kapitel, schritt } = s.tutorial;
    const def = KAPITEL[kapitel].schritte[schritt];
    besucht.add(def.id);
    for (const a of def.aufgaben) erfuelle(w, s, a);
    aktualisiereTutorial(w, 0);
    tick(w, 2);
    assert.ok(!s.tot, 'nie tot');
  }
  assert.ok(s.tutorial.fertig, `hängt bei ${s.tutorial.kapitel}:${s.tutorial.schritt}`);
  assert.equal(besucht.size, KAPITEL.reduce((n, k) => n + k.schritte.length, 0));
  assert.equal(tutorialFuerClient(w, s).fertig, true);
});

test('Tutorial: Tore bleiben zu, bis das Kapitel sie öffnet', () => {
  const { w, s } = neuesTutorial();
  const tuer = w.tutorial.tueren.sicherheit;
  const t = w.welt.tueren[tuer];
  s.x = t.x;
  s.y = t.y + 40;
  tick(w, 10);
  assert.equal(w.welt.istTuerOffen(tuer), false);
  tutorialAktion(w, s, 'kapitel', 3); // Sicherheitsdienst
  s.x = t.x;
  s.y = t.y + 40;
  tick(w, 10);
  assert.equal(w.welt.istTuerOffen(tuer), true);
});

test('Tutorial: Ohnmacht statt Tod, Munition wird nachgefüllt, Werkzeug nutzt sich nicht ab', () => {
  const { w, s } = neuesTutorial();
  tutorialAktion(w, s, 'kapitel', 4); // Stromausfall: Pistole + Munition
  tick(w);
  assert.ok(s.inventar.some((e) => e?.defId === 'pistole'));
  const muni = s.inventar.find((e) => e?.defId === 'munition_9mm');
  muni.menge = 2;
  s.inventar.push(null);
  s.inventar[s.inventar.length - 1] = { defId: 'axt', menge: 1, haltbarkeit: 3 };
  tick(w);
  assert.ok(s.inventar.filter((e) => e?.defId === 'munition_9mm').reduce((n, e) => n + e.menge, 0) >= 15);
  assert.equal(s.inventar.find((e) => e?.defId === 'axt').haltbarkeit, undefined);
  s.x = 1500;
  fuegeSchadenZu(w, s, 999, null);
  assert.equal(s.tot, false);
  assert.equal(s.leben, s.maxLeben);
  const cp = w.tutorial.punkte[s.tutorial.checkpoint];
  assert.deepEqual([s.x, s.y], [cp.x, cp.y]);
  assert.ok(s.tutorial.funk.some((f) => f.id === 'ohnmacht'));
});

test('Tutorial: leere Taschen am Anfang, Uhr steht, kein Hunger', () => {
  const { w, s } = neuesTutorial();
  assert.equal(s.inventar.filter(Boolean).length, 0);
  const zeit = w.zeit;
  const hunger = s.hunger;
  tick(w, 90);
  assert.equal(w.zeit, zeit);
  assert.equal(s.hunger, hunger);
  assert.equal(w.anzahlVomTyp('zombie'), 0, 'am Anfang keine Zombies');
});

test('Tutorial: echte Mechanik in Hof und Garten (Abbau, Werkbank, Munition, Feuer, Beet, Ernte, Kochen)', () => {
  const { w, s } = neuesTutorial();
  const tut = w.tutorial;
  const g = w.welt.kachelGroesse;
  const aktion = (art, extra = {}) => {
    s.aktionsPuffer.push({ art, slot: null, ...extra });
    tick(w);
  };
  const slot = (defId) => s.inventar.findIndex((e) => e?.defId === defId);
  const warte = (sek) => tick(w, Math.ceil(sek * 30));
  tutorialAktion(w, s, 'kapitel', 6); // Hinterhof
  tick(w, 3);
  // Werkzeug liegt am Schuppen
  const p = tut.punkte.schuppen;
  Object.assign(s, { x: p.x, y: p.y });
  for (let i = 0; i < 4; i++) aktion('aufheben');
  assert.ok(slot('axt') >= 0 && slot('spitzhacke') >= 0, 'Axt + Spitzhacke aufgehoben');
  tick(w, 2);
  assert.equal(s.tutorial.schritt, 1, 'weiter zu Sammeln');
  // Bäume fällen / Steine abbauen bis genug da ist
  const anzahl = (defId) => s.inventar.reduce((n, e) => n + (e?.defId === defId ? e.menge : 0), 0);
  for (const art of ['holz', 'stein']) {
    const ziel = art === 'holz' ? 6 : 3;
    for (let versuch = 0; versuch < 12 && anzahl(art) < ziel; versuch++) {
      const r = w.welt.ressourcen.find((x) => x.art === art && !w.welt.istAbgebaut?.(x.id) && !w.ressourcenNachwuchs.has(x.id));
      Object.assign(s, { x: r.x, y: r.y + r.radius + 14 });
      aktion('abbauen');
      warte(4);
    }
    assert.ok(anzahl(art) >= ziel, `${art}: ${anzahl(art)}`);
  }
  tick(w, 2);
  assert.equal(s.tutorial.schritt, 2, 'weiter zu Werkbank');
  // Werkbank herstellen und aufstellen, dann Munition gießen
  Object.assign(s, { x: 20 * g + 16, y: 50 * g + 16 });
  aktion('herstellen', { rezept: 'werkbank' });
  aktion('platzieren', { slot: slot('werkbank'), tx: 21, ty: 50 });
  tick(w, 2);
  assert.equal(s.tutorial.schritt, 3, 'weiter zu Munition');
  aktion('herstellen', { rezept: 'munition_9mm' });
  tick(w, 2);
  assert.equal(s.tutorial.kapitel, 7, 'Garten erreicht');
  // Garten: Lagerfeuer bauen + Feuerzeug aufheben, anzünden
  const beet = tut.punkte.beet;
  Object.assign(s, { x: beet.x, y: beet.y });
  for (let i = 0; i < 4; i++) aktion('aufheben');
  aktion('herstellen', { rezept: 'lagerfeuer' });
  aktion('platzieren', { slot: slot('lagerfeuer'), tx: Math.floor(beet.x / g) + 2, ty: Math.floor(beet.y / g) });
  tick(w, 2);
  assert.equal(s.tutorial.schritt, 1, `weiter zu Anzünden (${JSON.stringify(s.tutorial.erledigt)})`);
  const lf = [...w.welt.bauwerke.values()].find((x) => x.typ === 'lagerfeuer');
  Object.assign(s, { x: (lf.tx + 0.5) * g, y: (lf.ty + 1.6) * g });
  aktion('feuer');
  Object.assign(s, { x: beet.x, y: beet.y });
  tick(w, 2);
  assert.equal(s.tutorial.schritt, 2, 'Feuer brennt');
  // Beet anlegen und pflanzen
  s.ausgeruestet = slot('hacke');
  aktion('feld', { tx: Math.floor(beet.x / g) - 1, ty: Math.floor(beet.y / g) + 1 });
  assert.ok([...w.welt.bauwerke.values()].some((b) => b.typ === 'beet'), 'Beet da');
  s.ausgeruestet = slot('samen_tomate');
  s.angriff = true;
  tick(w);
  s.angriff = false;
  if (s.tutorial.schritt === 2) {
    const b = [...w.welt.bauwerke.values()].find((x) => x.typ === 'beet');
    Object.assign(s, { x: (b.tx + 0.5) * g, y: (b.ty + 1.5) * g });
    aktion('bauwerk');
  }
  tick(w, 2);
  assert.equal(s.tutorial.schritt, 3, 'gepflanzt');
  warte(20);
  const b = [...w.welt.bauwerke.values()].find((x) => x.typ === 'beet');
  assert.equal(b.wachstum, 1, 'nach 20 s reif');
  Object.assign(s, { x: (b.tx + 0.5) * g, y: (b.ty + 1.5) * g });
  aktion('bauwerk');
  assert.ok(slot('tomate') >= 0, 'Tomate geerntet');
  // Braten
  const feuer = [...w.welt.bauwerke.values()].find((x) => x.typ === 'lagerfeuer');
  Object.assign(s, { x: (feuer.tx + 0.5) * g, y: (feuer.ty + 1.6) * g });
  aktion('bauwerk', { bauwerkId: feuer.id });
  aktion('stationLegen', { slot: slot('tomate') });
  warte(10);
  tick(w, 2);
  assert.equal(s.tutorial.kapitel, 8, `Finale erreicht (${s.tutorial.kapitel}:${s.tutorial.schritt})`);
});
