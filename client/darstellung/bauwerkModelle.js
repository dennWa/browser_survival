import * as THREE from 'three';
import { vereineGeometrien, matrixAus } from './geometrie.js';
import { TUER_EBENE, werkbankTeile } from './kartenModell.js';
import { PFLANZEN, feldKacheln } from '../../gemeinsam/welt/bauwerke.js';
import { BASIS_MATERIAL, IST_AUSGERICHTET, bauteilGeometrie } from './basisbauModelle.js';
import { baueMoebel } from './moebelModelle.js';

/**
 * 3D-Modelle der Bauwerke (gemeinsam/welt/bauwerke.js): Werkbank, Lagerfeuer, Bärenfalle, Beet, Lagerkiste und die
 * Basisbau-Teile (Geometrien: basisbauModelle.js – Böden/Wände/Dächer zeichnet im Spiel die instanzierte BasisbauSchicht,
 * hier entstehen sie nur fürs Hologramm; Tür & Bett sind Einzelstücke).
 * Jedes Bauwerk ist eine Gruppe; Zustände (Feuer an, Falle zu, Pflanzen-Stufe) setzt aktualisiere().
 * Ursprung = Kachelmitte am Boden. Bauwerke sind wenige → einzelne Meshes reichen (Geometrien gecacht).
 */
const MATERIAL = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 });
const METALL = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4, metalness: 0.7 });
const FLAMME_AUSSEN = new THREE.MeshBasicMaterial({ color: 0xff7a1a, transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending });
const FLAMME_INNEN = new THREE.MeshBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending });
const GLUT = new THREE.MeshBasicMaterial({ color: 0xff4a12 });
const ASCHE = new THREE.MeshBasicMaterial({ color: 0x3a3330 });

const METALL_BASIS = BASIS_MATERIAL;
const TUER_OFFEN_WINKEL = -1.5; // Radiant: Türblatt schwingt fast 90° auf
const f = (hex) => new THREE.Color(hex);
const teil = (geometrie, matrix, farbe) => ({ geometrie, matrix, farbe: f(farbe) });
const cache = new Map();
function geometrie(name, bauen) {
  if (!cache.has(name)) cache.set(name, vereineGeometrien(bauen(), { mitFarbe: true }));
  return cache.get(name);
}

