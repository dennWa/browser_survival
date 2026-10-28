import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FAHRZEUG, fahre, tempoZuKmh } from '../gemeinsam/physik/fahrzeug.js';
import { erstelleKonfiguration } from '../server/spiel/konfiguration/spielKonfiguration.js';
import { erzeugeZombie } from '../server/spiel/entitaeten/zombie.js';
import { erzeugeFahrzeug, fahrzeugZuNetzwerk } from '../server/spiel/entitaeten/fahrzeug.js';
import { erkenneGeraet } from '../client/darstellung/geraet.js';

/**
 * Runde 20: realistischeres Fahren (Lenkrad mit Trägheit, Einspurmodell, sanftere Beschleunigung), Tacho bis 120 km/h,
 * Auto-Grafik (Geräteerkennung), „Halber Zombie“.
 */
const freieWelt = { kachelGroesse: 32, istBlockiert: () => false };
const auto = () => ({ id: 1, x: 500, y: 500, winkel: 0, tempo: 0, laenge: 110, breite: 46 });
const schritte = (fz, eingabe, sekunden) => {
  for (let i = 0; i < Math.round(sekunden * 30); i++) fahre(fz, eingabe, freieWelt, 1 / 30);
};

test('Anfahren dauert: nach 1 s noch weit unter Höchsttempo, nach 6 s fast Vollgas', () => {
  const fz = auto();
  schritte(fz, { x: 0, y: -1 }, 1);
  assert.ok(fz.tempo < FAHRZEUG.max * 0.45, `nach 1 s ${tempoZuKmh(fz.tempo).toFixed(0)} km/h`);
  schritte(fz, { x: 0, y: -1 }, 5);
  assert.ok(fz.tempo > FAHRZEUG.max * 0.9, `nach 6 s ${tempoZuKmh(fz.tempo).toFixed(0)} km/h`);
  assert.ok(tempoZuKmh(fz.tempo) <= 120 + 1e-9);
});

test('Lenkrad hat Trägheit: der Einschlag baut sich auf und geht von selbst zurück', () => {
  const fz = auto();
  fz.tempo = 150;
  fahre(fz, { x: 1, y: -1 }, freieWelt, 1 / 30);
  assert.ok(fz.lenkung > 0 && fz.lenkung < 0.3, `nach einem Tick ${fz.lenkung}`);
  schritte(fz, { x: 1, y: -1 }, 0.5);
  assert.equal(fz.lenkung, 1);
  schritte(fz, { x: 0, y: -1 }, 0.5);
  assert.equal(fz.lenkung, 0);
});

test('Im Stand dreht das Auto nicht, bei Vollgas nur weite Kurven', () => {
  const steh = auto();
  schritte(steh, { x: 1, y: 0 }, 1);
  assert.equal(steh.winkel, 0);
  const drehrate = (tempo) => {
    const fz = auto();
    fz.tempo = tempo;
    fz.lenkung = 1;
    const vorher = fz.winkel;
    fahre(fz, { x: 1, y: 0 }, freieWelt, 1 / 30);
    return (fz.winkel - vorher) * 30;
  };
  const langsam = drehrate(110);
  const schnell = drehrate(FAHRZEUG.max);
  assert.ok(langsam > 0.6 && langsam < 2.4, `Drehrate bei 110 px/s ${langsam}`);
  // Wendekreis bei Vollgas deutlich größer als langsam (Radius = Tempo / Drehrate)
  assert.ok(FAHRZEUG.max / schnell > 2 * (110 / langsam), 'schnell = weite Kurve');
  // rückwärts andersherum
  assert.ok(drehrate(-60) < 0);
});

test('Lenkeinschlag geht übers Netz (Vorhersage des Fahrers + Optik für andere)', () => {
  const fz = erzeugeFahrzeug({ id: 3, modell: 'auto_rot', x: 0, y: 0, winkel: 0, laenge: 110, breite: 46 });
  assert.equal(fz.lenkung, 0);
  fz.lenkung = 0.456;
  assert.equal(fahrzeugZuNetzwerk(fz).lenkung, 0.46);
});

test('Auto-Grafik: Software-GL → niedrig, Intel-Onboard → mittel, starke Karte → hoch', () => {
  const pc = { hardwareConcurrency: 8, deviceMemory: 8 };
  assert.equal(erkenneGeraet(false, 'Google SwiftShader', pc).profil, 'niedrig');
  assert.equal(erkenneGeraet(false, 'ANGLE (Intel, Intel(R) UHD Graphics 620 Direct3D11 vs_5_0 ps_5_0, D3D11)', pc).profil, 'mittel');
  assert.equal(erkenneGeraet(false, 'ANGLE (NVIDIA, NVIDIA GeForce 940MX Direct3D11)', pc).profil, 'mittel');
  assert.equal(erkenneGeraet(false, 'ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11)', pc).profil, 'hoch');
  assert.equal(erkenneGeraet(false, 'ANGLE (NVIDIA, NVIDIA GeForce GTX 1060 6GB Direct3D11)', pc).profil, 'hoch');
  assert.equal(erkenneGeraet(false, 'Apple M1', pc).profil, 'hoch');
  assert.equal(erkenneGeraet(false, 'irgendwas', { hardwareConcurrency: 2, deviceMemory: 8 }).profil, 'niedrig');
  assert.equal(erkenneGeraet(false, 'irgendwas', { hardwareConcurrency: 4, deviceMemory: 4 }).profil, 'mittel');
});

test('Halber Zombie: eigene Variante, schwächer als ein normaler', () => {
  const k = erstelleKonfiguration({});
  const halb = erzeugeZombie({ id: 1, x: 0, y: 0, konfiguration: k, variante: 'halb' });
  const normal = erzeugeZombie({ id: 2, x: 0, y: 0, konfiguration: k, variante: 'normal' });
  assert.equal(halb.variante, 'halb');
  assert.ok(halb.leben < normal.leben);
  assert.ok(k.zombie.varianten.halb.gewicht > 0);
});
