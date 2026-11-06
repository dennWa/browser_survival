import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SpielWelt } from '../server/spiel/spielWelt.js';
import { erstelleKonfiguration } from '../server/spiel/konfiguration/spielKonfiguration.js';
import { GEGENSTAENDE } from '../server/spiel/konfiguration/gegenstaende.js';
import { REZEPTE } from '../server/spiel/konfiguration/rezepte.js';
import { AKTIONEN } from '../gemeinsam/protokoll.js';
import { TICK_DAUER_S } from '../gemeinsam/konstanten.js';
import { RINDE_MAX, abbauArtFuer } from '../gemeinsam/welt/ressourcen.js';
import { FAHRZEUG, fahre, kmhZuTempo } from '../gemeinsam/physik/fahrzeug.js';
import { wetterSchichten, vorschauWetter } from '../gemeinsam/audio/umgebung.js';
import { untergrundFuer } from '../client/audio/schritte.js';
import { EREIGNISSE } from '../client/audio/eigeneSounds.js';
import { fuegeZumInventarHinzu } from '../server/spiel/systeme/inventarSystem.js';
import { erzeugeFahrzeug } from '../server/spiel/entitaeten/fahrzeug.js';
import { aktualisiereFahrzeuge } from '../server/spiel/systeme/fahrzeugSystem.js';
import { hebeAlleAuf } from './hilfen/aufheben.js';

/** Runde 31: Äste (Busch), Rinde (Baum), Feuerbohrer/Feuerzeug-Nutzungen, Lagerfeuer-Brennstoff, Auto-Zusammenstoß, Schritte auf Asphalt, Lautstärken. */
const KARTE = {
  id: 'wald31',
  name: 'Wald',
  kacheln: Array.from({ length: 12 }, (_, i) => (i === 0 || i === 11 ? '#'.repeat(20) : i === 2 ? `#,S${','.repeat(16)}#` : `#${','.repeat(18)}#`)),
  raeume: {},
  objekte: [
    { typ: 'baum', x: 5, y: 5, b: 2, h: 2, ebene: 'oben' },
    { typ: 'busch', x: 10, y: 5, b: 1.5, h: 1.5, ebene: 'oben' },
  ],
};
const m = (t) => t * 32 + 16;
function welt31(extra = {}) {
  const konfiguration = erstelleKonfiguration({ server: { zufallsStartwert: 5 }, tiere: { hasenProTausend: 0 }, wetter: { aktiv: false }, ziele: { aktiv: false }, bots: { proKarte: 0 }, spieler: { startInventar: [] }, ...extra });
  const welt = new SpielWelt(konfiguration, { kartenDefinition: KARTE });
  for (const z of [...welt.alleVomTyp('zombie')]) welt.entfernen(z.id);
  const spieler = welt.spielerBetrittWelt('Förster');
  spieler.gottmodus = false;
  return { welt, spieler, w: welt.welt };
}
const laufe = (welt, n) => {
  for (let i = 0; i < n; i++) welt.aktualisiere(TICK_DAUER_S);
};
const aktion = (welt, spieler, a) => {
  spieler.aktionsPuffer.push({ slot: null, ...a });
  welt.aktualisiere(TICK_DAUER_S);
};
const anzahl = (spieler, defId) => spieler.inventar.reduce((s, e) => s + (e?.defId === defId ? e.menge : 0), 0);
const slotVon = (spieler, defId) => spieler.inventar.findIndex((e) => e?.defId === defId);
const zu = (spieler, r) => Object.assign(spieler, { x: r.x, y: r.y + r.radius + 12 });

test('Busch: Machete/Axt/Messer schneiden einen Ast, ohne Werkzeug nicht; Busch verschwindet und wächst nach', () => {
  const { welt, spieler, w } = welt31({ ressourcen: { ast: { dauer: 0.1, chanceAufMehr: 0, nachwachsen: 5 } } });
  const busch = w.ressourcen.find((r) => r.typ === 'busch');
  assert.ok(busch && busch.art === 'ast' && busch.werkzeuge.includes('machete'));
  zu(spieler, busch);
  aktion(welt, spieler, { art: AKTIONEN.ABBAUEN });
  assert.ok(welt.meldungen.some((x) => x.text.includes('Machete')), 'Hinweis ohne Werkzeug');
  assert.equal(spieler.arbeit, null);
  fuegeZumInventarHinzu(spieler, 'kuechenmesser', 1);
  aktion(welt, spieler, { art: AKTIONEN.ABBAUEN });
  assert.equal(spieler.arbeit?.art, 'ast');
  laufe(welt, 12);
  assert.equal(anzahl(spieler, 'ast'), 1);
  assert.ok(!w.istRessourceDa(busch.id), 'Busch ist weg');
  Object.assign(spieler, { x: m(16), y: m(9) }); // nicht daneben stehen, sonst wächst nichts nach
  laufe(welt, 5 * 30 + 10);
  assert.ok(w.istRessourceDa(busch.id), 'Busch wächst nach');
});

