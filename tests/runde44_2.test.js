/**
 * Runde 44 (2): Lagerplatz – immer klar + windstill, keine Hasen, Lager-Katze, Kerzen auf den Tischen (Objektfeld z), große Bäume,
 * Auto; Bots leben im Lager (sitzen, wärmen, schauen) und gehorchen „setzt euch“ / „aufstehen“; Busch → „Zweig sammeln“ (ohne Werkzeug).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ladeKarte, KARTEN } from '../server/spiel/karten/kartenLader.js';
import { SpielWelt } from '../server/spiel/spielWelt.js';
import { erstelleKonfiguration } from '../server/spiel/konfiguration/spielKonfiguration.js';
import { pruefeZonenEinstellungen } from '../server/spiel/karten/zonenEinstellungen.js';
import { spawneBot } from '../server/spiel/systeme/botSystem.js';
import { botBefehl } from '../server/spiel/systeme/botLager.js';
import { RESSOURCEN_OBJEKTE, abbauArtFuer, abbauText } from '../gemeinsam/welt/ressourcen.js';

const g = 32;

function lagerWelt(start = 3) {
  return new SpielWelt(erstelleKonfiguration({ server: { zufallsStartwert: start } }), { kartenDefinition: KARTEN.lager });
}

function laufe(welt, sekunden, schritt = 1 / 20) {
  for (let t = 0; t < sekunden; t += schritt) welt.aktualisiere(schritt);
}

/** Nächster freier Punkt (Kachelmitte) um x|y – Bots nicht in Möbel setzen */
function frei(welt, x, y) {
  const w = welt.welt;
  for (let r = 0; r < 8; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        const tx = Math.floor(x / g) + dx;
        const ty = Math.floor(y / g) + dy;
        if (!w.istBereichBlockiert(tx * g + 4, ty * g + 4, tx * g + g - 4, ty * g + g - 4)) return { x: (tx + 0.5) * g, y: (ty + 0.5) * g };
      }
    }
  }
  throw new Error('kein freier Punkt');
}

const feuerPx = (welt) => {
  const f = [...welt.welt.bauwerke.values()].find((b) => b.typ === 'lagerfeuer');
  return { x: (f.tx + 0.5) * g, y: (f.ty + 0.5) * g };
};

test('Zonen-Einstellung windstill: Lagerplatz hat immer klares Wetter und keinen Wind', () => {
  assert.deepEqual(pruefeZonenEinstellungen({ wetter: { windstill: true, aktiv: false } }), { wetter: { aktiv: false, windstill: true } });
  const welt = lagerWelt();
  welt.wetter.wind = 0.8;
  laufe(welt, 30, 0.5);
  assert.equal(welt.wetter.art, 'klar');
  assert.equal(welt.wetter.wind, 0, 'windstill');
  laufe(welt, 3000, 5);
  assert.equal(welt.wetter.art, 'klar', 'auch nach langer Zeit kein Regen/Nebel/Sturm');
});

test('Lagerplatz: keine Hasen, aber eine Lager-Katze (Start-Tier ohne Besitzer, am Feuer)', () => {
  const welt = lagerWelt();
  const tiere = [...welt.alleVomTyp('tier')];
  assert.equal(tiere.filter((t) => t.art === 'hase').length, 0, 'keine Kaninchen');
  const katze = tiere.find((t) => t.art === 'katze');
  assert.ok(katze, 'Katze da');
  assert.ok(!katze.besitzer);
  const f = feuerPx(welt);
  assert.ok(Math.hypot(katze.x - f.x, katze.y - f.y) < 5 * g, 'startet am Feuer');
  assert.deepEqual(ladeKarte('stadtrand').startTiere, [], 'andere Karten ohne Start-Tiere');
});

test('Lagerplatz: auf jedem Tisch steht eine Kerze (z = Tischhöhe), große Bäume mit Stamm-Hindernis, Auto', () => {
  const { daten } = ladeKarte('lager');
  const typ = (o) => daten.typen?.[o.typ]?.glbDatei ?? '';
  const tische = daten.objekte.filter((o) => /table-(1|big)\.glb/.test(typ(o)));
  const kerzen = daten.objekte.filter((o) => /candle/.test(typ(o)));
  assert.ok(tische.length >= 3);
  for (const t of tische) {
    const kerze = kerzen.find((k) => k.x >= t.x && k.x <= t.x + t.b && k.y >= t.y && k.y <= t.y + t.h);
    assert.ok(kerze, `Kerze auf Tisch bei ${t.x}|${t.y}`);
    assert.ok(kerze.z >= 0.6 && kerze.z <= 0.9, 'steht auf der Platte, nicht darunter');
  }
  assert.ok(daten.objekte.filter((o) => /\/tree(-\d)?\.glb/.test(typ(o))).length >= 2, 'zwei große Bäume');
  assert.ok(daten.objekte.some((o) => /\/car\.glb/.test(typ(o))), 'Auto');
});

