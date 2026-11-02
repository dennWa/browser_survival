import * as THREE from 'three';
import { GLTFLoader, GLTFExporter, OrbitControls, TransformControls } from '../../client/vendor/three/addons.js';
import { baueAnimation, ANIMATIONS_ARTEN } from '../../editor/kern/animation.js';
import { knotenName } from '../../editor/kern/knochen.js';
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
      knoten.push([o.uuid, o.parent?.uuid ?? '', this.#imBaum(o), o.position.toArray(), o.quaternion.toArray(), o.scale.toArray(), o.visible, o.name]);
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
    for (const [u, , , pos, quat, sk, sichtbar, name] of st.knoten) {
      const o = this.pool.get(u);
      if (!o) continue;
      o.position.fromArray(pos);
      o.quaternion.fromArray(quat);
      o.scale.fromArray(sk);
      o.visible = sichtbar;
      o.name = name;
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
    return { masse: this.masse(), spielHoehe: r3(this.spielHoehe), grundflaeche: this.grundflaeche(), dreiecke: Math.round(dreiecke), teile, materialien: this.materialien().length, animationen: this.clips.length, leerlauf: this.leerlauf || null, einheitInMetern: r3(this.massstab || 1) };
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

  // ---------- Zeiger: Klick wählt ein Teil ----------
  #zeiger() {
    let start = null;
    this.leinwand.addEventListener('pointerdown', (e) => (start = e.button === 0 ? [e.clientX, e.clientY] : null));
    this.leinwand.addEventListener('pointerup', (e) => {
      if (!start || Math.hypot(e.clientX - start[0], e.clientY - start[1]) > 4 || this.gizmo.dragging) return;
      const r = this.leinwand.getBoundingClientRect();
      const strahl = new THREE.Raycaster();
      strahl.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), this.kamera);
      const ziele = [];
      this.modell.traverseVisible((o) => o.isMesh && ziele.push(o));
      const t = strahl.intersectObjects(ziele, false)[0];
      this.waehle(t ? t.object.uuid : null);
    });
  }
}