const GEOMETRIEN = {
  // Runde 24: Fallen
  sprengfalle: () =>
    geometrie('sprengfalle', () => [
      teil(new THREE.BoxGeometry(16, 4, 12), matrixAus(0, 2, 0), 0x5f6b45),
      ...[-5, 0, 5].map((x) => teil(new THREE.CylinderGeometry(1.8, 1.8, 7, 8), matrixAus(x, 6, 0), 0xa33a28)),
      teil(new THREE.CylinderGeometry(0.4, 0.4, 14, 4).rotateZ(Math.PI / 2), matrixAus(4, 1, 8, 0.4), 0x222222),
      teil(new THREE.SphereGeometry(1.2, 6, 4), matrixAus(9, 2, 10), 0xd02020),
    ]),
  stacheldraht: () =>
    geometrie('stacheldraht', () => {
      const teile = [];
      for (const x of [-14, 14]) teile.push(teil(new THREE.CylinderGeometry(1.4, 1.6, 22, 6), matrixAus(x, 11, 0), 0x6b4a2a));
      for (const y of [6, 13, 19]) {
        const draht = new THREE.TorusGeometry(4, 0.35, 4, 8);
        for (let i = -3; i <= 3; i++) teile.push(teil(draht, matrixAus(i * 4, y, 0, Math.PI / 2 + i * 0.4), 0xa8adb3));
      }
      return teile;
    }),
  dosenalarm: () =>
    geometrie('dosenalarm', () => {
      const teile = [];
      for (const x of [-13, 13]) teile.push(teil(new THREE.CylinderGeometry(0.9, 1, 18, 5), matrixAus(x, 9, 0), 0x6b4a2a));
      teile.push(teil(new THREE.CylinderGeometry(0.2, 0.2, 26, 3).rotateZ(Math.PI / 2), matrixAus(0, 17, 0), 0xdedad0));
      for (const x of [-7, 0, 7]) teile.push(teil(new THREE.CylinderGeometry(2, 2, 5, 8), matrixAus(x, 12, 0), 0xb8bcc2), teil(new THREE.CylinderGeometry(2.05, 2.05, 1.6, 8), matrixAus(x, 12, 0), 0xc0392b));
      return teile;
    }),
  grube: () =>
    geometrie('grube', () => [
      teil(new THREE.CylinderGeometry(14, 12, 0.6, 14), matrixAus(0, 0.35, 0), 0x2a1d12),
      teil(new THREE.TorusGeometry(14, 1.6, 4, 14).rotateX(Math.PI / 2), matrixAus(0, 0.6, 0), 0x6a4a2c),
    ]),
  pfaehle: () =>
    geometrie('pfaehle', () =>
      [[-6, -4], [5, -6], [0, 2], [-4, 7], [7, 5], [-9, 1]].map(([x, z]) => teil(new THREE.ConeGeometry(1.4, 9, 5), matrixAus(x, 4, z), 0xb98a55)),
    ),
  werkbank: () => geometrie('werkbank', () => werkbankTeile(0, 0, 30, 22, 26, 0)),
  feuerstelle: () =>
    geometrie('feuerstelle', () => {
      const teile = [];
      for (let i = 0; i < 9; i++) {
        const w = (i / 9) * Math.PI * 2;
        teile.push(teil(new THREE.DodecahedronGeometry(3.6, 0), matrixAus(Math.cos(w) * 11, 2, Math.sin(w) * 11, w, new THREE.Vector3(1, 0.8, 1)), 0x84868a));
      }
      for (const w of [0.3, 1.35, 2.4]) {
        const holz = new THREE.CylinderGeometry(1.8, 2.1, 17, 7).rotateZ(Math.PI / 2 - 0.28);
        teile.push(teil(holz, matrixAus(0, 4.5, 0, w), 0x6b4424));
      }
      return teile;
    }),
  ofen: () =>
    geometrie('ofen', () => [
      teil(new THREE.BoxGeometry(24, 20, 22), matrixAus(0, 10, 0), 0x8a8c92),
      teil(new THREE.BoxGeometry(26, 3, 24), matrixAus(0, 21.5, 0), 0x6f7279),
      teil(new THREE.CylinderGeometry(3.6, 4.4, 16, 8), matrixAus(6, 31, -5), 0x5f6269),
      teil(new THREE.BoxGeometry(11, 9, 2), matrixAus(0, 8, 11.2), 0x241a16),
      teil(new THREE.BoxGeometry(14, 1.6, 2.4), matrixAus(0, 13.4, 11.4), 0x4a4d54),
      teil(new THREE.BoxGeometry(14, 1.6, 2.4), matrixAus(0, 3, 11.4), 0x4a4d54),
    ]),
  falleBasis: () => geometrie('falleBasis', () => [teil(new THREE.CylinderGeometry(10, 10.5, 1.4, 16), matrixAus(0, 0.7, 0), 0x5d6168), teil(new THREE.CylinderGeometry(3, 3, 1.8, 10), matrixAus(0, 1.2, 0), 0x8a8d91)]),
  falleBacke: () =>
    geometrie('falleBacke', () => {
      // Halbkreis-Bügel mit Zähnen (liegt in der x/y-Ebene, Drehachse = x)
      const teile = [teil(new THREE.TorusGeometry(10, 1.1, 6, 14, Math.PI), new THREE.Matrix4(), 0x9aa0a6)];
      for (let i = 1; i < 8; i++) {
        const w = (i / 8) * Math.PI;
        const zahn = new THREE.ConeGeometry(1.2, 3.6, 4);
        const m = new THREE.Matrix4().makeTranslation(Math.cos(w) * 10, Math.sin(w) * 10, 0).multiply(new THREE.Matrix4().makeRotationZ(w + Math.PI / 2));
        teile.push(teil(zahn, m.multiply(new THREE.Matrix4().makeTranslation(0, 1.6, 0)), 0xd6dade));
      }
      return teile;
    }),
  beet: () =>
    geometrie('beet', () => {
      // Volle Kachelbreite: nebeneinander liegende Beete eines Erdfelds ergeben eine geschlossene Fläche
      const teile = [teil(new THREE.BoxGeometry(32, 3, 32), matrixAus(0, 1.2, 0), 0x4a2f1c)];
      for (const z of [-10, 0, 10]) teile.push(teil(new THREE.BoxGeometry(28, 1.4, 4.5), matrixAus(0, 3, z), 0x5e3c24));
      return teile;
    }),
  kiste: () =>
    geometrie('kiste', () => [
      teil(new THREE.BoxGeometry(26, 18, 20), matrixAus(0, 9, 0), 0x9a6c3a),
      teil(new THREE.BoxGeometry(27, 3, 21), matrixAus(0, 19.5, 0), 0xb78650),
      teil(new THREE.BoxGeometry(2.4, 18.5, 20.6), matrixAus(-8, 9.2, 0), 0x6b4a28),
      teil(new THREE.BoxGeometry(2.4, 18.5, 20.6), matrixAus(8, 9.2, 0), 0x6b4a28),
      teil(new THREE.BoxGeometry(5, 5, 1.6), matrixAus(0, 14, 10.4), 0xc9ccd1),
    ]),
  blatt: () => geometrie('blatt', () => [teil(new THREE.SphereGeometry(3, 6, 4), matrixAus(0, 0, 0, 0, new THREE.Vector3(1.4, 0.35, 0.8)), 0x4f9a2a)]),
  stiel: () => geometrie('stiel', () => [teil(new THREE.CylinderGeometry(0.5, 0.7, 1, 5).translate(0, 0.5, 0), new THREE.Matrix4(), 0x3f7a22)]),
  frucht: () => geometrie('frucht', () => [teil(new THREE.SphereGeometry(2.2, 8, 6), new THREE.Matrix4(), 0xffffff)]),
};

