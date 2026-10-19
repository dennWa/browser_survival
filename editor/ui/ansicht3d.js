import * as THREE from 'three';
import { BAUWERKE } from '../../gemeinsam/welt/bauwerke.js';
import { RESSOURCEN_OBJEKTE } from '../../gemeinsam/welt/ressourcen.js';
import { ausSchluessel } from '../kern/karte.js';
import { kachelInfo, objektInfo } from '../kern/katalog.js';
import { eigenesModellUrl, ladeEigenesModell, eigenesModellInhalt } from '../../client/darstellung/eigeneModelle.js';
import { musterTextur, extrusionsGeometrie } from './bild3d.js';
import { mitModell } from '../kern/bibliothek.js';

/**
 * 3D-Ansicht des Editors (Phase 10): dieselbe Karte in Spielperspektive (Kamera-Winkel wie client/darstellung/renderer.js).
 * 1 Kachel = 1 Einheit, Höhe in Metern (Terrain-Höhen sind echte Höhen der Bodenfläche). Boden = Canvas aus Kachelfarben +
 * Bemalung (dieselbe Farbe wie 2D und Spiel). Objekte als einfache Körper (Möbel = Quader in Typ-/Objektfarbe mit Muster,
 * Bäume instanziert, eigene Bild-Objekte als Billboard oder Extrusion, eigene .glb-Modelle eingepasst auf Fußabdruck × 3D-Höhe).
 * Klänge (Phase 4): Punkt = Kugel + Bodenringe (voll bis / Hörweite), Ambiente = durchsichtiger Rahmen (Ebene „klaenge“).
 * Auswahl ist synchron mit 2D (Klick wählt).
 * Steuerung: Ziehen = schieben, Rechts-/Alt-Ziehen = drehen, Rad/Pinch = Zoom, Tippen = wählen (Touch: Ansehen + Schwenken).
 * Gezeichnet wird nur bei Bedarf (anfordern), neu gebaut nur, wenn sich die Karte geändert hat und die Ansicht sichtbar ist.
 */
const PX = 32; // Spiel-Pixel je Kachel
const WAND_HOEHE = 84 / PX;
const TUER_HOEHE = 64 / PX;
const SPIEL_NEIGUNG = Math.atan2(540, 400); // KAMERA_VERSATZ (0, 540, 400) im Spiel
const MOEBEL_HOEHE = { bett: 18, bett_orange: 18, tisch: 24, tisch_rund: 24, stuhl: 14, sessel: 18, sessel_blau: 18, sofa: 18, sofa_dunkel: 18, kiste: 26, kiste_klein: 16, pflanze: 30, kueche_theke: 30, kueche_herd: 30, kueche_spuele: 30, kueche_kochfeld: 30, auto_schwarz: 38, auto_blau: 38, auto_rot: 38, auto_gruen: 38, auto_gelb: 38, transporter: 46, fass: 28, pylone: 18, werkbank: 26, stein: 20, eisenerz: 22 };

