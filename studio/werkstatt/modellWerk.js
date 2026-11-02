import * as THREE from 'three';
import { GLTFLoader, GLTFExporter, OrbitControls, TransformControls } from '../../client/vendor/three/addons.js';
import { baueAnimation, ANIMATIONS_ARTEN } from '../../editor/kern/animation.js';
import { knotenName, knochenForm, standardLaenge, KNOCHEN_MIN } from '../../editor/kern/knochen.js';
import { neueLeinwand, pinsel, effekt, EFFEKTE } from './malen.js';
import { farbtonDrehen, fussabdruck } from '../kern/modelle.js';

/**
 * Modell-Werkstatt – 3D-Werk (Studio Phase 3.2–3.7). Bühne + alle Bearbeitungen als Methoden; Oberfläche
 * (werkstatt/werkstatt.js) und KI/MCP (kern/kiModelle.js) rufen DIESELBEN Methoden auf → alles mit Undo.
 *
 * Anzeige wie im Spiel: das Spiel passt jedes Modell gleichmäßig in Grundfläche × „Höhe im Spiel“ ein, Unterkante auf den
 * Boden, mittig (client/darstellung/eigeneModelle.eigenesModellInhalt). Die Bühne macht dasselbe (Gruppe `anzeige`):
 * 1 Rasterkästchen = 1 Kachel = 1 m im Spiel, daneben eine 1,8-m-Figur zum Vergleich, Grundfläche als Rechteck am Boden.
 * Lage/Größe einzelner TEILE sind Modell-Einheiten (die Datei) – Gesamtgröße/-lage regelt das Spiel (Höhe im Spiel).
 * Neue Modelle (aus Grundkörpern): 1 Einheit = 1 m, Höhe im Spiel folgt der Modellhöhe (`hoeheAuto`).
 *
 * Undo: Stand = alle je gesehenen Knoten (Pool, uuid → Object3D) mit Eltern/Lage/sichtbar/Name + Materialien (Farbe, Rauheit,
 * Metall, Textur-Nr.) + Clips/Leerlauf. Löschen = aus dem Baum nehmen (bleibt im Pool) → Undo hängt es wieder ein.
 * Export: `modell` ist eine THREE.Scene → GLTFExporter schreibt deren Kinder als Wurzeln (kein Verschachteln beim mehrfachen
 * Speichern) und findet alle Animations-Ziele. Spuren auf ausgeblendete Teile fallen weg.
 */
export const GRUNDKOERPER = Object.freeze({
  kiste: { name: 'Kiste', groesse: [1, 1, 1] },
  zylinder: { name: 'Zylinder', groesse: [1, 1, 1] },
  kugel: { name: 'Kugel', groesse: [1, 1, 1] },
  kegel: { name: 'Kegel', groesse: [1, 1, 1] },
  keil: { name: 'Keil', groesse: [1, 1, 1] },
  ring: { name: 'Ring', groesse: [1, 0.25, 1] },
  platte: { name: 'Platte', groesse: [1, 0.1, 1] },
});
const FIGUR_HOEHE = 1.8;
const r3 = (v) => Math.round(v * 1000) / 1000;
const grad = (r) => r3(THREE.MathUtils.radToDeg(r));

function grundGeometrie(form) {
  switch (form) {
    case 'zylinder': return new THREE.CylinderGeometry(0.5, 0.5, 1, 24);
    case 'kugel': return new THREE.SphereGeometry(0.5, 24, 16);
    case 'kegel': return new THREE.ConeGeometry(0.5, 1, 24);
    case 'keil': {
      const f = new THREE.Shape([new THREE.Vector2(-0.5, -0.5), new THREE.Vector2(0.5, -0.5), new THREE.Vector2(-0.5, 0.5)]);
      return new THREE.ExtrudeGeometry(f, { depth: 1, bevelEnabled: false }).translate(0, 0, -0.5);
    }
    case 'ring': return new THREE.TorusGeometry(0.375, 0.125, 12, 32).rotateX(Math.PI / 2).scale(1, 2, 1);
    case 'platte':
    case 'kiste': return new THREE.BoxGeometry(1, 1, 1);
    default: throw new Error(`Unbekannter Grundkörper „${form}“ (${Object.keys(GRUNDKOERPER).join(', ')})`);
  }
}

