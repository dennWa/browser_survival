import * as THREE from 'three';
import { FBXLoader, SkeletonUtils } from '../vendor/three/addons.js';
import { KartenModell } from './kartenModell.js';
import { vereineGeometrien } from './geometrie.js';
import { Fussspuren } from './fussspuren.js';
import { itemGeometrie, ITEM_MATERIAL, rucksackTeile } from './itemModelle.js';
import { zeichneBeschriftung } from './beschriftung.js';
import { richteFigurEin, aktualisiereHaltung } from './figurHaltung.js';
import { erzeugeWaffe, WAFFEN_NAMEN } from './waffenModelle.js';

/**
 * Renderer mit Three.js (WebGL): schräge Kamera, echte Lichter und Schatten, Tag & Nacht.
 *
 * Gameplay bleibt 2D (x/y auf dem Boden); nur die Darstellung ist 3D:
 *   Weltpixel x → three.x, Weltpixel y → three.z, Höhe → three.y (1 Einheit = 1 Weltpixel)
 *
 * Ebenen: WebGL-Canvas (#spielflaeche3d) liegt UNTER dem 2D-Canvas (#spielflaeche). Das 2D-Canvas bleibt
 * durchsichtig, empfängt Maus/Touch und zeigt Namen & Lebensbalken. Vignette und Schadensblitz sind CSS.
 *
 * Performance (Ziel: 60 FPS auch auf Handys):
 *   - Karte in wenigen Draw-Calls (kartenModell.js: Instancing, zusammengefasste Möbel, eingefrorene Matrizen)
 *   - feste Lichteranzahl: Lampen-Pool (nur die nächsten LAMPEN_POOL Kartenlampen leuchten echt), 3 Taschenlampen,
 *     2 Mündungsblitze → Shader werden nie neu kompiliert
 *   - alle Shader beim Laden vorkompiliert (#vorkompilieren), Materialien geteilt
 *   - adaptive Auflösung: fallen die FPS, wird die Renderauflösung stufenweise gesenkt
 *   - Figuren außerhalb der Sichtweite werden nicht animiert
 */
const ASSETS = new URL('../assets/', import.meta.url);
const FIGUR_HOEHE = 64;
const SCHNITT_RADIUS = 115; // px um die eigene Figur, in denen kameraseitige Wände aufgeschnitten werden
const SCHNITT_HOEHE = 10; // bis zu dieser Höhe bleiben aufgeschnittene Wände als Sockel stehen
const ZIELHOEHE = 36; // Mausstrahl trifft diese Höhe (Brust) → Zielen fühlt sich richtig an
const KAMERA_VERSATZ = new THREE.Vector3(0, 560, 380);
const SKINS = { spieler: 'humanMaleA', normal: 'zombieMaleA', laeufer: 'zombieFemaleA', brocken: 'zombieMaleA' };
const MAX_TASCHENLAMPEN = 3;
const LAMPEN_POOL = 6; // so viele Kartenlampen leuchten gleichzeitig echt (die nächsten)
const MUENDUNGS_LICHTER = 2;
const SICHTWEITE = 1300; // weiter entfernte Figuren werden nicht animiert/gezeichnet
const AUFLOESUNG_MIN = 0.55;
/** Lichtfarben für Tag, Nacht und Dämmerung (siehe #tageslicht) */
const TAG = { sonne: new THREE.Color(0xfff1dc), himmel: new THREE.Color(0xbfd8ff), boden: new THREE.Color(0x4a4636), hintergrund: new THREE.Color(0x9cc3e4) };
const NACHT = { sonne: new THREE.Color(0x9db4e8), himmel: new THREE.Color(0x3a4a70), boden: new THREE.Color(0x101010), hintergrund: new THREE.Color(0x04060b) };
const DAEMMERUNG = { sonne: new THREE.Color(0xff9a4d), hintergrund: new THREE.Color(0xe08a5a) };

const _ziel = new THREE.Vector3();
const _kameraZiel = new THREE.Vector3();

export class Renderer {
  /** Lädt Figuren & Animationen, baut den Renderer. Wirft, wenn WebGL fehlt. */
  static async erstelle(leinwand2d, assets) {
    const renderer = new Renderer(leinwand2d, assets);
    await renderer.#ladeFiguren();
    return renderer;
  }

