import * as THREE from 'three';
import { FBXLoader, SkeletonUtils } from '../vendor/three/addons.js';
import { KartenModell } from './kartenModell.js';
import { vereineGeometrien } from './geometrie.js';
import { Fussspuren } from './fussspuren.js';
import { bauwerkDrehungY, erzeugeBauwerk, erzeugeVorschau } from './bauwerkModelle.js';
import { BASIS_MATERIAL, BasisbauSchicht, INSTANZ_TYPEN, bauteilGeometrie, erzeugeGebietRing, initialisiereBasisbauModelle, markierungsHoehe, wirdInstanziert } from './basisbauModelle.js';
import { animiereWrack, erzeugeFahrzeugModell, macheWrack } from './fahrzeugModelle.js';
import { FAHRZEUG_MODELLE } from '../../gemeinsam/physik/fahrzeug.js';
import { erzeugeFrisur } from './haarModell.js';
import { AUSSEHEN, skinFuer } from '../../gemeinsam/spieler/aussehen.js';
import { itemGeometrie, ITEM_MATERIAL, rucksackTeile } from './itemModelle.js';
import { zeichneBeschriftung, zeichneItemName } from './beschriftung.js';
import { richteFigurEin, aktualisiereHaltung } from './figurHaltung.js';
import { erzeugeWaffe, WAFFEN_NAMEN } from './waffenModelle.js';
import { erzeugeTier } from './tierModelle.js';
import { erzeugeAngel } from './angelModell.js';
import { WetterEffekt } from './wetterEffekt.js';
import { BlaetterEffekt } from './blaetterEffekt.js';

/**
 * Renderer mit Three.js (WebGL): schräge Kamera, echte Lichter und Schatten, Tag & Nacht.
 *
 * Gameplay bleibt 2D (x/y auf dem Boden); nur die Darstellung ist 3D:
 *   Weltpixel x → three.x, Weltpixel y → three.z, Höhe → three.y (1 Einheit = 1 Weltpixel)
 *
 * v0.10: Tiere (Hase), Angel (Rute/Schnur/Pose), Wetter (wetterEffekt.js: Regen, Nebel, Licht), Wracks, Erdfeld-Vorschau.
 * v0.11 Basisbau: Böden/Wände/Dächer als instanzierte Schicht (basisbauModelle.js → BasisbauSchicht), Bau-Hologramm (zeigeVorschau mit
 *   drehung, 'abriss'-Markierung, 'flagge'), roter Baugebiet-Ring (zeigeGebiet, nur Besitzer) + Flaggen-Ring (zeigeGebietVorschau).
 *
 * Ebenen: WebGL-Canvas (#spielflaeche3d) liegt UNTER dem 2D-Canvas (#spielflaeche). Das 2D-Canvas bleibt
 * durchsichtig, empfängt Maus/Touch und zeigt Namen & Lebensbalken. Vignette und Schadensblitz sind CSS.
 *
 * Performance (Ziel: 60 FPS auch auf Handys):
 *   - Karte in wenigen Draw-Calls (kartenModell.js: Instancing, zusammengefasste Möbel, eingefrorene Matrizen)
 *   - feste Lichteranzahl: Lampen-Pool (nur die nächsten LAMPEN_POOL Kartenlampen leuchten echt), 3 Taschenlampen,
 *     2 Mündungsblitze → Shader werden nie neu kompiliert
 *   - alle Shader beim Laden vorkompiliert (#vorkompilieren), Materialien geteilt
 *   - adaptive Qualität (QUALITAETS_STUFEN): fallen die FPS, werden erst Details gespart (Retina-Auflösung,
 *     Schattenauflösung, Baum-Umrisse/-Schatten) und erst ganz zum Schluss die Auflösung unter 1 – nie unter 0,8
 *   - Figuren außerhalb der Sichtweite werden nicht animiert
 */
const ASSETS = new URL('../assets/', import.meta.url);
const FIGUR_HOEHE = 64;
const SCHNITT_RADIUS = 0; // 0 = aus: kein Durchschauen durch Wände mehr (verdeckte Figur zeigt stattdessen die Silhouette)
const SCHNITT_HOEHE = 10; // bis zu dieser Höhe bleiben aufgeschnittene Wände als Sockel stehen
const ZIELHOEHE = 36; // Mausstrahl trifft diese Höhe (Brust) → Zielen fühlt sich richtig an
const KAMERA_VERSATZ = new THREE.Vector3(0, 600, 320);
const SKINS = { normal: 'zombieMaleA', laeufer: 'zombieFemaleA', brocken: 'zombieMaleA' }; // Zombies; Spieler: aussehen.js
const KOPF = { hoehe: 1.22, breite: 0.9, tiefe: 1.07 }; // Schädelmaße im Verhältnis zum Abstand Kopfknochen → Head_end (gemessen)
const _wetterGrau = new THREE.Color();
const MAX_TASCHENLAMPEN = 3;
const LAMPEN_POOL = 6; // so viele Kartenlampen leuchten gleichzeitig echt (die nächsten)
const MUENDUNGS_LICHTER = 2;
const SITZ_TIEFE = 24; // so weit sinkt die Figur beim Sitzen am Feuer
const SICHTWEITE = 1300; // weiter entfernte Figuren werden nicht animiert/gezeichnet
/**
 * Qualitätsstufen, von schön (0) nach sparsam. aufloesung = Obergrenze fürs Pixelverhältnis (null = Gerät),
 * schatten = Größe der Schattenkarte, baumDetail = Umrisse + Schatten der Bäume.
 */
const QUALITAETS_STUFEN = [
  { aufloesung: null, schatten: 2048, baumDetail: true },
  { aufloesung: 1.5, schatten: 2048, baumDetail: true },
  { aufloesung: 1, schatten: 2048, baumDetail: true },
  { aufloesung: 1, schatten: 1024, baumDetail: true },
  { aufloesung: 1, schatten: 1024, baumDetail: false },
  { aufloesung: 0.9, schatten: 1024, baumDetail: false },
  { aufloesung: 0.8, schatten: 1024, baumDetail: false },
];
/**
 * Grafik-Einstellung (Einstellungen ⚙): hoch = volle Auflösung, Schatten & Texturen (Bildrate wird nur über
 * Schatten/Baum-Details nachgeregelt, die Auflösung bleibt – sonst wirkt das Bild mal scharf, mal unscharf),
 * mittel = etwas abgeschwächt, niedrig = beste Bildrate (kleinere Auflösung, kleine Texturen, keine Sonnenschatten).
 * stufe = feste Qualitätsstufe (QUALITAETS_STUFEN), adaptiv = darf bei Ruckeln sparsamer werden.
 */
