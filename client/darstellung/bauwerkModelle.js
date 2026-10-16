import * as THREE from 'three';
import { vereineGeometrien, matrixAus } from './geometrie.js';
import { werkbankTeile } from './kartenModell.js';
import { PFLANZEN, feldKacheln } from '../../gemeinsam/welt/bauwerke.js';

/**
 * 3D-Modelle der Bauwerke (gemeinsam/welt/bauwerke.js): Werkbank, Lagerfeuer, Bärenfalle, Beet.
 * Jedes Bauwerk ist eine Gruppe; Zustände (Feuer an, Falle zu, Pflanzen-Stufe) setzt aktualisiere().
 * Ursprung = Kachelmitte am Boden. Bauwerke sind wenige → einzelne Meshes reichen (Geometrien gecacht).
 */
const MATERIAL = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 });
const METALL = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4, metalness: 0.7 });
const FLAMME_AUSSEN = new THREE.MeshBasicMaterial({ color: 0xff7a1a, transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending });
const FLAMME_INNEN = new THREE.MeshBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending });
const GLUT = new THREE.MeshBasicMaterial({ color: 0xff4a12 });
const ASCHE = new THREE.MeshBasicMaterial({ color: 0x3a3330 });

const f = (hex) => new THREE.Color(hex);
const teil = (geometrie, matrix, farbe) => ({ geometrie, matrix, farbe: f(farbe) });
const cache = new Map();
function geometrie(name, bauen) {
  if (!cache.has(name)) cache.set(name, vereineGeometrien(bauen(), { mitFarbe: true }));
  return cache.get(name);
}

const GEOMETRIEN = {
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
  holzwand: () =>
    geometrie('holzwand', () => {
      const teile = [];
      for (let i = 0; i < 4; i++) teile.push(teil(new THREE.BoxGeometry(7.4, 40, 30), matrixAus(-12 + i * 8, 20, 0), i % 2 ? 0x8a5f33 : 0x9a6c3a));
      teile.push(teil(new THREE.BoxGeometry(32, 4, 4), matrixAus(0, 12, 15), 0x5f4122), teil(new THREE.BoxGeometry(32, 4, 4), matrixAus(0, 30, 15), 0x5f4122));
      return teile;
    }),
  holzboden: () =>
    geometrie('holzboden', () => {
      const teile = [];
      for (let i = 0; i < 4; i++) teile.push(teil(new THREE.BoxGeometry(7.6, 1.6, 31), matrixAus(-12 + i * 8, 0.8, 0), i % 2 ? 0xb98650 : 0xc79a62));
      return teile;
    }),
  blatt: () => geometrie('blatt', () => [teil(new THREE.SphereGeometry(3, 6, 4), matrixAus(0, 0, 0, 0, new THREE.Vector3(1.4, 0.35, 0.8)), 0x4f9a2a)]),
  stiel: () => geometrie('stiel', () => [teil(new THREE.CylinderGeometry(0.5, 0.7, 1, 5).translate(0, 0.5, 0), new THREE.Matrix4(), 0x3f7a22)]),
  frucht: () => geometrie('frucht', () => [teil(new THREE.SphereGeometry(2.2, 8, 6), new THREE.Matrix4(), 0xffffff)]),
};

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
    case 'holzwand':
      gruppe.add(mesh(GEOMETRIEN.holzwand()));
      break;
    case 'holzboden':
      gruppe.add(mesh(GEOMETRIEN.holzboden()));
      break;
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
export function erzeugeVorschau(typ) {
  let gruppe;
  const rahmenGeo = new THREE.RingGeometry(20, 22.6, 4, 1, Math.PI / 4).rotateX(-Math.PI / 2);
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
