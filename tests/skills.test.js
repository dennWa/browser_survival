import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TICK_DAUER_S, PROTOKOLL_VERSION } from '../gemeinsam/konstanten.js';
import { AKTIONEN, NACHRICHT, kodiere, dekodiere } from '../gemeinsam/protokoll.js';
import { erstelleKonfiguration } from '../server/spiel/konfiguration/spielKonfiguration.js';
import { SpielWelt } from '../server/spiel/spielWelt.js';
import { SpielServer } from '../server/spiel/spielServer.js';
import { GastAuthentifizierung } from '../server/spiel/authentifizierung/gastAuthentifizierung.js';
import { erstelleSpeicherKanalPaar } from '../server/spiel/netz/speicherKanal.js';
import { erzeugeZombie } from '../server/spiel/entitaeten/zombie.js';
import { fuegeSchadenZu } from '../server/spiel/systeme/kampfSystem.js';
import { gibXp } from '../server/spiel/systeme/levelSystem.js';
import { erstelleSpielstand, wendeSpielstandAn } from '../server/spiel/spielstand.js';
import { wendeEingabeAn } from '../gemeinsam/physik/bewegung.js';
import { pruefeAussehen, skinFuer } from '../gemeinsam/spieler/aussehen.js';

function neueWelt() {
  const welt = new SpielWelt(erstelleKonfiguration({ server: { zufallsStartwert: 5 }, spieler: { startInventar: [] } }));
  for (const z of [...welt.alleVomTyp('zombie')]) welt.entfernen(z.id);
  const spieler = welt.spielerBetrittWelt('Held');
  return { welt, spieler };
}
const skill = (welt, spieler, name) => {
  spieler.aktionsPuffer.push({ art: AKTIONEN.SKILL, slot: null, skill: name });
  welt.aktualisiere(TICK_DAUER_S);
};

test('Skills: Level-Aufstieg gibt Punkte; Tempo, Zähigkeit, Stärke wirken; Tod nimmt alles', () => {
  const { welt, spieler } = neueWelt();
  skill(welt, spieler, 'tempo');
  assert.equal(spieler.skills.tempo, 0, 'ohne Punkte geht nichts');
  gibXp(welt, spieler, 50 + 70 + 90); // → Level 4 = 3 Punkte
  assert.equal(spieler.level, 4);
  assert.equal(spieler.skillPunkte, 3);

  skill(welt, spieler, 'tempo');
  assert.equal(spieler.tempoFaktor, 1.03);
  const a = { x: 0, y: 0, blick: 0, tempoFaktor: spieler.tempoFaktor };
  const b = { x: 0, y: 0, blick: 0 };
  const physik = welt.physikParameter();
  const leer = { isBlockiert: () => false, istBlockiert: () => false, kachelGroesse: 32, breite: 1000, hoehe: 1000, kachelAn: () => ',' };
  wendeEingabeAn(a, { x: 1, y: 0 }, leer, physik, TICK_DAUER_S);
  wendeEingabeAn(b, { x: 1, y: 0 }, leer, physik, TICK_DAUER_S);
  assert.ok(a.x > b.x, 'schneller als ohne Skill');

  skill(welt, spieler, 'leben');
  assert.equal(spieler.maxLeben, welt.konfiguration.spieler.leben + 10);
  assert.equal(spieler.leben, spieler.maxLeben, 'neue Lebenspunkte sofort aufgefüllt');

  skill(welt, spieler, 'staerke');
  spieler.inventar[0] = { defId: 'hammer', menge: 1 };
  spieler.ausgeruestet = 0;
  const z = welt.hinzufuegen(erzeugeZombie({ id: welt.neueId(), x: spieler.x + 30, y: spieler.y, konfiguration: welt.konfiguration }));
  const lebenVorher = z.leben;
  spieler.blick = 0;
  spieler.eingabePuffer.push({ seq: 1, x: 0, y: 0, blick: 0, angriff: true });
  welt.aktualisiere(TICK_DAUER_S);
  assert.ok(Math.abs(lebenVorher - z.leben - 30 * 1.08) < 0.01, `Hammer 30 × 1,08 Schaden (war ${lebenVorher - z.leben})`);

  fuegeSchadenZu(welt, spieler, 9999, null);
  assert.deepEqual(spieler.skills, { tempo: 0, staerke: 0, leben: 0, sammeln: 0 });
  assert.equal(spieler.skillPunkte, 0);
  assert.equal(spieler.maxLeben, welt.konfiguration.spieler.leben);
  assert.equal(spieler.tempoFaktor, 1);
});