  constructor(leinwand2d, assets) {
    this.assets = assets;
    this.overlay = leinwand2d;
    this.octx = leinwand2d.getContext('2d');
    this.leinwand = Object.assign(document.createElement('canvas'), { id: 'spielflaeche3d' });
    leinwand2d.before(this.leinwand);
    this.vignette = document.getElementById('vignette');
    this.schadenEbene = document.getElementById('schadensblitz');
    this.istHandy = matchMedia('(pointer: coarse)').matches;

    this.gl = new THREE.WebGLRenderer({ canvas: this.leinwand, antialias: !this.istHandy, powerPreference: 'high-performance' });
    this.gl.shadowMap.enabled = true;
    this.gl.shadowMap.type = THREE.PCFShadowMap;
    this.gl.toneMapping = THREE.ACESFilmicToneMapping;
    this.gl.outputColorSpace = THREE.SRGBColorSpace;

    this.szene = new THREE.Scene();
    this.szene.background = new THREE.Color(0x04060b);
    this.szene.fog = new THREE.Fog(0x04060b, 650, 1500);
    this.kamera3d = new THREE.PerspectiveCamera(38, 1, 10, 4000);
    this.kamera = new KameraAdapter(this);
    this.nachtsicht = false; // Admin: Dunkelheit aus
    this.letzteZeit = 0;

    // Grundlicht: Himmel/Boden-Licht + Sonne bzw. Mond (Farbe & Stärke je nach Tageszeit, siehe #tageslicht)
    this.umgebung = new THREE.HemisphereLight(0x3a4a70, 0x101010, 0.55);
    this.mond = new THREE.DirectionalLight(0x9db4e8, 0.9);
    this.mond.castShadow = true;
    this.mond.shadow.mapSize.set(this.istHandy ? 1024 : 2048, this.istHandy ? 1024 : 2048);
    Object.assign(this.mond.shadow.camera, { left: -650, right: 650, top: 650, bottom: -650, near: 10, far: 2500 });
    this.mond.shadow.bias = -0.0006;
    this.szene.add(this.umgebung, this.mond, this.mond.target);

    /** Wand-Schnitt: Wände zwischen Kamera und eigener Figur werden nahe der Figur weggeschnitten (#mitSchnitt) */
    this.schnitt = { uFokus: { value: new THREE.Vector3() }, uRadius: { value: SCHNITT_RADIUS }, uHoehe: { value: SCHNITT_HOEHE } };
    this.figuren = new Map(); // Entitäts-ID → { gruppe, mixer, aktionen, aktuell, ... }
    this.items = new Map();
    /** Leuchtring unter dem Item, das E gerade aufheben würde */
    this.markierRing = new THREE.Mesh(
      new THREE.RingGeometry(11, 14, 28, 1, 0, Math.PI * 1.6).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 0.7, depthWrite: false }),
    );
    this.markierRing.visible = false;
    this.itemMaterialien = new Map(); // defId → { normal, markiert, breite, hoehe }
    this.figurMaterialien = new Map(); // Skin-Schlüssel → Material (geteilt)
    this.taschenlampen = Array.from({ length: MAX_TASCHENLAMPEN }, (_, i) => this.#neueTaschenlampe(i === 0));
    this.lampenPool = Array.from({ length: LAMPEN_POOL }, () => this.#neuesPunktlicht(0xffffff, 300));
    this.muendungslichter = Array.from({ length: MUENDUNGS_LICHTER }, () => this.#neuesPunktlicht(0xffc070, 380));
    this.#baueEffektObjekte();
    this.fussspuren = new Fussspuren(this.szene);

    // Adaptive Auflösung
    this.aufloesungMax = Math.min(window.devicePixelRatio || 1, this.istHandy ? 1.5 : 2);
    this.aufloesung = this.aufloesungMax;
    this.messung = { frames: 0, zeit: 0, seit: 0 };
    this.letzterSchaden = -1;
    this.overlayBenutzt = false;

    this.#groesseAnpassen();
    window.addEventListener('resize', () => this.#groesseAnpassen());
    window.visualViewport?.addEventListener('resize', () => this.#groesseAnpassen());
  }

  anzeigen() {
    this.leinwand.hidden = false;
    if (this.vignette) this.vignette.hidden = false;
  }

  verbergen() {
    this.leinwand.hidden = true;
    if (this.vignette) this.vignette.hidden = true;
    if (this.schadenEbene) this.schadenEbene.style.opacity = '0';
    this.leeren();
  }

  leeren() {
    this.octx.setTransform(1, 0, 0, 1, 0, 0);
    this.octx.clearRect(0, 0, this.overlay.width, this.overlay.height);
  }

  /** Admin-Nachtsicht: Szene immer taghell. @returns neuer Zustand */
  nachtsichtUmschalten() {
    this.nachtsicht = !this.nachtsicht;
    return this.nachtsicht;
  }

  setzeAssets(assets) {
    this.assets = assets;
  }

  /** Baut die statische Szene aus der Welt und kompiliert alle Shader vor (dauert kurz, danach ruckelfrei). */
  setzeWelt(welt) {
    this.welt = welt;
    if (this.karte) this.szene.remove(this.karte.statisch, this.karte.beweglich);
    for (const f of this.figuren.values()) this.szene.remove(f.gruppe);
    this.figuren.clear();
    for (const m of this.items.values()) this.szene.remove(m);
    this.items.clear();
    this.karte = new KartenModell({
      welt,
      assets: this.assets,
      gl: this.gl,
      mitSchnitt: (m) => this.#mitSchnitt(m),
      bodenMassstab: this.istHandy ? 0.6 : 1,
    });
    this.szene.add(this.karte.statisch, this.karte.beweglich);
    this.#vorkompilieren();
  }

  /** Kurzinfo für das Debug-Overlay (F3). */
  statistik() {
    const info = this.gl.info.render;
    return `Draw-Calls ${info.calls} · Dreiecke ${Math.round(info.triangles / 1000)}k · Auflösung ${this.aufloesung.toFixed(2)}`;
  }

  /**
   * @param tageszeit  { helligkeit 0..1, istNacht, anteil } (gemeinsam/tageszeit.js)
   */
  zeichne({ fokus, entitaeten, gegenstaende, jetzt, effekte = null, markiertId = null, tageszeit = null }) {
    const dt = this.letzteZeit ? Math.min(0.1, (jetzt - this.letzteZeit) / 1000) : 0;
    this.letzteZeit = jetzt;
    this.#passeAufloesungAn(dt, jetzt);

    // Kamera folgt weich dem eigenen Spieler
    _ziel.set(fokus.x, 0, fokus.y);
    _kameraZiel.copy(_ziel).add(this.kameraVersatz);
    this.kamera3d.position.lerp(_kameraZiel, Math.min(1, dt * 8) || 1);
    this.kamera3d.lookAt(_ziel.x, 0, _ziel.z - 20);
    this.schnitt.uFokus.value.set(fokus.x, 0, fokus.y);
    const dunkel = this.#tageslicht(tageszeit, _ziel);

    this.karte.aktualisiere(dt, dunkel);
    this.#aktualisiereFiguren(entitaeten, fokus, dt, jetzt);
    this.#aktualisiereTaschenlampen(entitaeten, fokus, dunkel);
    this.#aktualisiereItems(gegenstaende, markiertId, jetzt);
    this.fussspuren.aktualisiere(entitaeten, jetzt);
    this.#aktualisiereLampenPool(fokus, jetzt, dunkel);
    if (effekte) {
      effekte.aktualisiere(dt, jetzt);
      this.#aktualisiereEffekte(effekte.zustand);
    }

    this.gl.render(this.szene, this.kamera3d);
    this.#zeichneOverlay(entitaeten, fokus);
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

  /**
   * Alle Shader-Varianten jetzt kompilieren und Texturen hochladen, nicht erst wenn sie zum ersten Mal ins Bild
   * kommen (das waren die Ruckler beim Start): je eine Figur pro Aussehen, jede Waffe, ein Item, ein Blutfleck.
   */
  #vorkompilieren() {
    const probe = new THREE.Group();
    probe.position.set(this.welt.pixelBreite / 2, 0, this.welt.pixelHoehe / 2);
    for (const variante of ['spieler', 'normal', 'laeufer', 'brocken']) {
      const f = this.#neueFigur({ id: -1, typ: variante === 'spieler' ? 'spieler' : 'zombie', variante });
      this.szene.remove(f.gruppe);
      probe.add(f.gruppe);
    }
    for (const name of WAFFEN_NAMEN) probe.add(erzeugeWaffe(name));
    const icon = new THREE.Mesh(this.#itemMaterial('apfel').geometrie, this.#itemMaterial('apfel').markiert);
    probe.add(icon, this.#itemMesh({ id: -2, defId: 'apfel', x: 0, y: 0 }), this.#blutMesh({ sprite: 'blutlache', groesse: 10, winkel: 0, x: 0, y: 0 }));
    this.szene.add(probe);
    this.lampenPool.forEach((l) => (l.intensity = 1));
    this.gl.compile(this.szene, this.kamera3d);
    for (const t of [this.karte.bodenTextur, ...Object.values(this.skins)]) this.gl.initTexture(t);
    this.gl.render(this.szene, this.kamera3d); // auch Schatten-Shader & Uploads einmal anstoßen
    this.szene.remove(probe);
  }

  /**
   * Material bekommt einen "Röntgen-Schnitt": Fragmente über SCHNITT_HOEHE, die südlich (kameraseitig) der
   * eigenen Figur und näher als SCHNITT_RADIUS liegen, werden verworfen – so verdecken Wände die Figur nie.
   * Schatten bleiben unverändert (der Schattendurchgang nutzt ein eigenes Material).
   */
  #mitSchnitt(material) {
    material.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, this.schnitt);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vSchnittPos;')
        .replace(
          '#include <project_vertex>',
          `#include <project_vertex>
          vec4 schnittPos = vec4(transformed, 1.0);
          #ifdef USE_INSTANCING
            schnittPos = instanceMatrix * schnittPos;
          #endif
          vSchnittPos = (modelMatrix * schnittPos).xyz;`,
        );
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vSchnittPos;\nuniform vec3 uFokus;\nuniform float uRadius;\nuniform float uHoehe;')
        .replace(
          '#include <clipping_planes_fragment>',
          `#include <clipping_planes_fragment>
          vec2 schnittAbstand = vSchnittPos.xz - uFokus.xz;
          if (vSchnittPos.y > uHoehe && schnittAbstand.y > -6.0 && length(schnittAbstand * vec2(0.8, 1.0)) < uRadius) discard;`,
        );
    };
    material.customProgramCacheKey = () => 'schnitt';
    return material;
  }

  #neueTaschenlampe(mitSchatten) {
    const spot = new THREE.SpotLight(0xfff1d6, 0, 650, 0.45, 0.5, 1);
    spot.castShadow = mitSchatten;
    spot.shadow.mapSize.set(this.istHandy ? 512 : 1024, this.istHandy ? 512 : 1024);
    spot.shadow.bias = -0.0008;
    this.szene.add(spot, spot.target);
    return spot;
  }

  #neuesPunktlicht(farbe, reichweite) {
    const licht = new THREE.PointLight(farbe, 0, reichweite, 1);
    this.szene.add(licht);
    return licht;
  }

  #baueEffektObjekte() {
    this.spurGeometrie = new THREE.BufferGeometry();
    this.spurPunkte = new THREE.BufferAttribute(new Float32Array(6 * 64), 3);
    this.spurGeometrie.setAttribute('position', this.spurPunkte);
    this.spuren = new THREE.LineSegments(
      this.spurGeometrie,
      new THREE.LineBasicMaterial({ color: 0xffe6a0, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending }),
    );
    this.spuren.frustumCulled = false;
    this.partikelGeometrie = new THREE.BufferGeometry();
    this.partikelPunkte = new THREE.BufferAttribute(new Float32Array(3 * 400), 3);
    this.partikelGeometrie.setAttribute('position', this.partikelPunkte);
    this.partikel = new THREE.Points(this.partikelGeometrie, new THREE.PointsMaterial({ color: 0x7a1510, size: 3 }));
    this.partikel.frustumCulled = false;
    this.blutFlecken = new Map(); // Effekt-Objekt → Mesh
    this.szene.add(this.spuren, this.partikel, this.markierRing);
  }

  // ---------------------------------------------------------------------------
  // Pro Frame

  /**
   * Fällt die Bildrate unter ~50 FPS, wird die Auflösung gesenkt; läuft es länger locker, wieder angehoben.
   * Mit Hysterese: Jede Änderung (setPixelRatio) baut die Bildpuffer neu und kostet einen kurzen Hänger –
   * ständiges Hin- und Herschalten fühlte sich wie Ruckeln an. Darum: nach dem Senken 30 s kein Anheben,
   * Anheben erst nach drei guten Messfenstern hintereinander.
   */
  #passeAufloesungAn(dt, jetzt) {
    const m = this.messung;
    if (dt > 0.25) return; // Tab war im Hintergrund o. Ä. – zählt nicht
    m.frames++;
    m.zeit += dt;
    if (jetzt - m.seit < 2000) return;
    const mittel = m.zeit / Math.max(1, m.frames);
    const vorher = this.aufloesung;
    if (mittel > 1 / 48 && this.aufloesung > AUFLOESUNG_MIN) {
      this.aufloesung = Math.max(AUFLOESUNG_MIN, this.aufloesung * 0.85);
      this.anhebenGesperrtBis = jetzt + 30000;
      this.guteFenster = 0;
    } else if (mittel < 1 / 57) {
      this.guteFenster = (this.guteFenster ?? 0) + 1;
      if (this.guteFenster >= 3 && jetzt > (this.anhebenGesperrtBis ?? 0) && this.aufloesung < this.aufloesungMax) {
        this.aufloesung = Math.min(this.aufloesungMax, this.aufloesung * 1.1);
        this.guteFenster = 0;
      }
    } else {
      this.guteFenster = 0;
    }
    if (this.aufloesung !== vorher) this.gl.setPixelRatio(this.aufloesung);
    this.messung = { frames: 0, zeit: 0, seit: jetzt };
  }

  #aktualisiereFiguren(entitaeten, fokus, dt, jetzt) {
    const gesehen = new Set();
    for (const e of entitaeten) {
      if (e.typ !== 'spieler' && e.typ !== 'zombie') continue;
      gesehen.add(e.id);
      let f = this.figuren.get(e.id);
      if (!f) {
        f = this.#neueFigur(e);
        this.figuren.set(e.id, f);
      }
      const nah = Math.abs(e.x - fokus.x) < SICHTWEITE && Math.abs(e.y - fokus.y) < SICHTWEITE;
      f.gruppe.visible = !e.tot && nah;
      if (!f.gruppe.visible) continue;
      const schlaeft = e.arbeit === 'schlafen' && e.arbeitOrt;
      if (schlaeft) {
        // Im Bett liegen: auf die Matratze, Kopf zum Kopfende
        // Rücken nach unten (x-Drehung), Kopf nach Norden bzw. Osten; Ursprung der Figur = Füße
        const laengs = e.arbeitOrt.laengs;
        f.gruppe.position.set(e.arbeitOrt.x - (laengs ? 0 : 30), 20, e.arbeitOrt.y + (laengs ? 30 : 0));
        f.gruppe.rotation.set(-Math.PI / 2, laengs ? 0 : -Math.PI / 2, 0, 'YXZ');
      } else {
        f.gruppe.position.set(e.x, 0, e.y);
        f.gruppe.rotation.set(0, Math.PI / 2 - e.blick, 0, 'YXZ');
      }

      const tempo = e.geschwindigkeit ?? 0;
      const name = tempo > 12 ? 'rennen' : 'stehen';
      let zeitfaktor = 1;
      if (name === 'rennen') zeitfaktor = e.typ === 'zombie' ? Math.max(0.5, tempo / 140) : Math.max(0.6, tempo / 170);
      if (f.aktuell !== name) {
        const neu = f.aktionen[name];
        neu.reset().fadeIn(0.15).play();
        f.aktionen[f.aktuell]?.fadeOut(0.15);
        f.aktuell = name;
      }
      f.aktionen[name].timeScale = zeitfaktor;
      if (!!e.rucksack !== !!f.rucksack) this.#setzeRucksack(f, !!e.rucksack);
      f.mixer.update(dt);
      if (!schlaeft) aktualisiereHaltung(f, e, jetzt);
    }
    for (const [id, f] of this.figuren) {
      if (gesehen.has(id)) continue;
      this.szene.remove(f.gruppe);
      f.mixer.stopAllAction();
      this.figuren.delete(id);
    }
  }

  #figurMaterial(e) {
    const schluessel = e.typ === 'spieler' ? 'spieler' : (e.variante ?? 'normal');
    if (!this.figurMaterialien.has(schluessel)) {
      const material = new THREE.MeshStandardMaterial({ map: this.skins[SKINS[schluessel] ?? SKINS.normal], roughness: 0.75 });
      if (schluessel === 'brocken') material.color.setRGB(0.75, 0.6, 0.55);
      this.figurMaterialien.set(schluessel, material);
    }
    return this.figurMaterialien.get(schluessel);
  }

  /** Rucksack auf dem Rücken (an der Figur befestigt; lokales +z = Blickrichtung → Rücken = -z). */
  #setzeRucksack(figur, an) {
    if (!an) {
      figur.rucksack?.removeFromParent();
      figur.rucksack = null;
      return;
    }
    this.rucksackGeometrie ??= vereineGeometrien(rucksackTeile(), { mitFarbe: true });
    const mesh = new THREE.Mesh(this.rucksackGeometrie, ITEM_MATERIAL);
    mesh.castShadow = true;
    mesh.position.set(0, FIGUR_HOEHE * 0.6, -8.5);
    figur.gruppe.add(mesh);
    figur.rucksack = mesh;
  }

  #neueFigur(e) {
    const modell = SkeletonUtils.clone(this.basisModell);
    const material = this.#figurMaterial(e);
    modell.traverse((teil) => {
      if (!teil.isMesh) return;
      teil.material = material;
      teil.castShadow = true;
    });
    modell.scale.setScalar(this.modellMassstab * (e.groesse ?? 1));
    const gruppe = new THREE.Group();
    gruppe.add(modell);
    this.szene.add(gruppe);
    const mixer = new THREE.AnimationMixer(modell);
    const aktionen = {};
    for (const [name, clip] of Object.entries(this.clips)) aktionen[name] = mixer.clipAction(clip);
    aktionen.stehen.play();
    // Zombies nicht alle im Gleichtakt
    mixer.setTime(Math.random() * 2);
    const figur = { gruppe, mixer, aktionen, aktuell: 'stehen' };
    richteFigurEin(figur, modell);
    return figur;
  }

  /** Taschenlampen der nächsten Spieler (eigene zuerst, mit Schatten) – nur wenn deren Lampe an ist. */
  #aktualisiereTaschenlampen(entitaeten, fokus, dunkel) {
    const spieler = [];
    for (const e of entitaeten) if (e.typ === 'spieler' && !e.tot && e.lichtAn !== false && e.arbeit !== 'schlafen') spieler.push(e);
    spieler.sort((a, b) => (b.istEigener ? 1 : 0) - (a.istEigener ? 1 : 0) || Math.hypot(a.x - fokus.x, a.y - fokus.y) - Math.hypot(b.x - fokus.x, b.y - fokus.y));
    this.taschenlampen.forEach((spot, i) => {
      const s = spieler[i];
      if (!s) {
        spot.intensity = 0;
        return;
      }
      const vx = Math.cos(s.blick);
      const vz = Math.sin(s.blick);
      // Aus der Lampe/Waffe in der Hand – mindestens etwas vor dem Körper, sonst verschluckt dessen Schatten den Kegel
      const f = this.figuren.get(s.id);
      if (f?.hatMuendung) spot.position.set(f.muendung.x + vx * 4, f.muendung.y, f.muendung.z + vz * 4);
      else spot.position.set(s.x + vx * 20, 40, s.y + vz * 20);
      spot.target.position.set(s.x + vx * 200, 0, s.y + vz * 200);
      // Tagsüber sieht man den Kegel kaum
      spot.intensity = this.nachtsicht ? 600 : 500 + 2300 * dunkel;
    });
  }

  /** Nur die nächsten Kartenlampen bekommen ein echtes Licht aus dem Pool (feste Lichteranzahl = keine Shader-Neubauten). */
  #aktualisiereLampenPool(fokus, jetzt, dunkel) {
    const lampen = this.karte.lampen;
    if (dunkel < 0.03 || lampen.length === 0) {
      for (const l of this.lampenPool) l.intensity = 0;
      return;
    }
    // Alle paar Frames neu sortieren reicht
    if (!this.naechsteLampen || jetzt - this.lampenSortiert > 250) {
      this.lampenSortiert = jetzt;
      this.naechsteLampen = [...lampen].sort((a, b) => Math.hypot(a.x - fokus.x, a.z - fokus.y) - Math.hypot(b.x - fokus.x, b.z - fokus.y)).slice(0, LAMPEN_POOL);
    }
    this.lampenPool.forEach((licht, i) => {
      const lampe = this.naechsteLampen[i];
      if (!lampe) {
        licht.intensity = 0;
        return;
      }
      licht.position.set(lampe.x, lampe.y, lampe.z);
      licht.color.copy(lampe.farbe);
      licht.distance = lampe.reichweite;
      licht.intensity = lampe.staerke * flackern(lampe.objekt, jetzt) * dunkel;
    });
  }

  #itemMaterial(defId) {
    if (this.itemMaterialien.has(defId)) return this.itemMaterialien.get(defId);
    const icon = this.assets?.item(defId);
    const bild = this.assets?.itemBild;
    const canvas = document.createElement('canvas');
    canvas.width = icon?.b ?? 8;
    canvas.height = icon?.h ?? 8;
    if (icon && bild) canvas.getContext('2d').drawImage(bild, icon.x, icon.y, icon.b, icon.h, 0, 0, icon.b, icon.h);
    const textur = new THREE.CanvasTexture(canvas);
    textur.colorSpace = THREE.SRGBColorSpace;
    const massstab = ((icon?.weltGroesse ?? 20) * 1.4) / Math.max(canvas.width, canvas.height);
    const basis = { map: textur, emissiveMap: textur, emissive: 0xffffff, transparent: true, alphaTest: 0.3 };
    const eintrag = {
      normal: new THREE.MeshStandardMaterial({ ...basis, emissiveIntensity: 0.25 }),
      markiert: new THREE.MeshStandardMaterial({ ...basis, emissiveIntensity: 0.8 }),
      geometrie: new THREE.PlaneGeometry(canvas.width * massstab, canvas.height * massstab).rotateX(-Math.PI / 2),
    };
    this.itemMaterialien.set(defId, eintrag);
    return eintrag;
  }

  /** 3D-Modell (itemModelle.js) – oder, falls es keins gibt, das flache Icon. */
  #itemMesh(g) {
    const geometrie = itemGeometrie(g.defId);
    let mesh;
    if (geometrie) {
      mesh = new THREE.Mesh(geometrie, ITEM_MATERIAL);
      mesh.castShadow = true;
      mesh.rotation.y = ((g.id * 2.399) % (Math.PI * 2)); // jedes Item liegt anders da
      mesh.position.set(g.x, 0, g.y);
    } else {
      const m = this.#itemMaterial(g.defId);
      mesh = new THREE.Mesh(m.geometrie, m.normal);
      mesh.userData.icon = true;
      mesh.position.set(g.x, 1.5, g.y);
    }
    mesh.userData.defId = g.defId;
    return mesh;
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
      if (mesh.userData.icon) {
        const m = this.itemMaterialien.get(g.defId);
        mesh.material = g.id === markiertId ? m.markiert : m.normal;
      }
      // Markiertes Item (E hebt es auf): hüpft leicht, Ring darunter
      mesh.position.y = (mesh.userData.icon ? 1.5 : 0) + (g.id === markiertId ? 2 + Math.sin(jetzt / 180) * 1.5 : 0);
      if (g.id === markiertId) this.markierRing.position.set(g.x, 0.6, g.y);
    }
    this.markierRing.visible = markiertId !== null && this.items.has(markiertId);
    if (this.markierRing.visible) {
      this.markierRing.material.opacity = 0.55 + Math.sin(jetzt / 150) * 0.25;
      this.markierRing.rotation.y = jetzt / 900;
    }
    if (markiertId !== null) this.itemMaterialien.forEach((m) => (m.markiert.emissiveIntensity = 0.6 + Math.sin(jetzt / 150) * 0.3));
    for (const [id, mesh] of this.items) {
      if (gesehen.has(id)) continue;
      this.szene.remove(mesh);
      this.items.delete(id);
    }
  }

  /**
   * Sonne/Mond, Himmel, Nebel nach Tageszeit. @returns dunkel 0 (Mittag) … 1 (Nacht) – für Lampen & Taschenlampen
   */
  #tageslicht(tageszeit, ziel) {
    const hell = this.nachtsicht ? 1 : (tageszeit?.helligkeit ?? 0);
    const dunkel = 1 - hell;
    // Sonne wandert von Ost nach West (Schatten drehen mit), nachts steht der Mond schräg im Süden
    const anteil = tageszeit?.anteil ?? 0.5;
    const bogen = tageszeit?.istNacht ? 0.35 : anteil;
    const winkel = Math.PI * (1 - bogen);
    this.mond.position.set(ziel.x + Math.cos(winkel) * 700, 650 + Math.sin(winkel) * 450, ziel.z + 380);
    this.mond.target.position.copy(ziel);
    // Farben mischen: Nacht (blau) → Dämmerung (orange) → Tag (warm-weiß)
    const daemmerung = Math.max(0, 1 - Math.abs(hell - 0.35) / 0.35) * (tageszeit?.istNacht ? 0 : 1);
    this.mond.color.copy(NACHT.sonne).lerp(TAG.sonne, hell).lerp(DAEMMERUNG.sonne, daemmerung * 0.6);
    this.mond.intensity = 0.9 + hell * 2.1;
    this.umgebung.color.copy(NACHT.himmel).lerp(TAG.himmel, hell);
    this.umgebung.groundColor.copy(NACHT.boden).lerp(TAG.boden, hell);
    this.umgebung.intensity = 0.55 + hell * 0.75;
    this.szene.background.copy(NACHT.hintergrund).lerp(TAG.hintergrund, hell).lerp(DAEMMERUNG.hintergrund, daemmerung * 0.5);
    this.szene.fog.color.copy(this.szene.background);
    this.szene.fog.near = 650 + hell * 600;
    this.szene.fog.far = 1500 + hell * 1500;
    return dunkel;
  }

  #blutMesh(fleck) {
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(fleck.groesse, fleck.groesse),
      new THREE.MeshStandardMaterial({ map: this.karte.sprite(fleck.sprite), transparent: true, depthWrite: false, roughness: 0.4 }),
    );
    mesh.rotation.set(-Math.PI / 2, 0, fleck.winkel);
    mesh.position.set(fleck.x, 0.6, fleck.y);
    return mesh;
  }

  #aktualisiereEffekte({ leuchtspuren, feuer, partikel, flecken, schadenBlitz }) {
    // Leuchtspuren als Linien in Brusthöhe (fester Puffer, keine neuen Arrays pro Frame)
    const spuren = Math.min(leuchtspuren.length, 64);
    for (let i = 0; i < spuren; i++) {
      const s = leuchtspuren[i];
      this.spurPunkte.array.set([s.x, ZIELHOEHE, s.y, s.zx, ZIELHOEHE, s.zy], i * 6);
    }
    this.spurGeometrie.setDrawRange(0, spuren * 2);
    this.spurPunkte.needsUpdate = spuren > 0;
    // Mündungsfeuer als kurze Punktlichter
    this.muendungslichter.forEach((licht, i) => {
      const f = feuer[i];
      licht.intensity = f ? 1400 * (1 - f.alter / f.dauer) : 0;
      if (f) licht.position.set(f.x, ZIELHOEHE + 6, f.y);
    });
    // Blutspritzer
    const anzahl = Math.min(partikel.length, 400);
    for (let i = 0; i < anzahl; i++) {
      const t = partikel[i];
      this.partikelPunkte.array.set([t.x, 12 + (1 - t.alter / t.dauer) * 20, t.y], i * 3);
    }
    this.partikelGeometrie.setDrawRange(0, anzahl);
    this.partikelPunkte.needsUpdate = anzahl > 0;
    // Blutlachen am Boden
    const aktiv = new Set(flecken);
    for (const fleck of flecken) {
      if (this.blutFlecken.has(fleck)) continue;
      const mesh = this.#blutMesh(fleck);
      this.szene.add(mesh);
      this.blutFlecken.set(fleck, mesh);
    }
    for (const [fleck, mesh] of this.blutFlecken) {
      if (aktiv.has(fleck)) {
        mesh.material.opacity = Math.min(1, (1 - fleck.alter / fleck.dauer) * 4) * 0.9;
        continue;
      }
      this.szene.remove(mesh);
      mesh.material.dispose();
      mesh.geometry.dispose();
      this.blutFlecken.delete(fleck);
    }
    // Roter Rand bei Schaden: CSS-Ebene, nur bei Änderung anfassen
    const schaden = Math.round(schadenBlitz * 20) / 20;
    if (schaden !== this.letzterSchaden && this.schadenEbene) {
      this.letzterSchaden = schaden;
      this.schadenEbene.style.opacity = String(schaden);
    }
  }

  /** 2D-Ebene über der 3D-Szene: nur Namen und Lebensbalken (Vignette & Schaden sind CSS). */
  #zeichneOverlay(entitaeten, fokus) {
    const ctx = this.octx;
    const zuZeichnen = [];
    for (const e of entitaeten) {
      if (e.tot || (e.typ !== 'spieler' && e.typ !== 'zombie')) continue;
      if (Math.abs(e.x - fokus.x) > SICHTWEITE || Math.abs(e.y - fokus.y) > SICHTWEITE) continue;
      const braucht = e.typ === 'spieler' ? !e.istEigener : e.leben < e.maxLeben;
      if (braucht) zuZeichnen.push(e);
    }
    if (zuZeichnen.length === 0 && !this.overlayBenutzt) return;
    this.overlayBenutzt = zuZeichnen.length > 0;
    const dpr = this.overlay.width / Math.max(1, this.kamera.breite);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.overlay.width, this.overlay.height);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    for (const e of zuZeichnen) {
      const kopf = this.kamera.weltZuBildschirm(e.x, e.y, FIGUR_HOEHE * (e.groesse ?? 1) + 8);
      zeichneBeschriftung(ctx, { ...e, x: kopf.x, y: kopf.y + 30 });
    }
  }

  #groesseAnpassen() {
    const breite = window.innerWidth;
    const hoehe = window.innerHeight;
    this.gl.setPixelRatio(this.aufloesung);
    this.gl.setSize(breite, hoehe, false);
    // Overlay-Canvas (nur Text) – höchstens 1,5-fach, das reicht für scharfe Schrift
    const overlayDpr = Math.min(window.devicePixelRatio || 1, 1.5);
    this.overlay.width = Math.round(breite * overlayDpr);
    this.overlay.height = Math.round(hoehe * overlayDpr);
    this.overlayBenutzt = true;
    this.kamera3d.aspect = breite / hoehe;
    // Kleine Bildschirme (Handy): Kamera etwas weiter weg, damit man genug von der Umgebung sieht
    const abstand = Math.min(1.35, Math.max(1, Math.sqrt(720 / Math.max(1, Math.min(breite, hoehe)))));
    this.kameraVersatz = KAMERA_VERSATZ.clone().multiplyScalar(abstand);
    this.kamera3d.updateProjectionMatrix();
    this.kamera.breite = breite;
    this.kamera.hoehe = hoehe;
  }
}

