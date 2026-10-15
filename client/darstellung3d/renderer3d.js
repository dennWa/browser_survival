import * as THREE from 'three';
import { FBXLoader, SkeletonUtils } from '../vendor/three/addons.js';
import { KACHELN } from '../../gemeinsam/welt/kacheln.js';
import { WeltZeichner } from '../darstellung/weltZeichner.js';
import { zeichneBeschriftung } from '../darstellung/entitaetZeichner.js';
import { flackern } from '../darstellung/licht.js';

/**
 * 3D-PROTOTYP – Renderer mit Three.js (WebGL), schräge Kamera, echte Lichter und Schatten.
 *
 * Gleiche Schnittstelle wie darstellung/renderer.js → ClientSpiel, HUD, Netzwerk & Spiellogik
 * merken keinen Unterschied. Gameplay bleibt 2D (x/y auf dem Boden); nur die Darstellung ist 3D:
 *   Weltpixel x → three.x, Weltpixel y → three.z, Höhe → three.y (1 Einheit = 1 Weltpixel)
 *
 * Ebenen: WebGL-Canvas (#spielflaeche3d) liegt UNTER dem 2D-Canvas (#spielflaeche). Das 2D-Canvas
 * bleibt durchsichtig, empfängt weiter Maus/Touch und zeigt Namen, Lebensbalken, Vignette, Schadensblitz.
 */
const ASSETS = new URL('../assets/', import.meta.url);
const WANDHOEHE = 72;
const FIGUR_HOEHE = 64;
const ZIELHOEHE = 36; // Mausstrahl trifft diese Höhe (Brust) → Zielen fühlt sich richtig an
const KAMERA_VERSATZ = new THREE.Vector3(0, 560, 380);
const SKINS = { spieler: 'humanMaleA', normal: 'zombieMaleA', laeufer: 'zombieFemaleA', brocken: 'zombieMaleA' };
const MAX_TASCHENLAMPEN = 4;
/** Höhe (Weltpixel) der Möbel-Quader */
const MOEBEL_HOEHE = {
  bett: 18, bett_orange: 18, tisch: 24, tisch_rund: 24, stuhl: 14, sessel: 18, sessel_blau: 18, sofa: 18, sofa_dunkel: 18,
  kiste: 26, kiste_klein: 16, pflanze: 30, kueche_theke: 30, kueche_herd: 30, kueche_spuele: 30, kueche_kochfeld: 30,
  auto_schwarz: 38, auto_blau: 38, auto_rot: 38, auto_gruen: 38, auto_gelb: 38, transporter: 46, fass: 28, pylone: 18,
};

export class Renderer3D {
  /** Lädt Figuren & Animationen, baut den Renderer. Wirft, wenn WebGL fehlt. */
  static async erstelle(leinwand2d, assets) {
    const renderer = new Renderer3D(leinwand2d, assets);
    await renderer.#ladeFiguren();
    return renderer;
  }

