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
 * Sitzen: Clip „sitzen“ (falls vorhanden), sonst prozedural. Runde 44: auf Stuhl/Bank (e.arbeitOrt.sitz) Steh-Clip + stuhlSitz
 * (Becken auf die Sitzfläche, Beine/Arme prozedural). Runde 45: Arme je Bild ab armRuhe (setzeArmAufRuhe), Hände per IK flach
 * auf die Oberschenkel (handAufOberschenkel/legeHandFlach) – nie relativ weiterdrehen (konstante Clip-Spuren, s. fallen.md).
 *
 * Haltungen (Runde 19): ohne Waffe hängen die Arme locker (Clip); Taschenlampe nur nachts mit Licht an, schräg nach vorn-unten;
 * Schusswaffen (Pistole, Gewehr) und Nahkampfwaffen außer Arbeitswerkzeug hängen locker neben dem Körper und gehen erst beim
 * Schießen/Schlagen in den Anschlag (bleibt ANSCHLAG_MS oben, dann BEIDE Arme wieder runter). Arbeitswerkzeug (WERKZEUGE:
 * Axt, Spitzhacke, Angel, Hammer, Hacke) bleibt beidhändig vor dem Körper. Andere Hand-Items (Essen, Trinken, Holz, Samen)
 * trägt die Figur entspannt seitlich (Haltung 'seitlich').
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
/** Runde 45: Fingerwurzeln [Zeige-, Mittel-, kleiner Finger] – daraus Handflächen-Normale (handflaeche); nur Quaternius-Rig */
const FINGER_KNOCHEN = [{ rechts: ['Index1R', 'Middle1R', 'Pinky1R'], links: ['Index1L', 'Middle1L', 'Pinky1L'] }];
/**
 * Runde 48: Fingerglieder zum Greifen (Quaternius: Glied 1 = Mittelhand und sitzt am Handgelenk, 2 = Knöchel, 3/4 = Fingerglieder).
 * Die Knöchel (Glied 2) spannen die Handfläche auf – Glied 1 liegt bei diesem Rig für alle Finger im selben Punkt.
 */
const GREIF_FINGER = ['Index', 'Middle', 'Ring', 'Pinky'];
const GREIF_GLIEDER = [2, 3, 4];
const DAUMEN_GLIEDER = [2, 3];
const v = (x, y, z) => new THREE.Vector3(x, y, z).normalize();
const VORNE = new THREE.Vector3(0, 0, 1);

