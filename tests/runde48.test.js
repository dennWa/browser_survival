/**
 * Runde 48: Schusswaffen-Griff (figurHaltung.schusswaffeHalten) und hängende Zombie-Arme.
 * Mini-Skelett mit Quaternius-Knochennamen inkl. Fingergliedern, ohne Animation (= Worst Case „Clip schreibt nichts neu“).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { richteFigurEin, aktualisiereHaltung } from '../client/darstellung/figurHaltung.js';

function baueFigur() {
  const modell = new THREE.Group();
  const knochen = {};
  const neu = (name, eltern, x, y, z) => {
    const k = new THREE.Bone();
    k.name = name;
    k.position.set(x, y, z);
    (eltern ? knochen[eltern] : modell).add(k);
    knochen[name] = k;
  };
  neu('Root', null, 0, 0, 0);
  neu('Hips', 'Root', 0, 33, 0);
  neu('Chest', 'Hips', 0, 12, 0);
  for (const [s, x] of [['R', -1], ['L', 1]]) {
    neu(`UpperArm${s}`, 'Chest', 6 * x, 2, 0);
    neu(`LowerArm${s}`, `UpperArm${s}`, 0, -6.5, 0);
    neu(`Wrist${s}`, `LowerArm${s}`, 0, -8, 0);
    // Finger: Glied 1 am Handgelenk, Knöchel (2) ≈ 4 tiefer, dann 3/4; Zeigefinger vorn (+z), kleiner Finger hinten
    for (const [name, z] of [['Index', 0.9], ['Middle', 0.3], ['Ring', -0.3], ['Pinky', -0.9]]) {
      neu(`${name}1${s}`, `Wrist${s}`, 0, -0.5, 0);
      neu(`${name}2${s}`, `${name}1${s}`, 0, -3.8, z);
      neu(`${name}3${s}`, `${name}2${s}`, 0, -1.2, 0);
      neu(`${name}4${s}`, `${name}3${s}`, 0, -1, 0);
    }
    neu(`Thumb1${s}`, `Wrist${s}`, 0, -0.5, 0);
    neu(`Thumb2${s}`, `Thumb1${s}`, 0.8 * -x, -1.5, 1.6);
    neu(`Thumb3${s}`, `Thumb2${s}`, 0, -1, 0.6);
  }
  const gruppe = new THREE.Group();
  gruppe.add(modell);
  gruppe.position.set(300, 0, 200);
  gruppe.rotation.set(0, 0.7, 0, 'YXZ');
  const figur = { gruppe, modell, aktionen: {}, aktuell: 'stehen', klips: new Set(['stehen']) };
  richteFigurEin(figur, modell);
  return { figur, knochen };
}

const welt = (k) => k.getWorldPosition(new THREE.Vector3());
const imFigurRaum = (figur, v) => v.clone().applyQuaternion(figur.gruppe.quaternion.clone().invert());
const PISTOLE = { typ: 'spieler', waffe: 'pistole', ausruestung: 'pistole' };

/** Ein Schuss, danach Bilder laufen lassen, bis die Waffe im Anschlag ist */
function imAnschlag(figur, e = PISTOLE) {
  let t = 1000;
  aktualisiereHaltung(figur, { ...e, aktion: 'schiessen', aktionTick: 1, aktionDauer: 0.2 }, t);
  for (let i = 0; i < 90; i++) aktualisiereHaltung(figur, e, (t += 16));
  return t;
}

test('Runde 48: Pistole im Anschlag – beide Handgelenke am Griff, Lauf nach vorn, Finger gekrümmt', () => {
  const { figur, knochen } = baueFigur();
  imAnschlag(figur);
  assert.equal(figur.anschlag, 1);
  const griff = figur.waffe.getWorldPosition(new THREE.Vector3());
  for (const s of ['R', 'L']) {
    const abstand = welt(knochen[`Wrist${s}`]).distanceTo(griff);
    assert.ok(abstand < 7, `Handgelenk ${s} ist ${abstand.toFixed(1)} vom Griff entfernt`);
  }
  const lauf = imFigurRaum(figur, new THREE.Vector3(0, 0, 1).applyQuaternion(figur.waffe.getWorldQuaternion(new THREE.Quaternion())));
  assert.ok(lauf.z > 0.99, `Lauf zeigt nicht nach vorn: ${lauf.toArray()}`);
  // Mittelfinger: Glied 3→4 weicht deutlich von der Handrichtung (Handgelenk→Knöchel) ab
  const hand = welt(knochen.Middle2R).sub(welt(knochen.WristR)).normalize();
  const finger = welt(knochen.Middle4R).sub(welt(knochen.Middle3R)).normalize();
  assert.ok(hand.angleTo(finger) > 0.8, `Finger kaum gekrümmt (${hand.angleTo(finger).toFixed(2)} rad)`);
});