/** Drehung um y (Radiant) für ein Bauwerk: ausgerichtete Teile nach `drehung` (0/1 × 90°), alles andere zufällig-aber-stabil pro Kachel. */
export function bauwerkDrehungY(b) {
  if (IST_AUSGERICHTET.has(b.typ)) return (b.drehung ?? 0) * (Math.PI / 2);
  return b.typ === 'werkbank' || b.typ === 'zaun' ? 0 : (((b.tx * 7 + b.ty * 13) % 4) * Math.PI) / 2;
}

/** Neues 3D-Bauwerk. @returns { gruppe, aktualisiere(b, jetzt) } */
export function erzeugeBauwerk(b) {
  const gruppe = new THREE.Group();
  const mesh = (geo, material = MATERIAL) => {
    const m = new THREE.Mesh(geo, material);
    m.castShadow = true;
    m.receiveShadow = true;
    return m;
  };
  let aktualisiere = () => {};
  switch (b.typ) {
    case 'werkbank':
      gruppe.add(mesh(GEOMETRIEN.werkbank()));
      break;
    case 'lagerfeuer': {
      gruppe.add(mesh(GEOMETRIEN.feuerstelle()));
      const asche = new THREE.Mesh(new THREE.CircleGeometry(7.5, 14).rotateX(-Math.PI / 2), ASCHE);
      asche.position.y = 0.4;
      const glut = new THREE.Mesh(new THREE.SphereGeometry(4.5, 8, 6).scale(1, 0.35, 1), GLUT);
      glut.position.y = 1.5;
      const flammen = new THREE.Group();
      for (const [x, z, h, r, mat] of [[0, 0, 22, 6, FLAMME_AUSSEN], [3, -2, 15, 4, FLAMME_AUSSEN], [-3, 2, 16, 4, FLAMME_AUSSEN], [0, 0, 13, 3.2, FLAMME_INNEN]]) {
        const flamme = new THREE.Mesh(new THREE.ConeGeometry(r, h, 7).translate(0, h / 2, 0), mat);
        flamme.position.set(x, 3, z);
        flamme.userData.h = h;
        flammen.add(flamme);
      }
      gruppe.add(asche, glut, flammen);
      aktualisiere = (zustand, jetzt) => {
        flammen.visible = zustand.brennt;
        glut.visible = zustand.brennt;
        if (!zustand.brennt) return;
        flammen.children.forEach((fl, i) => {
          const t = jetzt / 1000 + i * 1.7;
          fl.scale.set(1 + Math.sin(t * 13) * 0.08, 0.8 + Math.sin(t * 9.3) * 0.18 + Math.sin(t * 23) * 0.06, 1 + Math.cos(t * 11) * 0.08);
          fl.rotation.y = t * 0.8;
        });
      };
      break;
    }
    case 'falle': {
      gruppe.add(mesh(GEOMETRIEN.falleBasis(), METALL));
      const backen = [mesh(GEOMETRIEN.falleBacke(), METALL), mesh(GEOMETRIEN.falleBacke(), METALL)];
      backen[1].rotation.y = Math.PI; // gespiegelt gegenüber
      for (const backe of backen) {
        backe.position.y = 1.5;
        gruppe.add(backe);
      }
      aktualisiere = (zustand) => {
        // Gespannt: Backen liegen flach nach außen geklappt; zugeschnappt: stehen senkrecht aneinander
        backen[0].rotation.x = zustand.gespannt ? -Math.PI / 2 : 0;
        backen[1].rotation.x = zustand.gespannt ? Math.PI / 2 : 0;
      };
      break;
    }
    case 'kiste':
      gruppe.add(mesh(GEOMETRIEN.kiste()));
      break;
    // Runde 24: Fallen (server/spiel/systeme/fallenSystem.js)
    case 'sprengfalle':
      gruppe.add(mesh(GEOMETRIEN.sprengfalle()));
      break;
    case 'stacheldraht':
      gruppe.add(mesh(GEOMETRIEN.stacheldraht(), METALL));
      break;
    case 'dosenalarm':
      gruppe.add(mesh(GEOMETRIEN.dosenalarm(), METALL));
      break;
    case 'fallgrube': {
      gruppe.add(mesh(GEOMETRIEN.grube()));
      const pfaehle = mesh(GEOMETRIEN.pfaehle());
      gruppe.add(pfaehle);
      aktualisiere = (zustand) => {
        pfaehle.visible = zustand.bereit !== false; // ausgelöst: Grube leer, Pfähle werden neu gesetzt
      };
      break;
    }
    case 'schmelzofen': {
      // Steinofen mit Schornstein; wenn er heiß ist, glüht die Öffnung
      gruppe.add(mesh(GEOMETRIEN.ofen()));
      const glut = new THREE.Mesh(new THREE.BoxGeometry(9, 7, 1), new THREE.MeshBasicMaterial({ color: 0xff6a1a }));
      glut.position.set(0, 8, 11.6);
      gruppe.add(glut);
      aktualisiere = (zustand, jetzt) => {
        glut.visible = zustand.brennt === true;
        if (zustand.brennt) glut.scale.setScalar(0.9 + Math.sin(jetzt / 90) * 0.06 + Math.sin(jetzt / 37) * 0.04);
      };
      break;
    }
    case 'holzwand':
    case 'holzboden':
    case 'holzdach':
    case 'holzwand_fenster':
    case 'holzwand_tuer':
    case 'bett':
    case 'flagge':
      gruppe.add(mesh(bauteilGeometrie(b.typ), BASIS_MATERIAL));
      break;
    case 'holztuer': {
      // Türblatt schwingt um das Scharnier (am linken Pfosten) auf und zu
      const blatt = new THREE.Group();
      blatt.position.x = -13;
      const tuerMesh = mesh(bauteilGeometrie('holztuer'), BASIS_MATERIAL);
      tuerMesh.layers.enable(TUER_EBENE); // hinter Wänden als Schimmer sichtbar (Renderer)
      blatt.add(tuerMesh);
      gruppe.add(blatt);
      let winkel = b.offen ? TUER_OFFEN_WINKEL : 0;
      blatt.rotation.y = winkel;
      aktualisiere = (zustand) => {
        const ziel = zustand.offen ? TUER_OFFEN_WINKEL : 0;
        if (Math.abs(ziel - winkel) < 0.002) return;
        winkel += (ziel - winkel) * 0.22;
        blatt.rotation.y = winkel;
      };
      break;
    }
    case 'zaun': {
      // Pfosten + ein Arm zu jedem verbundenen Nachbarn (maske: 1 = Ost, 2 = Süd, 4 = West, 8 = Nord; Standard Ost-West)
      gruppe.add(mesh(bauteilGeometrie('zaunpfosten'), METALL_BASIS));
      const maske = b.maske || 5;
      [[1, 0], [2, -Math.PI / 2], [4, Math.PI], [8, Math.PI / 2]].forEach(([bit, winkel]) => {
        if (!(maske & bit)) return;
        const arm = mesh(bauteilGeometrie('zaunarm'), METALL_BASIS);
        arm.rotation.y = winkel;
        gruppe.add(arm);
      });
      break;
    }
    case 'zauntor': {
      gruppe.add(mesh(bauteilGeometrie('zauntor'), METALL_BASIS));
      const blatt = new THREE.Group();
      blatt.position.x = -14;
      blatt.add(mesh(bauteilGeometrie('zauntorblatt'), METALL_BASIS));
      gruppe.add(blatt);
      let winkel = b.offen ? TUER_OFFEN_WINKEL : 0;
      blatt.rotation.y = winkel;
      aktualisiere = (zustand) => {
        const ziel = zustand.offen ? TUER_OFFEN_WINKEL : 0;
        if (Math.abs(ziel - winkel) < 0.002) return;
        winkel += (ziel - winkel) * 0.22;
        blatt.rotation.y = winkel;
      };
      break;
    }
    case 'beet': {
      gruppe.add(mesh(GEOMETRIEN.beet()));
      const pflanzen = new THREE.Group();
      gruppe.add(pflanzen);
      let stand = '';
      aktualisiere = (zustand, jetzt) => {
        const stufe = zustand.pflanze ? Math.min(4, Math.floor(zustand.wachstum * 4) + (zustand.wachstum >= 1 ? 1 : 0)) : -1;
        const schluessel = `${zustand.pflanze}|${stufe}`;
        if (schluessel !== stand) {
          stand = schluessel;
          pflanzen.clear();
          if (zustand.pflanze) baueSetzlinge(pflanzen, zustand.pflanze, stufe, mesh);
        }
        // Reife Pflanzen wippen leicht – "erntebereit"
        pflanzen.rotation.z = stufe >= 4 ? Math.sin(jetzt / 400) * 0.03 : 0;
      };
      break;
    }
    default: {
      // Runde 24 (Cozy): Möbel, Deko, Lichter, Kamin, Radio … (moebelModelle.js)
      const zusatz = baueMoebel(b, gruppe);
      if (zusatz) aktualisiere = zusatz;
    }
  }
  return { gruppe, aktualisiere };
}