export class Ansicht3D {
  constructor(leinwand, zustand, { zeichner2d }) {
    this.leinwand = leinwand;
    this.zustand = zustand;
    this.zeichner2d = zeichner2d;
    this.renderer = new THREE.WebGLRenderer({ canvas: leinwand, antialias: true });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.szene = new THREE.Scene();
    this.szene.background = new THREE.Color(0x10141a);
    this.kamera = new THREE.PerspectiveCamera(45, 1, 0.1, 2000);
    this.szene.add(new THREE.HemisphereLight(0xdfe8ff, 0x3a3020, 1.1));
    const sonne = new THREE.DirectionalLight(0xffffff, 1.6);
    sonne.position.set(-0.4, 1, 0.6);
    this.szene.add(sonne);
    this.welt = new THREE.Group();
    this.markierung = new THREE.Group();
    this.szene.add(this.welt, this.markierung);
    this.blick = { x: 20, z: 15, abstand: 30, gier: 0, neigung: SPIEL_NEIGUNG };
    this.waehlbar = []; // Meshes mit userData { s, k } bzw. InstancedMesh mit userData.ids
    this.boxen = new Map(); // "s|k" → { mitte, groesse } für Auswahl-Markierung
    this.veraltet = true;
    this.materialien = new Map();
    this.#angefragt = false;
    this.#zeiger = new Map();
    zustand.bei('karte', () => this.#veraltet());
    zustand.bei('zone', () => this.#veraltet(true));
    zustand.bei('bibliothek', () => this.#veraltet()); // Modell ersetzt/gelöscht
    zustand.bei('ebenen', () => this.#veraltet()); // Klang-Ebene ein/aus
    zustand.bei('auswahl', () => this.#markiereAuswahl());
    zustand.bei('ansicht', () => {
      if (zustand.ansicht !== '3d') return;
      this.uebernimmBlickAus2D();
      if (this.veraltet) this.baue();
      document.getElementById('knoepfe-3d').hidden = false;
      this.anfordern();
    });
    zustand.bei('ansicht', () => zustand.ansicht === '2d' && (document.getElementById('knoepfe-3d').hidden = true));
    new ResizeObserver(() => this.anfordern()).observe(leinwand);
    this.#steuerung();
    document.querySelectorAll('#knoepfe-3d [data-3d]').forEach((b) =>
      b.addEventListener('click', () => {
        this.blick.gier = 0;
        this.blick.neigung = b.dataset['3d'] === 'oben' ? Math.PI / 2 - 0.001 : SPIEL_NEIGUNG;
        this.anfordern();
      }),
    );
  }

  #angefragt;
  #zeiger;
  #bauTimer = null;

  get sichtbar() {
    return this.zustand.ansicht === '3d';
  }

  #veraltet(sofort = false) {
    this.veraltet = true;
    if (!this.sichtbar) return;
    clearTimeout(this.#bauTimer);
    this.#bauTimer = setTimeout(() => this.baue(), sofort ? 0 : 150);
  }

  anfordern() {
    if (this.#angefragt || !this.sichtbar) return;
    this.#angefragt = true;
    requestAnimationFrame(() => {
      this.#angefragt = false;
      this.zeichne();
    });
  }

  zoomen(faktor) {
    if (faktor === 0) {
      const k = this.zustand.karte;
      if (k) Object.assign(this.blick, { x: k.breite / 2, z: k.hoehe / 2, abstand: Math.max(k.breite, k.hoehe) * 1.1 });
    } else this.blick.abstand = Math.max(4, Math.min(600, this.blick.abstand / faktor));
    this.anfordern();
  }

  uebernimmBlickAus2D() {
    const z = this.zeichner2d;
    const sichtbreite = (this.leinwand.clientWidth || 800) / z.zoom;
    Object.assign(this.blick, { x: z.kamera.x, z: z.kamera.y, abstand: Math.max(6, sichtbreite * 0.9) });
  }

  zeichne() {
    const b = this.leinwand.clientWidth;
    const h = this.leinwand.clientHeight;
    if (!b || !h) return;
    this.renderer.setSize(b, h, false);
    this.kamera.aspect = b / h;
    const { x, z, abstand, gier, neigung } = this.blick;
    const boden = this.#hoeheBei(x, z);
    this.kamera.position.set(x + Math.sin(gier) * Math.cos(neigung) * abstand, boden + Math.sin(neigung) * abstand, z + Math.cos(gier) * Math.cos(neigung) * abstand);
    this.kamera.lookAt(x, boden, z);
    this.kamera.far = abstand * 6 + 200;
    this.kamera.updateProjectionMatrix();
    this.renderer.render(this.szene, this.kamera);
  }

  // --- Aufbau ----------------------------------------------------------------------
  #material(farbe, muster = null) {
    const schluessel = `${farbe}|${muster ?? ''}`;
    if (!this.materialien.has(schluessel)) {
      const m = new THREE.MeshStandardMaterial({ color: new THREE.Color(farbe), roughness: 0.85 });
      if (muster) m.map = musterTextur(muster);
      this.materialien.set(schluessel, m);
    }
    return this.materialien.get(schluessel);
  }

  #hoeheBei(x, z) {
    const k = this.zustand.karte;
    return k ? k.hoeheAn(Math.floor(x), Math.floor(z)) : 0;
  }

  baue() {
    const k = this.zustand.karte;
    this.veraltet = false;
    for (const kind of [...this.welt.children]) {
      this.welt.remove(kind);
      kind.traverse?.((o) => {
        if (o.geometry && !o.geometry.userData?.geteilt) o.geometry.dispose();
      });
    }
    this.waehlbar = [];
    this.boxen.clear();
    if (!k) return;
    this.#baueBoden(k);
    this.#baueWaende(k);
    this.#baueObjekte(k);
    this.#baueBauwerke(k);
    this.#baueMarker(k);
    if (this.zustand.sichtbar('klaenge')) this.#baueKlaenge(k);
    this.#markiereAuswahl();
    this.anfordern();
  }

  #baueBoden(k) {
    const tpx = Math.max(2, Math.min(8, Math.floor(4096 / Math.max(k.breite, k.hoehe))));
    const canvas = document.createElement('canvas');
    canvas.width = k.breite * tpx;
    canvas.height = k.hoehe * tpx;
    const ctx = canvas.getContext('2d');
    for (let y = 0; y < k.hoehe; y++)
      for (let x = 0; x < k.breite; x++) {
        ctx.fillStyle = kachelInfo(k.zellen[y * k.breite + x]).farbe;
        ctx.fillRect(x * tpx, y * tpx, tpx, tpx);
      }
    ctx.globalAlpha = 0.6;
    for (const [schl, f] of k.s('bemalung')) {
      const [x, y] = ausSchluessel(schl);
      ctx.fillStyle = f;
      ctx.fillRect(x * tpx, y * tpx, tpx, tpx);
    }
    ctx.globalAlpha = 0.12;
    ctx.strokeStyle = '#000';
    for (let x = 0; x <= k.breite; x++) ctx.strokeRect(x * tpx, 0, 0.01, canvas.height);
    ctx.globalAlpha = 1;
    // Bodenobjekte (Teppiche, Flecken, Markierungen) direkt auf die Textur
    for (const o of k.s('objekte').values()) {
      if (o.ebene !== 'boden') continue;
      ctx.fillStyle = o.farbe ?? k.s('texturen').get(o.typ)?.farbe ?? objektInfo(o.typ, k).farbe;
      ctx.fillRect(o.x * tpx, o.y * tpx, o.b * tpx, o.h * tpx);
    }
    const textur = new THREE.CanvasTexture(canvas);
    textur.colorSpace = THREE.SRGBColorSpace;
    textur.magFilter = THREE.NearestFilter;
    textur.anisotropy = 4;
    const geo = new THREE.PlaneGeometry(k.breite, k.hoehe, k.breite, k.hoehe);
    geo.rotateX(-Math.PI / 2);
    geo.translate(k.breite / 2, 0, k.hoehe / 2);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const vx = Math.round(pos.getX(i));
      const vz = Math.round(pos.getZ(i));
      let summe = 0;
      let n = 0;
      for (const [dx, dz] of [[-1, -1], [0, -1], [-1, 0], [0, 0]]) {
        if (!k.imFeld(vx + dx, vz + dz)) continue;
        summe += k.hoeheAn(vx + dx, vz + dz);
        n++;
      }
      pos.setY(i, n ? summe / n : 0);
    }
    geo.computeVertexNormals();
    const boden = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: textur, roughness: 1 }));
    boden.userData.boden = true;
    this.welt.add(boden);
  }

  #baueWaende(k) {
    const teile = { wand: [], fenster: [], glas: [], sturz: [] };
    for (let y = 0; y < k.hoehe; y++)
      for (let x = 0; x < k.breite; x++) {
        const c = k.zellen[y * k.breite + x];
        const h0 = k.hoeheAn(x, y);
        if (c === '#') teile.wand.push([x + 0.5, h0 + WAND_HOEHE / 2, y + 0.5, 1, WAND_HOEHE, 1]);
        else if (c === 'F') {
          teile.fenster.push([x + 0.5, h0 + 0.375, y + 0.5, 1, 0.75, 1], [x + 0.5, h0 + WAND_HOEHE - 0.19, y + 0.5, 1, 0.38, 1]);
          teile.glas.push([x + 0.5, h0 + (0.75 + WAND_HOEHE - 0.38) / 2, y + 0.5, 0.9, WAND_HOEHE - 1.13, 0.9]);
        } else if (c === 'T') teile.sturz.push([x + 0.5, h0 + (TUER_HOEHE + WAND_HOEHE) / 2, y + 0.5, 1, WAND_HOEHE - TUER_HOEHE, 1]);
      }
    const box = new THREE.BoxGeometry(1, 1, 1);
    const instanzen = (liste, material) => {
      if (!liste.length) return;
      const m = new THREE.InstancedMesh(box, material, liste.length);
      const mat = new THREE.Matrix4();
      liste.forEach(([x, y, z, sx, sy, sz], i) => m.setMatrixAt(i, mat.compose(new THREE.Vector3(x, y, z), new THREE.Quaternion(), new THREE.Vector3(sx, sy, sz))));
      this.welt.add(m);
    };
    const wand = new THREE.MeshStandardMaterial({ color: 0x5a616c, roughness: 0.9 });
    instanzen(teile.wand, wand);
    instanzen(teile.fenster, wand);
    instanzen(teile.sturz, new THREE.MeshStandardMaterial({ color: 0x8a5a33 }));
    instanzen(teile.glas, new THREE.MeshStandardMaterial({ color: 0x8cc8e2, transparent: true, opacity: 0.35 }));
  }

  #baueObjekte(k) {
    const kronen = [];
    for (const [id, o] of k.s('objekte')) {
      if (o.ebene === 'boden') continue;
      const info = objektInfo(o.typ, k);
      const typTextur = k.s('texturen').get(o.typ);
      const farbe = o.typ === 'licht' ? (o.farbe ?? '#ffd9a0') : (o.farbe ?? typTextur?.farbe ?? info.farbe);
      const muster = o.textur ?? typTextur?.muster ?? null;
      const cx = o.x + o.b / 2;
      const cz = o.y + o.h / 2;
      const boden = k.hoeheAn(Math.floor(cx), Math.floor(cz));
      if (o.ebene === 'oben') {
        kronen.push({ id, o, farbe, cx, cz, boden });
        continue;
      }
      const eigen = mitModell(k.s('typen').get(o.typ)); // Bibliotheks-Modell (asset) → glb
      let mesh;
      if (eigenesModellUrl(eigen)) {
        mesh = this.#glbGruppe(id, o, eigen, typTextur, cx, boden, cz);
      } else if (eigen?.bild && eigen.modus === 'billboard') {
        const textur = new THREE.TextureLoader().load(eigen.bild, () => this.anfordern());
        textur.colorSpace = THREE.SRGBColorSpace;
        mesh = new THREE.Sprite(new THREE.SpriteMaterial({ map: textur, alphaTest: 0.4 }));
        const hoehe = eigen.hoehe3d ?? Math.max(o.b, o.h);
        mesh.scale.set(Math.max(o.b, o.h), hoehe, 1);
        mesh.position.set(cx, boden + hoehe / 2, cz);
      } else if (eigen?.bild && eigen.modus === 'extrusion') {
        mesh = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 }));
        extrusionsGeometrie(eigen.bild, { breite: Math.max(o.b, o.h), tiefe: eigen.tiefe ?? 0.3 }).then((geo) => {
          mesh.geometry.dispose();
          mesh.geometry = geo;
          this.anfordern();
        });
        mesh.position.set(cx, boden, cz);
        mesh.rotation.y = (-(o.drehung ?? 0) * Math.PI) / 180;
      } else if (o.typ === 'licht') {
        const gruppe = new THREE.Group();
        if (o.mast) gruppe.add(new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 2.4, 6), this.#material('#333')).translateY(1.2));
        const kugel = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), new THREE.MeshStandardMaterial({ color: farbe, emissive: farbe, emissiveIntensity: 1.2 }));
        kugel.position.y = o.mast ? 2.5 : 1.6;
        gruppe.add(kugel);
        gruppe.position.set(cx, boden, cz);
        mesh = gruppe;
      } else {
        const hoehe = (eigen?.hoehe3d ?? (MOEBEL_HOEHE[o.typ] ?? 20) / PX) * (RESSOURCEN_OBJEKTE[o.typ] && o.groesse === 'gross' ? 1.25 : 1);
        mesh = new THREE.Mesh(new THREE.BoxGeometry(o.b * 0.96, hoehe, o.h * 0.96), this.#material(farbe, muster));
        mesh.position.set(cx, boden + hoehe / 2, cz);
        mesh.rotation.y = ((o.drehung ?? 0) % 90) * (-Math.PI / 180); // freie Drehung sichtbar (90er-Raster = Fußabdruck)
      }
      mesh.userData = { s: 'objekte', k: id };
      mesh.traverse((t) => (t.userData = { s: 'objekte', k: id }));
      this.welt.add(mesh);
      this.waehlbar.push(mesh);
      this.boxen.set(`objekte|${id}`, { x: cx, y: boden, z: cz, b: o.b, h: o.h, hoehe: 1.2 });
    }
    // Bäume & Büsche: instanziert (Stamm + Krone)
    if (kronen.length) {
      const stamm = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.15, 0.22, 1.4, 6), this.#material('#5a3a1e'), kronen.length);
      const krone = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.5, 1), new THREE.MeshStandardMaterial({ roughness: 0.9 }), kronen.length);
      const mat = new THREE.Matrix4();
      const farbe = new THREE.Color();
      kronen.forEach(({ o, cx, cz, boden, farbe: f }, i) => {
        const busch = o.typ === 'busch';
        const groesse = Math.min(o.b, o.h) * (busch ? 0.9 : 0.8) * (o.groesse === 'gross' ? 1.2 : 1);
        stamm.setMatrixAt(i, mat.compose(new THREE.Vector3(cx, boden + (busch ? -1 : 0.7), cz), new THREE.Quaternion(), new THREE.Vector3(1, busch ? 0.01 : 1, 1)));
        krone.setMatrixAt(i, mat.compose(new THREE.Vector3(cx, boden + (busch ? groesse * 0.4 : 1.4 + groesse * 0.45), cz), new THREE.Quaternion(), new THREE.Vector3(groesse, groesse * (busch ? 0.7 : 0.9), groesse)));
        krone.setColorAt(i, farbe.set(f));
        this.boxen.set(`objekte|${kronen[i].id}`, { x: cx, y: boden, z: cz, b: groesse, h: groesse, hoehe: busch ? groesse : 1.4 + groesse });
      });
      krone.userData = { s: 'objekte', ids: kronen.map((x) => x.id) };
      this.welt.add(stamm, krone);
      this.waehlbar.push(krone);
    }
  }

  /**
   * Eigenes .glb-Modell: die Gruppe hängt sofort in der Welt (und ist wählbar), das Modell kommt, sobald es geladen ist.
   * Ist die Gruppe beim Laden schon aus der Welt (Neuaufbau), passiert nichts mehr.
   */
  #glbGruppe(id, o, eigen, typTextur, cx, boden, cz) {
    const gruppe = new THREE.Group();
    gruppe.position.set(cx, boden, cz);
    gruppe.rotation.y = (-(o.drehung ?? 0) * Math.PI) / 180;
    ladeEigenesModell(eigenesModellUrl(eigen))
      .then((szene) => {
        if (!gruppe.parent) return;
        gruppe.add(eigenesModellInhalt(szene, { b: o.b, h: o.h, hoehe: eigen.hoehe3d ?? 1, farbe: typTextur?.farbe, id }));
        this.anfordern();
      })
      .catch(() => this.zustand.meldung(`3D-Modell „${o.typ}“ konnte nicht gelesen werden`, 'fehler'));
    return gruppe;
  }

  #baueBauwerke(k) {
    for (const [id, b] of k.s('bauwerke')) {
      const ebene = BAUWERKE[b.typ]?.ebene ?? 'objekt';
      const zaun = b.typ === 'zaun' || b.typ === 'zauntor';
      const [hoehe, dicke, unten] = ebene === 'wand' ? (zaun ? [1.2, 0.25, 0] : [WAND_HOEHE, 1, 0]) : ebene === 'boden' ? [0.06, 1, 0] : ebene === 'dach' ? [0.15, 1, WAND_HOEHE] : ebene === 'tuer' ? [TUER_HOEHE, 0.2, 0] : [0.8, 0.8, 0];
      const quer = b.drehung === 1;
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(zaun && quer ? dicke : 1, hoehe, zaun && !quer ? dicke : 1), ebene === 'dach' ? new THREE.MeshStandardMaterial({ color: 0x7a4a2a, transparent: true, opacity: 0.45 }) : this.#material(ebene === 'wand' ? '#8a6a46' : '#b48a5a', 'holz'));
      const boden = k.hoeheAn(b.tx, b.ty);
      mesh.position.set(b.tx + 0.5, boden + unten + hoehe / 2, b.ty + 0.5);
      mesh.userData = { s: 'bauwerke', k: id };
      this.welt.add(mesh);
      this.waehlbar.push(mesh);
      this.boxen.set(`bauwerke|${id}`, { x: b.tx + 0.5, y: boden, z: b.ty + 0.5, b: 1, h: 1, hoehe: unten + hoehe });
    }
  }

  #baueMarker(k) {
    const zylinder = new THREE.CylinderGeometry(0.28, 0.28, 0.9, 12);
    for (const [schl, m] of k.s('marker')) {
      const [x, y] = ausSchluessel(schl);
      const farbe = m.art === 'start' ? '#38d16a' : m.art === 'zombie' ? (m.horde ? '#8a2be2' : '#d13838') : '#ffd23f';
      const mesh = new THREE.Mesh(zylinder, new THREE.MeshStandardMaterial({ color: farbe, emissive: farbe, emissiveIntensity: 0.35 }));
      mesh.position.set(x + 0.5, k.hoeheAn(x, y) + 0.45, y + 0.5);
      mesh.userData = { s: 'marker', k: schl };
      this.welt.add(mesh);
      this.waehlbar.push(mesh);
      this.boxen.set(`marker|${schl}`, { x: x + 0.5, y: k.hoeheAn(x, y), z: y + 0.5, b: 0.7, h: 0.7, hoehe: 0.9 });
    }
    for (const [name, a] of k.s('ankuenfte')) {
      const mesh = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.9, 10), new THREE.MeshStandardMaterial({ color: 0x2b8cff, emissive: 0x2b8cff, emissiveIntensity: 0.4 }));
      mesh.rotation.x = Math.PI;
      mesh.position.set(a.x + 0.5, k.hoeheAn(a.x, a.y) + 0.6, a.y + 0.5);
      mesh.userData = { s: 'ankuenfte', k: name };
      this.welt.add(mesh);
      this.waehlbar.push(mesh);
    }
    for (const [id, u] of k.s('uebergaenge')) {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(u.b, 1.6, u.h), new THREE.MeshStandardMaterial({ color: 0x2b8cff, transparent: true, opacity: 0.3 }));
      mesh.position.set(u.x + u.b / 2, k.hoeheAn(u.x, u.y) + 0.8, u.y + u.h / 2);
      mesh.userData = { s: 'uebergaenge', k: id };
      this.welt.add(mesh);
      this.waehlbar.push(mesh);
    }
  }

  /** Klänge (Phase 4): Punkt = Kugel + Bodenringe (voll bis / Hörweite), Ambiente = durchsichtiger Rahmen, Global ohne Ort */
  #baueKlaenge(k) {
    const farbe = 0x7fd6ff;
    const ring = (r, x, y, z, gestrichelt) => {
      const punkte = [];
      for (let i = 0; i <= 48; i++) punkte.push(new THREE.Vector3(x + Math.cos((i / 48) * Math.PI * 2) * r, y, z + Math.sin((i / 48) * Math.PI * 2) * r));
      const geo = new THREE.BufferGeometry().setFromPoints(punkte);
      const linie = new THREE.Line(geo, gestrichelt ? new THREE.LineDashedMaterial({ color: farbe, dashSize: 0.5, gapSize: 0.35 }) : new THREE.LineBasicMaterial({ color: farbe }));
      if (gestrichelt) linie.computeLineDistances();
      this.welt.add(linie);
    };
    for (const [id, c] of k.s('klaenge')) {
      if (c.art === 'punkt') {
        const boden = k.hoeheAn(Math.floor(c.x), Math.floor(c.y));
        const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.25, 14, 10), new THREE.MeshStandardMaterial({ color: farbe, emissive: farbe, emissiveIntensity: 0.6 }));
        mesh.position.set(c.x, boden + 1.2, c.y);
        mesh.userData = { s: 'klaenge', k: id };
        this.welt.add(mesh);
        this.waehlbar.push(mesh);
        if (c.innen > 0) ring(c.innen, c.x, boden + 0.08, c.y, false);
        ring(c.aussen, c.x, boden + 0.08, c.y, true);
        this.boxen.set(`klaenge|${id}`, { x: c.x, y: boden + 0.9, z: c.y, b: 0.6, h: 0.6, hoehe: 0.6 });
      } else if (c.art === 'bereich') {
        const boden = k.hoeheAn(c.x, c.y);
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(c.b, 2, c.h), new THREE.MeshStandardMaterial({ color: farbe, transparent: true, opacity: 0.12, depthWrite: false }));
        mesh.position.set(c.x + c.b / 2, boden + 1, c.y + c.h / 2);
        mesh.userData = { s: 'klaenge', k: id };
        this.welt.add(mesh);
        this.waehlbar.push(mesh);
        this.boxen.set(`klaenge|${id}`, { x: c.x + c.b / 2, y: boden, z: c.y + c.h / 2, b: c.b, h: c.h, hoehe: 2 });
      }
    }
  }

  /** Auswahl aus 2D (oder 3D) als leuchtende Rahmen */
  #markiereAuswahl() {
    for (const kind of [...this.markierung.children]) {
      this.markierung.remove(kind);
      kind.geometry?.dispose();
    }
    for (const sk of this.zustand.auswahl.keys()) {
      const b = this.boxen.get(sk);
      if (!b) continue;
      const linien = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(b.b + 0.12, b.hoehe + 0.12, b.h + 0.12)), new THREE.LineBasicMaterial({ color: 0x4fc3ff }));
      linien.position.set(b.x, b.y + b.hoehe / 2, b.z);
      this.markierung.add(linien);
    }
    this.anfordern();
  }

  // --- Steuerung ---------------------------------------------------------------------
  #steuerung() {
    const l = this.leinwand;
    l.addEventListener('contextmenu', (e) => e.preventDefault());
    l.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.blick.abstand = Math.max(4, Math.min(600, this.blick.abstand * Math.exp(Math.max(-1, Math.min(1, e.deltaY / 200)) * 0.3)));
      this.anfordern();
    }, { passive: false });
    l.addEventListener('pointerdown', (e) => {
      l.setPointerCapture(e.pointerId);
      this.#zeiger.set(e.pointerId, { x: e.clientX, y: e.clientY, startX: e.clientX, startY: e.clientY, drehen: e.button === 2 || e.altKey, umschalt: e.shiftKey });
    });
    l.addEventListener('pointermove', (e) => {
      const p = this.#zeiger.get(e.pointerId);
      if (!p) return;
      const dx = e.clientX - p.x;
      const dy = e.clientY - p.y;
      p.x = e.clientX;
      p.y = e.clientY;
      if (this.#zeiger.size === 2) {
        const [a, b] = [...this.#zeiger.values()];
        const abstand = Math.hypot(a.x - b.x, a.y - b.y);
        if (this.letzterAbstand) this.blick.abstand = Math.max(4, Math.min(600, this.blick.abstand * (this.letzterAbstand / abstand)));
        this.letzterAbstand = abstand;
        this.#schiebe(dx / 2, dy / 2);
      } else if (p.drehen) {
        this.blick.gier -= dx * 0.008;
        this.blick.neigung = Math.max(0.2, Math.min(Math.PI / 2 - 0.001, this.blick.neigung + dy * 0.006));
      } else this.#schiebe(dx, dy);
      this.anfordern();
    });
    const hoch = (e) => {
      const p = this.#zeiger.get(e.pointerId);
      this.#zeiger.delete(e.pointerId);
      if (this.#zeiger.size < 2) this.letzterAbstand = null;
      if (p && Math.hypot(e.clientX - p.startX, e.clientY - p.startY) < 5 && !p.drehen) this.#waehle(e, p.umschalt);
    };
    l.addEventListener('pointerup', hoch);
    l.addEventListener('pointercancel', (e) => this.#zeiger.delete(e.pointerId));
  }

  #schiebe(dx, dy) {
    const s = (this.blick.abstand / (this.leinwand.clientHeight || 600)) * 1.1;
    const { gier } = this.blick;
    this.blick.x -= (Math.cos(gier) * dx + Math.sin(gier) * dy) * s;
    this.blick.z -= (-Math.sin(gier) * dx + Math.cos(gier) * dy) * s;
  }

  #waehle(e, umschalt) {
    const r = this.leinwand.getBoundingClientRect();
    const maus = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    const strahl = new THREE.Raycaster();
    strahl.setFromCamera(maus, this.kamera);
    const treffer = strahl.intersectObjects(this.waehlbar, true).find((t) => t.object.userData?.s);
    if (!treffer) {
      if (!umschalt) this.zustand.leereAuswahl();
      return;
    }
    const d = treffer.object.userData;
    const k = d.ids ? d.ids[treffer.instanceId] : d.k;
    this.zustand.waehle([{ s: d.s, k }], umschalt);
    const was = d.s === 'objekte' ? this.zustand.karte.s('objekte').get(k)?.typ : d.s === 'klaenge' ? `🔊 ${this.zustand.karte.s('klaenge').get(k)?.name}` : d.s;
    this.zustand.meldung(`3D: ${was} gewählt – Eigenschaften rechts, in 2D ebenfalls markiert`);
  }
}

export function webglVerfuegbar() {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