export const GRAFIK_PROFILE = Object.freeze({
  hoch: { name: 'Hoch', beschreibung: 'volle Auflösung, Schatten, Texturen', stufe: null, adaptiv: true, aufloesung: null, texturen: 1, sonnenschatten: true },
  mittel: { name: 'Mittel', beschreibung: 'etwas weichere Schatten & Texturen', stufe: 3, adaptiv: false, aufloesung: 1.25, texturen: 0.6, sonnenschatten: true },
  niedrig: { name: 'Niedrig', beschreibung: 'beste Leistung für schwache Geräte', stufe: 6, adaptiv: false, aufloesung: 0.8, texturen: 0.4, sonnenschatten: false },
});
const GRAFIK_SCHLUESSEL = 'browserSurvival.grafik';
const ADAPTIV_MAX_STUFE = 4; // im Profil "hoch" wird höchstens bis hier gespart (Schatten, Baum-Details) – Auflösung bleibt
const AUFWAERM_MS = 6000; // so lange nach dem Betreten nicht messen (Shader, Texturen, erste Frames)
const ZOOM_MIN = 0.5;
const ZOOM_MAX = 1.9;
/** Lichtfarben für Tag, Nacht und Dämmerung (siehe #tageslicht) */
const TAG = { sonne: new THREE.Color(0xfff1dc), himmel: new THREE.Color(0xbfd8ff), boden: new THREE.Color(0x4a4636), hintergrund: new THREE.Color(0x9cc3e4) };
const NACHT = { sonne: new THREE.Color(0x9db4e8), himmel: new THREE.Color(0x3a4a70), boden: new THREE.Color(0x101010), hintergrund: new THREE.Color(0x04060b) };
const DAEMMERUNG = { sonne: new THREE.Color(0xff9a4d), hintergrund: new THREE.Color(0xe08a5a) };

const _ziel = new THREE.Vector3();
const _kameraZiel = new THREE.Vector3();

const ITEM_NAMEN_RADIUS = 320; // px: so nah müssen Bodenitems sein, damit ihr Name erscheint
const PARTIKEL_FARBE = new THREE.Color();

