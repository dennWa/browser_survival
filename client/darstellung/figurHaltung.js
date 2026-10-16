import * as THREE from 'three';
import { erzeugeWaffe, haltungFuer, waffenModellName } from './waffenModelle.js';

/**
 * Prozedurale Körperhaltung über der Lauf-/Steh-Animation:
 * Nach mixer.update() werden Ober- und Unterarme in eine Zielrichtung gedreht (Zielen, Schlagen,
 * Rückstoß, Nachladen), und das Waffenmodell sitzt in der Hand.
 *
 * Richtungen sind im Raum der Figur angegeben: +z = Blickrichtung, +y = oben,
 * -x = rechte Körperseite (die Kenney-Figur schaut im Modell nach +z, rechter Arm liegt bei -x).
 */
const ARM_KNOCHEN = {
  rechts: ['RightArm', 'RightForeArm', 'RightHand', 'RightHandIndex1'],
  links: ['LeftArm', 'LeftForeArm', 'LeftHand', 'LeftHandIndex1'],
};
const v = (x, y, z) => new THREE.Vector3(x, y, z).normalize();
const VORNE = new THREE.Vector3(0, 0, 1);

// Grundhaltungen [Oberarm, Unterarm]
const HALTUNGEN = {
  pistole: { rechts: [v(0.22, -0.04, 1), v(0.18, 0, 1)], links: [v(-0.5, -0.08, 1), v(-0.36, 0, 1)], hand: 'rechts', zielen: true },
  gewehr: { rechts: [v(0.05, -0.8, 0.5), v(0.35, 0.12, 1)], links: [v(-0.3, -0.35, 1), v(-0.12, 0.05, 1)], hand: 'rechts', zielen: true },
  nahkampf: { rechts: [v(-0.25, -0.85, 0.45), v(-0.05, -0.2, 1)], links: null, hand: 'rechts' },
  lampe: { rechts: null, links: [v(-0.12, -0.35, 1), v(-0.08, -0.04, 1)], hand: 'links' },
  zombie: { rechts: [v(0.12, 0.05, 1), v(0.05, 0.02, 1)], links: [v(-0.12, 0.05, 1), v(-0.05, 0.02, 1)], hand: null },
  // Holzfällen/Steinhacken: beidhändig, Schwung wird in veraendereFuerAktion animiert
  hacken: { rechts: [v(0.2, 0.3, 1), v(0.2, 0.3, 1)], links: [v(-0.35, 0.25, 1), v(-0.2, 0.3, 1)], hand: 'rechts' },
};
/** Arbeit → Werkzeug in der Hand */
const ARBEIT_WERKZEUG = { holz: 'axt', stein: 'spitzhacke' };
const HACK_TAKT_MS = 850; // ein Schlag

/** Bereitet eine frisch geklonte Figur vor: Knochen merken. */
export function richteFigurEin(figur, modell) {
  figur.knochen = {};
  for (const [seite, namen] of Object.entries(ARM_KNOCHEN)) {
    const k = namen.map((n) => modell.getObjectByName(n));
    if (k.every(Boolean)) figur.knochen[seite] = k;
  }
  figur.waffe = null;
  figur.waffenName = null;
  figur.aktionSchluessel = null;
  figur.aktionStart = 0;
  figur.aktionDauer = 0;
  figur.muendung = new THREE.Vector3();
  figur.hatMuendung = false;
}

/**
 * Pro Frame NACH mixer.update(): Haltung anwenden, Waffe platzieren.
 * @param e  Entität (Netzwerkdaten + Interpolation): typ, ausruestung, waffe, aktion, aktionTick, aktionDauer
 */
