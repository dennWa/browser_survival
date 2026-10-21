import * as THREE from 'three';
import { erzeugeWaffe, haltungFuer as modellHaltung, waffenModellName } from './waffenModelle.js';

/** Haltung je Waffenmodell: wie waffenModelle.haltungFuer, nur Messer einhändig ('messer') */
const haltungFuer = (name) => haltungMitHaenden(name) ?? modellHaltung(name);

/**
 * Prozedurale Körperhaltung über der Lauf-/Steh-Animation:
 * Nach mixer.update() werden Ober- und Unterarme in eine Zielrichtung gedreht (Zielen, Schlagen,
 * Rückstoß, Nachladen), und das Waffenmodell sitzt in der Hand.
 *
 * Spielerfiguren (client/assets/3d/figur_mann|frau.glb): Beim Holz-/Steinabbau, Zerlegen und Hacken macht ein Clip den Schlag
 * (hacken/spitzhacke/abbauen/hacke, figur.klips) – hier wird nur das Werkzeug zwischen die Hände gelegt (platziereHackwerkzeug).
 * Sitzen: Clip „sitzen“ (falls vorhanden), sonst prozedural.
 *
 * Haltungen (Runde 18): ohne Waffe hängen die Arme locker (Clip); Taschenlampe nur nachts mit Licht an nach vorn;
 * Pistole hängt unten und wird erst beim Schießen gehoben (bleibt PISTOLE_OBEN_MS oben); Nahkampfwaffen beidhändig vor dem
 * Körper, Messer einhändig (andere Hand locker).
 *
 * Richtungen sind im Raum der Figur angegeben: +z = Blickrichtung, +y = oben,
 * -x = rechte Körperseite (die Kenney-Figur schaut im Modell nach +z, rechter Arm liegt bei -x).
 */
// Knochennamen je Skelett: Kenney (Zombies) und Quaternius (Spielerfiguren; der GLTFLoader entfernt die Punkte aus „UpperArm.R“)
const ARM_KNOCHEN = [
  { rechts: ['RightArm', 'RightForeArm', 'RightHand', 'RightHandIndex1'], links: ['LeftArm', 'LeftForeArm', 'LeftHand', 'LeftHandIndex1'] },
  { rechts: ['UpperArmR', 'LowerArmR', 'WristR', 'Middle1R'], links: ['UpperArmL', 'LowerArmL', 'WristL', 'Middle1L'] },
];
const BEIN_KNOCHEN = [
  { rechts: ['RightUpLeg', 'RightLeg', 'RightFoot'], links: ['LeftUpLeg', 'LeftLeg', 'LeftFoot'] },
  { rechts: ['UpperLegR', 'LowerLegR', 'FootR'], links: ['UpperLegL', 'LowerLegL', 'FootL'] },
];
const v = (x, y, z) => new THREE.Vector3(x, y, z).normalize();
const VORNE = new THREE.Vector3(0, 0, 1);

