import * as THREE from 'three';

/**
 * Angeln (Darstellung): Rute in der Hand, Schnur mit Durchhang, rot-weiße Pose im Wasser.
 * Die Pose dümpelt beim Warten, wackelt und taucht beim Biss (phase 'biss' → jetzt klicken!).
 * Pro angelndem Spieler ein Objekt (Renderer verwaltet sie), Daten: e.angeln = { phase, x, y } (Pose in Weltpixeln).
 */
const SCHNUR_PUNKTE = 10;
const RUTE_MATERIAL = new THREE.MeshStandardMaterial({ color: 0x7a5230, roughness: 0.8 });
const POSE_ROT = new THREE.MeshStandardMaterial({ color: 0xe0392b, roughness: 0.5 });
const POSE_WEISS = new THREE.MeshStandardMaterial({ color: 0xf6f3ea, roughness: 0.5 });
const WELLE = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5, depthWrite: false });
const _hoch = new THREE.Vector3(0, 1, 0);
const _richtung = new THREE.Vector3();

export function erzeugeAngel() {
  const gruppe = new THREE.Group();
  const rute = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 1.1, 1, 6).translate(0, 0.5, 0), RUTE_MATERIAL);
  rute.castShadow = true;
  const schnurGeo = new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(SCHNUR_PUNKTE * 3), 3));
  const schnur = new THREE.Line(schnurGeo, new THREE.LineBasicMaterial({ color: 0xf2f2f2 }));
  schnur.frustumCulled = false;
  const pose = new THREE.Group();
  const unten = new THREE.Mesh(new THREE.SphereGeometry(2.6, 10, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), POSE_WEISS);
  const oben = new THREE.Mesh(new THREE.SphereGeometry(2.6, 10, 8, 0, Math.PI * 2, 0, Math.PI / 2), POSE_ROT);
  pose.add(unten, oben);
  const welle = new THREE.Mesh(new THREE.RingGeometry(3.2, 4.2, 20).rotateX(-Math.PI / 2), WELLE);
  welle.position.y = 0.6;
  gruppe.add(rute, schnur, pose, welle);

  return {
    gruppe,
    /** @param e Spieler-Entität (x, y, blick, angeln) */
    aktualisiere(e, jetzt) {
      const a = e.angeln;
      const biss = a.phase === 'biss';
      const t = jetzt / 1000;
      const wipp = biss ? -Math.abs(Math.sin(t * 17)) * 3.2 : Math.sin(t * 2.2) * 0.5;
      const px = a.x + (biss ? Math.sin(t * 31) * 1.2 : 0);
      const pz = a.y + (biss ? Math.cos(t * 27) * 1.2 : 0);
      pose.position.set(px, 1.2 + wipp, pz);
      // Wellenring: beim Biss schnell und groß, sonst langsam
      const takt = biss ? (t * 2.6) % 1 : (t * 0.5) % 1;
      welle.position.set(px, 0.6, pz);
      welle.scale.setScalar(0.7 + takt * (biss ? 2.4 : 1.4));
      WELLE.opacity = (1 - takt) * (biss ? 0.7 : 0.35);

      // Rute: von der Hand schräg nach vorn/oben in Richtung Pose
      const dx = a.x - e.x;
      const dz = a.y - e.y;
      const winkel = Math.atan2(dz, dx);
      const hand = new THREE.Vector3(e.x + Math.cos(winkel) * 10, 30, e.y + Math.sin(winkel) * 10);
      const spitze = new THREE.Vector3(hand.x + Math.cos(winkel) * 28, 50 + (biss ? Math.sin(t * 40) * 1.5 : 0), hand.z + Math.sin(winkel) * 28);
      _richtung.subVectors(spitze, hand);
      const laenge = _richtung.length();
      rute.position.copy(hand);
      rute.scale.set(1, laenge, 1);
      rute.quaternion.setFromUnitVectors(_hoch, _richtung.normalize());

      // Schnur mit Durchhang von der Rutenspitze zur Pose
      const pos = schnurGeo.attributes.position;
      const abstand = Math.hypot(a.x - spitze.x, a.y - spitze.z);
      const durchhang = Math.min(22, abstand * 0.12);
      for (let i = 0; i < SCHNUR_PUNKTE; i++) {
        const s = i / (SCHNUR_PUNKTE - 1);
        pos.setXYZ(i, spitze.x + (px - spitze.x) * s, spitze.y + (pose.position.y + 2 - spitze.y) * s - Math.sin(Math.PI * s) * durchhang * (biss ? 0.6 : 1), spitze.z + (pz - spitze.z) * s);
      }
      pos.needsUpdate = true;
    },
    freigeben() {
      gruppe.removeFromParent();
      schnurGeo.dispose();
    },
  };
}