test('Rinde: Messer/Machete in der Hand schneiden Rinde (3×, Baum bleibt, Dauer = Holzfällen); danach nur noch fällen; Nachwachsen setzt zurück', () => {
  const { welt, spieler, w } = welt31();
  const baum = w.ressourcen.find((r) => r.typ === 'baum');
  fuegeZumInventarHinzu(spieler, 'machete', 1);
  fuegeZumInventarHinzu(spieler, 'axt', 1);
  zu(spieler, baum);
  // Axt in der Hand → fällen; Machete in der Hand → Rinde
  const hand = (defId) => aktion(welt, spieler, { art: AKTIONEN.BENUTZEN, slot: slotVon(spieler, defId) });
  assert.equal(abbauArtFuer(baum, 'axt', (id) => id === 'axt', 0).art, 'holz');
  assert.equal(abbauArtFuer(baum, 'machete', (id) => id === 'machete' || id === 'axt', 0).art, 'rinde');
  assert.equal(abbauArtFuer(baum, 'machete', (id) => id === 'machete', RINDE_MAX), null, 'ohne Axt und ohne Rinde: nichts');
  hand('machete');
  const dauer = welt.konfiguration.ressourcen.holz.dauer * 30;
  for (let i = 1; i <= RINDE_MAX; i++) {
    aktion(welt, spieler, { art: AKTIONEN.ABBAUEN });
    assert.equal(spieler.arbeit?.art, 'rinde', `Schnitt ${i}`);
    assert.equal(spieler.arbeit.dauer, welt.konfiguration.ressourcen.holz.dauer * 1, 'Dauer wie Holzfällen (Skill-Faktor 1)');
    assert.ok(welt.ereignisse.some((e) => e.typ === 'rindeStart'), 'Schnitz-Geräusch-Ereignis');
    laufe(welt, dauer + 10);
    assert.equal(anzahl(spieler, 'rinde'), i);
    assert.equal(w.rindeAb.get(baum.id), i);
    assert.ok(w.istRessourceDa(baum.id), 'Baum bleibt stehen');
  }
  // vierter Versuch mit Machete in der Hand: fällt den Baum mit der Axt im Inventar
  aktion(welt, spieler, { art: AKTIONEN.ABBAUEN });
  assert.equal(spieler.arbeit?.art, 'holz', 'danach nur noch fällen');
  laufe(welt, dauer + 10);
  assert.ok(!w.istRessourceDa(baum.id));
  hebeAlleAuf(welt, spieler); // Runde 38: Holz liegt am Boden
  assert.ok(anzahl(spieler, 'holz') >= 1);
  // Nachwachsen: neuer Baum hat wieder volle Rinde
  Object.assign(spieler, { x: m(16), y: m(9) });
  laufe(welt, welt.konfiguration.ressourcen.holz.nachwachsen * 30 + 60);
  assert.ok(w.istRessourceDa(baum.id));
  assert.equal(w.rindeAb.get(baum.id) ?? 0, 0);
});

test('Rinde-Zähler wird übertragen (Anmeldedaten/RESSOURCEN) und vom Client übernommen', () => {
  const { w } = welt31();
  w.setzeRinde(0, 2);
  const objekt = Object.fromEntries(w.rindeAb);
  assert.deepEqual(objekt, { 0: 2 });
  const { w: client } = welt31();
  client.uebernimmRinde(objekt);
  assert.equal(client.rindeAb.get(0), 2);
  client.uebernimmRinde(undefined);
  assert.equal(client.rindeAb.size, 0);
});

test('Feuer: Feuerbohrer 2×, Feuerzeug 10× (dann aufgebraucht); Rezepte Feuerbohrer + Lagerfeuer mit Brennstoff', () => {
  assert.equal(GEGENSTAENDE.feuerzeug.haltbarkeit, 10);
  assert.equal(GEGENSTAENDE.feuerbohrer.haltbarkeit, 2);
  assert.deepEqual(REZEPTE.feuerbohrer.zutaten, { rinde: 1, ast: 1 });
  assert.equal(REZEPTE.feuerbohrer.ort, 'inventar', 'ohne Werkbank');
  for (const id of ['lagerfeuer', 'lagerfeuer_rinde', 'lagerfeuer_stoff', 'lagerfeuer_verband']) assert.equal(REZEPTE[id].zutaten.holz, 3, id);
  assert.deepEqual(
    ['lagerfeuer', 'lagerfeuer_rinde', 'lagerfeuer_stoff', 'lagerfeuer_verband'].map((id) => Object.keys(REZEPTE[id].zutaten).find((z) => z !== 'holz')),
    ['papier', 'rinde', 'stoff', 'verband'],
  );
  const { welt, spieler } = welt31();
  fuegeZumInventarHinzu(spieler, 'rinde', 1);
  fuegeZumInventarHinzu(spieler, 'ast', 1);
  aktion(welt, spieler, { art: AKTIONEN.HERSTELLEN, rezept: 'feuerbohrer' });
  assert.equal(anzahl(spieler, 'feuerbohrer'), 1);
  assert.equal(anzahl(spieler, 'rinde') + anzahl(spieler, 'ast'), 0);
  // Feuer: Lagerfeuer in die Welt setzen und zweimal anzünden
  const lf = { id: 900, typ: 'lagerfeuer', tx: 6, ty: 6, brennt: false, brennRest: 0 };
  welt.welt.setzeBauwerk(lf);
  Object.assign(spieler, { x: m(6), y: m(7) });
  for (let i = 1; i <= 2; i++) {
    aktion(welt, spieler, { art: AKTIONEN.FEUER });
    assert.ok(lf.brennt, `Zündung ${i}`);
    aktion(welt, spieler, { art: AKTIONEN.FEUER }); // löschen
    assert.ok(!lf.brennt);
  }
  assert.equal(slotVon(spieler, 'feuerbohrer'), -1, 'nach 2 Zündungen verbraucht');
  assert.ok(welt.meldungen.some((x) => x.text.includes('aufgebraucht')));
});