test('Runde 48: Griff ohne Clip stabil – keine aufgestapelte Drehung je Bild', () => {
  const { figur, knochen } = baueFigur();
  let t = imAnschlag(figur);
  const namen = ['WristR', 'WristL', 'LowerArmR', 'Middle3R', 'Index3L', 'Thumb3R'];
  const vorher = namen.map((n) => knochen[n].getWorldQuaternion(new THREE.Quaternion()));
  for (let i = 0; i < 30; i++) aktualisiereHaltung(figur, PISTOLE, (t += 16));
  namen.forEach((n, i) => {
    const grad = (vorher[i].angleTo(knochen[n].getWorldQuaternion(new THREE.Quaternion())) * 180) / Math.PI;
    assert.ok(grad < 0.01, `${n} dreht sich je Bild weiter (${grad.toFixed(3)}° nach 30 Bildern)`);
  });
});

test('Runde 48: Waffe weg → Arme und Finger zurück in die Ruhe', () => {
  const { figur, knochen } = baueFigur();
  const ruhe = ['Middle3R', 'WristR', 'UpperArmL'].map((n) => knochen[n].quaternion.clone());
  let t = imAnschlag(figur);
  aktualisiereHaltung(figur, { typ: 'spieler', waffe: null, ausruestung: null, lichtAn: false }, (t += 16));
  ['Middle3R', 'WristR', 'UpperArmL'].forEach((n, i) => assert.ok(knochen[n].quaternion.angleTo(ruhe[i]) < 1e-6, `${n} nicht in Ruhe`));
});

test('Runde 48: Gewehr – linke Hand am Vorderschaft (vor der rechten), auch gesenkt beidhändig', () => {
  const { figur, knochen } = baueFigur();
  const gewehr = { typ: 'spieler', waffe: 'gewehr', ausruestung: 'gewehr' };
  imAnschlag(figur, gewehr);
  const vorRechts = imFigurRaum(figur, welt(knochen.WristL).sub(welt(knochen.WristR)));
  assert.ok(vorRechts.z > 3, `linke Hand nicht vor der rechten (${vorRechts.z.toFixed(1)})`);
  figur.anschlagBis = 0;
  let t = 5000;
  for (let i = 0; i < 90; i++) aktualisiereHaltung(figur, gewehr, (t += 16));
  assert.equal(figur.anschlag, 0);
  const griff = figur.waffe.getWorldPosition(new THREE.Vector3());
  assert.ok(welt(knochen.WristL).distanceTo(griff) < 13, 'linke Hand hält das gesenkte Gewehr nicht');
});

test('Runde 48: Zombie-Arme hängen nach unten, beim Angriff nur leicht gehoben', () => {
  const { figur, knochen } = baueFigur();
  const zombie = { typ: 'zombie', id: 7 };
  aktualisiereHaltung(figur, zombie, 1000);
  const unterarm = () => imFigurRaum(figur, welt(knochen.WristR).sub(welt(knochen.LowerArmR)).normalize());
  assert.ok(unterarm().y < -0.6, `Unterarm zeigt nicht nach unten: ${unterarm().toArray()}`);
  aktualisiereHaltung(figur, { ...zombie, aktion: 'angriff', aktionTick: 1, aktionDauer: 1 }, 2000);
  aktualisiereHaltung(figur, { ...zombie, aktion: 'angriff', aktionTick: 1, aktionDauer: 1 }, 2350); // höchster Punkt
  const oben = unterarm();
  assert.ok(oben.y > -0.6 && oben.y < 0.1, `Angriff: Unterarm sollte leicht gehoben sein, ist ${oben.toArray()}`);
});
