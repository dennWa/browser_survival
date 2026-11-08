/**
 * Runde 45: Sitzpose auf Stuhl/Bank (client/darstellung/figurHaltung.js) – Hände dürfen nicht „zittern“.
 * Ursache war eine relative Handdrehung je Bild (drehUmAchse −1,4 rad), die sich aufstapelte, weil der Steh-Clip konstante
 * Arm-Spuren hat (Three.js PropertyMixer schreibt die nur einmal). Der Test baut ein Mini-Skelett mit Quaternius-Knochennamen
 * ohne Animation – also genau der Fall „Clip schreibt nichts neu“ – und ruft die Haltung mehrfach auf.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { richteFigurEin, aktualisiereHaltung, setzeStuhlZurueck } from '../client/darstellung/figurHaltung.js';

/** Knochen anlegen: [name, elternName, x, y, z] (Position relativ zum Eltern-Knochen, Figur ≈ 64 hoch) */
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
  neu('Chest', 'Hips', 0, 12, 0); // Schulter ≈ 16 über dem Hüftgelenk, Arm ≈ 15,5 lang (wie Quaternius-Figur)
  for (const [s, x] of [['R', -1], ['L', 1]]) {
    // Arm hängt seitlich, Handfläche zum Bein, Daumen/Zeigefinger vorn (+z)
    neu(`UpperArm${s}`, 'Chest', 6 * x, 2, 0);
    neu(`LowerArm${s}`, `UpperArm${s}`, 0, -7, 0);
    neu(`Wrist${s}`, `LowerArm${s}`, 0, -8.5, 0);
    neu(`Middle1${s}`, `Wrist${s}`, 0, -3, 0);
    neu(`Index1${s}`, `Wrist${s}`, 0, -2.8, 0.8);
    neu(`Pinky1${s}`, `Wrist${s}`, 0, -2.6, -0.8);
    neu(`UpperLeg${s}`, 'Hips', 4 * x, -2, 0);
    neu(`LowerLeg${s}`, `UpperLeg${s}`, 0, -15, 0);
    neu(`Foot${s}`, 'Root', 4 * x, 1, 0); // Quaternius: Fuß = IK-Ziel am Root, kein Kind des Unterschenkels
  }
  const gruppe = new THREE.Group();
  gruppe.add(modell);
  gruppe.position.set(300, 14, 200);
  gruppe.rotation.set(0, 0.7, 0, 'YXZ'); // schräg gedreht: Richtungen müssen im Figur-Raum stimmen
  const figur = { gruppe, modell, aktionen: {}, aktuell: 'stehen', klips: new Set(['stehen']) };
  richteFigurEin(figur, modell);
  return { figur, knochen };
}

const SITZEN = { typ: 'spieler', arbeit: 'sitzen', arbeitOrt: { x: 300, y: 200, blick: 0, hoehe: 14, sitz: true } };
const welt = (k) => k.getWorldPosition(new THREE.Vector3());
const weltDrehung = (k) => k.getWorldQuaternion(new THREE.Quaternion());
/** Richtung im Figur-Raum (+z vorn, +y oben, -x rechts) */
const imFigurRaum = (figur, v) => v.clone().applyQuaternion(figur.gruppe.quaternion.clone().invert());

test('Runde 45: Hände im Sitzen stehen still (keine aufgestapelte Drehung je Bild)', () => {
  const { figur, knochen } = baueFigur();
  aktualisiereHaltung(figur, SITZEN, 1000);
  const vorher = { R: weltDrehung(knochen.WristR), L: weltDrehung(knochen.WristL), uR: weltDrehung(knochen.LowerArmR) };
  for (let i = 1; i <= 30; i++) aktualisiereHaltung(figur, SITZEN, 1000 + i * 16);
  for (const [name, k] of [['R', knochen.WristR], ['L', knochen.WristL], ['uR', knochen.LowerArmR]]) {
    const grad = (vorher[name].angleTo(weltDrehung(k)) * 180) / Math.PI;
    assert.ok(grad < 0.01, `${name} hat sich nach 30 Bildern um ${grad.toFixed(2)}° weitergedreht`);
  }
});

test('Runde 45: Hände liegen flach auf den Oberschenkeln (Handfläche unten, Finger vorn)', () => {
  const { figur, knochen } = baueFigur();
  aktualisiereHaltung(figur, SITZEN, 1000);
  for (const s of ['R', 'L']) {
    const handgelenk = welt(knochen[`Wrist${s}`]);
    const finger = imFigurRaum(figur, welt(knochen[`Middle1${s}`]).sub(handgelenk).normalize());
    assert.ok(finger.z > 0.85, `Finger ${s} zeigen nach vorn (z=${finger.z.toFixed(2)})`);
    const quer = welt(knochen[`Index1${s}`]).sub(welt(knochen[`Pinky1${s}`]));
    const flaeche = imFigurRaum(figur, new THREE.Vector3().crossVectors(quer, welt(knochen[`Middle1${s}`]).sub(handgelenk)).normalize().multiplyScalar(s === 'R' ? 1 : -1));
    assert.ok(flaeche.y < -0.9, `Handfläche ${s} zeigt nach unten (y=${flaeche.y.toFixed(2)})`);
    // Handgelenk über dem Oberschenkel: zwischen Hüfte und Knie, knapp über der Beinachse
    const huefte = welt(knochen[`UpperLeg${s}`]);
    const knie = welt(knochen[`LowerLeg${s}`]);
    const bein = knie.clone().sub(huefte);
    const t = handgelenk.clone().sub(huefte).dot(bein) / bein.lengthSq();
    assert.ok(t > 0.2 && t < 0.7, `Hand ${s} liegt auf dem Oberschenkel (Anteil Hüfte→Knie ${t.toFixed(2)})`);
    const ueber = handgelenk.y - (huefte.y + bein.y * t);
    assert.ok(ueber > 0.5 && ueber < 5, `Hand ${s} knapp über der Beinachse (${ueber.toFixed(2)})`);
  }
});

test('Runde 45: nach dem Aufstehen Arme wieder in Ruhestellung, Modell zurück', () => {
  const { figur, knochen } = baueFigur();
  const ruhe = knochen.LowerArmR.quaternion.clone();
  const basis = figur.modell.position.clone();
  for (let i = 0; i < 5; i++) aktualisiereHaltung(figur, SITZEN, 1000 + i * 16);
  assert.ok(figur.stuhlVersatz);
  assert.ok(knochen.LowerArmR.quaternion.angleTo(ruhe) > 0.1, 'im Sitzen ist der Unterarm gebeugt');
  setzeStuhlZurueck(figur);
  assert.ok(!figur.stuhlVersatz);
  assert.ok(knochen.LowerArmR.quaternion.angleTo(ruhe) < 1e-6, 'Unterarm wieder in Ruhestellung');
  assert.ok(figur.modell.position.distanceTo(basis) < 1e-9, 'Modell-Versatz zurückgenommen');
});