// Silhouette: Ist die eigene Figur hinter einer Wand verschwunden, bleibt ein grauer Umriss sichtbar.
// Schritt 1 markiert per Stencil, wo die Figur sichtbar ist; Schritt 2 malt sie nur dort grau, wo sie verdeckt ist.
const SILHOUETTE_EBENE = 1;
const SILHOUETTE_MARKE = new THREE.MeshBasicMaterial({
  colorWrite: false, depthWrite: false, depthFunc: THREE.LessEqualDepth,
  stencilWrite: true, stencilFunc: THREE.AlwaysStencilFunc, stencilRef: 1, stencilZPass: THREE.ReplaceStencilOp,
});
const SILHOUETTE_GRAU = new THREE.MeshBasicMaterial({
  color: 0x9aa3b0, transparent: true, opacity: 0.55, depthWrite: false, depthFunc: THREE.GreaterDepth, fog: false,
  stencilWrite: true, stencilFunc: THREE.NotEqualStencilFunc, stencilRef: 1, stencilZPass: THREE.ReplaceStencilOp,
});

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

    this.gl = new THREE.WebGLRenderer({ canvas: this.leinwand, antialias: !this.istHandy, stencil: true, powerPreference: 'high-performance' });
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
    /** Roter Ring um den angetippten Zombie (Auto-Zielen) */
    this.zielRing = new THREE.Mesh(
      new THREE.RingGeometry(17, 20, 32).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0xff4a3a, transparent: true, opacity: 0.8, depthWrite: false, depthTest: false }),
    );
    this.zielRing.renderOrder = 5;
    this.zielRing.visible = false;
    this.itemMaterialien = new Map(); // defId → { normal, markiert, breite, hoehe }
    this.figurMaterialien = new Map(); // Skin-Schlüssel → Material (geteilt)
    this.taschenlampen = Array.from({ length: MAX_TASCHENLAMPEN }, (_, i) => this.#neueTaschenlampe(i === 0));
    this.lampenPool = Array.from({ length: LAMPEN_POOL }, () => this.#neuesPunktlicht(0xffffff, 300));
    this.muendungslichter = Array.from({ length: MUENDUNGS_LICHTER }, () => this.#neuesPunktlicht(0xffc070, 380));
    this.#baueEffektObjekte();
    this.fussspuren = new Fussspuren(this.szene);
    this.fallendeBaeume = []; // { gruppe, achse, zeit }
    this.bauwerke = new Map(); // Bauwerk-ID → { gruppe, aktualisiere, typ }
    this.bauwerkeStand = -1;
    this.feuerLampen = []; // brennende Lagerfeuer als Lampen für den Lampen-Pool
    this.vorschau = null; // { typ, gruppe }
    // Basisbau: instanzierte Böden/Wände/Dächer, roter Baugebiet-Ring (nur der Besitzer sieht ihn) und Ring fürs Flaggen-Hologramm
    initialisiereBasisbauModelle({ mitSchnitt: (m) => this.#mitSchnitt(m) });
    this.basisbau = new BasisbauSchicht(this.szene);
    this.gebietRing = erzeugeGebietRing(0xff3b30);
    this.gebietVorschau = erzeugeGebietRing(0x7dff6a);
    this.szene.add(this.gebietRing.mesh, this.gebietVorschau.mesh);
    this.fahrzeuge = new Map(); // Fahrzeug-ID → Gruppe
    this.tiere = new Map(); // Tier-ID → { gruppe, aktualisiere }
    this.angelnde = new Map(); // Spieler-ID → Angel-Darstellung (Rute, Schnur, Pose)
    this.wetterEffekt = new WetterEffekt(this.szene); // Regen-Striche + weiche Übergänge für Nebel/Licht
    this.fahrZoom = 1; // Kamera geht beim Fahren etwas weiter weg

    // Adaptive Qualität (siehe QUALITAETS_STUFEN)
    this.aufloesungMax = Math.min(window.devicePixelRatio || 1, this.istHandy ? 1.5 : 2);
    this.grafik = ladeGrafik();
    this.stufe = 0;
    this.aufloesung = this.#stufenAufloesung();
    this.#setzeStufe(this.#startStufe());
    this.mond.castShadow = GRAFIK_PROFILE[this.grafik].sonnenschatten;
    this.messung = { frames: 0, zeit: 0, seit: 0 };
    this.messenAb = 0;
    // Zoom (Mausrad / zwei Finger), gemerkt im Browser
    this.zoom = 1;
    try {
      const z = Number(localStorage.getItem('browserSurvival.zoom'));
      if (z >= ZOOM_MIN && z <= ZOOM_MAX) this.zoom = z;
    } catch {
      // egal
    }
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

  /** Rein-/Rauszoomen. @param faktor > 1 = raus, < 1 = rein */
  zoomen(faktor) {
    this.zoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, this.zoom * faktor));
    this.#kameraAbstand();
    try {
      localStorage.setItem('browserSurvival.zoom', this.zoom.toFixed(3));
    } catch {
      // egal
    }
  }

  /** Touch-Knopf 🔍: normal → weiter weg → näher dran → normal … */
  naechsteZoomStufe() {
    const stufen = [1, 1.35, 0.75];
    const i = stufen.findIndex((z) => Math.abs(z - this.zoom) < 0.05);
    this.zoomen(stufen[(i + 1) % stufen.length] / this.zoom);
  }

  /** Nach dem Betreten erst messen, wenn alles warm ist (sonst landet man wegen der Ladeframes gleich auf "unscharf"). */
  aufwaermen(jetzt = performance.now()) {
    this.messenAb = jetzt + AUFWAERM_MS;
    this.messung = { frames: 0, zeit: 0, seit: this.messenAb };
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
    if (this.karte) {
      // Zonenwechsel/Neu-Login: alte Karte raus und ihre Geometrie freigeben (Grafikspeicher; geteilte
      // Geometrie lädt three.js bei Bedarf einfach neu hoch – Materialien/Texturen bleiben)
      this.szene.remove(this.karte.statisch, this.karte.beweglich);
      for (const teil of [this.karte.statisch, this.karte.beweglich]) teil.traverse((o) => o.geometry?.dispose());
    }
    for (const b of this.fallendeBaeume) this.szene.remove(b.gruppe);
    this.fallendeBaeume.length = 0;
    for (const f of this.figuren.values()) this.szene.remove(f.gruppe);
    this.figuren.clear();
    for (const m of this.items.values()) this.szene.remove(m);
    this.items.clear();
    for (const g of this.fahrzeuge.values()) this.szene.remove(g);
    this.fahrzeuge.clear();
    for (const t of this.tiere.values()) this.szene.remove(t.gruppe);
    this.tiere.clear();
    for (const a of this.angelnde.values()) a.freigeben();
    this.angelnde.clear();
    for (const b of this.bauwerke.values()) this.szene.remove(b.gruppe);
    this.bauwerke.clear();
    this.bauwerkeStand = -1;
    this.basisbau.leeren();
    this.gebietRing.verstecke();
    this.gebietVorschau.verstecke();
    this.zeigeVorschau(null);
    this.blaetter?.entfernen();
    this.blaetter = new BlaetterEffekt(this.szene, welt);
    this.karte = new KartenModell({
      welt,
      assets: this.assets,
      gl: this.gl,
      mitSchnitt: (m) => this.#mitSchnitt(m),
      bodenMassstab: this.#bodenMassstab(),
    });
    this.szene.add(this.karte.statisch, this.karte.beweglich);
    this.karte.setzeBaumDetail(QUALITAETS_STUFEN[this.stufe].baumDetail);
    this.#vorkompilieren();
    this.aufwaermen();
  }

  /** Kurzinfo für das Debug-Overlay (F3). */
  statistik() {
    const info = this.gl.info.render;
    return `Draw-Calls ${info.calls} · Dreiecke ${Math.round(info.triangles / 1000)}k · Qualität ${this.stufe} · Auflösung ${this.aufloesung.toFixed(2)} · Zoom ${this.zoom.toFixed(2)}`;
  }

  /**
   * @param tageszeit  { helligkeit 0..1, istNacht, anteil } (gemeinsam/tageszeit.js)
   */
  zeichne({ fokus, entitaeten, gegenstaende, itemDefinitionen = {}, jetzt, effekte = null, markiertId = null, zielId = null, tageszeit = null, wetter = 'klar' }) {
    const dt = this.letzteZeit ? Math.min(0.1, (jetzt - this.letzteZeit) / 1000) : 0;
    this.letzteZeit = jetzt;
    this.#passeAufloesungAn(dt, jetzt);

    // Kamera folgt weich dem eigenen Spieler (im Auto etwas weiter weg – man ist schneller)
    this.fahrZoom += ((fokus.fahrzeugId ? 1.3 : 1) - this.fahrZoom) * Math.min(1, dt * 2);
    _ziel.set(fokus.x, 0, fokus.y);
    _kameraZiel.copy(this.kameraVersatz).multiplyScalar(this.fahrZoom).add(_ziel);
    this.kamera3d.position.lerp(_kameraZiel, Math.min(1, dt * 8) || 1);
    this.kamera3d.lookAt(_ziel.x, 0, _ziel.z - 20);
    this.schnitt.uFokus.value.set(fokus.x, 0, fokus.y);
    this.wetterEffekt.setzeArt(wetter);
    this.wetterEffekt.aktualisiere(dt, fokus.x, fokus.y);
    const dunkel = this.#tageslicht(tageszeit, _ziel);

    this.karte.aktualisiere(dt, dunkel);
    this.karte.aktualisiereDaecher(fokus.x, fokus.y);
    this.blaetter?.aktualisiere(dt, fokus, jetzt, dunkel);
    this.#aktualisiereFahrzeuge(entitaeten, fokus);
    this.#aktualisiereFiguren(entitaeten, fokus, dt, jetzt);
    this.egoHaken?.(this.kamera3d, fokus); // EGO-PROTOTYP (client/ego/, siehe EGO_PROTOTYP.md)
    this.#aktualisiereTiere(entitaeten, fokus, jetzt);
    this.#aktualisiereAngeln(entitaeten, fokus, jetzt);
    this.#aktualisiereTaschenlampen(entitaeten, fokus, dunkel);
    this.#aktualisiereItems(gegenstaende, markiertId, jetzt);
    this.#aktualisiereZielRing(entitaeten, zielId, jetzt);
    this.#aktualisiereFallendeBaeume(dt);
    this.#aktualisiereBauwerke(jetzt, fokus);
    this.gebietRing.animiere(jetzt);
    this.gebietVorschau.animiere(jetzt);
    this.fussspuren.aktualisiere(entitaeten, jetzt);
    this.#aktualisiereLampenPool(fokus, jetzt, dunkel);
    if (effekte) {
      effekte.aktualisiere(dt, jetzt);
      this.#aktualisiereEffekte(effekte.zustand);
    }

    this.gl.render(this.szene, this.kamera3d);
    this.#zeichneSilhouette(fokus);
    this.#zeichneOverlay(entitaeten, fokus, gegenstaende, itemDefinitionen);
    if (this.ruhigWarter) this.#pruefeRuhig(dt, jetzt);
  }

  /** Grauer Umriss der eigenen Figur, wo Wände/Dächer/Bäume sie verdecken (zweiter Durchgang, nur Figur-Ebene). */
  #zeichneSilhouette(fokus) {
    const figur = this.figuren.get(fokus.id);
    if (!figur || !figur.gruppe.visible || fokus.fahrzeugId) return;
    figur.gruppe.traverse((o) => o.layers.enable(SILHOUETTE_EBENE)); // Waffe/Haare wechseln → jedes Mal (≈50 Objekte)
    const { gl, szene, kamera3d } = this;
    const schatten = gl.shadowMap.autoUpdate;
    const ebenen = kamera3d.layers.mask;
    gl.shadowMap.autoUpdate = false;
    gl.autoClear = false;
    const hintergrund = szene.background;
    szene.background = null; // eine Farb-Hintergrund würde den Bildpuffer sonst bei jedem render() löschen
    kamera3d.layers.set(SILHOUETTE_EBENE);
    szene.overrideMaterial = SILHOUETTE_MARKE;
    gl.render(szene, kamera3d);
    szene.overrideMaterial = SILHOUETTE_GRAU;
    gl.render(szene, kamera3d);
    szene.overrideMaterial = null;
    szene.background = hintergrund;
    kamera3d.layers.mask = ebenen;
    gl.autoClear = true;
    gl.shadowMap.autoUpdate = schatten;
  }

  /**
   * Gefällter Baum kippt um – weg vom Holzfäller (sx/sy). Ablauf passend zum Geräusch 'baum_faellt':
   * 0–1 s knarzen (leichtes Neigen), 1–1,65 s fallen (immer schneller), Aufschlag + Nachfedern, ab 2,4 s versinken.
   */
  baumFaellt({ id, x, y, sx, sy }) {
    const gruppe = this.karte?.baumKopie(id);
    if (!gruppe) return;
    let dx = x - (sx ?? x - 1);
    let dz = y - (sy ?? y);
    const laenge = Math.hypot(dx, dz) || 1;
    dx /= laenge;
    dz /= laenge;
    this.szene.add(gruppe);
    // Drehachse senkrecht zur Fallrichtung (rechte Hand: Spitze kippt Richtung +dx/+dz)
    this.fallendeBaeume.push({ gruppe, achse: new THREE.Vector3(dz, 0, -dx), zeit: 0 });
  }

  /** Autos: ein Mesh pro Fahrzeug, Position/Drehung jedes Frame (Front = +z → Drehung wie bei Figuren). */
  #aktualisiereFahrzeuge(entitaeten, fokus) {
    const gesehen = new Set();
    for (const e of entitaeten) {
      if (e.typ !== 'fahrzeug') continue;
      gesehen.add(e.id);
      let g = this.fahrzeuge.get(e.id);
      if (!g) {
        g = erzeugeFahrzeugModell(e.modell, e.laenge, e.breite);
        this.fahrzeuge.set(e.id, g);
        this.szene.add(g);
      }
      g.visible = Math.abs(e.x - fokus.x) < SICHTWEITE && Math.abs(e.y - fokus.y) < SICHTWEITE;
      g.position.set(e.x, 0, e.y);
      g.rotation.y = Math.PI / 2 - e.winkel;
      if (e.kaputt && !g.userData.wrack) macheWrack(g);
      if (g.userData.wrack) animiereWrack(g, performance.now());
    }
    for (const [id, g] of this.fahrzeuge) {
      if (gesehen.has(id)) continue;
      this.szene.remove(g);
      this.fahrzeuge.delete(id);
    }
  }

  /** Tiere (Hasen): ein Modell pro Tier, hüpft beim Laufen. */
  #aktualisiereTiere(entitaeten, fokus, jetzt) {
    const gesehen = new Set();
    for (const e of entitaeten) {
      if (e.typ !== 'tier') continue;
      gesehen.add(e.id);
      let t = this.tiere.get(e.id);
      if (!t) {
        t = erzeugeTier(e.art);
        this.tiere.set(e.id, t);
        this.szene.add(t.gruppe);
      }
      t.gruppe.visible = Math.abs(e.x - fokus.x) < SICHTWEITE && Math.abs(e.y - fokus.y) < SICHTWEITE;
      if (!t.gruppe.visible) continue;
      t.gruppe.position.set(e.x, 0, e.y);
      t.gruppe.rotation.y = Math.PI / 2 - e.blick;
      t.aktualisiere(e, jetzt);
    }
    for (const [id, t] of this.tiere) {
      if (gesehen.has(id)) continue;
      this.szene.remove(t.gruppe);
      this.tiere.delete(id);
    }
  }

  /** Angelnde Spieler: Rute in der Hand, Schnur, Pose im Wasser (e.angeln kommt vom Server). */
  #aktualisiereAngeln(entitaeten, fokus, jetzt) {
    const gesehen = new Set();
    for (const e of entitaeten) {
      if (e.typ !== 'spieler' || !e.angeln || e.tot) continue;
      gesehen.add(e.id);
      let a = this.angelnde.get(e.id);
      if (!a) {
        a = erzeugeAngel();
        this.angelnde.set(e.id, a);
        this.szene.add(a.gruppe);
      }
      a.gruppe.visible = Math.abs(e.x - fokus.x) < SICHTWEITE && Math.abs(e.y - fokus.y) < SICHTWEITE;
      if (a.gruppe.visible) a.aktualisiere(e, jetzt);
    }
    for (const [id, a] of this.angelnde) {
      if (gesehen.has(id)) continue;
      a.freigeben();
      this.angelnde.delete(id);
    }
  }

  /**
   * Bauwerke der Welt als 3D-Gruppen – neu aufbauen nur, wenn sich die Liste geändert hat (bauwerkeVersion).
   * Viele gleiche Basisbau-Teile (Boden, Wand, Dach …) zeichnet stattdessen die BasisbauSchicht instanziert.
   */
  #aktualisiereBauwerke(jetzt, fokus) {
    const welt = this.welt;
    this.basisbau.aktualisiere(welt, fokus);
    if (welt.bauwerkeVersion !== this.bauwerkeStand) {
      this.bauwerkeStand = welt.bauwerkeVersion;
      const g = welt.kachelGroesse;
      for (const [id, b] of this.bauwerke) {
        const jetztB = welt.bauwerke.get(id);
        // Ausgerichtete Einzelstücke (Tür, Bett) neu stellen, wenn sich die Richtung ändert – sonst nur bei Typwechsel
        if (jetztB?.typ === b.typ && (jetztB.drehung ?? 0) === b.drehung && zaunMaske(welt, jetztB) === b.maske) continue;
        this.szene.remove(b.gruppe);
        this.bauwerke.delete(id);
      }
      for (const b of welt.bauwerke.values()) {
        if (this.bauwerke.has(b.id) || wirdInstanziert(b.typ)) continue;
        const maske = zaunMaske(welt, b);
        const neu = erzeugeBauwerk(maske ? { ...b, maske } : b);
        neu.typ = b.typ;
        neu.drehung = b.drehung ?? 0;
        neu.maske = maske;
        neu.gruppe.position.set((b.tx + 0.5) * g, 0, (b.ty + 0.5) * g);
        neu.gruppe.rotation.y = bauwerkDrehungY(b);
        this.szene.add(neu.gruppe);
        this.bauwerke.set(b.id, neu);
      }
      // Brennende Lagerfeuer leuchten (über den Lampen-Pool)
      this.feuerLampen = [...welt.bauwerke.values()]
        .filter((b) => b.typ === 'lagerfeuer' && b.brennt)
        .map((b) => ({ x: (b.tx + 0.5) * g, y: 22, z: (b.ty + 0.5) * g, farbe: new THREE.Color(0xff9a40), reichweite: 300, staerke: 320, objekt: { feuer: true, x: b.tx, y: b.ty } }));
      this.naechsteLampen = null;
    }
    for (const [id, b] of this.bauwerke) b.aktualisiere(welt.bauwerke.get(id), jetzt);
  }

  /**
   * Eigenes Baugebiet als roter Ring (nur der Besitzer kennt es, siehe SPIELER_DATEN.flagge) – oder null/false = aus.
   * @param gebiet { tx, ty, radius } in Kacheln
   */
  zeigeGebiet(gebiet) {
    if (!gebiet) return this.gebietRing.verstecke();
    const g = this.welt.kachelGroesse;
    this.gebietRing.setze((gebiet.tx + 0.5) * g, (gebiet.ty + 0.5) * g, (gebiet.radius + 0.5) * g);
  }

  /** Vorschau-Ring beim Platzieren der Flagge: { tx, ty, radius, ok } oder null. */
  zeigeGebietVorschau(daten) {
    if (!daten) return this.gebietVorschau.verstecke();
    const g = this.welt.kachelGroesse;
    this.gebietVorschau.setze((daten.tx + 0.5) * g, (daten.ty + 0.5) * g, (daten.radius + 0.5) * g, daten.ok ? 0x7dff6a : 0xff4a3a);
  }

  /** Platzier-Vorschau: { typ, tx, ty, ok } oder null (weg). */
  zeigeVorschau(daten) {
    if (!daten || daten.tx === undefined) {
      if (this.vorschau) this.szene.remove(this.vorschau.gruppe);
      this.vorschau = null;
      return;
    }
    if (this.vorschau?.typ !== daten.typ) {
      if (this.vorschau) this.szene.remove(this.vorschau.gruppe);
      this.vorschau = { typ: daten.typ, gruppe: erzeugeVorschau(daten.typ), ok: null };
      this.szene.add(this.vorschau.gruppe);
    }
    const g = this.welt.kachelGroesse;
    const n = daten.groesse ?? 1; // Blöcke (2×2): Hologramm über die ganze Fläche
    this.vorschau.gruppe.position.set((daten.tx + n / 2) * g, 0.2, (daten.ty + n / 2) * g);
    this.vorschau.gruppe.scale.set(n, 1, n);
    this.vorschau.gruppe.rotation.y = (daten.drehung ?? 0) * (Math.PI / 2); // nur Teile mit Richtung bekommen drehung != 0
    if (daten.typ === 'abriss') this.vorschau.gruppe.userData.kasten.scale.y = markierungsHoehe(daten.ziel);
    if (this.vorschau.ok !== daten.ok) {
      this.vorschau.ok = daten.ok;
      this.vorschau.gruppe.userData.setzeOk(daten.ok);
    }
  }

  #aktualisiereFallendeBaeume(dt) {
    for (let i = this.fallendeBaeume.length - 1; i >= 0; i--) {
      const b = this.fallendeBaeume[i];
      b.zeit += dt;
      const t = b.zeit;
      let winkel;
      if (t < 1) winkel = 0.1 * (t * t) + Math.sin(t * 22) * 0.008 * t; // knarzt und neigt sich
      else if (t < 1.65) winkel = 0.1 + (Math.PI / 2 - 0.12) * ((t - 1) / 0.65) ** 2; // fällt
      else winkel = Math.PI / 2 - 0.02 - Math.abs(Math.sin((t - 1.65) * 14)) * 0.06 * Math.exp(-(t - 1.65) * 6); // federt nach
      b.gruppe.quaternion.setFromAxisAngle(b.achse, winkel);
      if (t > 2.4) {
        const rest = Math.max(0, 1 - (t - 2.4) / 1.2);
        b.gruppe.scale.setScalar(rest);
        b.gruppe.position.y = -(1 - rest) * 10;
      }
      if (t > 3.6) {
        this.szene.remove(b.gruppe);
        this.fallendeBaeume.splice(i, 1);
      }
    }
  }

  /** Promise: erfüllt, sobald 10 Frames hintereinander flott waren (max. 5 s) – für den Ladebildschirm. */
  warteBisRuhig() {
    return new Promise((erfuellen) => {
      this.ruhigWarter = { erfuellen, start: performance.now(), frames: 0, flott: 0 };
    });
  }

  #pruefeRuhig(dt, jetzt) {
    const w = this.ruhigWarter;
    w.frames++;
    w.flott = dt > 0 && dt < 1 / 30 ? w.flott + 1 : 0;
    if ((w.frames > 20 && w.flott >= 10) || jetzt - w.start > 5000) {
      this.ruhigWarter = null;
      this.aufwaermen(jetzt);
      w.erfuellen();
    }
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
    const figuren = [
      ...Object.keys(AUSSEHEN.koerper.optionen).map((koerper) => ({ id: -1, typ: 'spieler', aussehen: { koerper } })),
      ...['normal', 'laeufer', 'brocken'].map((variante) => ({ id: -1, typ: 'zombie', variante })),
    ];
    for (const e of figuren) {
      const f = this.#neueFigur(e);
      this.szene.remove(f.gruppe);
      probe.add(f.gruppe);
    }
    for (const name of WAFFEN_NAMEN) probe.add(erzeugeWaffe(name));
    for (const modell of Object.keys(FAHRZEUG_MODELLE)) probe.add(erzeugeFahrzeugModell(modell, 150, 70));
    for (const typ of Object.keys(INSTANZ_TYPEN)) {
      // Instanzierte Basisbau-Teile haben eine eigene Shader-Variante (USE_INSTANCING)
      const m = new THREE.InstancedMesh(bauteilGeometrie(typ), BASIS_MATERIAL, 1);
      m.castShadow = m.receiveShadow = true;
      probe.add(m);
    }
    for (const typ of ['werkbank', 'lagerfeuer', 'falle', 'beet', 'kiste', 'holztuer', 'zaun', 'zauntor', 'bett', 'flagge', 'abriss']) {
      if (typ === 'abriss') {
        probe.add(erzeugeVorschau(typ));
        continue;
      }
      const zustand = { typ, brennt: true, gespannt: true, pflanze: 'tomate', wachstum: 1 };
      const b = erzeugeBauwerk(zustand);
      b.aktualisiere(zustand, 0);
      probe.add(b.gruppe, erzeugeVorschau(typ));
    }
    const icon = new THREE.Mesh(this.#itemMaterial('apfel').geometrie, this.#itemMaterial('apfel').markiert);
    probe.add(icon, this.#itemMesh({ id: -2, defId: 'apfel', x: 0, y: 0 }), this.#blutMesh({ sprite: 'blutlache', groesse: 10, winkel: 0, x: 0, y: 0 }));
    this.szene.add(probe);
    this.lampenPool.forEach((l) => (l.intensity = 1));
    for (const ring of [this.gebietRing, this.gebietVorschau]) {
      const kopie = ring.mesh.clone();
      kopie.visible = true;
      probe.add(kopie);
    }
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
    this.partikelFarben = new THREE.BufferAttribute(new Float32Array(3 * 400), 3);
    this.partikelGeometrie.setAttribute('color', this.partikelFarben);
    this.partikel = new THREE.Points(this.partikelGeometrie, new THREE.PointsMaterial({ vertexColors: true, size: 3 }));
    this.partikel.frustumCulled = false;
    this.blutFlecken = new Map(); // Effekt-Objekt → Mesh
    this.szene.add(this.spuren, this.partikel, this.markierRing, this.zielRing);
  }

  // ---------------------------------------------------------------------------
  // Pro Frame

  /**
   * Adaptive Qualität: Fällt die Bildrate (Mittel über 2 s) unter ~48 FPS, eine Stufe sparsamer; läuft es
   * dreimal hintereinander locker (> 57 FPS), eine Stufe schöner – aber nach dem Absenken 30 s lang nicht.
   * Jede Änderung kostet einen kurzen Hänger (Puffer neu anlegen), darum so zurückhaltend.
   */
  #passeAufloesungAn(dt, jetzt) {
    if (!GRAFIK_PROFILE[this.grafik].adaptiv) return; // mittel/niedrig: feste Stufe
    if (jetzt < this.messenAb || dt > 0.25) return; // Aufwärmphase bzw. Tab war im Hintergrund
    const m = this.messung;
    m.frames++;
    m.zeit += dt;
    if (jetzt - m.seit < 2000) return;
    const mittel = m.zeit / Math.max(1, m.frames);
    this.messung = { frames: 0, zeit: 0, seit: jetzt };
    if (mittel > 1 / 48 && this.stufe < ADAPTIV_MAX_STUFE) {
      this.#setzeStufe(this.stufe + 1);
      this.anhebenGesperrtBis = jetzt + 30000;
      this.guteFenster = 0;
    } else if (mittel < 1 / 57) {
      this.guteFenster = (this.guteFenster ?? 0) + 1;
      if (this.guteFenster >= 3 && jetzt > (this.anhebenGesperrtBis ?? 0) && this.stufe > this.#startStufe()) {
        this.#setzeStufe(this.stufe - 1);
        this.guteFenster = 0;
      }
    } else {
      this.guteFenster = 0;
    }
  }

  /** Beste Stufe des gewählten Profils (Handy startet im Profil "hoch" eine Stufe sparsamer). */
  #startStufe() {
    return GRAFIK_PROFILE[this.grafik].stufe ?? (this.istHandy ? 2 : 0);
  }

  /** Pixelverhältnis: im Profil "hoch" immer volle Geräteauflösung (nie automatisch unscharf), sonst die Profil-Grenze. */
  #stufenAufloesung() {
    const grenze = GRAFIK_PROFILE[this.grafik].aufloesung;
    return Math.min(this.aufloesungMax, grenze ?? (this.istHandy ? 1.25 : 2));
  }

  #bodenMassstab() {
    const massstab = GRAFIK_PROFILE[this.grafik].texturen;
    return this.istHandy ? Math.min(massstab, 0.6) : massstab;
  }

  /** Grafik-Einstellung ändern ('hoch' | 'mittel' | 'niedrig') – wirkt sofort und wird im Browser gemerkt. */
  setzeGrafik(name) {
    if (!(name in GRAFIK_PROFILE)) return;
    this.grafik = name;
    try {
      localStorage.setItem(GRAFIK_SCHLUESSEL, name);
    } catch {
      // egal
    }
    const profil = GRAFIK_PROFILE[name];
    this.#setzeStufe(this.#startStufe());
    this.mond.castShadow = profil.sonnenschatten;
    this.karte?.setzeBodenMassstab(this.#bodenMassstab());
    this.messung = { frames: 0, zeit: 0, seit: 0 };
    this.guteFenster = 0;
    this.messenAb = performance.now() + 3000;
  }

  #setzeStufe(stufe) {
    const vorher = QUALITAETS_STUFEN[this.stufe];
    this.stufe = stufe;
    const neu = QUALITAETS_STUFEN[stufe];
    const aufloesung = this.#stufenAufloesung();
    if (aufloesung !== this.aufloesung) {
      this.aufloesung = aufloesung;
      this.gl.setPixelRatio(aufloesung);
    }
    const schatten = this.istHandy ? Math.min(1024, neu.schatten) : neu.schatten;
    if (schatten !== this.mond.shadow.mapSize.x) {
      this.mond.shadow.mapSize.set(schatten, schatten);
      this.mond.shadow.map?.dispose();
      this.mond.shadow.map = null;
    }
    if (neu.baumDetail !== vorher.baumDetail) this.karte?.setzeBaumDetail(neu.baumDetail);
  }

  #aktualisiereFiguren(entitaeten, fokus, dt, jetzt) {
    const gesehen = new Set();
    for (const e of entitaeten) {
      if (e.typ !== 'spieler' && e.typ !== 'zombie') continue;
      gesehen.add(e.id);
      let f = this.figuren.get(e.id);
      // Eigene Figur wird manchmal schon vor dem ersten Server-Stand (mit Aussehen) gebaut → dann neu bauen
      if (f && e.typ === 'spieler' && f.koerper !== (e.aussehen?.koerper ?? AUSSEHEN.koerper.standard)) {
        this.szene.remove(f.gruppe);
        f.mixer.stopAllAction();
        f = null;
      }
      if (!f) {
        f = this.#neueFigur(e);
        this.figuren.set(e.id, f);
      }
      const nah = Math.abs(e.x - fokus.x) < SICHTWEITE && Math.abs(e.y - fokus.y) < SICHTWEITE;
      f.gruppe.visible = !e.tot && nah && !e.fahrzeug && !e.fahrzeugId; // im Auto sieht man die Figur nicht
      if (!f.gruppe.visible) continue;
      const schlaeft = e.arbeit === 'schlafen' && e.arbeitOrt;
      if (schlaeft) {
        // Im Bett liegen: auf die Matratze, Kopf zum Kopfende
        // Rücken nach unten (x-Drehung), Kopf nach Norden bzw. Osten; Ursprung der Figur = Füße
        const laengs = e.arbeitOrt.laengs;
        f.gruppe.position.set(e.arbeitOrt.x - (laengs ? 0 : 30), 20, e.arbeitOrt.y + (laengs ? 30 : 0));
        f.gruppe.rotation.set(-Math.PI / 2, laengs ? 0 : -Math.PI / 2, 0, 'YXZ');
      } else {
        f.gruppe.position.set(e.x, e.arbeit === 'sitzen' ? -SITZ_TIEFE : e.fliegen ? 34 + Math.sin(jetzt / 260) * 3 : 0, e.y); // Flugmodus (Admin): schwebt
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
    // Spieler: Skin aus dem gewählten Aussehen (gemeinsam/spieler/aussehen.js), Zombies: nach Variante
    // Zombies: 4 Gesichter (zombieGesicht0–3: gerade = männlicher, ungerade = weiblicher Körper) – Läufer weiblich, Brocken männlich
    let gesicht = null;
    if (e.typ === 'zombie') {
      const nr = (e.id ?? 0) % 4;
      gesicht = e.variante === 'laeufer' ? (nr % 2) * 2 + 1 : e.variante === 'brocken' ? (nr % 2) * 2 : nr;
    }
    const schluessel = e.typ === 'spieler' ? skinFuer(e.aussehen) : `${e.variante ?? 'normal'}:${gesicht}`;
    if (!this.figurMaterialien.has(schluessel)) {
      const skin = e.typ === 'spieler' ? schluessel : `zombieGesicht${gesicht}`;
      const material = new THREE.MeshStandardMaterial({ map: this.skins[skin] ?? this.skins[SKINS.normal], roughness: 0.75 });
      if (e.variante === 'brocken') material.color.setRGB(0.75, 0.6, 0.55);
      this.figurMaterialien.set(schluessel, material);
    }
    return this.figurMaterialien.get(schluessel);
  }

  /** Frisur (haarModell.js) an den Kopfknochen hängen; Maße aus dem Abstand Kopf → Head_end × KOPF. */
  #setzeFrisur(gruppe, modell, frisur) {
    const kopfKnochen = modell.getObjectByName('Head');
    const spitze = modell.getObjectByName('Head_end');
    if (!frisur || !kopfKnochen || !spitze) return;
    gruppe.updateMatrixWorld(true);
    const unten = gruppe.worldToLocal(kopfKnochen.getWorldPosition(new THREE.Vector3()));
    const oben = gruppe.worldToLocal(spitze.getWorldPosition(new THREE.Vector3()));
    const hoehe = Math.abs(oben.y - unten.y);
    const haare = erzeugeFrisur(frisur, { mitte: unten.clone().lerp(oben, 0.5), hoehe: hoehe * KOPF.hoehe, breite: hoehe * KOPF.breite, tiefe: hoehe * KOPF.tiefe });
    gruppe.add(haare);
    kopfKnochen.attach(haare); // behält die Weltlage, folgt aber ab jetzt dem Kopf
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
    const figur = { gruppe, mixer, aktionen, aktuell: 'stehen', koerper: e.aussehen?.koerper ?? AUSSEHEN.koerper.standard };
    richteFigurEin(figur, modell);
    if (e.typ === 'spieler') this.#setzeFrisur(gruppe, modell, AUSSEHEN.koerper.optionen[e.aussehen?.koerper]?.frisur);
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
      // Im Auto: Scheinwerfer statt Taschenlampe (von der Front in Fahrtrichtung)
      const autoId = s.fahrzeugId ?? s.fahrzeug?.id;
      const auto = autoId !== undefined && autoId !== null ? entitaeten.find((e) => e.id === autoId) : null;
      if (auto) {
        const ax = Math.cos(auto.winkel);
        const az = Math.sin(auto.winkel);
        spot.position.set(auto.x + ax * (auto.laenge / 2 + 2), 22, auto.y + az * (auto.laenge / 2 + 2));
        spot.target.position.set(auto.x + ax * 380, 0, auto.y + az * 380);
        spot.intensity = this.nachtsicht ? 600 : 500 + 2600 * dunkel;
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
    const lampen = this.feuerLampen.length > 0 ? [...this.karte.lampen, ...this.feuerLampen] : this.karte.lampen;
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
      licht.intensity = lampe.staerke * (lampe.objekt.feuer ? feuerFlackern(lampe.objekt, jetzt) : flackern(lampe.objekt, jetzt)) * dunkel;
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

  /** Roter, pulsierender Ring um den anvisierten Zombie. */
  #aktualisiereZielRing(entitaeten, zielId, jetzt) {
    const ziel = zielId !== null ? entitaeten.find((e) => e.id === zielId && e.typ === 'zombie' && !e.tot) : null;
    this.zielRing.visible = !!ziel;
    if (!ziel) return;
    const r = (ziel.groesse ?? 1) * (1 + Math.sin(jetzt / 180) * 0.07);
    this.zielRing.position.set(ziel.x, 1, ziel.y);
    this.zielRing.scale.set(r, 1, r);
    this.zielRing.rotation.y = jetzt / 700;
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
    // Nebel wandert mit der Kamera (Zoom, Auto-Fahrt): sonst liegt beim Rauszoomen/Fahren alles hinter dem Nebel
    const abstand = (this.grundAbstand ?? 1) * this.zoom * this.fahrZoom;
    // Wetter: Regen/Nebel dämpfen Sonne & Himmel, färben den Hintergrund grau und rücken den Nebel heran
    const { regen, nebel } = this.wetterEffekt;
    const stimmung = Math.max(regen, nebel);
    if (stimmung > 0.001) {
      this.mond.intensity *= 1 - 0.4 * regen * hell - 0.25 * nebel * hell;
      this.umgebung.intensity *= 1 - 0.18 * regen;
      _wetterGrau.setRGB(0.6, 0.64, 0.7).multiplyScalar(0.12 + 0.88 * hell);
      this.szene.background.lerp(_wetterGrau, 0.7 * stimmung);
      this.szene.fog.color.copy(this.szene.background);
    }
    const dicht = Math.min(1, nebel + 0.35 * regen);
    // Dichter Nebel darf kräftig sein, aber nie die Figur selbst verschlucken (Top-Down: Kamera ~677 px × Zoom entfernt)
    const kamAbstand = KAMERA_VERSATZ.length() * abstand;
    const nah = Math.max((650 + hell * 600) * abstand * (1 - 0.82 * dicht), kamAbstand * 0.92);
    this.szene.fog.near = nah;
    this.szene.fog.far = Math.max((1500 + hell * 1500) * abstand * (1 - 0.62 * dicht), nah + kamAbstand * (0.5 + 0.3 * hell));
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
      PARTIKEL_FARBE.set(t.farbe);
      this.partikelFarben.array.set([PARTIKEL_FARBE.r, PARTIKEL_FARBE.g, PARTIKEL_FARBE.b], i * 3);
    }
    this.partikelFarben.needsUpdate = anzahl > 0;
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

  /** 2D-Ebene über der 3D-Szene: Namen, Lebensbalken und kleine Item-Namen am Boden (Vignette & Schaden sind CSS). */
  #zeichneOverlay(entitaeten, fokus, gegenstaende = [], itemDefinitionen = {}) {
    const ctx = this.octx;
    const zuZeichnen = [];
    for (const e of entitaeten) {
      if (e.tot || (e.typ !== 'spieler' && e.typ !== 'zombie')) continue;
      if (Math.abs(e.x - fokus.x) > SICHTWEITE || Math.abs(e.y - fokus.y) > SICHTWEITE) continue;
      const braucht = e.typ === 'spieler' ? !e.istEigener : e.leben < e.maxLeben;
      if (braucht) zuZeichnen.push(e);
    }
    const beschriftet = [];
    if (!this.egoHaken) {
      for (const g of gegenstaende) {
        if (Math.abs(g.x - fokus.x) > ITEM_NAMEN_RADIUS || Math.abs(g.y - fokus.y) > ITEM_NAMEN_RADIUS) continue;
        if (itemDefinitionen[g.defId]?.name && this.karte.istEinsehbar(g.x, g.y)) beschriftet.push(g);
      }
    }
    if (zuZeichnen.length === 0 && beschriftet.length === 0 && !this.overlayBenutzt) return;
    this.overlayBenutzt = zuZeichnen.length > 0 || beschriftet.length > 0;
    const dpr = this.overlay.width / Math.max(1, this.kamera.breite);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.overlay.width, this.overlay.height);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    for (const e of zuZeichnen) {
      const kopf = this.kamera.weltZuBildschirm(e.x, e.y, FIGUR_HOEHE * (e.groesse ?? 1) + 8);
      zeichneBeschriftung(ctx, { ...e, x: kopf.x, y: kopf.y + 30 });
    }
    for (const g of beschriftet) {
      const p = this.kamera.weltZuBildschirm(g.x, g.y, 12);
      zeichneItemName(ctx, g.menge > 1 ? `${itemDefinitionen[g.defId].name} ×${g.menge}` : itemDefinitionen[g.defId].name, p.x, p.y - 4);
    }
  }

  /** Kameraabstand = Bildschirmgröße × Zoom; Nebel wandert mit, damit man beim Rauszoomen nicht ins Graue schaut. */
  #kameraAbstand() {
    const abstand = (this.grundAbstand ?? 1) * this.zoom;
    this.kameraVersatz = KAMERA_VERSATZ.clone().multiplyScalar(abstand);
    this.szene.fog.near = 650 * abstand;
    this.szene.fog.far = 1500 * abstand;
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
    this.grundAbstand = Math.min(1.35, Math.max(1, Math.sqrt(720 / Math.max(1, Math.min(breite, hoehe)))));
    this.#kameraAbstand();
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
    this.boden = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
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

  /** Mausposition → Punkt auf dem Boden (y = 0) – zum Bauen/Platzieren. */
  bildschirmZuBoden(sx, sy) {
    this.ndc.set((sx / this.breite) * 2 - 1, -(sy / this.hoehe) * 2 + 1);
    this.strahl.setFromCamera(this.ndc, this.renderer.kamera3d);
    if (!this.strahl.ray.intersectPlane(this.boden, this.punkt)) return null;
    return { x: this.punkt.x, y: this.punkt.z };
  }

  istSichtbar() {
    return true;
  }
}