/** Kamera für Zielen (Maus → Welt) & Overlay (Welt → Bildschirm). */
class KameraAdapter {
  constructor(renderer) {
    this.renderer = renderer;
    this.breite = 1;
    this.hoehe = 1;
    this.zoom = 1;
    this.strahl = new THREE.Raycaster();
    this.ebene = new THREE.Plane(new THREE.Vector3(0, 1, 0), -ZIELHOEHE);
    this.v = new THREE.Vector3();
    this.ndc = new THREE.Vector2();
    this.punkt = new THREE.Vector3();
  }

  weltZuBildschirm(x, y, hoehe = 0) {
    const v = this.v.set(x, hoehe, y).project(this.renderer.kamera3d);
    return { x: ((v.x + 1) / 2) * this.breite, y: ((1 - v.y) / 2) * this.hoehe };
  }

  /** Mausposition → Punkt in der Welt (Strahl auf eine Ebene in Brusthöhe). */
  bildschirmZuWelt(sx, sy) {
    this.ndc.set((sx / this.breite) * 2 - 1, -(sy / this.hoehe) * 2 + 1);
    this.strahl.setFromCamera(this.ndc, this.renderer.kamera3d);
    if (!this.strahl.ray.intersectPlane(this.ebene, this.punkt)) return null;
    return { x: this.punkt.x, y: this.punkt.z };
  }

  istSichtbar() {
    return true;
  }
}

/** Manche Lampen flackern (Notstrom!). Deterministisch pro Lampe, ohne Zufallszahlen pro Frame. */
function flackern(lampe, jetzt) {
  if (!lampe.flackern) return 1;
  const t = jetzt / 1000 + lampe.x * 7.3 + lampe.y * 3.1;
  const welle = Math.sin(t * 13) * Math.sin(t * 7.7) * Math.sin(t * 2.3);
  return welle > 0.55 ? 0.15 : 0.85 + 0.15 * Math.sin(t * 31);
}