test('Spielstand: Skills, Aussehen und Karten-Erkundung bleiben; zu viele Skillpunkte werden zurückgesetzt', () => {
  const { welt, spieler } = neueWelt();
  gibXp(welt, spieler, 50 + 70); // Level 3 = 2 Punkte
  skill(welt, spieler, 'leben');
  spieler.aussehen = pruefeAussehen({ koerper: 'frau' });
  spieler.x += 32 * 6;
  welt.aktualisiere(TICK_DAUER_S);
  const erkundetVorher = spieler.erkundet.reduce((s, v) => s + v, 0);
  assert.ok(erkundetVorher > 100, 'Server markiert erkundete Kacheln');

  const stand = JSON.parse(JSON.stringify(erstelleSpielstand(spieler, welt.karte.daten.id)));
  const neu = welt.spielerBetrittWelt('Held2');
  assert.equal(wendeSpielstandAn(neu, stand, welt), true);
  assert.deepEqual(neu.skills, spieler.skills);
  assert.equal(neu.skillPunkte, 1);
  assert.equal(neu.maxLeben, spieler.maxLeben);
  assert.equal(neu.aussehen.koerper, 'frau');
  assert.equal(neu.erkundet.reduce((s, v) => s + v, 0), erkundetVorher);

  const geschummelt = welt.spielerBetrittWelt('Held3');
  wendeSpielstandAn(geschummelt, { ...stand, skills: { tempo: 10, staerke: 10 }, skillPunkte: 5, aussehen: { koerper: 'drache' } }, welt);
  assert.equal(geschummelt.skills.tempo, 0, 'mehr Punkte als Level → zurückgesetzt');
  assert.equal(geschummelt.skillPunkte, 2);
  assert.equal(geschummelt.aussehen.koerper, 'mann');
});

test('Aussehen: beim Login gewählte Figur ist für alle sichtbar', async (t) => {
  const server = new SpielServer({ authentifizierung: new GastAuthentifizierung(), protokoll: { info() {}, warn() {}, error() {} } });
  t.after(() => server.stoppen());
  const { clientSeite, serverSeite } = erstelleSpeicherKanalPaar();
  const empfangen = [];
  clientSeite.beiNachricht((text) => empfangen.push(dekodiere(text)));
  server.verbindungHinzufuegen(serverSeite);
  clientSeite.senden(kodiere({ typ: NACHRICHT.ANMELDEN, benutzername: 'Lara', protokoll: PROTOKOLL_VERSION, aussehen: { koerper: 'frau', haare: 'irokese' } }));
  for (let i = 0; i < 200 && !empfangen.some((n) => n.typ === NACHRICHT.ANMELDUNG_OK); i++) await new Promise((r) => setTimeout(r, 5));
  const ok = empfangen.find((n) => n.typ === NACHRICHT.ANMELDUNG_OK);
  assert.ok(ok.erkundet, 'Erkundung kommt beim Login mit');
  server.tickAusfuehren();
  for (let i = 0; i < 100 && !empfangen.some((n) => n.typ === NACHRICHT.ZUSTAND); i++) await new Promise((r) => setTimeout(r, 5));
  const ich = empfangen.find((n) => n.typ === NACHRICHT.ZUSTAND).entitaeten.find((e) => e.id === ok.spielerId);
  assert.equal(ich.aussehen.koerper, 'frau');
  assert.equal(ich.aussehen.haare, undefined, 'Netz: nur Abweichungen vom Standard');
  assert.equal(pruefeAussehen(ich.aussehen).haare, 'standard', 'unbekannte Option → Standard');
  assert.equal(skinFuer(ich.aussehen), 'humanFemaleA');
});
