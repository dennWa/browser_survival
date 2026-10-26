/**
 * Map-Editor-Erweiterungen im Spiel (Phase 5): Zonen-Werte, Spawn-Anzahl/Dichte/Respawn/Horde, Loot je Raum, Hasen-Bereiche,
 * kartenfeste Bauwerke, steile Hänge, feste Baumgröße, Musik-Ordner. Alte Karten ohne diese Felder bleiben unverändert.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SpielWelt } from '../server/spiel/spielWelt.js';
import { erstelleKonfiguration } from '../server/spiel/konfiguration/spielKonfiguration.js';
import { verarbeiteKarte } from '../server/spiel/karten/kartenLader.js';
import { zonenKonfiguration, pruefeZonenEinstellungen } from '../server/spiel/karten/zonenEinstellungen.js';
import { schickeHorde } from '../server/spiel/systeme/tageszeitSystem.js';
import { fuegeSchadenZu } from '../server/spiel/systeme/kampfSystem.js';

const BASIS = {
  id: 'ed',
  name: 'Editor-Test',
  kacheln: [
    ',,,,,,,,,,,,,,,,,,,,',
    ',####,,,,,,,,,,,,,,,',
    ',#aa#,,,,,,,,,,,,,,,',
    ',#..#,,,,S,,,,,,,,,,',
    ',##T#,,,,,,,,,,,,,,,',
    ',,,,,,,,,,,,,,,,,,Z,',
    ',,,,,,,,,,,,,,,,,,,,',
    ',,,,,,,,,,Z,,,,,,,,,',
    ',,,,,,,,,,,,,,,,,,,,',
    ',,,,,,,,,,,,,,,,,,,,',
  ],
  raeume: { a: { name: 'Hütte', lootTabelle: 'huette' } },
  objekte: [],
};
const konfig = (extra = {}) => erstelleKonfiguration({ server: { zufallsStartwert: 7 }, ...extra });
const welt = (def, k = konfig()) => new SpielWelt(k, { kartenDefinition: { ...BASIS, ...def } });

test('Zonen-Werte: nur gesetzte Felder überschreiben, Rest liest live aus der gemeinsamen Konfiguration', () => {
  const k = konfig();
  const ohne = welt({}, k);
  assert.equal(ohne.konfiguration, k, 'ohne einstellungen: dasselbe Objekt');
  const mit = welt({ einstellungen: { wetter: { regenAnteil: 0.95, unbekannt: 3 }, loot: { spawnChance: 7 } } }, k);
  assert.equal(mit.konfiguration.wetter.regenAnteil, 0.95);
  assert.equal(mit.konfiguration.wetter.dauerMin, k.wetter.dauerMin);
  assert.equal(mit.konfiguration.loot.spawnChance, 1, 'auf erlaubten Bereich begrenzt');
  assert.equal(k.wetter.regenAnteil, 0.6, 'gemeinsame Konfiguration unverändert');
  assert.equal(mit.konfiguration.zombie, k.zombie, 'nicht überschriebene Bereiche sind dieselben Objekte');
  k.wetter.dauerMax = 999; // Developer-Änderung wirkt weiter durch
  assert.equal(mit.konfiguration.wetter.dauerMax, 999);
  assert.deepEqual(pruefeZonenEinstellungen({ zombie: { dichte: '2', respawnZeit: 30 }, quatsch: {} }), { zombie: { respawnZeit: 30 } });
  assert.equal(zonenKonfiguration(k, null), k);
});

test('Zombie-Spawns: Anzahl je Punkt × Dichte, eigener Respawn, Horde nur an Horden-Punkten', () => {
  assert.equal(welt({}).anzahlVomTyp('zombie'), 2);
  const w = welt({ zombieSpawns: [{ x: 18, y: 5, anzahl: 3, respawnZeit: 12 }, { x: 10, y: 7, horde: true }] });
  assert.equal(w.anzahlVomTyp('zombie'), 4);
  assert.equal(w.karte.zombieSpawns.filter((p) => p.respawnZeit === 12).length, 3);
  w.planeZombieRespawn(0);
  assert.equal(w.zombieRespawns.at(-1).rest, 12);
  w.planeZombieRespawn(3);
  assert.equal(w.zombieRespawns.at(-1).rest, w.konfiguration.zombie.respawnZeit);
  const vorher = new Set([...w.alleVomTyp('zombie')].map((z) => z.id));
  schickeHorde(w);
  const horde = [...w.alleVomTyp('zombie')].filter((z) => !vorher.has(z.id));
  assert.equal(horde.length, w.konfiguration.zombie.nachtHorde);
  for (const z of horde) assert.ok(Math.hypot(z.x - 10.5 * 32, z.y - 7.5 * 32) < 20, 'Horde am Horden-Punkt');
  assert.equal(welt({ einstellungen: { zombie: { dichte: 2 } } }).anzahlVomTyp('zombie'), 4);
  assert.equal(welt({ einstellungen: { zombie: { dichte: 0 } } }).anzahlVomTyp('zombie'), 0);
});

test('Loot: Chance und Nachschub je Raum', () => {
  const nie = welt({ raeume: { a: { name: 'H', lootTabelle: 'huette', spawnChance: 0, respawnZeit: 9 } } });
  assert.equal(nie.anzahlVomTyp('gegenstand'), 0);
  assert.equal(nie.karte.lootPunkte[0].respawnZeit, 9);
  const immer = welt({ raeume: { a: { name: 'H', lootTabelle: 'huette', spawnChance: 1 } } });
  assert.equal(immer.anzahlVomTyp('gegenstand'), 2);
});

test('Hasen-Bereiche: genau die Anzahl, nur im Bereich, Nachschub im selben Bereich', () => {
  const w = welt({ tierBereiche: [{ x: 12, y: 6, b: 6, h: 3, art: 'hase', anzahl: 4, respawnZeit: 5 }] });
  const hasen = [...w.alleVomTyp('tier')];
  assert.equal(hasen.length, 4);
  for (const h of hasen) assert.ok(h.x >= 12 * 32 && h.x < 18 * 32 && h.y >= 6 * 32 && h.y < 9 * 32, 'im Bereich');
  fuegeSchadenZu(w, hasen[0], 9999, null);
  assert.deepEqual(w.tierRespawns.at(-1), { rest: 5, bereich: 0 });
});

test('Kartenfeste Bauwerke: stehen, gehören niemandem, blockieren; Weltstand übernimmt ihren Zustand ohne Doppel', () => {
  const def = { bauwerke: [{ typ: 'zaun', tx: 6, ty: 6 }, { typ: 'kiste', tx: 7, ty: 6 }, { typ: 'gibtsnicht', tx: 1, ty: 1 }] };
  const w = welt(def);
  assert.equal(w.welt.bauwerke.size, 2);
  const kiste = w.welt.bauwerkBei(7, 6);
  assert.equal(kiste.besitzer, null);
  assert.equal(w.welt.istBlockiert(6, 6), true);
  kiste.inhalt[0] = { defId: 'holz', menge: 5 };
  const stand = JSON.parse(JSON.stringify(w.weltzustand()));
  const neu = welt(def);
  neu.uebernimmWeltzustand(stand);
  assert.equal(neu.welt.bauwerke.size, 2, 'keine Doppel');
  assert.deepEqual(neu.welt.bauwerkBei(7, 6).inhalt[0], { defId: 'holz', menge: 5 });
});

test('Terrain: steile Kacheln blockieren unsichtbar; feste Baumgröße; Musik-Ordner geht an den Client', () => {
  const k = verarbeiteKarte({ ...BASIS, terrain: { hoehen: [], steil: [[12, 2], [99, 99]] }, objekte: [{ typ: 'baum', x: 14, y: 1, b: 3.5, h: 3.5, groesse: 'gross' }, { typ: 'stein', x: 16, y: 8, b: 1, h: 1, groesse: 'klein' }], musik: 'wald' });
  const hang = k.daten.objekte.filter((o) => o.typ === 'hang');
  assert.equal(hang.length, 1);
  assert.equal(hang[0].ebene, 'unsichtbar');
  assert.equal(k.daten.objekte.find((o) => o.typ === 'baum').groesse, 'gross');
  assert.equal(k.daten.objekte.find((o) => o.typ === 'stein').groesse, 'klein');
  assert.equal(k.daten.musik, 'wald');
  const w = welt({ terrain: { steil: [[12, 2]] } });
  assert.equal(w.welt.istBlockiert(12, 2), true);
  assert.equal(verarbeiteKarte({ ...BASIS, musik: '../böse' }).daten.musik, undefined);
});

test('Karte testen: zwei Editor-Entwürfe laufen im echten SpielServer (wie im Testmodus), Zonenwechsel über vorgeschlagenen Übergang', async () => {
  const { neueZone } = await import('../editor/kern/zone.js');
  const { markerSchluessel } = await import('../editor/kern/karte.js');
  const { nachbarn, vorschlaegeFuerPaar, vorschlagOps } = await import('../editor/kern/zonenVerbund.js');
  const { testDaten } = await import('../editor/kern/testlauf.js');
  const { SpielServer } = await import('../server/spiel/spielServer.js');
  const { GastAuthentifizierung } = await import('../server/spiel/authentifizierung/gastAuthentifizierung.js');
  const { ArbeitsspeicherSpeicher } = await import('../server/spiel/speicher/arbeitsspeicherSpeicher.js');
  const { erstelleSpeicherKanalPaar } = await import('../server/spiel/netz/speicherKanal.js');
  const { NACHRICHT, kodiere, dekodiere } = await import('../gemeinsam/protokoll.js');
  const { PROTOKOLL_VERSION } = await import('../gemeinsam/konstanten.js');
  const sued = neueZone({ id: 'editor_sued', name: 'Süd', breite: 20, hoehe: 12 });
  const nord = neueZone({ id: 'editor_nord', name: 'Nord', breite: 20, hoehe: 12 });
  sued.anwenden([{ s: 'marker', k: markerSchluessel(10, 8), neu: { art: 'start' } }]);
  nord.anwenden([{ s: 'marker', k: markerSchluessel(10, 4), neu: { art: 'start' } }]);
  const zonen = new Map([['editor_sued', sued], ['editor_nord', nord]]);
  const layout = { editor_sued: { x: 0, y: 0 }, editor_nord: { x: 0, y: -12 } };
  const paar = nachbarn(zonen, layout)[0];
  const { opsA, opsB } = vorschlagOps(zonen, paar, vorschlaegeFuerPaar(zonen, layout, paar)[0]);
  zonen.get(paar.a).anwenden(opsA);
  zonen.get(paar.b).anwenden(opsB);
  const { daten, probleme } = testDaten(zonen, 'editor_sued', 0);
  assert.deepEqual(probleme, []);
  const json = JSON.parse(JSON.stringify(daten)); // wie über localStorage
  const server = new SpielServer({ authentifizierung: new GastAuthentifizierung({ admin: true }), konfiguration: { welt: { uebergangSekunden: 0 } }, protokoll: { info() {}, warn() {}, error() {} }, speicher: new ArbeitsspeicherSpeicher(), kartenDefinition: json.karten[json.start], kartenDefinitionen: json.karten });
  await server.weltGeladen;
  const { clientSeite, serverSeite } = erstelleSpeicherKanalPaar();
  const empfangen = [];
  clientSeite.beiNachricht((t) => empfangen.push(dekodiere(t)));
  server.verbindungHinzufuegen(serverSeite);
  clientSeite.senden(kodiere({ typ: NACHRICHT.ANMELDEN, benutzername: 'Gast-1234', gast: true, protokoll: PROTOKOLL_VERSION }));
  for (let i = 0; i < 100 && !empfangen.some((n) => n.typ === NACHRICHT.ANMELDUNG_OK); i++) await new Promise((r) => setTimeout(r, 5));
  assert.equal(empfangen.find((n) => n.typ === NACHRICHT.ANMELDUNG_OK).karte.id, 'editor_sued');
  const welt = server.weltVon('Gast-1234');
  const spieler = [...welt.alleVomTyp('spieler')][0];
  const u = welt.karte.daten.uebergaenge[0];
  spieler.x = (u.px.x0 + u.px.x1) / 2;
  spieler.y = (u.px.y0 + u.px.y1) / 2;
  server.tickAusfuehren();
  for (let i = 0; i < 100 && !empfangen.some((n) => n.typ === NACHRICHT.ZONE_WECHSEL); i++) await new Promise((r) => setTimeout(r, 5));
  const wechsel = empfangen.find((n) => n.typ === NACHRICHT.ZONE_WECHSEL);
  assert.equal(wechsel?.karte.id, 'editor_nord', 'Zonenwechsel in den zweiten Entwurf');
  server.stoppen?.();
});
