import * as THREE from 'three';
import { KACHELN } from '../../gemeinsam/welt/kacheln.js';

/**
 * Runde 38: nasse Straßen + tropfende Dachkanten (nur Optik).
 *
 * Nässe `nass` 0..1 kommt vom Server (wetterSystem: ~15 s nach Regenbeginn steigt sie, nach Regenende fällt sie in 2 Minuten
 * linear auf 0 → nach 1 min halb nass; Schlafen/Zeitsprung rechnet der Server mit). Hier wird sie nur weich nachgezogen
 * (`wert` folgt `ziel` exponentiell) – es gibt nirgends einen Sprung.
 *
 * Straßennässe = EIN InstancedMesh aus Kachel-Quadraten über allen Asphalt-/Straßenkacheln (Rasen, Gehweg, Böden bleiben trocken):
 * dunkle, glatte Schicht (roughness klein → Glanzlichter von Sonne/Mond/Laternen) mit Deckkraft ∝ Nässe. Trocken (< 1 %) ist das
 * Mesh unsichtbar = null Kosten. Schneezonen bleiben trocken (die Straße ist dort verschneit).
 *
 * Dachtropfen = kleiner Pool (`TROPFEN`) länglicher Streifen, die an den Außenkanten der Hauswände (Dachkante, WANDHOEHE) starten und
 * fallen (Schwerkraft); danach neue Pause + neue Kante in Spielernähe. Anzahl ∝ max(Regen, 0,6 × Nässe): es tropft also noch eine
 * Weile nach dem Regen nach, solange alles nass ist.
 */
const MAX_DECKKRAFT = 0.46; // volle Nässe: Asphalt wird etwa so viel dunkler (dezent, Fahrbahnmarkierungen bleiben sichtbar)
const NAESSE_FOLGE = 1.4; // 1/s – so schnell zieht `wert` dem Serverwert nach (Zeitkonstante ≈ 0,7 s)
const TROPFEN = 56;
const TROPFEN_RADIUS = 640; // px um den Spieler, in denen Dachkanten tropfen
const SCHWERKRAFT = 720; // px/s²
const KANTEN_VERSATZ = 2; // px vor der Wandfläche

const _matrix = new THREE.Matrix4();
const _quat = new THREE.Quaternion();
const _vek = new THREE.Vector3();
const _skala = new THREE.Vector3();

export class StrassenNaesse {
  /**
   * @param welt        Welt (Kacheln, schnee)
   * @param g           Kachelgröße in px
   * @param hy          (x, z) → Geländehöhe
   * @param wandHoehe   Höhe der Hauswände = Dachkante
   */
  constructor({ welt, g, hy, wandHoehe }) {
    this.gruppe = new THREE.Group();
    this.g = g;
    this.hy = hy;
    this.wandHoehe = wandHoehe;
    this.ziel = 0;
    this.wert = null; // erster Wert wird übernommen, nicht eingeblendet (Zonenwechsel/Beitritt mitten im Regen)
    this.regen = 0;
    this.#baueStrassen(welt);
    this.#baueKanten(welt);
    this.#baueTropfen();
  }

  /** Server-Nässe (0..1) und aktuelle Regenstärke (0..1, Wetter-Effekt) merken. */
  setze(nass, regen = 0) {
    this.ziel = Number.isFinite(nass) ? Math.max(0, Math.min(1, nass)) : 0;
    this.regen = Number.isFinite(regen) ? Math.max(0, Math.min(1, regen)) : 0;
    if (this.wert === null) this.#wende(this.ziel);
  }

  aktualisiere(dt, fokus) {
    if (!(dt >= 0) || dt > 1) dt = Math.min(Math.max(dt || 0, 0), 1);
    if (this.wert === null) this.wert = this.ziel;
    this.#wende(this.wert + (this.ziel - this.wert) * (1 - Math.exp(-NAESSE_FOLGE * dt)));
    this.#tropfen(dt, fokus);
  }

  /** Aktuell angezeigte Nässe 0..1 (Tests) */
  get nass() {
    return this.wert ?? 0;
  }