  constructor(leinwand2d, assets) {
    this.assets = assets;
    this.overlay = leinwand2d;
    this.octx = leinwand2d.getContext('2d');
    this.leinwand = Object.assign(document.createElement('canvas'), { id: 'spielflaeche3d' });
    leinwand2d.before(this.leinwand);

    this.gl = new THREE.WebGLRenderer({ canvas: this.leinwand, antialias: true, powerPreference: 'high-performance' });
    this.gl.shadowMap.enabled = true;
    this.gl.shadowMap.type = THREE.PCFShadowMap;
    this.gl.toneMapping = THREE.ACESFilmicToneMapping;
    this.gl.outputColorSpace = THREE.SRGBColorSpace;

    this.szene = new THREE.Scene();
    this.szene.background = new THREE.Color(0x04060b);
    this.szene.fog = new THREE.Fog(0x04060b, 650, 1500);
    this.kamera3d = new THREE.PerspectiveCamera(38, 1, 10, 4000);
    this.kamera = new KameraAdapter(this);
    this.lichtAn = true;
    this.letzteZeit = 0;
    this.statisch = new THREE.Group(); // alles, was zur Karte gehört
    this.szene.add(this.statisch);

    // Grundlicht: schwaches blaues Mondlicht + Umgebungslicht
    this.umgebung = new THREE.AmbientLight(0x3a4a70, 0.55);
    this.mond = new THREE.DirectionalLight(0x9db4e8, 0.9);
    this.mond.castShadow = true;
    this.mond.shadow.mapSize.set(2048, 2048);
    Object.assign(this.mond.shadow.camera, { left: -800, right: 800, top: 800, bottom: -800, near: 10, far: 2500 });
    this.mond.shadow.bias = -0.0005;
    this.szene.add(this.umgebung, this.mond, this.mond.target);

    this.figuren = new Map(); // Entitäts-ID → { gruppe, mixer, aktionen, aktuell, ... }
    this.items = new Map();
    this.taschenlampen = Array.from({ length: MAX_TASCHENLAMPEN }, (_, i) => this.#neueTaschenlampe(i === 0));
    this.muendungslichter = Array.from({ length: 3 }, () => {
      const l = new THREE.PointLight(0xffc070, 0, 380, 1);
      this.szene.add(l);
      return l;
    });
    this.#baueEffektObjekte();

    this.#groesseAnpassen();
    window.addEventListener('resize', () => this.#groesseAnpassen());
    window.visualViewport?.addEventListener('resize', () => this.#groesseAnpassen());
  }

  anzeigen() {
    this.leinwand.hidden = false;
  }

  verbergen() {
    this.leinwand.hidden = true;
    this.leeren();
  }

  leeren() {
    this.octx.setTransform(1, 0, 0, 1, 0, 0);
    this.octx.clearRect(0, 0, this.overlay.width, this.overlay.height);
  }

  lichtUmschalten() {
    this.lichtAn = !this.lichtAn;
    this.umgebung.intensity = this.lichtAn ? 0.55 : 2.2;
    this.mond.intensity = this.lichtAn ? 0.9 : 2.5;
    return this.lichtAn;
  }

  setzeAssets(assets) {
    this.assets = assets;
  }

  /** Baut die statische Szene (Boden, Wände, Möbel, Bäume, Lampen) aus der Welt. */
  setzeWelt(welt) {
    this.welt = welt;
    this.statisch.clear();
    for (const f of this.figuren.values()) this.szene.remove(f.gruppe);
    this.figuren.clear();
    for (const m of this.items.values()) this.szene.remove(m);
    this.items.clear();
    this.#baueBoden();
    this.#baueWaende();
    this.#baueObjekte();
  }

  /** Gleiche Szene-Daten wie der 2D-Renderer. */
  zeichne({ fokus, entitaeten, gegenstaende, jetzt, effekte = null, markiertId = null }) {
    const dt = this.letzteZeit ? Math.min(0.1, (jetzt - this.letzteZeit) / 1000) : 0;
    this.letzteZeit = jetzt;

    // Kamera folgt weich dem eigenen Spieler
    const ziel = new THREE.Vector3(fokus.x, 0, fokus.y);
    this.kamera3d.position.lerp(ziel.clone().add(KAMERA_VERSATZ), Math.min(1, dt * 8) || 1);
    this.kamera3d.lookAt(ziel.x, 0, ziel.z - 20);
    this.mond.position.set(ziel.x - 350, 900, ziel.z - 250);
    this.mond.target.position.copy(ziel);

    this.#aktualisiereFiguren(entitaeten, dt);
    this.#aktualisiereTaschenlampen(entitaeten, fokus);
    this.#aktualisiereItems(gegenstaende, markiertId, jetzt);
    this.#aktualisiereLampen(jetzt);
    if (effekte) {
      effekte.aktualisiere(dt, jetzt);
      this.#aktualisiereEffekte(effekte.zustand);
    }

    this.gl.render(this.szene, this.kamera3d);
    this.#zeichneOverlay(entitaeten, effekte);
  }

  // ---------------------------------------------------------------------------
  // Aufbau

  async #ladeFiguren() {
    const info = this.assets?.atlas.figuren3d;
    if (!info) throw new Error('3D-Figuren fehlen im Atlas');
    const [modell, clipsJson] = await Promise.all([
      new FBXLoader().loadAsync(new URL(info.modell, ASSETS).href),
      fetch(new URL(info.animationen, ASSETS)).then((a) => a.json()),
    ]);
    this.clips = Object.fromEntries(Object.entries(clipsJson).map(([name, json]) => [name, THREE.AnimationClip.parse(json)]));
    const groesse = new THREE.Box3().setFromObject(modell).getSize(new THREE.Vector3());
    this.modellMassstab = FIGUR_HOEHE / groesse.y;
    this.basisModell = modell;
    const lader = new THREE.TextureLoader();
    this.skins = {};
    await Promise.all(
      Object.entries(info.skins).map(async ([name, pfad]) => {
        const textur = await lader.loadAsync(new URL(pfad, ASSETS).href);
        textur.colorSpace = THREE.SRGBColorSpace;
        textur.flipY = true;
        this.skins[name] = textur;
      }),
    );
  }

  #baueBoden() {
    const welt = this.welt;
    const g = welt.kachelGroesse;
    const leinwand = new WeltZeichner(welt, this.assets).rendereBoden(1);
    // Kein Dach → Innenräume im Boden abdunkeln, sonst wäre das Krankenhaus mondhell
    const ctx = leinwand.getContext('2d');
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    for (let ty = 0; ty < welt.hoehe; ty++) {
      for (let tx = 0; tx < welt.breite; tx++) {
        if (KACHELN[welt.kachelAn(tx, ty)]?.innen) ctx.fillRect(tx * g, ty * g, g, g);
      }
    }
    const textur = new THREE.CanvasTexture(leinwand);
    textur.colorSpace = THREE.SRGBColorSpace;
    textur.anisotropy = this.gl.capabilities.getMaxAnisotropy();
    const boden = new THREE.Mesh(
      new THREE.PlaneGeometry(welt.pixelBreite, welt.pixelHoehe),
      new THREE.MeshStandardMaterial({ map: textur, roughness: 1 }),
    );
    boden.rotation.x = -Math.PI / 2;
    boden.position.set(welt.pixelBreite / 2, 0, welt.pixelHoehe / 2);
    boden.receiveShadow = true;
    const draussen = new THREE.Mesh(new THREE.PlaneGeometry(8000, 8000), new THREE.MeshStandardMaterial({ color: 0x1d2a1a, roughness: 1 }));
    draussen.rotation.x = -Math.PI / 2;
    draussen.position.set(welt.pixelBreite / 2, -0.5, welt.pixelHoehe / 2);
    this.statisch.add(boden, draussen);
  }

  #baueWaende() {
    const welt = this.welt;
    const g = welt.kachelGroesse;
    const teile = []; // { x, y, z, hoehe }
    const glas = [];
    for (let ty = 0; ty < welt.hoehe; ty++) {
      for (let tx = 0; tx < welt.breite; tx++) {
        const name = KACHELN[welt.kachelAn(tx, ty)]?.name;
        const x = tx * g + g / 2;
        const z = ty * g + g / 2;
        if (name === 'wand') teile.push({ x, z, unten: 0, hoehe: WANDHOEHE });
        if (name === 'fenster') {
          teile.push({ x, z, unten: 0, hoehe: 24 }, { x, z, unten: WANDHOEHE - 12, hoehe: 12 });
          glas.push({ x, z, unten: 24, hoehe: WANDHOEHE - 36 });
        }
      }
    }
    const seite = new THREE.MeshStandardMaterial({ color: 0x5a616c, roughness: 0.92 });
    const oben = new THREE.MeshStandardMaterial({ color: 0x2c3038, roughness: 1 });
    const wandMesh = instanzen(new THREE.BoxGeometry(g, 1, g), [seite, seite, oben, oben, seite, seite], teile);
    wandMesh.castShadow = true;
    wandMesh.receiveShadow = true;
    const glasMesh = instanzen(
      new THREE.BoxGeometry(g, 1, g * 0.3),
      new THREE.MeshStandardMaterial({ color: 0x8cc8e2, transparent: true, opacity: 0.35, roughness: 0.1, metalness: 0.2 }),
      glas,
    );
    this.statisch.add(wandMesh, glasMesh);
    // Glas quer zur Wand ausrichten (Fenster in senkrechten Wänden drehen)
    let i = 0;
    const matrix = new THREE.Matrix4();
    for (let ty = 0; ty < welt.hoehe; ty++) {
      for (let tx = 0; tx < welt.breite; tx++) {
        if (KACHELN[welt.kachelAn(tx, ty)]?.name !== 'fenster') continue;
        const senkrecht = !istWandig(welt, tx - 1, ty) && !istWandig(welt, tx + 1, ty);
        glasMesh.getMatrixAt(i, matrix);
        if (senkrecht) matrix.multiply(new THREE.Matrix4().makeRotationY(Math.PI / 2));
        glasMesh.setMatrixAt(i++, matrix);
      }
    }
    glasMesh.instanceMatrix.needsUpdate = true;
  }