/** Zaun: welche Nachbarn (Zäune, Tore, Wände) sind verbunden? Bits 1 = Ost, 2 = Süd, 4 = West, 8 = Nord (0 = kein Zaun). */
const ZAUN_VERBINDER = new Set(['zaun', 'zauntor', 'holzwand', 'holzwand_fenster', 'holzwand_tuer']);
function zaunMaske(welt, b) {
  if (b.typ !== 'zaun') return 0;
  let maske = 0;
  for (const [dx, dy, bit] of [[1, 0, 1], [0, 1, 2], [-1, 0, 4], [0, -1, 8]]) {
    const n = welt.bauwerkBei(b.tx + dx, b.ty + dy, 'wand');
    if (n && ZAUN_VERBINDER.has(n.typ)) maske |= bit;
  }
  return maske || 5;
}

/** Lagerfeuer: unruhiges, warmes Flackern. */
function feuerFlackern(o, jetzt) {
  const t = jetzt / 1000 + o.x * 3.7 + o.y * 1.3;
  return 0.78 + Math.sin(t * 11) * 0.09 + Math.sin(t * 17.3) * 0.07 + Math.sin(t * 5.1) * 0.06;
}

/** Manche Lampen flackern (Notstrom!). Deterministisch pro Lampe, ohne Zufallszahlen pro Frame. */
function flackern(lampe, jetzt) {
  if (!lampe.flackern) return 1;
  const t = jetzt / 1000 + lampe.x * 7.3 + lampe.y * 3.1;
  const welle = Math.sin(t * 13) * Math.sin(t * 7.7) * Math.sin(t * 2.3);
  return welle > 0.55 ? 0.15 : 0.85 + 0.15 * Math.sin(t * 31);
}

function ladeGrafik() {
  try {
    const gespeichert = localStorage.getItem(GRAFIK_SCHLUESSEL);
    if (gespeichert in GRAFIK_PROFILE) return gespeichert;
  } catch {
    // egal
  }
  return 'hoch';
}