test('Bots im Lager: „setzt euch“ → alle sitzen am Feuer und bleiben sitzen; „aufstehen“ → stehen auf und gehen', () => {
  const welt = lagerWelt(7);
  const f = feuerPx(welt);
  const bots = [spawneBot(welt, frei(welt, f.x + 9 * g, f.y + 6 * g)), spawneBot(welt, frei(welt, f.x - 8 * g, f.y - 7 * g))];
  const spieler = welt.spielerBetrittWelt('Chef');
  laufe(welt, 5);
  const antworten = botBefehl(welt, spieler, 'Leute, setzt euch mal ans Feuer!');
  assert.equal(antworten.length, 2, 'beide antworten');
  assert.ok(antworten.every((a) => a.name.startsWith('Bot ') && a.text.length > 0));
  laufe(welt, 40);
  for (const b of bots) {
    assert.equal(b.arbeit?.art, 'sitzen', `${b.name} sitzt`);
    assert.ok(b.arbeit.ort?.sitz, `${b.name} auf einem Sitz`);
    assert.ok(Math.hypot(b.arbeit.ort.x - f.x, b.arbeit.ort.y - f.y) < 5 * g, `${b.name} am Feuer`);
  }
  assert.notDeepEqual(bots[0].arbeit.ort, bots[1].arbeit.ort, 'verschiedene Plätze');
  laufe(welt, 120); // bleiben sitzen, solange niemand „aufstehen“ sagt
  assert.ok(bots.every((b) => b.arbeit?.art === 'sitzen'), 'bleiben sitzen');
  assert.equal(botBefehl(welt, spieler, 'hallo').length, 0, 'kein Befehl → keine Antwort');
  assert.equal(botBefehl(welt, spieler, 'So, aufstehen!').length, 2);
  laufe(welt, 3);
  assert.ok(bots.every((b) => b.arbeit?.art !== 'sitzen'), 'aufgestanden');
  const vorher = bots.map((b) => ({ x: b.x, y: b.y }));
  laufe(welt, 25);
  assert.ok(bots.some((b, i) => Math.hypot(b.x - vorher[i].x, b.y - vorher[i].y) > g), 'gehen ihrer Wege');
});

test('Bots im Lager: einzeln ansprechbar („Ida, setz dich“) und ohne Befehl leben sie (sitzen/stehen am Feuer, bleiben im Lager)', () => {
  const welt = lagerWelt(11);
  const f = feuerPx(welt);
  const a = spawneBot(welt, frei(welt, f.x + 6 * g, f.y + 3 * g));
  const b = spawneBot(welt, frei(welt, f.x - 6 * g, f.y + 3 * g));
  const kurz = a.name.replace('Bot ', '');
  const antworten = botBefehl(welt, null, `${kurz}, setz dich bitte`);
  assert.deepEqual(antworten.map((x) => x.name), [a.name], 'nur der genannte Bot');
  assert.equal(a.bot.befehl, 'feuer');
  assert.ok(!b.bot.befehl);
  // Alltag: über 4 Minuten setzt sich der andere Bot mindestens einmal und bleibt in der Nähe des Feuers (nicht am Zaun/Ausgang)
  let gesessen = false;
  let weitester = 0;
  for (let t = 0; t < 240; t += 0.5) {
    laufe(welt, 0.5);
    if (b.arbeit?.art === 'sitzen') gesessen = true;
    weitester = Math.max(weitester, Math.hypot(b.x - f.x, b.y - f.y));
  }
  assert.ok(gesessen, 'setzt sich von selbst mal hin');
  assert.ok(weitester < 15 * g, `bleibt im Lager (${(weitester / g).toFixed(1)} Kacheln)`);
});

test('Busch: „Zweig sammeln“ geht mit bloßen Händen (kein Werkzeug, keine Abnutzung)', () => {
  const busch = RESSOURCEN_OBJEKTE.busch;
  assert.equal(busch.aktion, 'Zweig sammeln');
  const r = { art: 'ast', typ: 'busch', ...busch };
  assert.deepEqual(abbauArtFuer(r, null, () => false), { art: 'ast', werkzeug: null });
  assert.deepEqual(abbauArtFuer(r, 'machete', (id) => id === 'machete'), { art: 'ast', werkzeug: null }, 'auch mit Machete: sammeln, nicht schneiden');
  assert.equal(abbauText(r, 'ast').text, 'Zweig sammeln');
});