  #wende(w) {
    this.wert = Math.abs(w - this.ziel) < 0.004 ? this.ziel : w;
    if (!this.strassen) return;
    const weich = this.wert * this.wert * (3 - 2 * this.wert); // smoothstep: sanfter Anfang und Ende
    this.strassen.visible = this.wert > 0.01;
    this.strassen.material.opacity = MAX_DECKKRAFT * weich;
    this.strassen.material.roughness = 0.5 - 0.38 * weich; // trockener Asphalt matt, nasser glänzt
  }

  #baueStrassen(welt) {
    this.strassen = null;
    if (welt.schnee) return;
    const felder = [];
    for (let ty = 0; ty < welt.hoehe; ty++) {
      for (let tx = 0; tx < welt.breite; tx++) {
        const name = KACHELN[welt.kachelAn(tx, ty)]?.name;
        if (name === 'asphalt' || name === 'strasse') felder.push([tx, ty]);
      }
    }
    if (felder.length === 0) return;
    const g = this.g;
    const material = new THREE.MeshStandardMaterial({ color: 0x0c1016, roughness: 0.5, metalness: 0, transparent: true, opacity: 0, depthWrite: false });
    material.polygonOffset = true;
    material.polygonOffsetFactor = -1;
    material.polygonOffsetUnits = -1;
    const mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(g, g).rotateX(-Math.PI / 2), material, felder.length);
    felder.forEach(([tx, ty], i) => mesh.setMatrixAt(i, _matrix.makeTranslation((tx + 0.5) * g, 0.4 + this.hy((tx + 0.5) * g, (ty + 0.5) * g), (ty + 0.5) * g)));
    mesh.instanceMatrix.needsUpdate = true;
    mesh.frustumCulled = false;
    mesh.renderOrder = 1;
    mesh.visible = false;
    mesh.receiveShadow = true; // Schatten von Häusern/Bäumen liegen auch auf dem nassen Belag
    this.gruppe.add(mesh);
    this.strassen = mesh;
    this.anzahlStrassen = felder.length;
  }

  /** Außenkanten der Hauswände (Wandkachel mit freier Nachbarkachel draußen): { x, z, nx, nz } = Punkt knapp vor der Wand */
  #baueKanten(welt) {
    this.kanten = [];
    if (welt.schnee) return;
    const g = this.g;
    const draussen = (tx, ty) => {
      const k = KACHELN[welt.kachelAn(tx, ty)];
      return !!k && !k.wand && !k.innen && k.name !== 'fenster' && k.name !== 'tuer';
    };
    for (let ty = 0; ty < welt.hoehe; ty++) {
      for (let tx = 0; tx < welt.breite; tx++) {
        const k = KACHELN[welt.kachelAn(tx, ty)];
        if (!k?.wand) continue;
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          if (!draussen(tx + dx, ty + dz)) continue;
          this.kanten.push({ x: (tx + 0.5) * g + dx * (g / 2 + KANTEN_VERSATZ), z: (ty + 0.5) * g + dz * (g / 2 + KANTEN_VERSATZ), sx: Math.abs(dz), sz: Math.abs(dx) });
        }
      }
    }
  }

  #baueTropfen() {
    this.tropfen = [];
    this.tropfenMesh = null;
    if (this.kanten.length === 0) return;
    const material = new THREE.MeshBasicMaterial({ color: 0xbdd0e8, transparent: true, opacity: 0.75, depthWrite: false });
    const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.9, 3.2, 0.9), material, TROPFEN);
    mesh.frustumCulled = false;
    mesh.renderOrder = 2;
    for (let i = 0; i < TROPFEN; i++) {
      this.tropfen.push({ an: false, wartet: Math.random() * 2, x: 0, y: 0, z: 0, v: 0, boden: 0 });
      mesh.setMatrixAt(i, _matrix.makeScale(0, 0, 0));
    }
    mesh.instanceMatrix.needsUpdate = true;
    this.tropfenMesh = mesh;
    this.gruppe.add(mesh);
    this.nahe = [];
    this.naheZeit = -1;
  }

  #tropfen(dt, fokus) {
    const mesh = this.tropfenMesh;
    if (!mesh) return;
    const staerke = Math.max(this.regen, 0.6 * this.wert);
    if (staerke < 0.02 && !this.tropfen.some((t) => t.an)) {
      mesh.visible = false;
      return;
    }
    mesh.visible = true;
    // Kanten in Spielernähe (alle ~0,6 s neu; Kantenliste hat nur wenige tausend Einträge)
    this.naheZeit -= dt;
    if (this.naheZeit < 0 && fokus) {
      this.naheZeit = 0.6;
      const r2 = TROPFEN_RADIUS * TROPFEN_RADIUS;
      this.nahe = this.kanten.filter((k) => (k.x - fokus.x) ** 2 + (k.z - fokus.y) ** 2 < r2);
    }
    const erlaubt = Math.round(TROPFEN * Math.min(1, staerke * 0.8)); // höchstens so viele gleichzeitig aktiv
    let aktiv = 0;
    for (let i = 0; i < TROPFEN; i++) {
      const t = this.tropfen[i];
      if (t.an) {
        t.v += SCHWERKRAFT * dt;
        t.y -= t.v * dt;
        if (t.y <= t.boden) {
          t.an = false;
          t.wartet = 0.25 + Math.random() * (2.6 - 2.0 * Math.min(1, staerke)); // stärker nass/regnerisch → dichter
        }
      } else {
        t.wartet -= dt;
        if (t.wartet <= 0 && this.nahe?.length && aktiv < erlaubt) {
          const k = this.nahe[(Math.random() * this.nahe.length) | 0];
          const lang = (Math.random() - 0.5) * this.g * 0.9; // irgendwo entlang der Kante
          t.x = k.x + k.sx * lang;
          t.z = k.z + k.sz * lang;
          t.boden = this.hy(t.x, t.z) + 0.5;
          t.y = t.boden + this.wandHoehe - 3;
          t.v = 0;
          t.an = true;
        }
      }
      if (t.an) {
        aktiv++;
        _skala.set(1, 1 + Math.min(1.8, t.v / 260), 1);
        mesh.setMatrixAt(i, _matrix.compose(_vek.set(t.x, t.y, t.z), _quat.identity(), _skala));
      } else {
        mesh.setMatrixAt(i, _matrix.makeScale(0, 0, 0));
      }
    }
    mesh.instanceMatrix.needsUpdate = true;
  }
}