// Grundhaltungen [Oberarm, Unterarm]
const HALTUNGEN = {
  pistole: { rechts: [v(0.22, -0.04, 1), v(0.18, 0, 1)], links: [v(-0.5, -0.08, 1), v(-0.36, 0, 1)], hand: 'rechts', zielen: true },
  gewehr: { rechts: [v(0.05, -0.8, 0.5), v(0.35, 0.12, 1)], links: [v(-0.3, -0.35, 1), v(-0.12, 0.05, 1)], hand: 'rechts', zielen: true },
  // Pistole in Ruhe: Arm hängt schräg nach vorn-unten, Lauf zeigt zum Boden vor der Figur
  pistoleUnten: { rechts: [v(-0.08, -0.92, 0.32), v(0.02, -0.7, 0.7)], links: null, hand: 'rechts' },
  // Messer (einhändig): Klinge vor dem Körper, andere Hand bleibt unten
  messer: { rechts: [v(-0.25, -0.85, 0.45), v(-0.05, -0.2, 1)], links: null, hand: 'rechts' },
  // Nahkampfwaffe beidhändig vor dem Körper (Schlagbereitschaft); die linke Hand greift den Stiel (greifeMitLinkerHand)
  nahkampf: { rechts: [v(-0.12, -0.78, 0.6), v(0.25, 0.1, 1)], links: null, hand: 'rechts', beidhaendig: true },
  // Faustschlag ohne Waffe (Ausgangshaltung, der Stoß kommt aus veraendereFuerAktion)
  faust: { rechts: [v(-0.25, -0.75, 0.5), v(0.15, 0.6, 0.75)], links: null, hand: null },
  // Nichts in der Hand: Arme kommen ganz aus dem Clip (locker hängend / Pendeln beim Gehen)
  locker: { rechts: null, links: null, hand: null },
  // Etwas in der Hand halten (Essen, Trinken, Holz, Samen): Unterarm vor dem Bauch
  halten: { rechts: [v(-0.12, -0.55, 0.8), v(0.12, 0.05, 1)], links: null, hand: 'rechts' },
  lampe: { rechts: null, links: [v(-0.12, -0.35, 1), v(-0.08, -0.04, 1)], hand: 'links' },
  zombie: { rechts: [v(0.12, 0.05, 1), v(0.05, 0.02, 1)], links: [v(-0.12, 0.05, 1), v(-0.05, 0.02, 1)], hand: null },
  // Am Lagerfeuer sitzen: Hände locker auf den Knien
  sitzen: { rechts: [v(-0.05, -0.75, 0.55), v(0.02, -0.3, 1)], links: [v(0.05, -0.75, 0.55), v(-0.02, -0.3, 1)], hand: null },
  // Holzfällen/Steinhacken: beidhändig, Schwung wird in veraendereFuerAktion animiert
  hacken: { rechts: [v(0.2, 0.3, 1), v(0.2, 0.3, 1)], links: [v(-0.35, 0.25, 1), v(-0.2, 0.3, 1)], hand: 'rechts' },
};
/** Arbeit → Werkzeug in der Hand (zerlegen: das ausgerüstete Werkzeug) */
const ARBEIT_WERKZEUG = { holz: 'axt', stein: 'spitzhacke', eisenerz: 'spitzhacke' };
/** Arbeit/Aktion → Clip, der den Schlag macht (wenn die Figur ihn hat) */
export const ARBEIT_KLIP = { holz: 'hacken', stein: 'spitzhacke', eisenerz: 'spitzhacke', zerlegen: 'abbauen' };
const HACK_TAKT_MS = 850; // ein Schlag
const PISTOLE_OBEN_MS = 10000; // so lange bleibt die Pistole nach dem letzten Schuss im Anschlag
const ANSCHLAG_TEMPO = 7; // 1/s: Heben/Senken der Pistole

/** Bereitet eine frisch geklonte Figur vor: Knochen merken. */
export function richteFigurEin(figur, modell) {
  const waehle = (satz) => {
    const gefunden = {};
    for (const namen of satz) {
      for (const [seite, liste] of Object.entries(namen)) {
        const k = liste.map((n) => modell.getObjectByName(n));
        if (k.every(Boolean)) gefunden[seite] = k;
      }
      if (Object.keys(gefunden).length) break;
    }
    return gefunden;
  };
  figur.knochen = waehle(ARM_KNOCHEN);
  figur.beine = waehle(BEIN_KNOCHEN);
  figur.waffe = null;
  figur.waffenName = null;
  figur.aktionSchluessel = null;
  figur.aktionStart = 0;
  figur.aktionDauer = 0;
  figur.muendung = new THREE.Vector3();
  figur.hatMuendung = false;
  figur.anschlag = 0; // 0 = Pistole unten, 1 = im Anschlag
  figur.anschlagBis = 0;
  figur.letzteHaltungZeit = 0;
}

/**
 * Pro Frame NACH mixer.update(): Haltung anwenden, Waffe platzieren.
 * @param e  Entität (Netzwerkdaten + Interpolation): typ, ausruestung, waffe, aktion, aktionTick, aktionDauer, lichtAn
 * @param dunkel 0 (Tag) … 1 (Nacht): Taschenlampe wird nur im Dunkeln (und wenn an) nach vorn gehalten
 */