  #baueObjekte() {
    const g = this.welt.kachelGroesse;
    this.lampen = [];
    for (const o of this.welt.objekte) {
      if (o.typ === 'licht') {
        const licht = new THREE.PointLight(o.farbe, 0, o.radius * g * 1.8, 1);
        licht.position.set((o.x + 0.5) * g, 60, (o.y + 0.5) * g);
        licht.userData = { basis: (o.staerke ?? 0.8) * 260, objekt: o };
        this.statisch.add(licht);
        this.lampen.push(licht);
        continue;
      }
      if (o.ebene === 'boden' || o.typ === 'markierung') continue; // steckt schon in der Bodentextur
      if (o.ebene === 'oben') this.statisch.add(this.#baum(o, g));
      else this.statisch.add(this.#moebel(o, g));
    }
  }

  #moebel(o, g) {
    const quer = (o.drehung ?? 0) % 180 !== 0;
    const breite = (quer ? o.h : o.b) * g;
    const tiefe = (quer ? o.b : o.h) * g;
    const hoehe = MOEBEL_HOEHE[o.typ] ?? 20;
    const { textur, farbe } = this.#spriteTextur(o.typ);
    const deckel = new THREE.MeshStandardMaterial({ map: textur, roughness: 0.8 });
    const seite = new THREE.MeshStandardMaterial({ color: farbe, roughness: 0.9 });
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(breite, hoehe, tiefe), [seite, seite, deckel, seite, seite, seite]);
    mesh.position.set((o.x + o.b / 2) * g, hoehe / 2, (o.y + o.h / 2) * g);
    mesh.rotation.y = (-(o.drehung ?? 0) * Math.PI) / 180;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }

  #baum(o, g) {
    const gruppe = new THREE.Group();
    const x = (o.x + o.b / 2) * g;
    const z = (o.y + o.h / 2) * g;
    const istBusch = o.typ === 'busch';
    const hoehe = istBusch ? 26 : 96;
    if (!istBusch) {
      const stamm = new THREE.Mesh(new THREE.CylinderGeometry(5, 7, hoehe, 8), new THREE.MeshStandardMaterial({ color: 0x4a3420, roughness: 1 }));
      stamm.position.set(x, hoehe / 2, z);
      stamm.castShadow = true;
      gruppe.add(stamm);
    }
    const { textur } = this.#spriteTextur(o.typ);
    const krone = new THREE.Mesh(
      new THREE.PlaneGeometry(o.b * g, o.h * g),
      new THREE.MeshStandardMaterial({ map: textur, transparent: true, alphaTest: 0.4, side: THREE.DoubleSide, roughness: 1 }),
    );
    krone.rotation.x = -Math.PI / 2;
    krone.position.set(x, hoehe, z);
    krone.castShadow = true;
    gruppe.add(krone);
    return gruppe;
  }

  /** Schneidet ein Sprite aus dem Umgebungs-Atlas → Textur + mittlere Farbe (für die Seiten). */
  #spriteTextur(typ) {
    this.spriteCache ??= new Map();
    if (this.spriteCache.has(typ)) return this.spriteCache.get(typ);
    const rahmen = this.assets?.objekt(typ);
    const bild = this.assets?.umgebungBild;
    const canvas = document.createElement('canvas');
    canvas.width = rahmen?.b ?? 4;
    canvas.height = rahmen?.h ?? 4;
    const ctx = canvas.getContext('2d');
    let farbe = new THREE.Color(0x6b5a48);
    if (rahmen && bild) {
      ctx.drawImage(bild, rahmen.x, rahmen.y, rahmen.b, rahmen.h, 0, 0, rahmen.b, rahmen.h);
      const daten = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      let r = 0, gr = 0, b = 0, n = 0;
      for (let i = 0; i < daten.length; i += 16) {
        if (daten[i + 3] < 128) continue;
        r += daten[i]; gr += daten[i + 1]; b += daten[i + 2]; n++;
      }
      if (n) farbe = new THREE.Color(r / n / 255, gr / n / 255, b / n / 255).multiplyScalar(0.6).convertSRGBToLinear();
    } else {
      ctx.fillStyle = '#6b5a48';
      ctx.fillRect(0, 0, 4, 4);
    }
    const textur = new THREE.CanvasTexture(canvas);
    textur.colorSpace = THREE.SRGBColorSpace;
    const eintrag = { textur, farbe };
    this.spriteCache.set(typ, eintrag);
    return eintrag;
  }

  #neueTaschenlampe(mitSchatten) {
    const spot = new THREE.SpotLight(0xfff1d6, 0, 650, 0.45, 0.5, 1);
    spot.castShadow = mitSchatten;
    spot.shadow.mapSize.set(1024, 1024);
    spot.shadow.bias = -0.0008;
    this.szene.add(spot, spot.target);
    return spot;
  }

  #baueEffektObjekte() {
    this.spurGeometrie = new THREE.BufferGeometry();
    this.spuren = new THREE.LineSegments(
      this.spurGeometrie,
      new THREE.LineBasicMaterial({ color: 0xffe6a0, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending }),
    );
    this.spuren.frustumCulled = false;
    this.partikelGeometrie = new THREE.BufferGeometry();
    this.partikel = new THREE.Points(this.partikelGeometrie, new THREE.PointsMaterial({ color: 0x7a1510, size: 3 }));
    this.partikel.frustumCulled = false;
    this.blutFlecken = new Map(); // Effekt-Objekt → Mesh
    this.szene.add(this.spuren, this.partikel);
  }

  // ---------------------------------------------------------------------------
  // Pro Frame

  #aktualisiereFiguren(entitaeten, dt) {
    const gesehen = new Set();
    for (const e of entitaeten) {
      if (e.typ !== 'spieler' && e.typ !== 'zombie') continue;
      gesehen.add(e.id);
      let f = this.figuren.get(e.id);
      if (!f) {
        f = this.#neueFigur(e);
        this.figuren.set(e.id, f);
      }
      f.gruppe.visible = !e.tot;
      f.gruppe.position.set(e.x, 0, e.y);
      f.gruppe.rotation.y = Math.PI / 2 - e.blick;

      const tempo = e.geschwindigkeit ?? 0;
      let name = tempo > 12 ? 'rennen' : 'stehen';
      let zeitfaktor = 1;
      if (name === 'rennen') zeitfaktor = e.typ === 'zombie' ? Math.max(0.5, tempo / 140) : Math.max(0.6, tempo / 170);
      if (e.aktion === 'angriff' || e.aktion === 'nahkampf') name = 'springen';
      if (f.aktuell !== name) {
        const neu = f.aktionen[name];
        neu.reset().fadeIn(0.15).play();
        f.aktionen[f.aktuell]?.fadeOut(0.15);
        f.aktuell = name;
      }
      f.aktionen[name].timeScale = zeitfaktor;
      f.mixer.update(dt);
    }
    for (const [id, f] of this.figuren) {
      if (gesehen.has(id)) continue;
      this.szene.remove(f.gruppe);
      f.mixer.stopAllAction();
      this.figuren.delete(id);
    }
  }

  #neueFigur(e) {
    const modell = SkeletonUtils.clone(this.basisModell);
    const skin = this.skins[e.typ === 'spieler' ? SKINS.spieler : SKINS[e.variante] ?? SKINS.normal];
    modell.traverse((teil) => {
      if (!teil.isMesh) return;
      teil.material = new THREE.MeshStandardMaterial({ map: skin, roughness: 0.75 });
      if (e.variante === 'brocken') teil.material.color.setRGB(0.75, 0.6, 0.55);
      teil.castShadow = true;
    });
    modell.scale.setScalar(this.modellMassstab * (e.groesse ?? 1));
    const gruppe = new THREE.Group();
    gruppe.add(modell);
    this.szene.add(gruppe);
    const mixer = new THREE.AnimationMixer(modell);
    const aktionen = {};
    for (const [name, clip] of Object.entries(this.clips)) {
      aktionen[name] = mixer.clipAction(clip);
      if (name === 'springen') {
        aktionen[name].setLoop(THREE.LoopOnce, 1);
        aktionen[name].clampWhenFinished = true;
      }
    }
    aktionen.stehen.play();
    // Zombies nicht alle im Gleichtakt
    mixer.setTime(Math.random() * 2);
    return { gruppe, mixer, aktionen, aktuell: 'stehen' };
  }

  /** Taschenlampen der nächsten Spieler (eigene zuerst, mit Schatten) – nur wenn deren Lampe an ist. */
  #aktualisiereTaschenlampen(entitaeten, fokus) {
    const spieler = entitaeten
      .filter((e) => e.typ === 'spieler' && !e.tot && e.lichtAn !== false)
      .sort((a, b) => (b.istEigener ? 1 : 0) - (a.istEigener ? 1 : 0) || Math.hypot(a.x - fokus.x, a.y - fokus.y) - Math.hypot(b.x - fokus.x, b.y - fokus.y));
    this.taschenlampen.forEach((spot, i) => {
      const s = spieler[i];
      if (!s) {
        spot.intensity = 0;
        return;
      }
      const vorne = { x: Math.cos(s.blick), z: Math.sin(s.blick) };
      // Vor dem Körper (Hand) – sitzt die Lampe IN der Figur, verschluckt deren Schatten den ganzen Kegel
      spot.position.set(s.x + vorne.x * 20, 40, s.y + vorne.z * 20);
      spot.target.position.set(s.x + vorne.x * 200, 0, s.y + vorne.z * 200);
      spot.intensity = this.lichtAn ? 2600 : 800;
    });
  }

  #aktualisiereItems(gegenstaende, markiertId, jetzt) {
    const gesehen = new Set();
    for (const g of gegenstaende) {
      gesehen.add(g.id);
      let mesh = this.items.get(g.id);
      if (!mesh) {
        mesh = this.#itemMesh(g);
        this.items.set(g.id, mesh);
        this.szene.add(mesh);
      }
      const pulsieren = g.id === markiertId ? 0.6 + Math.sin(jetzt / 150) * 0.3 : 0.25;
      mesh.material.emissiveIntensity = pulsieren;
    }
    for (const [id, mesh] of this.items) {
      if (gesehen.has(id)) continue;
      this.szene.remove(mesh);
      this.items.delete(id);
    }
  }

  #itemMesh(g) {
    const icon = this.assets?.item(g.defId);
    const bild = this.assets?.itemBild;
    const canvas = document.createElement('canvas');
    canvas.width = icon?.b ?? 8;
    canvas.height = icon?.h ?? 8;
    if (icon && bild) canvas.getContext('2d').drawImage(bild, icon.x, icon.y, icon.b, icon.h, 0, 0, icon.b, icon.h);
    const textur = new THREE.CanvasTexture(canvas);
    textur.colorSpace = THREE.SRGBColorSpace;
    const massstab = ((icon?.weltGroesse ?? 20) * 1.4) / Math.max(canvas.width, canvas.height);
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(canvas.width * massstab, canvas.height * massstab),
      new THREE.MeshStandardMaterial({ map: textur, emissiveMap: textur, emissive: 0xffffff, transparent: true, alphaTest: 0.3 }),
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(g.x, 1.5, g.y);
    return mesh;
  }

  #aktualisiereLampen(jetzt) {
    for (const licht of this.lampen ?? []) {
      licht.intensity = this.lichtAn ? licht.userData.basis * flackern(licht.userData.objekt, jetzt) : 0;
    }
  }

  #aktualisiereEffekte({ leuchtspuren, feuer, partikel, flecken }) {
    // Leuchtspuren als Linien in Brusthöhe
    const punkte = new Float32Array(leuchtspuren.length * 6);
    leuchtspuren.forEach((s, i) => punkte.set([s.x, ZIELHOEHE, s.y, s.zx, ZIELHOEHE, s.zy], i * 6));
    this.spurGeometrie.setAttribute('position', new THREE.BufferAttribute(punkte, 3));
    // Mündungsfeuer als kurze Punktlichter
    this.muendungslichter.forEach((licht, i) => {
      const f = feuer[i];
      licht.intensity = f ? 1400 * (1 - f.alter / f.dauer) : 0;
      if (f) licht.position.set(f.x, ZIELHOEHE + 6, f.y);
    });
    // Blutspritzer
    const p = new Float32Array(partikel.length * 3);
    partikel.forEach((t, i) => p.set([t.x, 12 + (1 - t.alter / t.dauer) * 20, t.y], i * 3));
    this.partikelGeometrie.setAttribute('position', new THREE.BufferAttribute(p, 3));
    // Blutlachen am Boden
    const aktiv = new Set(flecken);
    for (const fleck of flecken) {
      if (this.blutFlecken.has(fleck)) continue;
      const { textur } = this.#spriteTextur(fleck.sprite);
      const mesh = new THREE.Mesh(
        new THREE.PlaneGeometry(fleck.groesse, fleck.groesse),
        new THREE.MeshStandardMaterial({ map: textur, transparent: true, depthWrite: false, roughness: 0.4 }),
      );
      mesh.rotation.set(-Math.PI / 2, 0, fleck.winkel);
      mesh.position.set(fleck.x, 0.6, fleck.y);
      this.szene.add(mesh);
      this.blutFlecken.set(fleck, mesh);
    }
    for (const [fleck, mesh] of this.blutFlecken) {
      if (aktiv.has(fleck)) {
        mesh.material.opacity = Math.min(1, (1 - fleck.alter / fleck.dauer) * 4) * 0.9;
        continue;
      }
      this.szene.remove(mesh);
      this.blutFlecken.delete(fleck);
    }
  }

  /** 2D-Ebene über der 3D-Szene: Namen, Lebensbalken, Vignette, Schadensblitz. */
  #zeichneOverlay(entitaeten, effekte) {
    const ctx = this.octx;
    const dpr = this.overlay.width / Math.max(1, this.kamera.breite);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.overlay.width, this.overlay.height);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    for (const e of entitaeten) {
      if (e.typ !== 'spieler' && e.typ !== 'zombie') continue;
      const kopf = this.kamera.weltZuBildschirm(e.x, e.y, FIGUR_HOEHE * (e.groesse ?? 1) + 8);
      zeichneBeschriftung(ctx, { ...e, x: kopf.x, y: kopf.y + 30 });
    }
    const b = this.kamera.breite;
    const h = this.kamera.hoehe;
    const radius = Math.hypot(b, h) / 2;
    const vignette = ctx.createRadialGradient(b / 2, h / 2, radius * 0.5, b / 2, h / 2, radius);
    vignette.addColorStop(0, 'rgba(0, 0, 0, 0)');
    vignette.addColorStop(1, 'rgba(0, 0, 0, 0.5)');
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, b, h);
    effekte?.zeichneBildschirm(ctx, b, h);
  }

  #groesseAnpassen() {
    const breite = window.innerWidth;
    const hoehe = window.innerHeight;
    this.gl.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.gl.setSize(breite, hoehe, false);
    this.kamera3d.aspect = breite / hoehe;
    this.kamera3d.updateProjectionMatrix();
    this.kamera.breite = breite;
    this.kamera.hoehe = hoehe;
  }
}

