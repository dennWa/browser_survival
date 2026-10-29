import * as THREE from 'three';
import { eigenesModellInhalt, ladeEigenesModell } from './eigeneModelle.js';

/**
 * Runde 24 (Cozy): 3D-Modelle der Möbel/Deko/Lichter (Bauwerke mit `moebel: true`, gemeinsam/welt/bauwerke.js).
 * Die meisten kommen als GLB aus dem Spielordner (client/assets/eigene/<datei>.glb, eingepasst in b × h × hoehe Kacheln);
 * Platzhalter-Kasten bis das Modell geladen ist. Prozedural: Plattenspieler, Lichterkette, Vorhang, Generator, Kerzen-/Kaminflammen.
 * Licht selbst kommt aus dem Lampen-Pool des Renderers (gemeinsam/welt/einrichtung.js LICHTER) – hier nur leuchtende Flächen.
 * `baueMoebel(b, gruppe)` → aktualisiere(b, jetzt, strom) oder null (kein Möbel); `strom` = hatStrom (Renderer).
 */
const KACHEL = 32;
const MODELLE = {
  sofa: { datei: 'sofa', b: 1.9, h: 0.9, hoehe: 0.85 },
  sessel: { datei: 'club-arm-chair', b: 0.95, h: 0.9, hoehe: 0.95 },
  stuhl: { datei: 'wooden-chair', b: 0.6, h: 0.6, hoehe: 1 },
  tisch: { datei: 'rounded-coffee-table', b: 0.9, h: 0.9, hoehe: 0.45 },
  esstisch: { datei: 'table', b: 1, h: 1, hoehe: 0.75 },
  regal: { datei: 'medium-book-shelf', b: 1, h: 0.45, hoehe: 1.9 },
  teppich: { datei: 'wool-carpet', b: 1.9, h: 1.3, hoehe: 0.03 },
  bild: { datei: 'painting-canvas', b: 0.8, h: 0.5, hoehe: 1.4 },
  pflanze: { datei: 'plant', b: 0.7, h: 0.7, hoehe: 0.9 },
  kamin: { datei: 'fireplace', b: 1.4, h: 0.6, hoehe: 1.3 },
  kerze: { datei: 'candle-melted', b: 0.3, h: 0.3, hoehe: 0.35 },
  oellampe: { datei: 'table-lamp', b: 0.35, h: 0.35, hoehe: 0.45 },
  stehlampe: { datei: 'floor-lamp', b: 0.5, h: 0.5, hoehe: 1.8 },
  radio: { datei: 'radio', b: 0.55, h: 0.3, hoehe: 0.4 },
};
export const MOEBEL_NAMEN = Object.freeze([...Object.keys(MODELLE), 'plattenspieler', 'lichterkette', 'vorhang', 'generator']);

const holz = new THREE.MeshStandardMaterial({ color: 0x6b4426, roughness: 0.8 });
const dunkel = new THREE.MeshStandardMaterial({ color: 0x202226, roughness: 0.5, metalness: 0.3 });
const metall = new THREE.MeshStandardMaterial({ color: 0x8a8f96, roughness: 0.45, metalness: 0.6 });
const rotLack = new THREE.MeshStandardMaterial({ color: 0xa8321e, roughness: 0.5, metalness: 0.3 });
const stoffRot = new THREE.MeshStandardMaterial({ color: 0x8a2a2a, roughness: 0.9, side: THREE.DoubleSide });
const glut = () => new THREE.MeshBasicMaterial({ color: 0xffd08a });
const flammenMaterial = new THREE.MeshBasicMaterial({ color: 0xff8a2a, transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending });

function box(b, h, t, material, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(b, h, t), material);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

/** Flammen-Büschel (für Kamin und Kerze) – Kegel, die per aktualisiere zucken */
function flammen(anzahl, groesse, breite) {
  const g = new THREE.Group();
  const geo = new THREE.ConeGeometry(groesse * 0.35, groesse, 6).translate(0, groesse / 2, 0);
  for (let i = 0; i < anzahl; i++) {
    const m = new THREE.Mesh(geo, flammenMaterial);
    m.position.x = (i - (anzahl - 1) / 2) * breite;
    g.add(m);
  }
  return g;
}

function zucke(gruppe, jetzt) {
  gruppe.children.forEach((f, i) => {
    const t = jetzt / 1000 + i * 1.3;
    f.scale.set(1, 0.75 + 0.25 * Math.abs(Math.sin(t * 9)) + 0.1 * Math.sin(t * 23), 1);
  });
}