/** 4 Pflanzen pro Beet; Stufe 0 Keimling … 3 groß, 4 reif (mit Früchten). */
function baueSetzlinge(gruppe, pflanze, stufe, mesh) {
  const farbe = PFLANZEN[pflanze].farbe;
  const groesse = [0.35, 0.6, 0.85, 1, 1][stufe];
  for (const [x, z] of [[-7, -7], [7, -7], [-7, 7], [7, 7]]) {
    const pf = new THREE.Group();
    pf.position.set(x, 3.5, z);
    pf.scale.setScalar(groesse);
    const hoehe = pflanze === 'kartoffel' ? 6 : 12;
    const stiel = mesh(GEOMETRIEN.stiel());
    stiel.scale.set(1, hoehe, 1);
    pf.add(stiel);
    for (let i = 0; i < 5; i++) {
      const blatt = mesh(GEOMETRIEN.blatt());
      const w = i * 2.4 + x;
      blatt.position.set(Math.cos(w) * 3, 2 + (i / 5) * hoehe, Math.sin(w) * 3);
      blatt.rotation.y = -w;
      pf.add(blatt);
    }
    if (stufe >= 4) {
      const fruchtMaterial = new THREE.MeshStandardMaterial({ color: farbe, roughness: 0.5 });
      for (let i = 0; i < (pflanze === 'gurke' ? 2 : 3); i++) {
        const frucht = new THREE.Mesh(GEOMETRIEN.frucht(), fruchtMaterial);
        const w = i * 2.1 + z;
        if (pflanze === 'gurke') frucht.scale.set(0.8, 2, 0.8);
        if (pflanze === 'kartoffel') frucht.position.set(Math.cos(w) * 5, -2, Math.sin(w) * 5); // liegen halb in der Erde
        else frucht.position.set(Math.cos(w) * 3.5, hoehe * 0.55 + i * 2, Math.sin(w) * 3.5);
        frucht.castShadow = true;
        pf.add(frucht);
      }
    }
    gruppe.add(pf);
  }
}