test('Auto: Baum bremst stark (baumBremse), Zusammenstoß wirft zurück (abprallenFahrzeug > Wand), unbesetztes Ziel bekommt Stoß', () => {
  assert.ok(FAHRZEUG.abprallenFahrzeug > FAHRZEUG.abprallen, 'Auto-gegen-Auto stärker zurück als Wand');
  const k = erstelleKonfiguration({});
  assert.ok(k.fahrzeug.baumBremse <= 0.25, 'Baum bremst deutlich');
  const { welt, w } = welt31();
  const g = w.kachelGroesse;
  const a = erzeugeFahrzeug({ id: 701, modell: 'auto_rot', x: m(3), y: m(5), winkel: 0, laenge: 40, breite: 18 });
  const b = erzeugeFahrzeug({ id: 702, modell: 'auto_blau', x: m(5) + 4, y: m(5), winkel: 0, laenge: 40, breite: 18 });
  welt.entitaeten.set(a.id, a);
  welt.entitaeten.set(b.id, b);
  w.setzeFahrzeugKacheln(a.id, [{ tx: 3, ty: 5 }]);
  w.setzeFahrzeugKacheln(b.id, [{ tx: 5, ty: 5 }, { tx: 6, ty: 5 }]);
  a.tempo = kmhZuTempo(50);
  const vorher = a.tempo;
  let aufprall = false;
  for (let i = 0; i < 90 && !aufprall; i++) {
    fahre(a, { x: 0, y: -1 }, w, TICK_DAUER_S);
    aufprall = a.tempo < 0;
  }
  assert.ok(aufprall, 'prallt zurück');
  assert.ok(a.aufprall?.mit === b.id, 'Zusammenstoß mit dem anderen Auto gemerkt');
  assert.ok(Math.abs(a.tempo) > vorher * 0.4, `Rückstoß spürbar (${a.tempo})`);
  aktualisiereFahrzeuge(welt, TICK_DAUER_S);
  assert.ok(b.tempo > 0, `Ziel bekommt Stoß (${b.tempo})`);
  void g;
});

test('Schritte: Asphalt/Straße/Gehweg/Pflaster → schritt_asphalt; Gras unverändert', () => {
  const welt = { kachelGroesse: 32, schnee: false, kachelAn: (tx) => ['_', '=', '-', '^', ','][tx] };
  assert.equal(untergrundFuer(welt, 0, 0).ereignis, 'schritt_asphalt');
  assert.equal(untergrundFuer(welt, 40, 0).ereignis, 'schritt_asphalt');
  assert.equal(untergrundFuer(welt, 70, 0).ereignis, 'schritt_asphalt');
  assert.equal(untergrundFuer(welt, 100, 0).ereignis, 'schritt_asphalt');
  assert.equal(untergrundFuer(welt, 130, 0).ereignis, 'schritt_gras');
  assert.ok(EREIGNISSE.schritt_asphalt && EREIGNISSE.rinde_schnitzen);
});

test('Lautstärken: Regen drinnen noch leiser, schwacher Wind draußen leiser aber drinnen unverändert', () => {
  const haus = wetterSchichten({ w: vorschauWetter('regen'), hell: 1, drinnen: true, imHaus: true, wetter: 'regen' });
  assert.ok(Math.abs(haus.regen - 0.112 * 0.85) < 1e-9); // Runde 38: −15 % zusätzlich
  const w = { ...vorschauWetter('klar'), windStufe: 1 };
  const draussen = wetterSchichten({ w, hell: 1, wetter: 'klar' }).wind_leicht;
  const drinnen = wetterSchichten({ w, hell: 1, drinnen: true, wetter: 'klar' }).wind_leicht;
  assert.ok(draussen > 0);
  const frueher = (1 / 0.8) * draussen * 0.3; // alter Wert drinnen = alter Draußen-Wert × 0,3
  assert.ok(Math.abs(drinnen - frueher) < 1e-9, 'drinnen = alte Formel');
});