// Grundhaltungen [Oberarm, Unterarm]
const HALTUNGEN = {
  pistole: { rechts: [v(0.22, -0.04, 1), v(0.18, 0, 1)], links: [v(-0.5, -0.08, 1), v(-0.36, 0, 1)], hand: 'rechts', zielen: true },
  gewehr: { rechts: [v(0.05, -0.8, 0.5), v(0.35, 0.12, 1)], links: [v(-0.3, -0.35, 1), v(-0.12, 0.05, 1)], hand: 'rechts', zielen: true },
  // Pistole in Ruhe: Arm hängt neben dem Körper, leicht angewinkelt, Lauf zeigt zum Boden
  pistoleUnten: { rechts: [v(-0.12, -0.98, 0.12), v(-0.04, -0.85, 0.5)], links: null, hand: 'rechts' },
  // Gewehr in Ruhe: rechte Hand hält es locker neben dem Körper, Lauf schräg nach vorn-unten, linke Hand hängt
  gewehrUnten: { rechts: [v(-0.12, -0.98, 0.15), v(-0.02, -0.75, 0.65)], links: null, hand: 'rechts' },
  // Entspannt seitlich: Arm hängt neben dem Körper, Unterarm leicht nach vorn (Item neben der Hüfte)
  seitlich: { rechts: [v(-0.14, -0.98, 0.08), v(-0.08, -0.8, 0.55)], links: null, hand: 'rechts' },
  // Messer (einhändig): Klinge vor dem Körper, andere Hand bleibt unten
  messer: { rechts: [v(-0.25, -0.85, 0.45), v(-0.05, -0.2, 1)], links: null, hand: 'rechts' },
  // Nahkampfwaffe beidhändig vor dem Körper (Schlagbereitschaft); die linke Hand greift den Stiel (greifeMitLinkerHand)
  nahkampf: { rechts: [v(-0.12, -0.78, 0.6), v(0.25, 0.1, 1)], links: null, hand: 'rechts', beidhaendig: true },
  // Faustschlag ohne Waffe (Ausgangshaltung, der Stoß kommt aus veraendereFuerAktion)
  faust: { rechts: [v(-0.25, -0.75, 0.5), v(0.15, 0.6, 0.75)], links: null, hand: null },
  // Nichts in der Hand: Arme kommen ganz aus dem Clip (locker hängend / Pendeln beim Gehen)
  locker: { rechts: null, links: null, hand: null },
  lampe: { rechts: null, links: [v(0.1, -0.85, 0.5), v(0.02, -0.35, 1)], hand: 'links' },
  // Runde 48: Zombie-Arme hängen schlaff nach unten (Nutzer-Wunsch statt vorgestreckt); beim Angriff leicht gehoben (ZOMBIE_ANGRIFF)
  zombie: { rechts: [v(-0.2, -0.95, 0.22), v(-0.1, -0.85, 0.45)], links: [v(0.2, -0.95, 0.22), v(0.1, -0.85, 0.45)], hand: null },
  // Am Lagerfeuer sitzen: Hände locker auf den Knien
  sitzen: { rechts: [v(-0.05, -0.75, 0.55), v(0.02, -0.3, 1)], links: [v(0.05, -0.75, 0.55), v(-0.02, -0.3, 1)], hand: null },
  // Holzfällen/Steinhacken: beidhändig, Schwung wird in veraendereFuerAktion animiert
  hacken: { rechts: [v(0.2, 0.3, 1), v(0.2, 0.3, 1)], links: [v(-0.35, 0.25, 1), v(-0.2, 0.3, 1)], hand: 'rechts' },
};
/** Runde 48: Zombie-Angriff – Ziel [Oberarm, Unterarm] (rechte Seite) beim höchsten Punkt: nur leicht nach vorn-unten gehoben */
const ZOMBIE_ANGRIFF = [[-0.15, -0.55, 0.8], [-0.08, -0.25, 1]];
/** Arbeit → Werkzeug in der Hand (zerlegen: das ausgerüstete Werkzeug) */
const ARBEIT_WERKZEUG = { holz: 'axt', stein: 'spitzhacke', eisenerz: 'spitzhacke' };
/** Arbeit/Aktion → Clip, der den Schlag macht (wenn die Figur ihn hat) */
export const ARBEIT_KLIP = { holz: 'hacken', rinde: 'abbauen', ast: 'abbauen', stein: 'spitzhacke', eisenerz: 'spitzhacke', zerlegen: 'abbauen' }; // Runde 31: Rinde/Ast = Arbeits-Clip „abbauen“ (Messer/Machete in der Hand)
const HACK_TAKT_MS = 850; // ein Schlag
const ANSCHLAG_MS = 5000; // so lange bleibt eine Waffe nach dem letzten Schuss/Schlag im Anschlag, dann gehen beide Arme runter
const ANSCHLAG_TEMPO = 7; // 1/s: Heben/Senken der Waffe
/** Arbeitswerkzeug: bleibt beidhändig vor dem Körper (Nutzer-Wunsch) – alle anderen Waffen/Items hängen in Ruhe locker */
const WERKZEUGE = new Set(['axt', 'spitzhacke', 'angel', 'hammer', 'hacke']);
/** Haltung in Ruhe (nicht im Anschlag) – null = Haltung bleibt immer gleich */
const RUHE_HALTUNG = { pistole: 'pistoleUnten', gewehr: 'gewehrUnten', nahkampf: 'seitlich', messer: 'seitlich' };

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
  figur.finger = waehle(FINGER_KNOCHEN);
  figur.greifer = greiferFuer(modell);
  // Runde 19: Ruhestellung der Arm-Knochen merken – Clips bewegen nicht jeden Knochen; ein einmal prozedural gedrehter Arm blieb
  // sonst stehen („nach dem Schießen bleibt eine Hand oben“). Beim Loslassen (Seite ohne Pose) geht er hierhin zurück.
  figur.armRuhe = Object.fromEntries(Object.entries(figur.knochen).map(([seite, k]) => [seite, k.map((x) => x.quaternion.clone())]));
  // Runde 48: Ruhestellung je Knochen (Arme + Finger) und was der Waffengriff zuletzt gesetzt hat (basisFuerGriff/loeseGriff)
  figur.ruhe = new Map();
  for (const seite of ['rechts', 'links']) {
    for (const k of [...(figur.knochen[seite] ?? []).slice(0, 3), ...greiferKnochen(figur.greifer[seite])]) figur.ruhe.set(k, k.quaternion.clone());
  }
  figur.griffGesetzt = new Map();
  figur.armGesetzt = { rechts: false, links: false };
  figur.waffe = null;
  figur.waffenName = null;
  figur.waffenSchluessel = undefined;
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
  setzeWaffe(figur, waffenName, e.waffeMods);
  // Runde 48: Pistole/Gewehr greifen beide Hände (IK + Finger) – alles andere gibt Arme/Finger aus dem Griff frei
  const griffWaffe = (haltungsName === 'pistole' || haltungsName === 'gewehr') && figur.greifer?.rechts && figur.greifer?.links;
  if (!griffWaffe) loeseGriff(figur);

  // Runde 44: auf Stuhl/Bank (arbeitOrt.sitz) – aufrechter Oberkörper aus dem Steh-Clip (der Renderer spielt „stehen“), Becken genau
  // auf die Sitzfläche, Oberschenkel waagerecht, Unterschenkel senkrecht, Hände auf den Oberschenkeln (stuhlSitz).
  // Runde 42 nahm dafür den Boden-Clip „sitzen“ – Becken nach hinten gekippt, Hände verdreht („sieht schlimm aus“).
  if (haltungsName === 'sitzen' && e.arbeitOrt?.sitz && figur.beine?.rechts && figur.beine?.links) {
    stuhlSitz(figur);
    return;
  }
  // Sitzen auf dem Boden mit eigenem Clip: Arme/Beine kommen ganz aus dem Clip
  if (haltungsName === 'sitzen' && klips.has('sitzen')) return loeseArme(figur);
  // Survivor: den Schlag macht ein Clip (hacken/spitzhacke/abbauen/hacke/nahkampf) – hier nur das Werkzeug in die Hände legen
  // (figur.schlagKlip setzt der Renderer, wenn er gerade einen Werkzeug-Clip abspielt)
  if ((haltungsName === 'hacken' || haltungsName === 'nahkampf') && figur.schlagKlip) {
    loeseArme(figur);
    platziereHackwerkzeug(figur);
    return;
  }

  // Waffen: locker unten tragen, erst beim Schießen/Nachladen/Schlagen in den Anschlag – nach ANSCHLAG_MS wieder runter
  const ruhe = WERKZEUGE.has(waffenName) ? null : RUHE_HALTUNG[haltungsName];
  if (ruhe) {
    if ((e.aktion === 'schiessen' || e.aktion === 'nachladen' || e.aktion === 'nahkampf') && fortschritt !== null) figur.anschlagBis = jetzt + ANSCHLAG_MS;
    const ziel = jetzt < figur.anschlagBis ? 1 : 0;
    figur.anschlag += (ziel - figur.anschlag) * Math.min(1, dt * ANSCHLAG_TEMPO);
    if (Math.abs(ziel - figur.anschlag) < 0.01) figur.anschlag = ziel;
  } else figur.anschlag = 0;
  if (griffWaffe) return schusswaffeHalten(figur, e, haltungsName, fortschritt);
  const basis = HALTUNGEN[haltungsName];
  const pose = { rechts: basis.rechts?.map((r) => r.clone()) ?? null, links: basis.links?.map((r) => r.clone()) ?? null };
  if (ruhe && figur.anschlag < 1) {
    // Zwischen Ruhe (unten, einhändig) und Anschlag überblenden; die linke Hand kommt erst oben dazu – unten hängen BEIDE Arme
    const unten = HALTUNGEN[ruhe];
    for (let i = 0; i < 2; i++) pose.rechts[i].lerpVectors(unten.rechts[i], basis.rechts[i], figur.anschlag).normalize();
    if (figur.anschlag < 0.5) pose.links = null;
  }
  const beidhaendig = basis.beidhaendig && (!ruhe || figur.anschlag >= 0.5);
  if (haltungsName === 'hacken') (e.arbeit === 'holz' ? seitSchwung : hackSchwung)(pose, e.aktion === 'hacke' && !e.arbeit ? Math.min(1, (fortschritt ?? 1) * 0.55 + 0.45) : (jetzt % HACK_TAKT_MS) / HACK_TAKT_MS);
  else veraendereFuerAktion(pose, haltungsName, e.aktion, fortschritt);
  if (haltungsName === 'zombie') {
    // hängende Arme pendeln leicht gegenläufig (je Zombie versetzt), damit sie beim Schlurfen nicht steif wirken
    const phase = jetzt / 420 + (e.id ?? 0);
    pose.rechts[0].z += 0.18 * Math.sin(phase);
    pose.links[0].z -= 0.18 * Math.sin(phase);
    for (const seite of ['rechts', 'links']) pose[seite][0].normalize();
  }

  const gruppe = figur.gruppe;
  gruppe.updateMatrixWorld(true);
  const linksGreift = (haltungsName === 'hacken' && e.arbeit === 'holz') || beidhaendig;
  for (const seite of ['rechts', 'links']) {
    if (!pose[seite]) {
      if (!(seite === 'links' && linksGreift)) loeseArm(figur, seite);
      continue;
    }
    const [oberarm, unterarm, hand] = figur.knochen[seite];
    richteKnochen(oberarm, unterarm, inWelt(pose[seite][0], gruppe));
    richteKnochen(unterarm, hand, inWelt(pose[seite][1], gruppe));
    figur.armGesetzt[seite] = true;
  }
  // Holzfällen / beidhändige Nahkampfwaffe: beide Hände am Stiel – die linke Hand greift ein Stück weiter vorn
  if (linksGreift) {
    greifeMitLinkerHand(figur, gruppe);
    figur.armGesetzt.links = true;
  }

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
      if (ruhe && figur.anschlag < 1) {
        // Waffe unten: Lauf folgt dem Unterarm (zeigt schräg zum Boden), oben genau nach vorn
        const ellbogen = gruppe.worldToLocal(unterarm.getWorldPosition(_f));
        const arm = _g.copy(gruppe.worldToLocal(hand.getWorldPosition(_e))).sub(ellbogen).normalize();
        richtung.lerp(arm, 1 - figur.anschlag);
      }
      richtung.normalize();
    } else {
      const ellbogen = gruppe.worldToLocal(unterarm.getWorldPosition(_c));
      richtung = _d.copy(gruppe.worldToLocal(hand.getWorldPosition(_e))).sub(ellbogen).normalize();
      if (haltungsName === 'nahkampf') richtung.y += 0.35 * (ruhe ? figur.anschlag : 1); // Klinge leicht nach oben (in Ruhe: hängt)
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

/** Runde 44: Maße der Stuhl-Sitzpose in Figur-Pixeln (Figur ≈ 64 px hoch) */
export const STUHL_SITZ = { ueberSitz: 2.6, zurueck: 4.5 };

/**
 * Runde 44: Sitzpose auf Stuhl/Bank. Die Gruppe steht auf der Sitzfläche (Renderer); hier wird das Modell so verschoben, dass die
 * Mitte der Hüftgelenke knapp über der Fläche und etwas hinter der Sitzmitte liegt – dann Beine (stuhlBeine) und Arme.
 * Der Versatz gilt nur in dieser Pose (`figur.stuhlVersatz`); der Renderer setzt das Modell danach zurück (setzeStuhlZurueck).
 */
function stuhlSitz(figur) {
  const { gruppe, modell } = figur;
  figur.modellBasis ??= modell.position.clone();
  modell.position.copy(figur.modellBasis);
  // Runde 45: Arme JEDES Bild von der Clip-Pose aus neu setzen. Der Steh-Clip hat konstante Arm-/Handgelenk-Spuren, die der Mixer
  // nur einmal schreibt – relative Drehungen stapelten sich sonst (Hand drehte ≈80°/Bild weiter = „Hände zittern wie verrückt“).
  for (const seite of ['rechts', 'links']) setzeArmAufRuhe(figur, seite);
  gruppe.updateMatrixWorld(true);
  // ⚠ Three.js schreibt konstante Clip-Spuren nur einmal (PropertyMixer: nur bei Wertänderung) – die Fuß-IK-Ziele (Foot*, Kinder von
  // Root) behalten also, was wir setzen. Darum beim Hinsetzen Fuß-Lage + Schienbeinlänge merken und beim Aufstehen zurückschreiben.
  if (!figur.stuhlVersatz) merkeFuesse(figur);
  const becken = gruppe.worldToLocal(figur.beine.rechts[0].getWorldPosition(_a)).add(gruppe.worldToLocal(figur.beine.links[0].getWorldPosition(_b))).multiplyScalar(0.5);
  modell.position.x -= becken.x;
  modell.position.y += STUHL_SITZ.ueberSitz - becken.y;
  modell.position.z -= STUHL_SITZ.zurueck + becken.z;
  figur.stuhlVersatz = true;
  gruppe.updateMatrixWorld(true);
  stuhlBeine(figur);
  // Runde 45: Hände liegen flach auf den Oberschenkeln (Zwei-Knochen-IK aufs Bein, Handfläche nach unten)
  for (const seite of ['rechts', 'links']) {
    handAufOberschenkel(figur, seite);
    figur.armGesetzt[seite] = true;
  }
}

/**
 * Runde 45: Hand-auf-Oberschenkel-Pose (Maße relativ zur Oberschenkellänge, also für jede Figurgröße gleich):
 * entlang = Handgelenk bei diesem Anteil Hüfte→Knie, oben/aussen = Versatz über/neben der Beinachse, pol = Ellbogen zeigt nach
 * hinten-außen (Figur-Raum, rechte Seite), unterarmAnteil = so viel der Handdrehung übernimmt der Unterarm (sonst verdrillt das
 * Handgelenk), fingerNeigung = Finger folgen dem Oberschenkel leicht nach unten.
 */
export const STUHL_HAND = { entlang: 0.4, oben: 0.17, aussen: 0.02, pol: [-0.7, -0.35, -1], unterarmAnteil: 0.65, fingerNeigung: 0.25 };

/**
 * Runde 45: Arm-Kette einer Seite (Ober-/Unterarm, Hand) auf die gemerkte Ruhestellung = Pose des Steh-Clips (armRuhe wird nach
 * mixer.setTime gemerkt) – absolute Basis je Bild, weil der Mixer die konstanten Arm-Spuren dieses Clips nicht neu schreibt.
 */
function setzeArmAufRuhe(figur, seite) {
  for (let i = 0; i < 3; i++) figur.knochen[seite][i].quaternion.copy(figur.armRuhe[seite][i]);
}

/** Runde 45: Hand einer Seite per Zwei-Knochen-IK auf den Oberschenkel legen (Ellbogen nach hinten-außen), dann flach ausrichten. */
function handAufOberschenkel(figur, seite) {
  const { gruppe } = figur;
  const [oberarm, unterarm, hand] = figur.knochen[seite];
  const [oberschenkel, unterschenkel] = figur.beine[seite];
  const r = seite === 'rechts' ? -1 : 1; // -x = rechte Körperseite
  const huefte = oberschenkel.getWorldPosition(new THREE.Vector3());
  const knie = unterschenkel.getWorldPosition(new THREE.Vector3());
  const laenge = huefte.distanceTo(knie);
  const vor = knie.clone().sub(huefte).normalize();
  const ziel = huefte.addScaledVector(vor, laenge * STUHL_HAND.entlang).add(inWelt(_a.set(r * STUHL_HAND.aussen, STUHL_HAND.oben, 0), gruppe).multiplyScalar(laenge));
  const [px, py, pz] = STUHL_HAND.pol; // rechte Seite, links gespiegelt
  zweiKnochenIK(figur, seite, ziel, inWelt(_d.set(seite === 'rechts' ? px : -px, py, pz), gruppe));
  legeHandFlach(figur, seite, vor);
}

/** Zwei-Knochen-IK: Handgelenk einer Seite auf `ziel` (Welt), Ellbogen auf dem Kreis um die Schulter-Ziel-Linie Richtung `pol` (Welt). */
function zweiKnochenIK(figur, seite, ziel, pol) {
  const [oberarm, unterarm, hand] = figur.knochen[seite];
  const schulter = oberarm.getWorldPosition(new THREE.Vector3());
  const ellbogenAlt = unterarm.getWorldPosition(_b);
  const l1 = schulter.distanceTo(ellbogenAlt);
  const l2 = ellbogenAlt.distanceTo(hand.getWorldPosition(_c));
  const richtung = _p1.copy(ziel).sub(schulter);
  const d = Math.min(l1 + l2 - 1e-3, Math.max(Math.abs(l1 - l2) + 1e-3, richtung.length()));
  richtung.normalize();
  const a = (l1 * l1 - l2 * l2 + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
  const p = _g.copy(pol).addScaledVector(richtung, -pol.dot(richtung)).normalize();
  const ellbogen = schulter.clone().addScaledVector(richtung, a).addScaledVector(p, h);
  const handgelenk = schulter.addScaledVector(richtung, d);
  richteKnochen(oberarm, unterarm, _e.copy(ellbogen).sub(oberarm.getWorldPosition(_f)).normalize());
  richteKnochen(unterarm, hand, _e.copy(handgelenk).sub(ellbogen).normalize());
}

/**
 * Runde 45: Hand flach auflegen – Finger in Richtung `vor` (leicht nach unten), Handfläche nach unten. Absolut berechnet (aus den
 * Fingerwurzeln), also ohne Aufschaukeln. Einen Teil der Drehung um die Unterarm-Achse übernimmt der Unterarm (kein verdrilltes Gelenk).
 */
function legeHandFlach(figur, seite, vor) {
  const finger = figur.finger?.[seite];
  if (!finger) return;
  const [, unterarm, hand] = figur.knochen[seite];
  const unten = _g.set(0, -1, 0);
  const achse = hand.getWorldPosition(new THREE.Vector3()).sub(unterarm.getWorldPosition(_a)).normalize();
  drehUmAchse(unterarm, achse, drehWinkel(achse, handflaeche(figur, seite, new THREE.Vector3()), unten) * STUHL_HAND.unterarmAnteil);
  const fingerIst = finger[1].getWorldPosition(new THREE.Vector3()).sub(hand.getWorldPosition(_a));
  const flaecheIst = handflaeche(figur, seite, new THREE.Vector3());
  const fingerSoll = vor.clone().addScaledVector(unten, STUHL_HAND.fingerNeigung);
  dreheInWelt(hand, basisDrehung(fingerIst, flaecheIst, fingerSoll, unten, _q2));
}

/** Runde 45: Normale der Handfläche (zeigt aus der Innenfläche heraus) aus Zeige-/Mittel-/kleinem Finger; gespiegelt für links. */
function handflaeche(figur, seite, ziel) {
  // Runde 48: wenn vorhanden über die Knöchel – die Fingerwurzeln (Glied 1) fallen beim Quaternius-Rig in einen Punkt
  const g = figur.greifer?.[seite];
  const [zeige, mittel, klein] = g ? [g.Index[0], g.Middle[0], g.Pinky[0]] : figur.finger[seite];
  const quer = zeige.getWorldPosition(_b).sub(klein.getWorldPosition(_c));
  const lang = mittel.getWorldPosition(_d).sub(figur.knochen[seite][2].getWorldPosition(_e));
  return ziel.crossVectors(quer, lang).normalize().multiplyScalar(seite === 'rechts' ? 1 : -1);
}

/** Vorzeichenbehafteter Winkel um `achse`, der `von` (senkrecht zur Achse projiziert) auf `nach` dreht. */
function drehWinkel(achse, von, nach) {
  const a = _b.copy(von).addScaledVector(achse, -von.dot(achse));
  const b = _c.copy(nach).addScaledVector(achse, -nach.dot(achse));
  if (a.lengthSq() < 1e-8 || b.lengthSq() < 1e-8) return 0;
  return Math.atan2(_d.crossVectors(a, b).dot(achse), a.dot(b));
}

/** Drehung (Quaternion → `ziel`), die das Paar (von1, von2) auf (nach1, nach2) bringt (1. Vektor exakt, 2. so nah wie möglich). */
function basisDrehung(von1, von2, nach1, nach2, ziel) {
  const basis = (x, y, m) => {
    const bx = _b.copy(x).normalize();
    const by = _c.copy(y).addScaledVector(bx, -y.dot(bx)).normalize();
    return m.makeBasis(bx, by, _d.crossVectors(bx, by));
  };
  const von = basis(von1, von2, _m1);
  const nach = basis(nach1, nach2, _m2);
  return ziel.setFromRotationMatrix(nach.multiply(von.transpose()));
}

/** Dreht `knochen` in Weltkoordinaten um die Welt-Drehung `q`. */
function dreheInWelt(knochen, q) {
  knochen.getWorldQuaternion(_qw);
  knochen.parent.getWorldQuaternion(_qp).invert();
  knochen.quaternion.copy(_qp.multiply(_qw.premultiply(q)));
  knochen.updateMatrixWorld(true);
}

/** Dreht `knochen` in Weltkoordinaten um `achse` (normiert) um `winkel`. */
function drehUmAchse(knochen, achse, winkel) {
  dreheInWelt(knochen, _q.setFromAxisAngle(achse, winkel));
}

/** Fuß-Lage (lokal), Schienbeinlänge und Fuß-Drehung relativ zur Gruppe im Moment des Hinsetzens (= aufrechte Clip-Pose). */
function merkeFuesse(figur) {
  const gq = figur.gruppe.getWorldQuaternion(new THREE.Quaternion()).invert();
  figur.fussVorher = {};
  for (const seite of ['rechts', 'links']) {
    const [, unterschenkel, fuss] = figur.beine[seite];
    figur.fussVorher[seite] = {
      position: fuss.position.clone(),
      quaternion: fuss.quaternion.clone(),
      laenge: fuss.getWorldPosition(new THREE.Vector3()).distanceTo(unterschenkel.getWorldPosition(new THREE.Vector3())),
      drehung: gq.clone().multiply(fuss.getWorldQuaternion(new THREE.Quaternion())), // Fuß flach, Spitze nach vorn
    };
  }
}

/** Runde 44: Stuhl-Versatz des Modells und die Füße zurücknehmen (nach dem Aufstehen, beim Sterben …). */
export function setzeStuhlZurueck(figur) {
  if (!figur.stuhlVersatz) return;
  figur.modell.position.copy(figur.modellBasis);
  for (const seite of ['rechts', 'links']) {
    const f = figur.fussVorher?.[seite];
    const fuss = figur.beine?.[seite]?.[2];
    if (!f || !fuss) continue;
    fuss.position.copy(f.position);
    fuss.quaternion.copy(f.quaternion);
  }
  loeseArme(figur); // Runde 45: Arme zurück in die Ruhestellung (sonst bliebe z. B. die Unterarm-Drehung des Sitzens in der Pistolen-Haltung)
  figur.stuhlVersatz = false;
}

/**
 * Beine auf dem Stuhl: Oberschenkel waagerecht nach vorn (leicht gespreizt), Unterschenkel über die eigene Knochenachse (+Y = zum
 * Kind) senkrecht nach unten, Fuß ans Schienbein-Ende, flach wie im Stehen. ⚠ Quaternius-Rig: Foot* sind IK-Ziele am Root (keine
 * Kinder von LowerLeg) → Fuß selbst setzen (sonst Gummi-Beine); nichts aus der Fuß-Lage des Clips ableiten (ist evtl. veraltet, s. o.).
 */
function stuhlBeine(figur) {
  const gruppe = figur.gruppe;
  gruppe.updateMatrixWorld(true);
  const gq = gruppe.getWorldQuaternion(new THREE.Quaternion());
  for (const seite of ['rechts', 'links']) {
    const bein = figur.beine?.[seite];
    const vorher = figur.fussVorher?.[seite];
    if (!bein || !vorher) continue;
    const [oberschenkel, unterschenkel, fuss] = bein;
    richteKnochen(oberschenkel, unterschenkel, inWelt(v(seite === 'rechts' ? -0.1 : 0.1, -0.04, 1), gruppe));
    const runter = inWelt(v(0, -1, 0.06), gruppe);
    richteAchse(unterschenkel, runter);
    setzeWeltPosition(fuss, unterschenkel.getWorldPosition(new THREE.Vector3()).add(runter.multiplyScalar(vorher.laenge)));
    fuss.parent.getWorldQuaternion(_qp).invert();
    fuss.quaternion.copy(_qp.multiply(gq.clone().multiply(vorher.drehung)));
    fuss.updateMatrixWorld(true);
  }
}

/** Dreht `knochen` so, dass seine eigene Achse (+Y, zeigt bei Quaternius zum Kind) in Welt-Richtung `ziel` zeigt. */
function richteAchse(knochen, ziel) {
  knochen.getWorldQuaternion(_qw);
  _q.setFromUnitVectors(_p0.set(0, 1, 0).applyQuaternion(_qw), ziel);
  knochen.parent.getWorldQuaternion(_qp).invert();
  knochen.quaternion.copy(_qp.multiply(_q.multiply(_qw)));
  knochen.updateMatrixWorld(true);
}

/** Knochen an eine Weltposition setzen (über das Eltern-Koordinatensystem). */
function setzeWeltPosition(knochen, welt) {
  knochen.parent.updateMatrixWorld(true);
  knochen.position.copy(knochen.parent.worldToLocal(welt));
  knochen.updateMatrixWorld(true);
}

/** Runde 19: Arm einer Seite einmalig in die Ruhestellung zurück (danach übernimmt wieder der Clip, falls er ihn bewegt) */
function loeseArm(figur, seite) {
  if (!figur.armGesetzt?.[seite]) return;
  figur.armGesetzt[seite] = false;
  figur.knochen[seite].forEach((k, i) => k.quaternion.copy(figur.armRuhe[seite][i]));
  figur.knochen[seite][0].updateMatrixWorld(true);
}

function loeseArme(figur) {
  loeseArm(figur, 'rechts');
  loeseArm(figur, 'links');
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
    for (const seite of ['rechts', 'links']) for (const r of pose[seite] ?? []) r.y += kick; // Pistole unten: nur rechter Arm (links null)
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
    // Zombie: Arme nur leicht nach vorn heben (schnell hoch, langsam wieder hängen lassen)
    const hub = p < 0.35 ? p / 0.35 : 1 - (p - 0.35) / 0.65;
    for (const seite of ['rechts', 'links']) {
      const s = seite === 'rechts' ? 1 : -1;
      ZOMBIE_ANGRIFF.forEach((ziel, i) => pose[seite][i].lerp(_a.set(ziel[0] * s, ziel[1], ziel[2]), hub));
    }
  }
  for (const seite of ['rechts', 'links']) for (const r of pose[seite] ?? []) r.normalize();
}

/** Messer/Skalpell = einhändig, Pistole/Gewehr/Lampe/Halten eigene Haltungen, alles andere (Axt, Machete, Hammer …) beidhändig. */
const EINHAENDIG = new Set(['kuechenmesser', 'skalpell']);
export function haltungMitHaenden(name) {
  return EINHAENDIG.has(name) ? 'messer' : null;
}

/** Beidhändige Nahkampfwaffe in der Hand (Axt, Machete, Hammer …)? Dann spielt der Survivor den Clip „nahkampf“ (Runde 18). */
export function istBeidhaendigerSchlag(e) {
  return haltungFuer(waffenModellName(e.waffe, e.ausruestung)) === 'nahkampf';
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

/**
 * Runde 48: Schusswaffen-Griff (Nutzer: „Hand soll schön an der Waffe sein“). Die Waffe liegt fest im Figur-Raum (relativ zur rechten
 * Schulter, wippt also mit dem Oberkörper), die Handgelenke kommen per Zwei-Knochen-IK an Griff/Vorderschaft, die Hände werden absolut
 * zur Waffe ausgerichtet und die Finger um den Griff gekrümmt. Maße in Figur-Pixeln (Figur ≈ 64 hoch, Arm bis Handgelenk ≈ 14):
 * anschlag/unten = Waffenursprung (= Griff) relativ zur rechten Schulter, richtung = Lauf, stuetze = Abstand Vorderschaft entlang
 * des Laufs (linke Hand; null = linke Hand umfasst die rechte), pol = Ellbogenrichtung (rechte Seite, links gespiegelt).
 * Pistole unten: einhändig am Arm aus dem Clip (pendelt beim Gehen mit), Gewehr unten: beidhändig schräg vor dem Körper.
 */
export const SCHUSS_GRIFF = {
  pistole: { anschlag: [4.2, -1, 14.6], unten: null, untenRichtung: [0, -0.75, 0.66], stuetze: null, pol: [-0.6, -1, -0.4], kick: 0.35, rueck: 1.2 },
  // Gewehre sind ×1,5 groß (bis 45 lang) – näher an der Körpermitte, sonst reicht der linke Arm nicht bis zum Handschutz
  gewehr: { anschlag: [3.8, -1.5, 6.5], unten: [5, -7, 4], untenRichtung: [0.3, -0.5, 0.8], stuetze: 5.5, pol: [-1, -0.7, -0.3], kick: 0.22, rueck: 1.5 },
};
/** Hand relativ zur Waffe (Lauf f, oben u, links x): Handrichtung (Handgelenk→Knöchel), Handflächen-Normale, Griffpunkt; Fingerkrümmung je Glied 2/3/4 */
export const HAND_AN_WAFFE = {
  rechts: { richtung: [0, -0.83, 0.55], flaeche: [1, 0, 0], griff: [0, -2.6, -0.4] },
  linksPistole: { richtung: [-0.7, -0.3, 0.65], flaeche: [-0.8, 0.2, 0.3], griff: [1.5, -2.2, 0.6] },
  linksGewehr: { richtung: [-0.8, 0, 0.6], flaeche: [0, 1, 0], griff: [0, -1.7, 0] },
  linksMagazin: { richtung: [0, 0.2, 1], flaeche: [0, 1, 0], griff: [0, -4.2, 1.4] },
};
export const HAND_MASS = { mitte: 2.5, dicke: 1.1 }; // Handgelenk → Mitte der Handfläche entlang der Hand; Knochenachse → Handflächen-Oberfläche
export const FINGER_KRUEMMUNG = { faust: [1.3, 1.2, 0.7], abzug: [0.5, 0.5, 0.3], daumen: [0.5, 0.4] };
const UNTERARM_ANTEIL = 0.5; // so viel der Hand-Drehung um die Unterarm-Achse übernimmt der Unterarm (kein verdrilltes Handgelenk)

function schusswaffeHalten(figur, e, art, p) {
  const { gruppe } = figur;
  const lage = SCHUSS_GRIFF[art];
  basisFuerGriff(figur);
  gruppe.updateMatrixWorld(true);
  const lokal = (k) => gruppe.worldToLocal(k.getWorldPosition(new THREE.Vector3()));
  const schulter = lokal(figur.knochen.rechts[0]);
  const a = figur.anschlag * figur.anschlag * (3 - 2 * figur.anschlag);

  // Waffen-Lage im Figur-Raum: oben (Anschlag) ↔ unten überblenden
  const obenPos = schulter.clone().add(_a.fromArray(lage.anschlag));
  const obenF = VORNE.clone();
  let untenPos;
  const untenF = new THREE.Vector3().fromArray(lage.untenRichtung).normalize();
  if (lage.unten) untenPos = schulter.clone().add(_a.fromArray(lage.unten));
  else {
    // am Clip-Arm: Waffe so, dass ihr Griff in der (Clip-)Hand liegt
    const rahmen = waffenRahmen(untenF);
    untenPos = lokal(figur.knochen.rechts[2]).sub(handVersatz(HAND_AN_WAFFE.rechts, rahmen));
  }
  const pos = untenPos.lerp(obenPos, a);
  const f = untenF.lerp(obenF, a).normalize();
  const welle = p === null ? 0 : Math.sin(Math.PI * p);
  if (e.aktion === 'schiessen' && welle) {
    pos.addScaledVector(f, -lage.rueck * welle).y += lage.rueck * 0.4 * welle;
    f.y += lage.kick * welle;
  } else if (e.aktion === 'nachladen' && welle) {
    f.y -= 0.45 * welle;
    pos.y -= 1.5 * welle;
  }
  f.normalize();
  const rahmen = waffenRahmen(f);

  // Rechte Hand an den Griff (unten ohne Gewehr-Lage: Arm bleibt im Clip, nur Hand + Finger)
  const linkeHand = art === 'gewehr' ? (e.aktion === 'nachladen' && welle > 0.3 ? HAND_AN_WAFFE.linksMagazin : HAND_AN_WAFFE.linksGewehr) : HAND_AN_WAFFE.linksPistole;
  const griffe = { rechts: HAND_AN_WAFFE.rechts, links: linkeHand };
  const stuetze = art === 'gewehr' ? lage.stuetze : 0;
  const linksAnteil = art === 'gewehr' ? 1 : Math.max(0, Math.min(1, (figur.anschlag - 0.3) / 0.6));
  for (const seite of ['rechts', 'links']) {
    const anteil = seite === 'rechts' ? 1 : linksAnteil;
    if (anteil <= 0) continue;
    const g = griffe[seite];
    const versatz = handVersatz(g, rahmen);
    if (seite === 'links' && g !== HAND_AN_WAFFE.linksMagazin) versatz.addScaledVector(rahmen.f, stuetze);
    const zielLokal = pos.clone().add(versatz);
    const hand = figur.knochen[seite][2];
    const istLokal = lokal(hand);
    const ik = seite === 'links' || lage.unten || a > 0;
    if (ik) {
      const ziel = gruppe.localToWorld(istLokal.clone().lerp(zielLokal, anteil));
      const s = seite === 'rechts' ? 1 : -1;
      // Pol: Anschlag-Ellbogen ↔ Ellbogen aus dem Clip (dann trifft die IK am Clip-Arm genau dessen Haltung)
      const polLokal = _a.set(lage.pol[0] * s, lage.pol[1], lage.pol[2]).normalize();
      if (!lage.unten && seite === 'rechts') {
        const clipPol = lokal(figur.knochen[seite][1]).sub(schulter.clone().lerp(istLokal, 0.5)).normalize();
        polLokal.lerp(clipPol, 1 - a).normalize();
      }
      zweiKnochenIK(figur, seite, ziel, polLokal.applyQuaternion(gruppe.getWorldQuaternion(_q2)));
    }
    richteHandAnWaffe(figur, seite, g, rahmen, anteil);
    kruemmeFinger(figur, seite, seite === 'rechts' ? 'abzug' : 'faust', anteil);
  }
  merkeGriff(figur);

  // Waffe: Ursprung = Griff, Achsen = Waffenrahmen (Modell: +z Lauf, +y oben)
  const w = figur.waffe;
  if (!w) return;
  w.scale.setScalar(1);
  w.position.copy(pos);
  w.quaternion.setFromRotationMatrix(_basis.makeBasis(rahmen.x, rahmen.u, rahmen.f));
  w.updateMatrixWorld(true);
  const muendung = w.userData.muendung;
  figur.hatMuendung = !!muendung;
  if (muendung) figur.muendung.copy(muendung).applyMatrix4(w.matrixWorld);
}

/** Waffenrahmen aus der Laufrichtung f (Figur-Raum): u = oben (senkrecht zu f), x = links der Waffe. */
function waffenRahmen(f) {
  const u = new THREE.Vector3(0, 1, 0).addScaledVector(f, -f.y);
  if (u.lengthSq() < 1e-6) u.set(0, 0, -1);
  u.normalize();
  return { f: f.clone(), u, x: new THREE.Vector3().crossVectors(u, f).normalize() };
}

/** Vektor im Waffenrahmen [x, u, f] → Figur-Raum. */
function imRahmen(arr, rahmen, ziel = new THREE.Vector3()) {
  return ziel.copy(rahmen.x).multiplyScalar(arr[0]).addScaledVector(rahmen.u, arr[1]).addScaledVector(rahmen.f, arr[2]);
}

/** Versatz Waffenursprung → Handgelenk für einen Griff (Griffpunkt minus halbe Hand entlang der Handrichtung, minus Handdicke). */
function handVersatz(g, rahmen) {
  const richtung = imRahmen(g.richtung, rahmen).normalize();
  const flaeche = imRahmen(g.flaeche, rahmen).normalize();
  return imRahmen(g.griff, rahmen).addScaledVector(richtung, -HAND_MASS.mitte).addScaledVector(flaeche, -HAND_MASS.dicke);
}

/** Hand absolut zur Waffe drehen (Knöchel in Griffrichtung, Handfläche zur Waffe); ein Teil der Verdrehung geht in den Unterarm. */
function richteHandAnWaffe(figur, seite, g, rahmen, anteil) {
  const { gruppe } = figur;
  const [, unterarm, hand] = figur.knochen[seite];
  const gq = gruppe.getWorldQuaternion(_q2);
  const richtungSoll = imRahmen(g.richtung, rahmen).normalize().applyQuaternion(gq);
  const flaecheSoll = imRahmen(g.flaeche, rahmen).normalize().applyQuaternion(gq);
  const knoechel = () => figur.greifer[seite].Middle[0].getWorldPosition(new THREE.Vector3()).sub(hand.getWorldPosition(_a)).normalize();
  if (anteil < 1) {
    richtungSoll.lerp(knoechel(), 1 - anteil).normalize();
    flaecheSoll.lerp(handflaeche(figur, seite, new THREE.Vector3()), 1 - anteil).normalize();
  }
  const achse = hand.getWorldPosition(new THREE.Vector3()).sub(unterarm.getWorldPosition(_a)).normalize();
  drehUmAchse(unterarm, achse, drehWinkel(achse, handflaeche(figur, seite, new THREE.Vector3()), flaecheSoll) * UNTERARM_ANTEIL);
  dreheInWelt(hand, basisDrehung(knoechel(), handflaeche(figur, seite, new THREE.Vector3()), richtungSoll, flaecheSoll, new THREE.Quaternion()));
}

/** Finger zur Handfläche krümmen (Glied 2/3/4 je Finger um die Achse Finger × Handfläche), Daumen legt sich an. Absolut ab Ruhe. */
function kruemmeFinger(figur, seite, art, anteil) {
  const greifer = figur.greifer[seite];
  const flaeche = handflaeche(figur, seite, new THREE.Vector3());
  for (const name of GREIF_FINGER) {
    const winkel = FINGER_KRUEMMUNG[name === 'Index' ? art : 'faust'];
    greifer[name].forEach((glied, i) => {
      const kind = greifer[name][i + 1] ?? null;
      const von = glied.getWorldPosition(new THREE.Vector3());
      const richtung = kind ? kind.getWorldPosition(new THREE.Vector3()).sub(von) : von.clone().sub(glied.parent.getWorldPosition(_a));
      const achse = richtung.cross(flaeche);
      if (achse.lengthSq() < 1e-8) return;
      drehUmAchse(glied, achse.normalize(), winkel[i] * anteil);
    });
  }
  const [d2, d3] = greifer.daumen;
  if (!d2) return;
  const richtung = (d3 ?? d2).getWorldPosition(new THREE.Vector3()).sub(d2.getWorldPosition(_a));
  const achse = richtung.cross(flaeche);
  if (achse.lengthSq() < 1e-8) return;
  achse.normalize();
  greifer.daumen.forEach((glied, i) => drehUmAchse(glied, achse, FINGER_KRUEMMUNG.daumen[i] * anteil));
}

/** Finger-Knochen je Seite: { Index: [Glied 2,3,4], Middle, Ring, Pinky, daumen: [2,3] } – nur wenn alle da sind (Quaternius-Rig). */
function greiferFuer(modell) {
  const ergebnis = {};
  for (const [seite, s] of [['rechts', 'R'], ['links', 'L']]) {
    const g = { daumen: DAUMEN_GLIEDER.map((n) => modell.getObjectByName(`Thumb${n}${s}`)) };
    for (const name of GREIF_FINGER) g[name] = GREIF_GLIEDER.map((n) => modell.getObjectByName(`${name}${n}${s}`));
    if ([...g.daumen, ...GREIF_FINGER.flatMap((n) => g[n])].every(Boolean)) ergebnis[seite] = g;
  }
  return ergebnis;
}

function greiferKnochen(g) {
  return g ? [...GREIF_FINGER.flatMap((n) => g[n]), ...g.daumen] : [];
}

/**
 * Basis je Bild (⚠ PropertyMixer schreibt konstante Spuren nur einmal): Hat der Mixer einen Knochen seit unserem letzten Setzen nicht
 * angefasst, steht dort noch unser Wert → zurück auf die Ruhe (= konstanter Clip-Wert). Sonst gilt der neue Clip-Wert (Gehen pendelt).
 */
function basisFuerGriff(figur) {
  for (const [k, q] of figur.griffGesetzt) if (k.quaternion.equals(q)) k.quaternion.copy(figur.ruhe.get(k));
}

function merkeGriff(figur) {
  for (const seite of ['rechts', 'links']) {
    for (const k of [...figur.knochen[seite].slice(0, 3), ...greiferKnochen(figur.greifer[seite])]) {
      const q = figur.griffGesetzt.get(k);
      if (q) q.copy(k.quaternion);
      else figur.griffGesetzt.set(k, k.quaternion.clone());
    }
    figur.armGesetzt[seite] = true;
  }
}

/** Griff verlassen (andere Haltung): Arme und Finger einmal zurück in die Ruhe, danach übernimmt wieder Clip bzw. Haltung. */
function loeseGriff(figur) {
  if (!figur.griffGesetzt?.size) return;
  basisFuerGriff(figur);
  figur.griffGesetzt.clear();
}

function setzeWaffe(figur, name, mods = null) {
  const schluessel = mods?.length ? `${name}|${mods.join(',')}` : name;
  if (figur.waffenSchluessel === schluessel) return;
  if (figur.waffe) figur.gruppe.remove(figur.waffe);
  figur.waffe = name ? erzeugeWaffe(name, mods) : null;
  figur.waffenName = name;
  figur.waffenSchluessel = schluessel;
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
const _q2 = new THREE.Quaternion();
const _qw = new THREE.Quaternion();
const _qp = new THREE.Quaternion();
const _m1 = new THREE.Matrix4();
const _m2 = new THREE.Matrix4();

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