export function aktualisiereHaltung(figur, e, jetzt) {
  if (!figur.knochen.rechts || !figur.knochen.links) return;
  const fortschritt = aktionsFortschritt(figur, e, jetzt);

  let haltungsName;
  let waffenName = null;
  if (e.typ === 'zombie') {
    haltungsName = 'zombie';
  } else if (ARBEIT_WERKZEUG[e.arbeit]) {
    waffenName = ARBEIT_WERKZEUG[e.arbeit];
    haltungsName = 'hacken';
  } else {
    waffenName = waffenModellName(e.waffe, e.ausruestung);
    haltungsName = haltungFuer(waffenName);
  }
  setzeWaffe(figur, waffenName);

  const basis = HALTUNGEN[haltungsName];
  const pose = { rechts: basis.rechts?.map((r) => r.clone()) ?? null, links: basis.links?.map((r) => r.clone()) ?? null };
  if (haltungsName === 'hacken') hackSchwung(pose, (jetzt % HACK_TAKT_MS) / HACK_TAKT_MS);
  else veraendereFuerAktion(pose, haltungsName, e.aktion, fortschritt);

  const gruppe = figur.gruppe;
  gruppe.updateMatrixWorld(true);
  for (const seite of ['rechts', 'links']) {
    if (!pose[seite]) continue;
    const [oberarm, unterarm, hand] = figur.knochen[seite];
    richteKnochen(oberarm, unterarm, inWelt(pose[seite][0], gruppe));
    richteKnochen(unterarm, hand, inWelt(pose[seite][1], gruppe));
  }

  // Waffe in die Hand: Position = Hand, Richtung = Unterarm (Schusswaffen: genau in Blickrichtung)
  if (figur.waffe) {
    const seite = basis.hand ?? 'rechts';
    const [, unterarm, hand, finger] = figur.knochen[seite];
    const handPos = hand.getWorldPosition(_a);
    const fingerPos = finger.getWorldPosition(_b);
    const mitte = handPos.lerp(fingerPos, 0.5);
    gruppe.worldToLocal(mitte);
    figur.waffe.position.copy(mitte);
    let richtung;
    if (basis.zielen) {
      richtung = _c.copy(VORNE);
      if (e.aktion === 'schiessen' && fortschritt !== null) richtung.y += Math.sin(Math.PI * fortschritt) * 0.5;
      if (e.aktion === 'nachladen' && fortschritt !== null) richtung.y -= Math.sin(Math.PI * fortschritt) * 0.9;
      richtung.normalize();
    } else {
      const ellbogen = gruppe.worldToLocal(unterarm.getWorldPosition(_c));
      richtung = _d.copy(gruppe.worldToLocal(hand.getWorldPosition(_e))).sub(ellbogen).normalize();
      if (haltungsName === 'nahkampf') richtung.y += 0.35; // Klinge leicht nach oben
      if (haltungsName === 'hacken') richtung.y += 0.6; // Kopf des Werkzeugs vorne-oben
      richtung.normalize();
    }
    figur.waffe.quaternion.setFromUnitVectors(VORNE, richtung);
    figur.waffe.updateMatrixWorld(true);
    const muendung = figur.waffe.userData.muendung;
    figur.hatMuendung = !!muendung;
    if (muendung) figur.muendung.copy(muendung).applyMatrix4(figur.waffe.matrixWorld);
  }
}

/** 0..1 während einer Aktion (Schuss, Schlag, Nachladen …), sonst null. Startet bei jeder neuen Aktion neu. */
function aktionsFortschritt(figur, e, jetzt) {
  if (!e.aktion) {
    figur.aktionSchluessel = null;
    return null;
  }
  const schluessel = `${e.aktion}:${e.aktionTick}`;
  if (schluessel !== figur.aktionSchluessel) {
    figur.aktionSchluessel = schluessel;
    figur.aktionStart = jetzt;
    figur.aktionDauer = Math.max(80, (e.aktionDauer ?? 0.3) * 1000);
  }
  return Math.min(1, (jetzt - figur.aktionStart) / figur.aktionDauer);
}

