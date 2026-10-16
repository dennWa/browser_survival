import * as THREE from 'three';

/**
 * Waffen- und Werkzeugmodelle für die Hand der Figuren – prozedural aus einfachen Körpern
 * (passt zum Low-Poly-Stil der Kenney-Figuren, keine Lizenzfragen).
 *
 * Koordinaten: 1 Einheit = 1 Weltpixel (Figur ≈ 64 hoch). Ursprung = Griffpunkt in der Hand,
 * die Waffe zeigt entlang +z (nach vorne), +y ist oben.
 * mündung: Punkt (lokal), aus dem Schüsse kommen bzw. an dem die Taschenlampe leuchtet.
 */
const metall = new THREE.MeshStandardMaterial({ color: 0x2b2e33, roughness: 0.45, metalness: 0.7 });
const metallHell = new THREE.MeshStandardMaterial({ color: 0xb9c0c8, roughness: 0.25, metalness: 0.9 });
const holz = new THREE.MeshStandardMaterial({ color: 0x6b4426, roughness: 0.8 });
const gummi = new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.9 });
const rot = new THREE.MeshStandardMaterial({ color: 0xa3231a, roughness: 0.6 });
const glas = new THREE.MeshStandardMaterial({ color: 0xfff4d0, emissive: 0xfff1c0, emissiveIntensity: 1.2 });

function quader(b, h, t, material, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(b, h, t), material);
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
}

/** Zylinder entlang +z (Läufe, Griffe) */
function rohr(radius, laenge, material, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, laenge, 10), material);
  m.rotation.x = Math.PI / 2;
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
}

/** Zylinder entlang +y (Stiele) */
function stiel(radius, laenge, material, y0 = 0) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius * 1.1, laenge, 8), material);
  m.position.set(0, y0 + laenge / 2, 0);
  m.castShadow = true;
  return m;
}

const BAUPLAENE = {
  pistole() {
    const g = new THREE.Group();
    g.add(quader(2, 5, 2.6, gummi, 0, -2, -0.6)); // Griff
    g.add(quader(2.3, 2.6, 10, metall, 0, 1, 2.6)); // Schlitten
    g.add(quader(1.6, 1.2, 3, metall, 0, -0.6, 1.4)); // Abzugsbügel
    g.userData.muendung = new THREE.Vector3(0, 1, 7.8);
    return g;
  },
  schrotflinte() {
    const g = new THREE.Group();
    g.add(quader(2.6, 4, 9, holz, 0, -1.2, -6)); // Schaft
    g.add(quader(2.6, 3.2, 7, metall, 0, 0.2, 1.5)); // Gehäuse
    g.add(rohr(0.9, 17, metall, 0, 1, 13)); // Lauf
    g.add(quader(2.4, 2, 6, holz, 0, -0.9, 10)); // Vorderschaft
    g.userData.muendung = new THREE.Vector3(0, 1, 21.5);
    return g;
  },
  skalpell() {
    const g = new THREE.Group();
    g.add(quader(0.9, 0.9, 5, metallHell, 0, 0, 1));
    g.add(quader(0.3, 1, 2.2, metallHell, 0, 0.2, 4.6));
    return g;
  },
  kuechenmesser() {
    const g = new THREE.Group();
    g.add(quader(1.3, 1.8, 4.5, gummi, 0, 0, 0.6));
    g.add(quader(0.4, 2.6, 9, metallHell, 0, 0.4, 7.2));
    return g;
  },
  hammer() {
    const g = new THREE.Group();
    g.add(rohr(0.8, 12, holz, 0, 0, 4.5));
    g.add(quader(2, 5.5, 2.4, metall, 0, 0.5, 10.5));
    return g;
  },
  machete() {
    const g = new THREE.Group();
    g.add(quader(1.4, 2, 5, gummi, 0, 0, 0.5));
    g.add(quader(0.4, 3.4, 17, metallHell, 0, 0.6, 11.5));
    return g;
  },
  feuerwehrbeil() {
    const g = new THREE.Group();
    g.add(rohr(1, 17, rot, 0, 0, 6.5));
    g.add(quader(1.2, 7, 4.5, metallHell, 0, 2.2, 14));
    g.add(quader(1, 2.6, 2.4, metall, 0, -2.2, 14.6)); // Dorn
    return g;
  },
  axt() {
    const g = new THREE.Group();
    g.add(rohr(0.9, 15, holz, 0, 0, 5.5));
    g.add(quader(1, 5.5, 4.5, metallHell, 0, 2.2, 12)); // Blatt
    g.add(quader(1.4, 2, 2.5, metall, 0, -1, 12.3)); // Rücken
    return g;
  },
  spitzhacke() {
    const g = new THREE.Group();
    g.add(rohr(0.9, 15, holz, 0, 0, 5.5));
    const kopf = quader(1.4, 13, 1.6, metall, 0, 0, 12.6); // Hacke quer zum Stiel
    g.add(kopf);
    g.add(quader(1, 2.2, 2.2, metallHell, 0, 6.4, 12.1));
    g.add(quader(1, 2.2, 2.2, metallHell, 0, -6.4, 12.1));
    return g;
  },
  taschenlampe() {
    const g = new THREE.Group();
    g.add(rohr(1.2, 7, gummi, 0, 0, 1.5));
    g.add(rohr(1.7, 2, gummi, 0, 0, 5.6));
    const linse = rohr(1.4, 0.4, glas, 0, 0, 6.7);
    g.add(linse);
    g.userData.muendung = new THREE.Vector3(0, 0, 7);
    g.userData.linse = linse;
    return g;
  },
};

/** Alle Modellnamen (zum Vorkompilieren der Shader beim Laden). */
export const WAFFEN_NAMEN = Object.keys(BAUPLAENE);

/** Welches Modell für ein Item bzw. eine Ausrüstung? (Nahkampfwaffen teilen sich die Ausrüstung 'messer') */
export function waffenModellName(waffeId, ausruestung) {
  if (waffeId && BAUPLAENE[waffeId]) return waffeId;
  if (BAUPLAENE[ausruestung]) return ausruestung;
  if (ausruestung === 'messer') return 'kuechenmesser';
  return 'taschenlampe';
}

/** Waffen etwas größer als "echt", damit man sie aus der Vogelperspektive erkennt. */
const SICHTBARKEIT = 1.5;

/** Neues Modell (jede Figur bekommt ihr eigenes, weil es mitbewegt wird). */
export function erzeugeWaffe(name) {
  const modell = (BAUPLAENE[name] ?? BAUPLAENE.taschenlampe)();
  modell.name = name;
  modell.scale.setScalar(SICHTBARKEIT);
  return modell;
}

/** Haltungsart pro Modell: 'pistole' | 'gewehr' | 'nahkampf' | 'lampe' (Werkzeuge bei der Arbeit: 'hacken') */
export function haltungFuer(name) {
  if (name === 'pistole') return 'pistole';
  if (name === 'schrotflinte') return 'gewehr';
  if (name === 'taschenlampe') return 'lampe';
  return 'nahkampf';
}
