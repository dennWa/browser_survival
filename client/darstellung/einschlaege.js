import * as THREE from 'three';

/**
 * Runde 29: Einschusslöcher – kleine dunkle Flecken, wo Schüsse Wände/Türen treffen ('schuss'-Ereignis mit `stoff`) und an Autos.
 * Wände: ein InstancedMesh als Ringpuffer (MAX, ältestes verschwindet). Kachel-Wände stehen auf dem Raster, die Normale
 * ergibt sich aus der nächsten Kachelkante. Autos: Kinder der Auto-Gruppe (fahren mit), höchstens MAX_JE_AUTO.
 * Nur Optik, nicht im Netz/Spielstand; `leeren()` beim Zonenwechsel.
 */
const MAX = 220;
const MAX_JE_AUTO = 14;
const RADIUS = 2.5;
const WAND_HOEHE = { min: 22, max: 62 };
const AUTO_HOEHE = { min: 12, max: 26 };
const ABSTAND = 0.5; // px vor der Fläche (kein Z-Fighting)
const RUECKSPRUNG = 60; // px: so weit vor dem Einschlag beginnt der Strahl ans Auto-Modell

const _m = new THREE.Matrix4();
const _r = new THREE.Raycaster();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _n = new THREE.Vector3();
const _s = new THREE.Vector3(1, 1, 1);
const VORNE = new THREE.Vector3(0, 0, 1);

const zufall = ({ min, max }) => min + Math.random() * (max - min);

export class Einschlaege {
  constructor(szene) {
    this.szene = szene;
    this.geo = new THREE.CircleGeometry(RADIUS, 8);
    this.material = new THREE.MeshBasicMaterial({ color: 0x14110e, transparent: true, opacity: 0.88, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    this.mesh = new THREE.InstancedMesh(this.geo, this.material, MAX);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.naechstes = 0;
    szene.add(this.mesh);
  }

  leeren() {
    this.mesh.count = 0;
    this.naechstes = 0;
  }

  /**
   * Treffer auf einer Kachelwand. @param wx, wy Einschlag (Weltpixel) · @param dx, dy Schussrichtung · @param g Kachelgröße · @param boden Geländehöhe
   */
  wand(wx, wy, dx, dy, g, boden) {
    const abX = Math.abs(wx / g - Math.round(wx / g));
    const abY = Math.abs(wy / g - Math.round(wy / g));
    if (abX < abY) _n.set(-Math.sign(dx) || 1, 0, 0);
    else _n.set(0, 0, -Math.sign(dy) || 1);
    _p.set(wx + _n.x * ABSTAND, boden + zufall(WAND_HOEHE), wy + _n.z * ABSTAND);
    this.mesh.setMatrixAt(this.naechstes, _m.compose(_p, _q.setFromUnitVectors(VORNE, _n), _s));
    this.naechstes = (this.naechstes + 1) % MAX;
    this.mesh.count = Math.max(this.mesh.count, this.naechstes || MAX);
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  /** Treffer auf ein Auto: Strahl gegen das echte Modell (Karosserie ist rund), Loch als Kind der Gruppe. @param dx, dy Schussrichtung */
  auto(gruppe, wx, wy, dx, dy, boden) {
    const laenge = Math.hypot(dx, dy) || 1;
    gruppe.updateWorldMatrix(true, true);
    _r.far = 2 * RUECKSPRUNG;
    for (const hoehe of [zufall(AUTO_HOEHE), AUTO_HOEHE.min, AUTO_HOEHE.min / 2]) {
      _r.ray.direction.set(dx / laenge, 0, dy / laenge);
      _r.ray.origin.set(wx, boden + hoehe, wy).addScaledVector(_r.ray.direction, -RUECKSPRUNG);
      const treffer = _r.intersectObject(gruppe, true).find((x) => x.face && x.object.geometry !== this.geo);
      if (!treffer) continue;
      _n.copy(treffer.face.normal).transformDirection(treffer.object.matrixWorld).transformDirection(_m.copy(gruppe.matrixWorld).invert());
      const loch = new THREE.Mesh(this.geo, this.material);
      loch.position.copy(gruppe.worldToLocal(treffer.point.clone())).addScaledVector(_n, ABSTAND);
      loch.quaternion.setFromUnitVectors(VORNE, _n);
      const liste = (gruppe.userData.loecher ??= []);
      liste.push(loch);
      gruppe.add(loch);
      if (liste.length > MAX_JE_AUTO) gruppe.remove(liste.shift());
      return;
    }
  }
}