export function aktualisiereHaltung(figur, e, jetzt, dunkel = 1) {
  if (!figur.knochen.rechts || !figur.knochen.links) return;
  const fortschritt = aktionsFortschritt(figur, e, jetzt);
  const dt = figur.letzteHaltungZeit ? Math.min(0.1, (jetzt - figur.letzteHaltungZeit) / 1000) : 0;
  figur.letzteHaltungZeit = jetzt;
  const klips = figur.klips ?? new Set();

  let haltungsName;
  let waffenName = null;
  if (e.typ === 'zombie') {
    haltungsName = 'zombie';
  } else if (e.arbeit === 'sitzen') {
    haltungsName = 'sitzen';
  } else if (ARBEIT_WERKZEUG[e.arbeit] || e.arbeit === 'zerlegen') {
    waffenName = ARBEIT_WERKZEUG[e.arbeit] ?? waffenModellName(e.waffe, e.ausruestung);
    haltungsName = 'hacken';
  } else if (e.aktion === 'hacke' && fortschritt !== null) {
    waffenName = 'hacke';
    haltungsName = 'hacken';
  } else {
    // Angelnd hält die Figur die Rute des Angel-Modells (angelModell.js) – nicht zusätzlich die Hand-Rute
    waffenName = e.angeln ? null : waffenModellName(e.waffe, e.ausruestung);
    haltungsName = haltungFuer(waffenName);
    // Nichts in der Hand: Lampe nur nachts und eingeschaltet vorn, sonst locker (Faustschlag hebt kurz den Arm)
    if (haltungsName === 'lampe' && (e.lichtAn === false || dunkel < 0.3)) {
      waffenName = null;
      haltungsName = e.aktion === 'nahkampf' && fortschritt !== null ? 'faust' : 'locker';
    }
  }
  setzeWaffe(figur, waffenName);

  // Sitzen mit eigenem Clip: Arme/Beine kommen ganz aus dem Clip
  if (haltungsName === 'sitzen' && klips.has('sitzen')) return;
  // Survivor: den Schlag macht ein Clip (hacken/spitzhacke/abbauen/hacke) – hier nur das Werkzeug in die Hände legen
  // (figur.schlagKlip setzt der Renderer, wenn er gerade einen Werkzeug-Clip abspielt)
  if (haltungsName === 'hacken' && figur.schlagKlip) {
    platziereHackwerkzeug(figur);
    return;
  }

  // Pistole: unten tragen, erst beim Schießen/Nachladen in den Anschlag – nach PISTOLE_OBEN_MS ohne Schuss wieder runter
  if (haltungsName === 'pistole') {
    if ((e.aktion === 'schiessen' || e.aktion === 'nachladen') && fortschritt !== null) figur.anschlagBis = jetzt + PISTOLE_OBEN_MS;
    const ziel = jetzt < figur.anschlagBis ? 1 : 0;
    figur.anschlag += (ziel - figur.anschlag) * Math.min(1, dt * ANSCHLAG_TEMPO);
    if (Math.abs(ziel - figur.anschlag) < 0.01) figur.anschlag = ziel;
  }
  const basis = HALTUNGEN[haltungsName];
  const pose = { rechts: basis.rechts?.map((r) => r.clone()) ?? null, links: basis.links?.map((r) => r.clone()) ?? null };
  if (haltungsName === 'pistole' && figur.anschlag < 1) {
    // Zwischen Ruhe (unten, einhändig) und Anschlag (beidhändig) überblenden; die linke Hand kommt erst oben dazu
    const unten = HALTUNGEN.pistoleUnten;
    for (let i = 0; i < 2; i++) pose.rechts[i].lerpVectors(unten.rechts[i], basis.rechts[i], figur.anschlag).normalize();
    if (figur.anschlag < 0.5) pose.links = null;
  }
  if (haltungsName === 'hacken') (e.arbeit === 'holz' ? seitSchwung : hackSchwung)(pose, e.aktion === 'hacke' && !e.arbeit ? Math.min(1, (fortschritt ?? 1) * 0.55 + 0.45) : (jetzt % HACK_TAKT_MS) / HACK_TAKT_MS);
  else veraendereFuerAktion(pose, haltungsName, e.aktion, fortschritt);

  const gruppe = figur.gruppe;
  gruppe.updateMatrixWorld(true);
  for (const seite of ['rechts', 'links']) {
    if (!pose[seite]) continue;
    const [oberarm, unterarm, hand] = figur.knochen[seite];
    richteKnochen(oberarm, unterarm, inWelt(pose[seite][0], gruppe));
    richteKnochen(unterarm, hand, inWelt(pose[seite][1], gruppe));
  }
  // Holzfällen / beidhändige Nahkampfwaffe: beide Hände am Stiel – die linke Hand greift ein Stück weiter vorn
  if ((haltungsName === 'hacken' && e.arbeit === 'holz') || basis.beidhaendig) greifeMitLinkerHand(figur, gruppe);

  // Sitzen: Oberschenkel nach vorn, Unterschenkel nach unten (Figur ist dafür tiefer gesetzt, siehe renderer)
  if (haltungsName === 'sitzen') {
    for (const seite of ['rechts', 'links']) {
      const bein = figur.beine[seite];
      if (!bein) continue;
      const [oberschenkel, unterschenkel, fuss] = bein;
      richteKnochen(oberschenkel, unterschenkel, inWelt(v(seite === 'rechts' ? -0.18 : 0.18, 0, 1), gruppe));
      richteKnochen(unterschenkel, fuss, inWelt(v(0, -1, 0.08), gruppe));
    }
  }

  // Waffe in die Hand: Position = Hand, Richtung = Unterarm (Schusswaffen: genau in Blickrichtung)
  if (figur.waffe) {
    figur.waffe.scale.setScalar(1);
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
      if (haltungsName === 'pistole' && figur.anschlag < 1) {
        // Pistole unten: Lauf folgt dem Unterarm (zeigt schräg zum Boden), oben genau nach vorn
        const ellbogen = gruppe.worldToLocal(unterarm.getWorldPosition(_f));
        const arm = _g.copy(gruppe.worldToLocal(hand.getWorldPosition(_e))).sub(ellbogen).normalize();
        richtung.lerp(arm, 1 - figur.anschlag);
      }
      richtung.normalize();
    } else {
      const ellbogen = gruppe.worldToLocal(unterarm.getWorldPosition(_c));
      richtung = _d.copy(gruppe.worldToLocal(hand.getWorldPosition(_e))).sub(ellbogen).normalize();
      if (haltungsName === 'nahkampf') richtung.y += 0.35; // Klinge leicht nach oben
      if (haltungsName === 'hacken') richtung.y += e.arbeit === 'holz' ? 0.15 : 0.6; // Kopf des Werkzeugs vorne-oben (Axt seitlich: fast waagerecht)
      richtung.normalize();
    }
    if (haltungsName === 'hacken' && e.arbeit === 'holz') {
      // Axt: Schneide (Modell +y) zeigt in Schwungrichtung (waagerecht quer zum Stiel) – man schlägt mit der scharfen Kante seitlich gegen den Stamm
      const kante = _f.set(0, 1, 0).cross(richtung);
      if (kante.lengthSq() > 1e-4) {
        kante.normalize();
        _g.copy(kante).cross(richtung);
        figur.waffe.quaternion.setFromRotationMatrix(_basis.makeBasis(_g, kante, richtung));
      } else figur.waffe.quaternion.setFromUnitVectors(VORNE, richtung);
    } else figur.waffe.quaternion.setFromUnitVectors(VORNE, richtung);
    figur.waffe.updateMatrixWorld(true);
    const muendung = figur.waffe.userData.muendung;
    figur.hatMuendung = !!muendung;
    if (muendung) figur.muendung.copy(muendung).applyMatrix4(figur.waffe.matrixWorld);
  }
}