/** Möbel aufbauen. @returns aktualisiere(b, jetzt) oder null */
export function baueMoebel(b, gruppe) {
  const def = MODELLE[b.typ];
  let zusatz = () => {};
  if (def) {
    const platzhalter = box(def.b * KACHEL * 0.8, Math.max(1, def.hoehe * KACHEL * 0.8), def.h * KACHEL * 0.8, holz, 0, (def.hoehe * KACHEL * 0.8) / 2, 0);
    gruppe.add(platzhalter);
    ladeEigenesModell(new URL(`../assets/eigene/${def.datei}.glb`, import.meta.url).href)
      .then((szene) => {
        const modell = eigenesModellInhalt(szene, { b: def.b, h: def.h, hoehe: def.hoehe, einheit: KACHEL });
        modell.traverse((t) => {
          if (!t.isMesh) return;
          t.castShadow = b.typ !== 'teppich';
          t.receiveShadow = true;
        });
        gruppe.remove(platzhalter);
        gruppe.add(modell);
      })
      .catch(() => {}); // Platzhalter bleibt
  }
  switch (b.typ) {
    case 'kamin': {
      const feuer = flammen(4, 14, 7);
      feuer.position.set(0, 4, 4);
      const glutBoden = box(26, 1.5, 6, glut(), 0, 3, 4);
      gruppe.add(feuer, glutBoden);
      zusatz = (z, jetzt) => {
        feuer.visible = glutBoden.visible = z.brennt === true;
        if (z.brennt) zucke(feuer, jetzt);
      };
      break;
    }
    case 'kerze':
    case 'oellampe': {
      const flamme = flammen(b.typ === 'kerze' ? 3 : 1, b.typ === 'kerze' ? 4 : 5, 3.2);
      flamme.position.set(0, b.typ === 'kerze' ? 11 : 13, 0);
      gruppe.add(flamme);
      zusatz = (z, jetzt) => {
        flamme.visible = z.an !== false;
        if (flamme.visible) zucke(flamme, jetzt);
      };
      break;
    }
    case 'stehlampe': {
      const schein = new THREE.Mesh(new THREE.SphereGeometry(5, 10, 8), glut());
      schein.position.y = 54;
      gruppe.add(schein);
      zusatz = (z, jetzt, strom) => (schein.visible = z.an !== false && strom);
      break;
    }
    case 'plattenspieler': {
      gruppe.add(box(18, 5, 16, holz, 0, 2.5, 0));
      const teller = new THREE.Mesh(new THREE.CylinderGeometry(6.5, 6.5, 1, 20), dunkel);
      teller.position.set(-2, 5.6, 0);
      gruppe.add(teller);
      gruppe.add(box(1, 1, 9, metall, 6, 6.4, 1));
      zusatz = (z, jetzt) => (teller.rotation.y = z.musik ? jetzt / 400 : teller.rotation.y);
      break;
    }
    case 'lichterkette': {
      const birnen = [];
      for (const x of [-13, 13]) gruppe.add(box(1.4, 26, 1.4, holz, x, 13, 0));
      const kurve = new THREE.CatmullRomCurve3([new THREE.Vector3(-13, 25, 0), new THREE.Vector3(0, 19, 0), new THREE.Vector3(13, 25, 0)]);
      gruppe.add(new THREE.Mesh(new THREE.TubeGeometry(kurve, 12, 0.25, 4), dunkel));
      const farben = [0xffd28a, 0xff9a6a, 0xfff0b0, 0x9adaff, 0xffb0d8];
      for (let i = 0; i <= 8; i++) {
        const birne = new THREE.Mesh(new THREE.SphereGeometry(1, 6, 4), new THREE.MeshBasicMaterial({ color: farben[i % farben.length] }));
        birne.position.copy(kurve.getPoint(i / 8)).add(new THREE.Vector3(0, -1.2, 0));
        gruppe.add(birne);
        birnen.push(birne);
      }
      zusatz = (z, jetzt, strom) => {
        const an = z.an !== false && strom;
        birnen.forEach((m, i) => (m.visible = an && Math.sin(jetzt / 500 + i * 1.7) > -0.6));
      };
      break;
    }
    case 'vorhang': {
      for (const x of [-8, 8]) {
        const tuch = new THREE.Mesh(new THREE.PlaneGeometry(14, 40, 4, 1), stoffRot);
        const p = tuch.geometry.attributes.position;
        for (let i = 0; i < p.count; i++) p.setZ(i, Math.sin(p.getX(i) * 0.9) * 1.6);
        tuch.geometry.computeVertexNormals();
        tuch.position.set(x, 22, 13);
        tuch.castShadow = true;
        gruppe.add(tuch);
      }
      gruppe.add(box(32, 1.4, 1.4, holz, 0, 43, 13));
      break;
    }
    case 'generator': {
      gruppe.add(box(24, 14, 16, rotLack, 0, 9, 0));
      gruppe.add(box(26, 2, 18, dunkel, 0, 1, 0));
      gruppe.add(box(8, 6, 1, dunkel, -4, 10, 8.4));
      const lampe = new THREE.Mesh(new THREE.SphereGeometry(1.2, 6, 4), new THREE.MeshBasicMaterial({ color: 0x40ff60 }));
      lampe.position.set(8, 13, 8.4);
      gruppe.add(lampe);
      zusatz = (z, jetzt) => {
        lampe.visible = z.laeuft === true;
        gruppe.children[0].position.x = z.laeuft ? Math.sin(jetzt / 25) * 0.25 : 0; // rüttelt
      };
      break;
    }
  }
  if (!def && !MOEBEL_NAMEN.includes(b.typ)) return null;
  return zusatz;
}