function veraendereFuerAktion(pose, haltung, aktion, p) {
  if (p === null) return;
  const welle = Math.sin(Math.PI * p);
  if (aktion === 'schiessen' && (haltung === 'pistole' || haltung === 'gewehr')) {
    const kick = welle * (haltung === 'gewehr' ? 0.45 : 0.6);
    for (const seite of ['rechts', 'links']) for (const r of pose[seite]) r.y += kick;
  } else if (aktion === 'nachladen' && pose.links) {
    for (const r of pose.rechts) r.y -= welle * 0.6;
    pose.links[0].set(-0.55, -0.6, 0.7);
    pose.links[1].set(-0.8, -0.1 + welle * 0.4, 0.4);
  } else if (aktion === 'nahkampf' && haltung === 'nahkampf') {
    // Schwung von rechts oben quer vor den Körper
    const t = p * p * (3 - 2 * p);
    pose.rechts[0].copy(_a.set(-0.9, 0.6, 0.25).lerp(_b.set(0.75, -0.3, 0.7), t));
    pose.rechts[1].copy(_a.set(-0.6, 0.7, 0.6).lerp(_b.set(0.7, -0.2, 0.9), t));
  } else if (aktion === 'nahkampf' && haltung === 'lampe') {
    // Faustschlag: aus der Deckung nach vorne und zurück
    const stoss = Math.sin(Math.PI * Math.min(1, p * 1.3));
    pose.rechts = [
      _a.set(-0.25, -0.75, 0.5).lerp(_b.set(0.12, 0.08, 1), stoss).clone(),
      _a.set(0.15, 0.6, 0.75).lerp(_b.set(0.12, 0.08, 1), stoss).clone(),
    ];
  } else if (aktion === 'angriff' && haltung === 'zombie') {
    // Zombie: Arme hoch und runterkrachen lassen
    const hub = p < 0.4 ? p / 0.4 : 1 - (p - 0.4) / 0.6;
    for (const seite of ['rechts', 'links']) for (const r of pose[seite]) r.y += hub * 0.9 - 0.2;
  }
  for (const seite of ['rechts', 'links']) for (const r of pose[seite] ?? []) r.normalize();
}

/** Hacken: ausholen über die Schulter, dann kräftig nach vorne-unten schlagen (p = 0..1 je Schlag). */
function hackSchwung(pose, p) {
  const ausholen = p < 0.55 ? p / 0.55 : 1 - (p - 0.55) / 0.45; // langsam hoch, schnell runter
  const hoehe = -0.55 + ausholen * 1.6;
  for (const seite of ['rechts', 'links']) {
    pose[seite][0].y = hoehe * 0.8;
    pose[seite][1].y = hoehe;
    pose[seite][0].z = 1 - ausholen * 0.5;
    for (const r of pose[seite]) r.normalize();
  }
}

function setzeWaffe(figur, name) {
  if (figur.waffenName === name) return;
  if (figur.waffe) figur.gruppe.remove(figur.waffe);
  figur.waffe = name ? erzeugeWaffe(name) : null;
  figur.waffenName = name;
  if (figur.waffe) figur.gruppe.add(figur.waffe);
}

function inWelt(richtung, gruppe) {
  return richtung.clone().applyQuaternion(gruppe.quaternion);
}

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();
const _d = new THREE.Vector3();
const _e = new THREE.Vector3();
const _p0 = new THREE.Vector3();
const _p1 = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _qw = new THREE.Quaternion();
const _qp = new THREE.Quaternion();

/** Dreht `knochen` so, dass die Linie zu `kind` in Welt-Richtung `ziel` zeigt. */
function richteKnochen(knochen, kind, ziel) {
  knochen.getWorldPosition(_p0);
  kind.getWorldPosition(_p1);
  const ist = _p1.sub(_p0).normalize();
  _q.setFromUnitVectors(ist, ziel);
  knochen.getWorldQuaternion(_qw);
  knochen.parent.getWorldQuaternion(_qp).invert();
  knochen.quaternion.copy(_qp.multiply(_q.multiply(_qw)));
  knochen.updateMatrixWorld(true);
}