const HACK_WERKZEUG_GROESSE = 1.5; // Axt/Spitzhacke wirken zum Schwingen mit zwei Händen sonst zu klein

/**
 * Clip „hacken“: Stiel liegt zwischen unterer (links) und oberer Hand (rechts), der Kopf sitzt am oberen Ende;
 * die Schneide steht senkrecht zum Stiel in der Schwungebene (Stiel um 90° gedreht: Ausholen → vorn-oben, Treffer → hinten-unten).
 */
function platziereHackwerkzeug(figur) {
  if (!figur.waffe) return;
  const gruppe = figur.gruppe;
  gruppe.updateMatrixWorld(true);
  const griff = (seite, ziel) => {
    const [, , hand, finger] = figur.knochen[seite];
    ziel.copy(gruppe.worldToLocal(hand.getWorldPosition(_a))).lerp(gruppe.worldToLocal(finger.getWorldPosition(_b)), 0.5);
    return ziel;
  };
  const oben = griff('rechts', _c);
  const unten = griff('links', _d);
  const stiel = _e.copy(oben).sub(unten);
  if (stiel.lengthSq() < 1e-4) stiel.copy(VORNE);
  stiel.normalize();
  const kante = _f.set(0, -stiel.z, stiel.y);
  kante.addScaledVector(stiel, -kante.dot(stiel));
  if (kante.lengthSq() < 1e-4) kante.set(0, 1, 0);
  kante.normalize();
  const quer = _g.copy(kante).cross(stiel);
  figur.waffe.position.copy(oben);
  figur.waffe.quaternion.setFromRotationMatrix(_basis.makeBasis(quer, kante, stiel));
  figur.waffe.scale.setScalar(HACK_WERKZEUG_GROESSE);
  figur.waffe.updateMatrixWorld(true);
  figur.hatMuendung = false;
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
  } else if (aktion === 'nahkampf' && (haltung === 'nahkampf' || haltung === 'messer')) {
    // Schwung von rechts oben quer vor den Körper
    const t = p * p * (3 - 2 * p);
    pose.rechts[0].copy(_a.set(-0.9, 0.6, 0.25).lerp(_b.set(0.75, -0.3, 0.7), t));
    pose.rechts[1].copy(_a.set(-0.6, 0.7, 0.6).lerp(_b.set(0.7, -0.2, 0.9), t));
  } else if (aktion === 'nahkampf' && (haltung === 'lampe' || haltung === 'faust')) {
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

/** Messer/Skalpell = einhändig, Pistole/Gewehr/Lampe/Halten eigene Haltungen, alles andere (Axt, Machete, Hammer …) beidhändig. */
const EINHAENDIG = new Set(['kuechenmesser', 'skalpell']);
export function haltungMitHaenden(name) {
  return EINHAENDIG.has(name) ? 'messer' : null;
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

/** Holzfällen: die Axt schwingt seitlich – von rechts hinten ausholen, quer vor dem Körper nach links durchziehen. */
function seitSchwung(pose, p) {
  const ausholen = p < 0.55 ? p / 0.55 : 1 - (p - 0.55) / 0.45; // 1 = ganz rechts ausgeholt, 0 = Treffer
  const quer = 0.55 - ausholen * 1.5; // -x ist rechts: von rechts außen (-0.95) nach links (+0.55)
  const tiefe = 0.95 - ausholen * 0.6;
  for (const seite of ['rechts', 'links']) {
    pose[seite][0].set(quer, 0.12 + ausholen * 0.1, tiefe);
    pose[seite][1].set(quer * 0.9, 0.1 + ausholen * 0.05, tiefe + 0.15);
    for (const r of pose[seite]) r.normalize();
  }
}

/** Linke Hand an den Stiel: Arm zeigt zum Punkt ~7 px vor der rechten Hand, in Stielrichtung (rechte Hand/Unterarm sind schon ausgerichtet). */
function greifeMitLinkerHand(figur, gruppe) {
  const [oR, uR, hR] = figur.knochen.rechts;
  const [oL, uL, hL] = figur.knochen.links;
  const stiel = _f.copy(hR.getWorldPosition(_a)).sub(uR.getWorldPosition(_b)).normalize();
  const ziel = _g.copy(hR.getWorldPosition(_a)).addScaledVector(stiel, 7);
  for (const [knochen, kind] of [[oL, uL], [uL, hL]]) {
    knochen.getWorldPosition(_c);
    richteKnochen(knochen, kind, _d.copy(ziel).sub(_c).normalize());
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
const _f = new THREE.Vector3();
const _g = new THREE.Vector3();
const _basis = new THREE.Matrix4();
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