export class ModellWerk {
  constructor(leinwand) {
    this.leinwand = leinwand;
    this.renderer = new THREE.WebGLRenderer({ canvas: leinwand, antialias: true, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.szene = new THREE.Scene();
    this.szene.background = new THREE.Color(0x15181d);
    this.szene.add(new THREE.HemisphereLight(0xe8efff, 0x3a332b, 1.5));
    const sonne = new THREE.DirectionalLight(0xfff2e0, 1.9);
    sonne.position.set(4, 8, 5);
    this.szene.add(sonne);
    this.kamera = new THREE.PerspectiveCamera(40, 1, 0.01, 500);
    this.kamera.position.set(3.2, 2.4, 4);
    this.orbit = new OrbitControls(this.kamera, leinwand);
    this.orbit.target.set(0, 0.6, 0);
    this.orbit.enableDamping = true;
    this.raster = new THREE.GridHelper(20, 20, 0x56606e, 0x2c323b);
    this.szene.add(this.raster);
    this.fuss = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2)), new THREE.LineBasicMaterial({ color: 0xff8a3d }));
    this.fuss.position.y = 0.005;
    this.fussFlaeche = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xff8a3d, transparent: true, opacity: 0.08, depthWrite: false }));
    this.fussFlaeche.position.y = 0.004;
    this.szene.add(this.fuss, this.fussFlaeche);
    this.figur = this.#baueFigur();
    this.szene.add(this.figur);
    this.anzeige = new THREE.Group();
    this.szene.add(this.anzeige);
    this.huelle = new THREE.Box3Helper(new THREE.Box3(), 0x4aa3ff);
    this.huelle.visible = false;
    this.szene.add(this.huelle);
    this.gizmo = new TransformControls(this.kamera, leinwand);
    this.gizmo.setSize(0.8);
    this.gizmo.addEventListener('dragging-changed', (e) => {
      this.orbit.enabled = !e.value;
      if (e.value) this.#vorGizmo = this.stand();
      else if (this.#vorGizmo) {
        this.#merke(this.#vorGizmo);
        this.#vorGizmo = null;
        this.#geaendert('Lage');
      }
    });
    this.gizmo.addEventListener('objectChange', () => this.#einpassen(false));
    this.szene.add(this.gizmo.getHelper ? this.gizmo.getHelper() : this.gizmo);
    this.modell = new THREE.Group();
    this.anzeige.add(this.modell);
    this.pool = new Map();
    this.texturen = new Map([[0, null]]);
    this.texturNr = new WeakMap();
    this.naechsteTextur = 1;
    this.clips = [];
    this.alleClips = new Map();
    this.leerlauf = '';
    this.zurueck = [];
    this.vor = [];
    this.gewaehlt = null;
    this.eintrag = null; // index.json-Eintrag (oder Entwurf bei neuen Modellen)
    this.hoeheAuto = false;
    this.mischer = null;
    this.uhr = new THREE.Clock();
    this.beiAenderung = null; // (was) → Oberfläche neu zeichnen
    this.beiAuswahl = null;
    this.#zeiger();
    new ResizeObserver(() => this.groesse()).observe(leinwand.parentElement);
    this.groesse();
  }

  #vorGizmo = null;

  // ---------- Laufen ----------
  starte() {
    this.renderer.setAnimationLoop(() => {
      this.orbit.update();
      if (this.mischer) {
        this.mischer.update(this.uhr.getDelta());
        this.#einpassen(false);
      }
      this.#zeigeKnochen();
      this.renderer.render(this.szene, this.kamera);
    });
  }

  halte() {
    this.renderer.setAnimationLoop(null);
  }

  groesse() {
    const el = this.leinwand.parentElement;
    const b = Math.max(1, el.clientWidth);
    const h = Math.max(1, el.clientHeight);
    this.renderer.setSize(b, h, false);
    this.kamera.aspect = b / h;
    this.kamera.updateProjectionMatrix();
  }

  #baueFigur() {
    const g = new THREE.Group();
    const m = new THREE.MeshStandardMaterial({ color: 0x7c8594, roughness: 0.9, transparent: true, opacity: 0.55 });
    const beine = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.12, 0.55, 12), m);
    beine.position.y = 0.275;
    const koerper = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 0.62, 6, 12), m); // 0,5 … 1,52
    koerper.position.y = 0.5 + 0.51;
    const kopf = new THREE.Mesh(new THREE.SphereGeometry(0.14, 16, 12), m);
    kopf.position.y = FIGUR_HOEHE - 0.14;
    g.add(koerper, kopf, beine);
    g.name = '__figur';
    return g;
  }

  // ---------- Laden / Neu ----------
  /** @param bytes ArrayBuffer|Uint8Array der .glb oder null = neues Modell (eine Kiste) · eintrag = index.json-Eintrag */
  async lade(bytes, eintrag) {
    this.stoppeAnimation();
    this.gizmo.detach();
    this.anzeige.remove(this.modell);
    this.pool.clear();
    this.texturen = new Map([[0, null]]);
    this.texturNr = new WeakMap();
    this.alleClips = new Map();
    this.zurueck = [];
    this.vor = [];
    this.gewaehlt = null;
    this.eintrag = { ...eintrag };
    if (bytes) {
      const puffer = bytes instanceof ArrayBuffer ? bytes : bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
      const gltf = await new GLTFLoader().parseAsync(puffer, '');
      // Als Scene führen: der Exporter schreibt dann die Kinder als Wurzel-Knoten (kein Verschachteln beim mehrfachen
      // Speichern) und findet die Animations-Ziele unter ALLEN Kindern (bei einem Array nur unter dem ersten)
      this.modell = new THREE.Scene();
      this.modell.add(...gltf.scene.children);
      this.clips = gltf.animations ?? [];
      this.hoeheAuto = false;
    } else {
      this.modell = new THREE.Scene();
      this.clips = [];
      this.hoeheAuto = true;
    }
    this.modell.name = 'Modell';
    for (const c of this.clips) this.alleClips.set(c.uuid, c);
    this.leerlauf = this.clips.some((c) => c.name === eintrag.leerlauf) ? eintrag.leerlauf : '';
    this.anzeige.add(this.modell);
    if (!bytes) this.#teilEinbauen('kiste', { groesse: [1, 1, 1], position: [0, 0.5, 0], farbe: '#a87a4d' });
    this.#merkePool();
    this.#einpassen(true);
    this.beiAenderung?.('geladen');
  }

  // ---------- Undo ----------
  #merkePool() {
    this.modell.traverse((o) => this.pool.set(o.uuid, o));
  }

  #imBaum(o) {
    for (let p = o; p; p = p.parent) if (p === this.modell) return true;
    return false;
  }

  #materialien(nurSichtbar = false) {
    const m = new Map();
    const quelle = nurSichtbar ? [] : [...this.pool.values()];
    if (nurSichtbar) this.modell.traverseVisible((o) => quelle.push(o));
    for (const o of quelle) if (o.isMesh) for (const mat of [].concat(o.material)) m.set(mat.uuid, mat);
    return [...m.values()];
  }

  #texNr(t) {
    if (!t) return 0;
    if (!this.texturNr.has(t)) {
      const nr = this.naechsteTextur++;
      this.texturNr.set(t, nr);
      this.texturen.set(nr, t);
    }
    return this.texturNr.get(t);
  }

  stand() {
    this.#merkePool();
    const knoten = [];
    for (const o of this.pool.values()) {
      if (o === this.modell) continue;
      knoten.push([o.uuid, o.parent?.uuid ?? '', this.#imBaum(o), o.position.toArray(), o.quaternion.toArray(), o.scale.toArray(), o.visible, o.name, o.userData.knochen?.laenge ?? null]);
    }
    const mats = this.#materialien().map((m) => [m.uuid, m.color ? m.color.getHex() : null, m.roughness ?? null, m.metalness ?? null, this.#texNr(m.map)]);
    return { knoten, mats, clips: this.clips.map((c) => c.uuid), leerlauf: this.leerlauf };
  }

  setzeStand(st) {
    const mats = new Map(this.#materialien().map((m) => [m.uuid, m]));
    const tiefe = (u) => {
      let n = 0;
      for (let p = this.pool.get(u)?.parent; p; p = p.parent) n++;
      return n;
    };
    for (const [u, , drin] of st.knoten) if (!drin) this.pool.get(u)?.removeFromParent();
    const rein = st.knoten.filter((k) => k[2]).sort((a, b) => tiefe(a[0]) - tiefe(b[0]));
    for (const [u, eltern] of rein) {
      const o = this.pool.get(u);
      const p = eltern === this.modell.uuid ? this.modell : this.pool.get(eltern);
      if (o && p && o.parent !== p) p.add(o);
    }
    for (const [u, , , pos, quat, sk, sichtbar, name, laenge] of st.knoten) {
      const o = this.pool.get(u);
      if (!o) continue;
      o.position.fromArray(pos);
      o.quaternion.fromArray(quat);
      o.scale.fromArray(sk);
      o.visible = sichtbar;
      o.name = name;
      if (laenge !== null && laenge !== undefined) o.userData.knochen = { ...(o.userData.knochen ?? {}), laenge };
    }
    for (const [u, farbe, rauheit, metall, tex] of st.mats) {
      const m = mats.get(u);
      if (!m) continue;
      if (farbe !== null && m.color) m.color.setHex(farbe);
      if (rauheit !== null) m.roughness = rauheit;
      if (metall !== null) m.metalness = metall;
      const t = this.texturen.get(tex) ?? null;
      if (m.map !== t) {
        m.map = t;
        m.needsUpdate = true;
      }
    }
    this.clips = st.clips.map((u) => this.alleClips.get(u)).filter(Boolean);
    this.leerlauf = st.leerlauf;
    if (this.gewaehlt && !this.#imBaum(this.gewaehlt)) this.waehle(null);
    this.#einpassen(false);
  }

  #merke(st = this.stand()) {
    this.zurueck.push(st);
    if (this.zurueck.length > 80) this.zurueck.shift();
    this.vor = [];
  }

  /** Änderung mit Undo: f() ändert, ein Schritt */
  #schritt(was, f) {
    const vorher = this.stand();
    const r = f();
    this.#merkePool();
    this.#merke(vorher);
    this.#einpassen(false);
    this.#geaendert(was);
    return r;
  }

  #geaendert(was) {
    this.geaendertSeit = true;
    this.beiAenderung?.(was);
  }

  get kannZurueck() {
    return this.zurueck.length > 0;
  }

  get kannVor() {
    return this.vor.length > 0;
  }

  rueckgaengig() {
    if (!this.zurueck.length) return false;
    this.stoppeAnimation();
    this.vor.push(this.stand());
    this.setzeStand(this.zurueck.pop());
    this.#geaendert('rückgängig');
    return true;
  }

  wiederholen() {
    if (!this.vor.length) return false;
    this.stoppeAnimation();
    this.zurueck.push(this.stand());
    this.setzeStand(this.vor.pop());
    this.#geaendert('wiederholt');
    return true;
  }

  // ---------- Anzeige wie im Spiel ----------
  /** Natürliche Größe des Modells (Modell-Einheiten): Box3 der sichtbaren Teile */
  box() {
    this.anzeige.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(this.anzeige.matrixWorld).invert(); // Box in Modell-Koordinaten (ohne Anzeige-Maßstab)
    const box = new THREE.Box3();
    this.modell.traverseVisible((o) => {
      if (!o.isMesh) return;
      if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
      box.union(o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld).applyMatrix4(inv));
    });
    return box;
  }

  masse() {
    const b = this.box();
    if (b.isEmpty()) return null;
    const g = b.getSize(new THREE.Vector3());
    return { b: r3(Math.max(g.x, 0.001)), h: r3(Math.max(g.z, 0.001)), hoehe: r3(Math.max(g.y, 0.001)) };
  }

  /** Höhe im Spiel (m) */
  get spielHoehe() {
    if (this.hoeheAuto || !(this.eintrag?.zielHoehe > 0)) return this.masse()?.hoehe ?? 1;
    return this.eintrag.zielHoehe;
  }

  /** Spiel-Grundfläche (Kacheln) */
  grundflaeche() {
    const m = this.masse();
    if (!m) return { b: 1, h: 1 };
    return fussabdruck({ ...this.eintrag, masse: m, zielHoehe: this.spielHoehe });
  }

  #einpassen(kamera) {
    const box = this.box();
    if (box.isEmpty()) return;
    const g = box.getSize(new THREE.Vector3());
    const mitte = box.getCenter(new THREE.Vector3());
    const fl = this.grundflaeche();
    const s = Math.min((fl.b * 0.96) / (g.x || 1), (fl.h * 0.96) / (g.z || 1), this.spielHoehe / (g.y || 1));
    this.anzeige.scale.setScalar(s);
    this.anzeige.position.set(-mitte.x * s, -box.min.y * s, -mitte.z * s);
    this.massstab = s;
    this.fuss.scale.set(fl.b, 1, fl.h);
    this.fussFlaeche.scale.set(fl.b, 1, fl.h);
    this.figur.position.set(-(fl.b / 2) - 0.6, 0, 0);
    if (this.gewaehlt) this.#zeigeHuelle();
    if (kamera) {
      const d = Math.max(fl.b, fl.h, this.spielHoehe, FIGUR_HOEHE) * 1.9 + 1;
      this.orbit.target.set(0, Math.min(this.spielHoehe, 3) * 0.45, 0);
      this.kamera.position.set(d * 0.75, d * 0.55, d * 0.95);
      this.kamera.near = d / 500;
      this.kamera.far = d * 60;
      this.kamera.updateProjectionMatrix();
    }
  }

  /** Anzeige neu einpassen (nach Änderung von Höhe/Grundfläche) */
  einpassen(kamera = false) {
    this.#einpassen(kamera);
  }

  // ---------- Teile ----------
  /** Baum aller Knoten: [{ uuid, name, art: 'mesh'|'knoten'|'knochen', tiefe, sichtbar, dreiecke }] */
  teile() {
    const liste = [];
    const lauf = (o, tiefe) => {
      for (const k of o.children) {
        const dreiecke = k.isMesh ? (k.geometry.index ? k.geometry.index.count : k.geometry.attributes.position.count) / 3 : 0;
        liste.push({ uuid: k.uuid, name: k.name || (k.isMesh ? 'Teil' : 'Knoten'), art: k.isBone ? 'knochen' : k.isMesh ? 'mesh' : 'knoten', tiefe, sichtbar: k.visible, dreiecke: Math.round(dreiecke) });
        lauf(k, tiefe + 1);
      }
    };
    lauf(this.modell, 0);
    return liste;
  }

  /** Teil per uuid oder Name (KI) */
  teil(ref) {
    if (!ref) return null;
    if (this.pool.has(ref) && this.#imBaum(this.pool.get(ref))) return this.pool.get(ref);
    let t = null;
    this.modell.traverse((o) => {
      if (!t && o !== this.modell && o.name === ref) t = o;
    });
    if (!t) throw new Error(`Teil „${ref}“ nicht gefunden (teile: ${this.teile().map((x) => x.name).slice(0, 30).join(', ')})`);
    return t;
  }

  waehle(ref) {
    this.gewaehlt = ref ? this.teil(ref) : null;
    if (this.gewaehlt) this.gizmo.attach(this.gewaehlt);
    else this.gizmo.detach();
    this.#zeigeHuelle();
    this.beiAuswahl?.(this.gewaehlt);
  }

  #zeigeHuelle() {
    this.huelle.visible = !!this.gewaehlt;
    if (this.gewaehlt) this.huelle.box.setFromObject(this.gewaehlt, true);
  }

  setzeGizmo(modus) {
    this.gizmo.setMode(modus);
  }

  setzeRasterSchritt(an) {
    this.gizmo.setTranslationSnap(an ? 0.1 / (this.massstab || 1) : null);
    this.gizmo.setRotationSnap(an ? THREE.MathUtils.degToRad(15) : null);
    this.gizmo.setScaleSnap(an ? 0.1 : null);
  }

  lage(ref) {
    const o = this.teil(ref);
    const e = new THREE.Euler().setFromQuaternion(o.quaternion, 'XYZ');
    return { position: o.position.toArray().map(r3), drehung: [grad(e.x), grad(e.y), grad(e.z)], groesse: o.scale.toArray().map(r3) };
  }

  /** Lage setzen: position [x,y,z] (Modell-Einheiten), drehung [x,y,z] Grad, groesse [x,y,z] Faktor – fehlende Teile bleiben */
  setzeLage(ref, { position, drehung, groesse } = {}) {
    const o = this.teil(ref);
    return this.#schritt('Lage', () => {
      const z = (a, alt) => (Array.isArray(a) ? a.map((v, i) => (Number.isFinite(Number(v)) ? Number(v) : alt[i])) : alt);
      if (position) o.position.fromArray(z(position, o.position.toArray()));
      if (drehung) {
        const e = new THREE.Euler().setFromQuaternion(o.quaternion, 'XYZ');
        const d = z(drehung, [grad(e.x), grad(e.y), grad(e.z)]).map((g) => THREE.MathUtils.degToRad(g));
        o.quaternion.setFromEuler(new THREE.Euler(d[0], d[1], d[2], 'XYZ'));
      }
      if (groesse) o.scale.fromArray(z(groesse, o.scale.toArray()).map((v) => (Math.abs(v) < 0.001 ? 0.001 : v)));
    });
  }

  #teilEinbauen(form, { groesse, position, drehung, farbe = '#b0b4ba', name, eltern = null } = {}) {
    const vorgabe = GRUNDKOERPER[form];
    if (!vorgabe) throw new Error(`Unbekannter Grundkörper „${form}“ (${Object.keys(GRUNDKOERPER).join(', ')})`);
    const mesh = new THREE.Mesh(grundGeometrie(form), new THREE.MeshStandardMaterial({ color: new THREE.Color(farbe), roughness: 0.8, metalness: 0 }));
    const g = groesse ?? vorgabe.groesse;
    mesh.scale.set(...g.map((v) => Math.max(0.001, Number(v) || 1)));
    mesh.position.set(...(position ?? [0, g[1] / 2, 0]).map((v) => Number(v) || 0));
    if (drehung) mesh.rotation.set(...drehung.map((d) => THREE.MathUtils.degToRad(Number(d) || 0)));
    mesh.material.name = `${vorgabe.name}-Material`;
    const vorhandene = [];
    this.modell.traverse((o) => vorhandene.push(o.name));
    mesh.name = knotenName(name || vorgabe.name, vorhandene);
    (eltern ? this.teil(eltern) : this.modell).add(mesh);
    return mesh;
  }

  /** Grundkörper anfügen. @returns Name des neuen Teils */
  teilHinzu(form, optionen = {}) {
    const m = this.#schritt(`${GRUNDKOERPER[form]?.name ?? form} angefügt`, () => this.#teilEinbauen(form, optionen));
    this.waehle(m.uuid);
    return m.name;
  }

  teilDuplizieren(ref) {
    const o = this.teil(ref);
    const k = this.#schritt('Dupliziert', () => {
      const kopie = o.clone(true);
      const vorhandene = [];
      this.modell.traverse((x) => vorhandene.push(x.name));
      kopie.traverse((x) => {
        if (x.name) x.name = knotenName(x.name, vorhandene);
        vorhandene.push(x.name);
      });
      kopie.position.x += (new THREE.Box3().setFromObject(o).getSize(new THREE.Vector3()).x || 1) / (this.massstab || 1) * 0.6;
      o.parent.add(kopie);
      return kopie;
    });
    this.waehle(k.uuid);
    return k.name;
  }

  teilLoeschen(ref) {
    const o = this.teil(ref);
    if (this.gewaehlt === o) this.waehle(null);
    this.#schritt('Gelöscht', () => o.removeFromParent());
    if (this.box().isEmpty()) this.#einpassen(false);
  }

  teilUmbenennen(ref, name) {
    const o = this.teil(ref);
    const vorhandene = [];
    this.modell.traverse((x) => x !== o && vorhandene.push(x.name));
    const alt = o.name;
    const neu = knotenName(name, vorhandene);
    this.#schritt('Umbenannt', () => {
      o.name = neu;
      // Animations-Spuren ziehen mit (neue Clip-Objekte → Undo bleibt sauber)
      this.clips = this.clips.map((c) => {
        if (!c.tracks.some((t) => t.name.startsWith(`${alt}.`))) return c;
        const n = new THREE.AnimationClip(c.name, c.duration, c.tracks.map((t) => {
          if (!t.name.startsWith(`${alt}.`)) return t;
          const k = t.clone();
          k.name = `${neu}${t.name.slice(alt.length)}`;
          return k;
        }));
        this.alleClips.set(n.uuid, n);
        return n;
      });
    });
    return neu;
  }

  teilSichtbar(ref, sichtbar) {
    const o = this.teil(ref);
    this.#schritt(sichtbar ? 'Eingeblendet' : 'Ausgeblendet (fehlt beim Speichern)', () => (o.visible = !!sichtbar));
  }

  /** Teil an ein anderes hängen (Lage bleibt) – eltern null = direkt ans Modell */
  teilAnhaengen(ref, eltern) {
    const o = this.teil(ref);
    const p = eltern ? this.teil(eltern) : this.modell;
    if (p === o || (p !== this.modell && o.getObjectById(p.id))) throw new Error('Ein Teil kann nicht an sich selbst/ein eigenes Kind');
    this.#schritt('Angehängt', () => p.attach(o));
  }

  /** Anderes Modell (glb) als Teil einfügen – auf die Höhe `anteil` × aktuelle Modellhöhe gebracht */
  async modellEinfuegen(bytes, name = 'Einfuegung', anteil = 0.5) {
    const puffer = bytes instanceof ArrayBuffer ? bytes : bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    const gltf = await new GLTFLoader().parseAsync(puffer, '');
    const g = new THREE.Group();
    g.add(...gltf.scene.children);
    const neuBox = new THREE.Box3().setFromObject(g);
    const hoehe = neuBox.getSize(new THREE.Vector3()).y || 1;
    const ziel = (this.masse()?.hoehe ?? 1) * anteil;
    g.scale.setScalar(ziel / hoehe);
    const box = this.box();
    g.position.set(box.isEmpty() ? 0 : box.max.x + (neuBox.getSize(new THREE.Vector3()).x * ziel) / hoehe / 2, (-neuBox.min.y * ziel) / hoehe + (box.isEmpty() ? 0 : box.min.y), 0);
    const vorhandene = [];
    this.modell.traverse((x) => vorhandene.push(x.name));
    g.name = knotenName(name, vorhandene);
    for (const c of gltf.animations ?? []) this.alleClips.set(c.uuid, c);
    this.#schritt('Modell eingefügt', () => this.modell.add(g));
    this.waehle(g.uuid);
    return g.name;
  }

  // ---------- Ganzes Modell ----------
  #ganz(was, m) {
    this.#schritt(was, () => {
      for (const k of [...this.modell.children]) k.applyMatrix4(m);
    });
  }

  drehen(achse = 'y', winkel = 90) {
    const a = { x: new THREE.Vector3(1, 0, 0), y: new THREE.Vector3(0, 1, 0), z: new THREE.Vector3(0, 0, 1) }[achse];
    if (!a) throw new Error('Achse x, y oder z');
    this.#ganz(`Gedreht ${winkel}° um ${achse}`, new THREE.Matrix4().makeRotationAxis(a, THREE.MathUtils.degToRad(winkel)));
  }

  spiegeln(achse = 'x') {
    const s = { x: [-1, 1, 1], y: [1, -1, 1], z: [1, 1, -1] }[achse];
    if (!s) throw new Error('Achse x, y oder z');
    this.#ganz(`Gespiegelt (${achse})`, new THREE.Matrix4().makeScale(...s));
  }

  /** Ursprung unten mittig (für Modelle, die woanders wiederverwendet werden; im Spiel ohne Wirkung) */
  ursprungUntenMitte() {
    const b = this.box();
    if (b.isEmpty()) return;
    const c = b.getCenter(new THREE.Vector3());
    this.#ganz('Ursprung unten mittig', new THREE.Matrix4().makeTranslation(-c.x, -b.min.y, -c.z));
  }

  // ---------- Materialien ----------
  /** [{ uuid, name, farbe '#rrggbb', rauheit, metall, textur (bool), teile }] – nur sichtbare */
  materialien() {
    const nutzung = new Map();
    this.modell.traverseVisible((o) => {
      if (o.isMesh) for (const m of [].concat(o.material)) nutzung.set(m.uuid, (nutzung.get(m.uuid) ?? 0) + 1);
    });
    return this.#materialien(true).map((m) => ({ uuid: m.uuid, name: m.name || 'Material', farbe: m.color ? `#${m.color.getHexString()}` : null, rauheit: r3(m.roughness ?? 1), metall: r3(m.metalness ?? 0), textur: !!m.map, teile: nutzung.get(m.uuid) ?? 0 }));
  }

  #material(ref) {
    const alle = this.#materialien(true);
    const m = alle.find((x) => x.uuid === ref) ?? alle.find((x) => x.name === ref);
    if (!m) {
      // Teil-Name → dessen (erstes) Material
      const t = this.teil(ref);
      const mat = t.isMesh ? [].concat(t.material)[0] : null;
      if (!mat) throw new Error(`Material „${ref}“ nicht gefunden`);
      return mat;
    }
    return m;
  }

  /** Material ändern: { farbe '#rrggbb', rauheit 0–1, metall 0–1 } – ref = Material-uuid/-Name oder Teil-Name */
  setzeMaterial(ref, { farbe, rauheit, metall } = {}) {
    const m = this.#material(ref);
    this.#schritt('Material', () => {
      if (farbe && m.color) m.color.set(farbe);
      if (Number.isFinite(Number(rauheit)) && rauheit !== null && rauheit !== '' && 'roughness' in m) m.roughness = Math.min(1, Math.max(0, Number(rauheit)));
      if (Number.isFinite(Number(metall)) && metall !== null && metall !== '' && 'metalness' in m) m.metalness = Math.min(1, Math.max(0, Number(metall)));
    });
  }

  /** Teil bekommt ein EIGENES Material (vorher teilen sich evtl. mehrere Teile eins) */
  eigenesMaterial(ref) {
    const t = this.teil(ref);
    if (!t.isMesh) throw new Error('Nur Teile mit Geometrie haben Materialien');
    this.#schritt('Eigenes Material', () => {
      t.material = Array.isArray(t.material) ? t.material.map((m) => m.clone()) : t.material.clone();
      for (const m of [].concat(t.material)) m.name = `${t.name}-Material`;
    });
  }

  /** Textur setzen (HTMLImageElement/Canvas/ImageBitmap) oder entfernen (null) */
  setzeTextur(ref, bild) {
    const m = this.#material(ref);
    this.#schritt(bild ? 'Textur ersetzt' : 'Textur entfernt', () => {
      if (bild) {
        const t = new THREE.Texture(bild);
        t.flipY = false; // glTF-Konvention
        t.colorSpace = THREE.SRGBColorSpace;
        t.wrapS = t.wrapT = THREE.RepeatWrapping;
        t.needsUpdate = true;
        m.map = t;
        if (m.color) m.color.set(0xffffff);
      } else m.map = null;
      m.needsUpdate = true;
    });
  }

  /** Farbton des ganzen Modells verschieben (grad −180…180, Sättigung/Helligkeit als Faktor) */
  farbton(gradzahl = 0, saettigung = 1, helligkeit = 1) {
    this.#schritt('Farbton', () => {
      for (const m of this.#materialien(true)) {
        if (!m.color) continue;
        const [r, g, b] = farbtonDrehen([m.color.r, m.color.g, m.color.b], gradzahl, saettigung, helligkeit);
        m.color.setRGB(r, g, b);
      }
    });
  }

  // ---------- Animation ----------
  animationen() {
    return this.clips.map((c) => ({ name: c.name, dauer: r3(c.duration), spuren: c.tracks.length, leerlauf: c.name === this.leerlauf }));
  }

  /** Knoten, den „ganzes Modell“-Animationen bewegen: das einzige Kind oder eine neue Hülle „Wurzel“ */
  #wurzelKnoten() {
    if (this.modell.children.length === 1 && !this.modell.children[0].isMesh) return this.modell.children[0];
    const w = new THREE.Group();
    const vorhandene = [];
    this.modell.traverse((o) => vorhandene.push(o.name));
    w.name = knotenName('Wurzel', vorhandene);
    w.add(...this.modell.children);
    this.modell.add(w);
    return w;
  }

  /**
   * Einfache Animation (editor/kern/animation.js): art drehen|wippen|pendeln|pulsieren|flackern, teil (Name/uuid, leer = ganzes
   * Modell), dauer s, staerke (° / Einheiten / Faktor), achse x|y|z, leerlauf = im Spiel als Schleife abspielen. @returns Clip-Name
   */
  animationHinzu({ art = 'drehen', teil = null, dauer = 2, staerke, achse = 'y', leerlauf = true } = {}) {
    if (!ANIMATIONS_ARTEN[art]) throw new Error(`Animation: ${Object.keys(ANIMATIONS_ARTEN).join(', ')}`);
    this.stoppeAnimation();
    return this.#schritt('Animation', () => {
      const ziel = teil ? this.teil(teil) : this.#wurzelKnoten();
      if (!ziel.name || this.modell.getObjectByName(ziel.name) !== ziel) {
        const vorhandene = [];
        this.modell.traverse((o) => o !== ziel && vorhandene.push(o.name));
        ziel.name = knotenName(ziel.name || 'Teil', vorhandene);
      }
      const b = baueAnimation(art, { knoten: ziel.name, dauer, staerke, achse, basis: { position: ziel.position.toArray(), quaternion: ziel.quaternion.toArray(), scale: ziel.scale.toArray() } });
      const spuren = b.spuren.map((s) => (s.name.endsWith('.quaternion') ? new THREE.QuaternionKeyframeTrack(s.name, s.zeiten, s.werte) : new THREE.VectorKeyframeTrack(s.name, s.zeiten, s.werte)));
      let name = b.name;
      for (let n = 2; this.clips.some((c) => c.name === name); n++) name = `${b.name} ${n}`;
      const clip = new THREE.AnimationClip(name, b.dauer, spuren);
      this.alleClips.set(clip.uuid, clip);
      this.clips = [...this.clips, clip];
      if (leerlauf) this.leerlauf = clip.name;
      return clip.name;
    });
  }

  animationLoeschen(name) {
    if (!this.clips.some((c) => c.name === name)) throw new Error(`Animation „${name}“ gibt es nicht`);
    this.stoppeAnimation();
    this.#schritt('Animation gelöscht', () => {
      this.clips = this.clips.filter((c) => c.name !== name);
      if (this.leerlauf === name) this.leerlauf = '';
    });
  }

  setzeLeerlauf(name) {
    if (name && !this.clips.some((c) => c.name === name)) throw new Error(`Animation „${name}“ gibt es nicht`);
    this.#schritt('Leerlauf', () => (this.leerlauf = name || ''));
  }

  spieleAnimation(name) {
    this.stoppeAnimation();
    const clip = this.clips.find((c) => c.name === name);
    if (!clip) throw new Error(`Animation „${name}“ gibt es nicht`);
    this.pose = this.stand();
    this.mischer = new THREE.AnimationMixer(this.modell);
    this.mischer.clipAction(clip).play();
    this.laeuft = name;
    this.uhr.getDelta();
  }

  stoppeAnimation() {
    if (!this.mischer) return;
    this.mischer.stopAllAction();
    this.mischer = null;
    this.laeuft = null;
    if (this.pose) this.setzeStand(this.pose);
    this.pose = null;
  }

  // ---------- Info, Export, Bilder ----------
  info() {
    let dreiecke = 0;
    let teile = 0;
    this.modell.traverseVisible((o) => {
      if (!o.isMesh) return;
      teile++;
      dreiecke += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3;
    });
    return { knochen: this.knochen().length, masse: this.masse(), spielHoehe: r3(this.spielHoehe), grundflaeche: this.grundflaeche(), dreiecke: Math.round(dreiecke), teile, materialien: this.materialien().length, animationen: this.clips.length, leerlauf: this.leerlauf || null, einheitInMetern: r3(this.massstab || 1) };
  }

  /** .glb (Uint8Array) – nur sichtbare Teile, mit Animationen */
  async exportiere() {
    this.stoppeAnimation();
    if (!this.modell.children.some((k) => k.visible)) throw new Error('Das Modell ist leer');
    // Spuren auf ausgeblendete/gelöschte Teile weglassen (der Exporter warnt sonst und bricht teils ab)
    const clips = this.clips
      .map((c) => new THREE.AnimationClip(c.name, c.duration, c.tracks.filter((t) => {
        const ziel = this.modell.getObjectByName(THREE.PropertyBinding.parseTrackName(t.name).nodeName);
        let sichtbar = !!ziel;
        for (let p = ziel; p && sichtbar; p = p.parent) sichtbar = p.visible;
        return sichtbar;
      })))
      .filter((c) => c.tracks.length);
    const ergebnis = await new GLTFExporter().parseAsync(this.modell, { binary: true, onlyVisible: true, animations: clips });
    return new Uint8Array(ergebnis);
  }

  /** Vorschaubild (PNG-Bytes, 256 × 256) im Stil der vorhandenen Vorschaubilder */
  async vorschauPng(groesse = 256) {
    this.vorschauRenderer ??= new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true, alpha: true });
    const r = this.vorschauRenderer;
    r.setSize(groesse, groesse);
    r.outputColorSpace = THREE.SRGBColorSpace;
    const s = new THREE.Scene();
    s.add(new THREE.HemisphereLight(0xffffff, 0x404040, 2.2));
    const licht = new THREE.DirectionalLight(0xffffff, 1.2);
    licht.position.set(3, 5, 4);
    s.add(licht);
    const eltern = this.anzeige.parent;
    s.add(this.anzeige);
    const box = new THREE.Box3().setFromObject(this.anzeige);
    const g = box.getSize(new THREE.Vector3());
    const c = box.getCenter(new THREE.Vector3());
    const k = new THREE.PerspectiveCamera(35, 1, 0.01, 1000);
    const d = Math.max(g.x, g.y, g.z) * 2.1;
    k.position.set(c.x + d * 0.7, c.y + d * 0.5, c.z + d * 0.9);
    k.lookAt(c);
    r.render(s, k);
    eltern.add(this.anzeige);
    const blob = await new Promise((ok) => r.domElement.toBlob(ok, 'image/png'));
    return new Uint8Array(await blob.arrayBuffer());
  }

  /** Bildschirmfoto der Bühne (PNG base64 ohne Kopf) – für die KI */
  bild() {
    this.renderer.render(this.szene, this.kamera);
    return this.renderer.domElement.toDataURL('image/png').split(',')[1];
  }

  /** Kamera: von 'vorne' | 'seite' | 'oben' | 'schraeg' */
  blick(richtung = 'schraeg') {
    const fl = this.grundflaeche();
    const d = Math.max(fl.b, fl.h, this.spielHoehe, FIGUR_HOEHE) * 1.9 + 1;
    const y = Math.min(this.spielHoehe, 3) * 0.45;
    const p = { vorne: [0, y, d * 1.2], seite: [d * 1.2, y, 0], oben: [0.001, d * 1.4, 0.001], schraeg: [d * 0.75, d * 0.55, d * 0.95] }[richtung];
    if (!p) throw new Error('Blick: vorne, seite, oben, schraeg');
    this.orbit.target.set(0, y, 0);
    this.kamera.position.set(...p);
    this.orbit.update();
  }

  setzeHilfen({ raster, figur, fuss, drahtgitter } = {}) {
    if (raster !== undefined) this.raster.visible = raster;
    if (figur !== undefined) this.figur.visible = figur;
    if (fuss !== undefined) this.fuss.visible = this.fussFlaeche.visible = fuss;
    if (drahtgitter !== undefined) {
      this.drahtgitter = drahtgitter;
      for (const m of this.#materialien()) m.wireframe = drahtgitter;
    }
  }

  // ---------- Zeiger: Klick wählt ein Teil/Knochen, Malmodus malt ----------
  #strahl(e) {
    const r = this.leinwand.getBoundingClientRect();
    const strahl = new THREE.Raycaster();
    strahl.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), this.kamera);
    return strahl;
  }

  #treffeModell(e) {
    const ziele = [];
    this.modell.traverseVisible((o) => o.isMesh && ziele.push(o));
    return this.#strahl(e).intersectObjects(ziele, false)[0] ?? null;
  }

  #zeiger() {
    let start = null;
    this.leinwand.addEventListener('pointerdown', (e) => {
      start = e.button === 0 ? [e.clientX, e.clientY] : null;
      if (!this.malModus || e.button !== 0) return;
      const t = this.#treffeModell(e);
      if (!t?.uv) return; // daneben oder Teil ohne UV → Kamera dreht wie gewohnt
      e.stopImmediatePropagation();
      this.orbit.enabled = false;
      this.#strichStart(t);
      this.leinwand.setPointerCapture(e.pointerId);
    }, true);
    this.leinwand.addEventListener('pointermove', (e) => {
      if (!this.strich) return;
      const t = this.#treffeModell(e);
      if (t?.uv && t.object === this.strich.mesh) this.#strichPunkt(t.uv);
    });
    this.leinwand.addEventListener('pointerup', (e) => {
      if (this.strich) {
        this.#strichEnde();
        this.orbit.enabled = true;
        start = null;
        return;
      }
      if (!start || Math.hypot(e.clientX - start[0], e.clientY - start[1]) > 4 || this.gizmo.dragging) return;
      const kn = this.#strahl(e).intersectObjects(this.knochenAnzeige.children, false)[0];
      if (kn) return this.waehle(kn.object.userData.knoten);
      const t = this.#treffeModell(e);
      this.waehle(t ? t.object.uuid : null);
    });
  }

  // ---------- Malen (Phase 4.10) ----------
  setzeMalen({ an, farbe, groesse, deckkraft } = {}) {
    if (an !== undefined) this.malModus = !!an;
    this.malPinsel = { farbe: farbe ?? this.malPinsel?.farbe ?? '#7a0d0d', groesse: groesse ?? this.malPinsel?.groesse ?? 24, deckkraft: deckkraft ?? this.malPinsel?.deckkraft ?? 0.8 };
    if (this.malModus) this.gizmo.detach();
  }

  #strichStart(treffer) {
    this.stoppeAnimation();
    const mat = [].concat(treffer.object.material)[treffer.face?.materialIndex ?? 0] ?? [].concat(treffer.object.material)[0];
    const vorher = this.stand();
    const l = neueLeinwand(mat);
    this.strich = { vorher, mesh: treffer.object, ...l };
    this.#strichPunkt(treffer.uv);
  }

  #strichPunkt(uv) {
    const p = this.malPinsel ?? {};
    pinsel(this.strich.ctx, uv.x, uv.y, { ...p, groesse: (p.groesse ?? 24) * (this.strich.canvas.width / 512) });
    this.strich.textur.needsUpdate = true;
  }

  #strichEnde() {
    const s = this.strich;
    this.strich = null;
    this.#merkePool();
    this.#merke(s.vorher);
    this.#geaendert('Gemalt');
  }

  /** Malen per Programm/KI: Teil + UV-Punkte [[u, v] …] (0..1), Pinsel { farbe, groesse (px bei 512), deckkraft } */
  maleUv(ref, punkte, opt = {}) {
    const t = this.teil(ref);
    if (!t.isMesh || !t.geometry.attributes.uv) throw new Error('Teil hat keine UV-Koordinaten (nicht bemalbar) – Effekte/Farbe nutzen');
    return this.#schritt('Gemalt', () => {
      const { ctx, canvas, textur } = neueLeinwand([].concat(t.material)[0]);
      for (const [u, v] of punkte) pinsel(ctx, u, v, { ...opt, groesse: (opt.groesse ?? 24) * (canvas.width / 512) });
      textur.needsUpdate = true;
    });
  }

  /**
   * Textur-Effekt (dunkler, dreck, blut, rost, moos, verblassen, rauschen, faerben) auf ein Material (uuid/Name/Teil-Name)
   * oder alle sichtbaren (ref leer). Materialien von Teilen ohne UV bekommen nur dunkler/faerben über die Farbe.
   */
  texturEffekt(ref, art, { staerke = 0.5, farbe, saat = 7 } = {}) {
    if (!EFFEKTE[art]) throw new Error(`Effekt: ${Object.keys(EFFEKTE).join(', ')}`);
    this.stoppeAnimation();
    const mitUv = new Set();
    this.modell.traverseVisible((o) => o.isMesh && o.geometry.attributes.uv && [].concat(o.material).forEach((m) => mitUv.add(m.uuid)));
    const mats = ref ? [this.#material(ref)] : this.#materialien(true);
    let n = 0;
    this.#schritt(`Effekt ${EFFEKTE[art]}`, () => {
      for (const m of mats) {
        if (mitUv.has(m.uuid)) {
          const { ctx, textur } = neueLeinwand(m);
          effekt(ctx, art, { staerke, farbe, saat: saat + n });
          textur.needsUpdate = true;
          n++;
        } else if (m.color && (art === 'dunkler' || art === 'faerben' || art === 'verblassen')) {
          const [r, g, b] = art === 'dunkler' ? [1 - staerke * 0.75, 1 - staerke * 0.78, 1 - staerke * 0.72] : art === 'faerben' ? new THREE.Color(farbe ?? '#5a7a3a').toArray().map((c) => 1 - staerke + c * staerke) : [1, 1, 1];
          if (art === 'verblassen') {
            const grau = m.color.r * 0.3 + m.color.g * 0.59 + m.color.b * 0.11;
            m.color.lerp(new THREE.Color(grau, grau, grau), staerke);
          } else m.color.multiply(new THREE.Color(r, g, b));
          n++;
        }
      }
    });
    return n;
  }

  // ---------- Knochen & Gelenke (Phase 4.10) ----------
  /** Knochen = Knoten mit userData.knochen { laenge } (auch importierte THREE.Bone) → [{ uuid, name, laenge, eltern, kinder: [Teilnamen] }] */
  knochen() {
    const liste = [];
    this.modell.traverse((o) => {
      if (!o.userData.knochen && !o.isBone) return;
      liste.push({ uuid: o.uuid, name: o.name, laenge: this.#laenge(o), eltern: o.parent === this.modell ? null : o.parent?.name ?? null, kinder: o.children.filter((k) => !k.userData.knochen && !k.isBone).map((k) => k.name) });
    });
    return liste;
  }

  #laenge(o) {
    if (o.userData.knochen) return o.userData.knochen.laenge;
    const kind = o.children.find((k) => k.isBone);
    return kind ? kind.position.length() : 0.1;
  }

  /**
   * Knochen anlegen. an = Knochen (→ Kind am Ende: Kette), Teil (→ Knochen unten in dessen Mitte, Teil hängt daran) oder leer
   * (Wurzel am Modell). kante = Gelenk an einer Teil-Kante statt unten mittig: oben, unten, links, rechts, vorne, hinten, mitte.
   * @returns Name
   */
  knochenHinzu({ an = null, name = null, laenge = null, kante = 'unten' } = {}) {
    this.stoppeAnimation();
    const ziel = an ? this.teil(an) : null;
    const istKnochen = ziel && (ziel.userData.knochen || ziel.isBone);
    const vorhandene = [];
    this.modell.traverse((o) => vorhandene.push(o.name));
    const k = new THREE.Group();
    k.name = knotenName(name || (istKnochen ? `${ziel.name}_kind` : ziel ? `${ziel.name}_gelenk` : 'Wurzel'), vorhandene);
    const r = this.#schritt('Knochen', () => {
      if (istKnochen) {
        k.userData.knochen = { laenge: Number(laenge) > 0 ? Number(laenge) : this.#laenge(ziel) * 0.8 };
        k.position.set(0, this.#laenge(ziel), 0);
        ziel.add(k);
      } else if (ziel) {
        // Gelenk an der Kante des Teils (Bounding-Box im Eltern-Raum), das Teil hängt danach am Gelenk (Lage bleibt)
        const p = ziel.parent;
        p.updateMatrixWorld(true);
        const inv = new THREE.Matrix4().copy(p.matrixWorld).invert();
        const box = new THREE.Box3().setFromObject(ziel, true).applyMatrix4(inv);
        const m = box.getCenter(new THREE.Vector3());
        const g = box.getSize(new THREE.Vector3());
        const pos = { unten: [m.x, box.min.y, m.z], oben: [m.x, box.max.y, m.z], links: [box.min.x, m.y, m.z], rechts: [box.max.x, m.y, m.z], vorne: [m.x, m.y, box.max.z], hinten: [m.x, m.y, box.min.z], mitte: [m.x, m.y, m.z] }[kante];
        if (!pos) throw new Error('kante: oben, unten, links, rechts, vorne, hinten, mitte');
        k.position.fromArray(pos);
        k.userData.knochen = { laenge: Number(laenge) > 0 ? Number(laenge) : standardLaenge(g.y) };
        p.add(k);
        k.updateMatrixWorld(true);
        k.attach(ziel);
      } else {
        const box = this.box();
        k.position.set(box.isEmpty() ? 0 : (box.min.x + box.max.x) / 2, box.isEmpty() ? 0 : box.min.y, box.isEmpty() ? 0 : (box.min.z + box.max.z) / 2);
        k.userData.knochen = { laenge: Number(laenge) > 0 ? Number(laenge) : standardLaenge(box.isEmpty() ? 1 : box.getSize(new THREE.Vector3()).y * 0.5) };
        this.modell.add(k);
      }
      return k.name;
    });
    this.waehle(k.uuid);
    return r;
  }

  /** Teil starr an einen Knochen binden (Lage bleibt) */
  knochenBinden(knochenRef, teilRef) {
    const k = this.teil(knochenRef);
    if (!k.userData.knochen && !k.isBone) throw new Error(`„${knochenRef}“ ist kein Knochen`);
    this.teilAnhaengen(teilRef, k.uuid);
  }

  knochenLaenge(ref, laenge) {
    const k = this.teil(ref);
    if (!k.userData.knochen) throw new Error('Nur eigene Knochen haben eine einstellbare Länge');
    this.#schritt('Knochenlänge', () => (k.userData.knochen = { ...k.userData.knochen, laenge: Math.max(KNOCHEN_MIN, Number(laenge) || KNOCHEN_MIN) }));
  }

  /** Knochen entfernen – Kinder (Teile, Kind-Knochen) wandern zum Eltern-Knoten, Lage bleibt */
  knochenLoeschen(ref) {
    const k = this.teil(ref);
    if (!k.userData.knochen) throw new Error('Nur eigene Knochen/Gelenke lassen sich löschen');
    if (this.gewaehlt === k) this.waehle(null);
    this.#schritt('Knochen gelöscht', () => {
      const p = k.parent;
      for (const kind of [...k.children]) p.attach(kind);
      k.removeFromParent();
    });
  }

  setzeKnochenAnzeige(an) {
    this.knochenSichtbar = !!an;
  }

  /** Oktaeder-Knochen (Blender-Look) über dem Modell – NICHT im Modell (wird nicht exportiert), jedes Bild nachgeführt */
  #zeigeKnochen() {
    if (!this.knochenAnzeige) {
      this.knochenAnzeige = new THREE.Group();
      this.knochenAnzeige.name = '__knochen';
      this.szene.add(this.knochenAnzeige);
      const f = knochenForm(1); // Einheits-Knochen, je Knochen auf Weltlänge skaliert (importierte Skelette sind oft ×100 skaliert)
      this.knochenGeo = new THREE.BufferGeometry();
      this.knochenGeo.setAttribute('position', new THREE.Float32BufferAttribute(f.punkte, 3));
      this.knochenGeo.setIndex(f.dreiecke);
    }
    const liste = [];
    if (this.knochenSichtbar !== false) this.modell.traverseVisible((o) => (o.userData.knochen || o.isBone) && liste.push(o));
    const g = this.knochenAnzeige;
    while (g.children.length < liste.length) {
      const m = new THREE.Mesh(this.knochenGeo, new THREE.MeshBasicMaterial({ color: 0x9fb7d6, transparent: true, opacity: 0.55, depthTest: false }));
      m.renderOrder = 20;
      g.add(m);
    }
    while (g.children.length > liste.length) g.remove(g.children.at(-1));
    if (!liste.length) return;
    this.modell.updateMatrixWorld(true);
    const p = new THREE.Vector3();
    const q = new THREE.Quaternion();
    const sk = new THREE.Vector3();
    const kindPos = new THREE.Vector3();
    liste.forEach((o, i) => {
      const m = g.children[i];
      o.matrixWorld.decompose(p, q, sk);
      let laenge;
      const kind = o.isBone ? o.children.find((k) => k.isBone) : null;
      const h = this.spielHoehe || 1;
      if (kind) laenge = kindPos.setFromMatrixPosition(kind.matrixWorld).distanceTo(p);
      else if (o.isBone) laenge = h * 0.04; // End-Knochen importierter Skelette: Skalierung des Armatures ist meist ×100 → feste kleine Länge
      else laenge = Math.max(KNOCHEN_MIN, this.#laenge(o)) * sk.y;
      laenge = Math.min(Math.max(laenge, h * 0.01), h * 0.6);
      m.position.copy(p);
      m.quaternion.copy(q);
      if (kind) {
        // importierte Knochen zeigen zum Kind-Knochen (nicht zwingend entlang y)
        const richtung = kindPos.clone().sub(p).normalize();
        m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), richtung);
      }
      m.scale.setScalar(laenge);
      m.userData.knoten = o.uuid;
      m.material.color.setHex(this.gewaehlt === o ? 0xffd23f : 0x9fb7d6);
    });
  }

  // ---------- Eigene Keyframe-Animation (Phase 4.10) ----------
  /** Leeren Clip anlegen (Dauer in s) → Name */
  clipNeu(name = 'Eigene Animation', dauer = 2) {
    let n = String(name).trim() || 'Eigene Animation';
    for (let i = 2; this.clips.some((c) => c.name === n); i++) n = `${name} ${i}`;
    return this.#schritt('Neuer Clip', () => {
      const c = new THREE.AnimationClip(n, Math.max(0.1, Number(dauer) || 2), []);
      this.alleClips.set(c.uuid, c);
      this.clips = [...this.clips, c];
      return n;
    });
  }

  #clip(name) {
    const c = this.clips.find((x) => x.name === name);
    if (!c) throw new Error(`Animation „${name}“ gibt es nicht`);
    return c;
  }

  /**
   * Keyframe: aktuelle Lage der Knoten (Namen/uuids; leer = alle Knochen, sonst alle Teile) zur Zeit `zeit` in den Clip
   * schreiben (vorhandener Schlüssel zur selben Zeit wird ersetzt). Ablauf: Zeit wählen → Knochen drehen (Gizmo E) → Keyframe.
   */
  keyframeSetzen(clipName, zeit, knotenRefs = null) {
    const alt = this.#clip(clipName);
    let knoten = (knotenRefs?.length ? knotenRefs.map((r) => this.teil(r)) : null) ?? this.knochen().map((k) => this.pool.get(k.uuid));
    if (!knoten.length) knoten = this.modell.children.slice();
    const t = Math.max(0, Math.min(alt.duration, Number(zeit) || 0));
    return this.#schritt('Keyframe', () => {
      const spuren = new Map(alt.tracks.map((s) => [s.name, s]));
      for (const o of knoten) {
        if (!o.name) o.name = knotenName('Teil', []);
        for (const [eig, wert, Typ] of [['position', o.position.toArray(), THREE.VectorKeyframeTrack], ['quaternion', o.quaternion.toArray(), THREE.QuaternionKeyframeTrack], ['scale', o.scale.toArray(), THREE.VectorKeyframeTrack]]) {
          const nameSpur = `${o.name}.${eig}`;
          const vorher = spuren.get(nameSpur);
          const zeiten = vorher ? [...vorher.times] : [];
          const n = wert.length;
          const werte = vorher ? [...vorher.values] : [];
          const i = zeiten.findIndex((z) => Math.abs(z - t) < 1e-3);
          if (i >= 0) werte.splice(i * n, n, ...wert);
          else {
            const j = zeiten.findIndex((z) => z > t);
            const stelle = j < 0 ? zeiten.length : j;
            zeiten.splice(stelle, 0, t);
            werte.splice(stelle * n, 0, ...wert);
          }
          spuren.set(nameSpur, new Typ(nameSpur, zeiten, werte));
        }
      }
      const neu = new THREE.AnimationClip(alt.name, alt.duration, [...spuren.values()]);
      this.alleClips.set(neu.uuid, neu);
      this.clips = this.clips.map((c) => (c === alt ? neu : c));
      if (this.leerlauf === '' && this.clips.length) this.leerlauf = neu.name;
      return this.keyframeZeiten(alt.name);
    });
  }

  keyframeLoeschen(clipName, zeit) {
    const alt = this.#clip(clipName);
    const t = Number(zeit);
    this.#schritt('Keyframe gelöscht', () => {
      const spuren = [];
      for (const s of alt.tracks) {
        const i = [...s.times].findIndex((z) => Math.abs(z - t) < 1e-3);
        if (i < 0) {
          spuren.push(s);
          continue;
        }
        const n = s.getValueSize();
        const zeiten = [...s.times].filter((_, k) => k !== i);
        const werte = [...s.values].filter((_, k) => Math.floor(k / n) !== i);
        if (zeiten.length) spuren.push(new s.constructor(s.name, zeiten, werte));
      }
      const neu = new THREE.AnimationClip(alt.name, alt.duration, spuren);
      this.alleClips.set(neu.uuid, neu);
      this.clips = this.clips.map((c) => (c === alt ? neu : c));
    });
  }

  /** Alle Keyframe-Zeiten eines Clips (sortiert) */
  keyframeZeiten(clipName) {
    const c = this.#clip(clipName);
    return [...new Set(c.tracks.flatMap((s) => [...s.times].map((z) => Math.round(z * 1000) / 1000)))].sort((a, b) => a - b);
  }

  /** Pose des Clips zur Zeit t auf das Modell legen (zum Weiterbearbeiten – als Undo-Schritt) */
  zeigeZeit(clipName, zeit) {
    const c = this.#clip(clipName);
    this.stoppeAnimation();
    if (!c.tracks.length) return;
    this.#schritt('Zeit gewählt', () => {
      const m = new THREE.AnimationMixer(this.modell);
      m.clipAction(c).play();
      m.setTime(Math.max(0, Math.min(c.duration, Number(zeit) || 0)));
      m.stopAllAction(); // Pose bleibt auf den Knoten
      m.uncacheRoot(this.modell);
    });
  }

  clipDauer(clipName, dauer) {
    const alt = this.#clip(clipName);
    this.#schritt('Clip-Dauer', () => {
      const d = Math.max(0.1, Number(dauer) || alt.duration);
      const neu = new THREE.AnimationClip(alt.name, d, alt.tracks.map((s) => s.clone()));
      this.alleClips.set(neu.uuid, neu);
      this.clips = this.clips.map((c) => (c === alt ? neu : c));
    });
  }
}
