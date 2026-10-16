import * as THREE from 'three';

/**
 * Frisuren als Anbauteile für die Spielfigur (prozedural aus Halbkugeln und Quadern).
 * Gebaut wird im Raum der Figurengruppe (+z = Blickrichtung, +y = oben) um den Kopf herum und dann mit
 * Object3D.attach() an den Kopfknochen gehängt (renderer.js → #setzeFrisur) – dort folgt es der Animation,
 * Skalierung/Drehung der Knochen gleicht attach() selbst aus.
 *
 * Neue Frisur: Eintrag in FRISUREN (Teile relativ zum Kopf, Maße als Anteile von Breite/Höhe/Tiefe) und in
 * gemeinsam/spieler/aussehen.js an eine Körper-Option (oder später ein eigenes Merkmal) hängen.
 */
const HAAR_MATERIAL = new THREE.MeshStandardMaterial({ color: 0x7a4a22, roughness: 0.85, side: THREE.DoubleSide });

const HALB = Math.PI / 2;
/**
 * Teilearten:
 *   kuppel  obere Halbkugel (ganz rundum)               radius = Anteil der Kopfmaße, y/z = Mittelpunkt
 *   schale  hintere untere Halbkugel (Haar im Nacken)    gestreckt nach unten durch hoehe
 *   quader  b, h, t = Maße, x/y/z = Mitte
 */
const FRISUREN = {
  lang: [
    { art: 'kuppel', b: 0.6, h: 0.5, t: 0.6, y: 0.12, z: -0.1 }, // Haaransatz über den Augen, Seiten bis an die Ohren
    { art: 'schale', b: 0.6, h: 1.0, t: 0.62, y: 0.12, z: -0.1 }, // fällt hinter Kopf und Nacken bis auf die Schultern
    { art: 'quader', b: 0.1, h: 0.7, t: 0.35, x: 0.57, y: -0.2, z: -0.12 }, // Strähne links
    { art: 'quader', b: 0.1, h: 0.7, t: 0.35, x: -0.57, y: -0.2, z: -0.12 }, // Strähne rechts
  ],
};

/** @param kopf { mitte: Vector3, hoehe, breite, tiefe } in Figuren-Einheiten (Mitte & Maße des Schädels) */
export function erzeugeFrisur(name, kopf) {
  const gruppe = new THREE.Group();
  for (const teil of FRISUREN[name] ?? []) {
    let geometrie;
    if (teil.art === 'quader') {
      geometrie = new THREE.BoxGeometry(teil.b * kopf.breite, teil.h * kopf.hoehe, teil.t * kopf.tiefe);
    } else {
      const kugel = teil.art === 'kuppel' ? [0, Math.PI * 2, 0, HALB] : [Math.PI, Math.PI, HALB, HALB];
      geometrie = new THREE.SphereGeometry(1, 20, 10, ...kugel).scale(teil.b * kopf.breite, teil.h * kopf.hoehe, teil.t * kopf.tiefe);
    }
    const mesh = new THREE.Mesh(geometrie, HAAR_MATERIAL);
    mesh.position.set((teil.x ?? 0) * kopf.breite, (teil.y ?? 0) * kopf.hoehe, (teil.z ?? 0) * kopf.tiefe);
    mesh.castShadow = true;
    gruppe.add(mesh);
  }
  gruppe.position.copy(kopf.mitte);
  return gruppe;
}