/** Halbtransparente Vorschau (grün = geht, rot = geht nicht). */
const GEIST_OK = new THREE.MeshBasicMaterial({ color: 0x7dff6a, transparent: true, opacity: 0.45, depthWrite: false });
const GEIST_NEIN = new THREE.MeshBasicMaterial({ color: 0xff4a3a, transparent: true, opacity: 0.45, depthWrite: false });
const ABRISS_MARKIERUNG = new THREE.MeshBasicMaterial({ color: 0xff8a1f, transparent: true, opacity: 0.5, depthWrite: false });
export function erzeugeVorschau(typ) {
  let gruppe;
  const rahmenGeo = new THREE.RingGeometry(20, 22.6, 4, 1, Math.PI / 4).rotateX(-Math.PI / 2);
  if (typ === 'abriss') {
    // Orange Markierung um das Bauteil, das der Hammer abreißen würde (Höhe setzt der Renderer über scale.y)
    gruppe = new THREE.Group();
    const kasten = new THREE.Mesh(new THREE.BoxGeometry(34, 1, 34).translate(0, 0.5, 0), ABRISS_MARKIERUNG);
    gruppe.add(kasten);
    gruppe.userData.setzeOk = () => {};
    gruppe.userData.kasten = kasten;
    return gruppe;
  }
  if (typ === 'erdfeld') {
    // Erdfeld (Spitzhacke): FELD_GROESSE² Beete, Rahmen um jede Kachel – die Gruppe sitzt auf der Mittelkachel
    gruppe = new THREE.Group();
    for (const k of feldKacheln(0, 0)) {
      const { gruppe: beet } = erzeugeBauwerk({ typ: 'beet', pflanze: null, wachstum: 0 });
      beet.position.set(k.tx * 32, 0, k.ty * 32);
      const rahmen = new THREE.Mesh(rahmenGeo, GEIST_OK);
      rahmen.position.set(k.tx * 32, 0.6, k.ty * 32);
      gruppe.add(beet, rahmen);
    }
  } else {
    const modell = erzeugeBauwerk({ typ, gespannt: true, brennt: false, pflanze: null, wachstum: 0 });
    gruppe = modell.gruppe;
    modell.aktualisiere({ typ, gespannt: true, brennt: false, pflanze: null, wachstum: 0 }, 0);
    // Rahmen um die Kachel
    const rahmen = new THREE.Mesh(rahmenGeo, GEIST_OK);
    rahmen.position.y = 0.6;
    gruppe.add(rahmen);
  }
  gruppe.userData.setzeOk = (ok) => {
    gruppe.traverse((o) => {
      if (o.isMesh) {
        o.material = ok ? GEIST_OK : GEIST_NEIN;
        o.castShadow = false;
      }
    });
  };
  return gruppe;
}