/** Gleiche Kamera-Schnittstelle wie darstellung/kamera.js – für Zielen & Overlay. */
class KameraAdapter {
  constructor(renderer) {
    this.renderer = renderer;
    this.breite = 1;
    this.hoehe = 1;
    this.zoom = 1;
    this.strahl = new THREE.Raycaster();
    this.ebene = new THREE.Plane(new THREE.Vector3(0, 1, 0), -ZIELHOEHE);
  }

  weltZuBildschirm(x, y, hoehe = 0) {
    const v = new THREE.Vector3(x, hoehe, y).project(this.renderer.kamera3d);
    return { x: ((v.x + 1) / 2) * this.breite, y: ((1 - v.y) / 2) * this.hoehe };
  }

  /** Mausposition → Punkt in der Welt (Strahl auf eine Ebene in Brusthöhe). */
  bildschirmZuWelt(sx, sy) {
    const ndc = new THREE.Vector2((sx / this.breite) * 2 - 1, -(sy / this.hoehe) * 2 + 1);
    this.strahl.setFromCamera(ndc, this.renderer.kamera3d);
    const punkt = new THREE.Vector3();
    if (!this.strahl.ray.intersectPlane(this.ebene, punkt)) return null;
    return { x: punkt.x, y: punkt.z };
  }

  istSichtbar() {
    return true;
  }
}

/** InstancedMesh aus einer Liste von Quadern { x, z, unten, hoehe } (Geometrie hat Höhe 1). */
function instanzen(geometrie, material, teile) {
  const mesh = new THREE.InstancedMesh(geometrie, material, Math.max(1, teile.length));
  mesh.count = teile.length;
  const matrix = new THREE.Matrix4();
  teile.forEach((t, i) => {
    matrix.compose(new THREE.Vector3(t.x, t.unten + t.hoehe / 2, t.z), new THREE.Quaternion(), new THREE.Vector3(1, t.hoehe, 1));
    mesh.setMatrixAt(i, matrix);
  });
  mesh.instanceMatrix.needsUpdate = true;
  return mesh;
}

function istWandig(welt, tx, ty) {
  const name = KACHELN[welt.kachelAn(tx, ty)]?.name;
  return name === 'wand' || name === 'fenster';
}
