import * as THREE from 'three';
import { EffectComposer, FXAAPass, Pass, GTAOPass, UnrealBloomPass, OutputPass } from '../vendor/three/addons.js';

/**
 * Nachbearbeitung (Post-Processing) für den Spiel-Renderer – nur aktiv, wenn GRAFIK_EINSTELLUNGEN.nachbearbeitung (Profile hoch/mittel).
 *
 *   SzenenPass  → Szene + Zusatz-Durchgänge (Silhouette, Tür-Schimmer: brauchen Stencil im SELBEN Puffer) in einen HDR-Puffer
 *                 (HalfFloat, Tiefe+Stencil als DepthTexture, OHNE MSAA – siehe ⚠ unten)
 *   Verdeckung  → GTAO (moderne SSAO): liest die Tiefe direkt aus diesem Puffer und rekonstruiert die Normalen daraus –
 *                 KEIN zweiter Szenen-Durchgang; Auflösung in CSS-Pixeln (ssao 1 = CSS-Auflösung, 0.5 = halbe)
 *   Bloom       → UnrealBloomPass in halber CSS-Auflösung, Schwelle nach Tageszeit (setzeHelligkeit): nachts leuchten
 *                 Laternen/Feuer/Lampe, tagsüber blüht nichts aus
 *   OutputPass  → ACES-Tonemapping (renderer.toneMapping/-Exposure) + sRGB
 *   FXAA        → billige Kantenglättung (optional, nach dem OutputPass, braucht sRGB-Eingang)
 *
 * ⚠ Leistung (Nutzer-Feedback: Hoch/Mittel nur ~10 FPS): KEIN MSAA im Composer-Puffer – three löst einen Multisample-Puffer nach
 *   JEDEM render() auf (Szene + Silhouette ×2 + Tür-Schimmer = bis zu 4× pro Bild, jeweils mit Tiefe+Stencil; unter
 *   Windows/ANGLE ein sehr langsamer Pfad). Vollbild-Effekte (GTAO, Bloom) rechnen in CSS-Pixeln statt Gerätepixeln
 *   (auf DPR-2-Bildschirmen sonst 4× Arbeit); die Szene selbst bleibt in voller Renderer-Auflösung.
 *
 * ⚠ Alle Szenen-Materialien rendern in den Composer-Puffer LINEAR (three schaltet Tonemapping/sRGB für Render-Targets ab);
 *   erst der OutputPass wandelt um → Farben bleiben gleich wie ohne Nachbearbeitung.
 * Welt-Einheit = 1 Weltpixel (Figur ≈ 64) → GTAO-Radius in Pixeln.
 */
const VERDECKUNG = { radius: 22, distanceExponent: 1.6, thickness: 14, scale: 1, distanceFallOff: 1, samples: 8 };
const ENTRAUSCHEN = { lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 8 };
const VERDECKUNG_STAERKE = 0.85;
/** Bloom: dezent – Stärke/Radius fest, Schwelle nach Helligkeit (linear HDR vor dem Tonemapping) */
const BLOOM = { staerke: 0.42, radius: 0.55, schwelleNacht: 1, schwelleTag: 2.6, aufloesung: 0.5 };

/** Erster Schritt: zeichnet die Szene (inkl. Zusatz-Durchgänge) in den Lese-Puffer des Composers. */
class SzenenPass extends Pass {
  constructor(zeichneSzene, nachZeichnen) {
    super();
    this.zeichneSzene = zeichneSzene;
    this.nachZeichnen = nachZeichnen;
    this.needsSwap = false;
  }

  render(gl, schreibPuffer, lesePuffer) {
    gl.setRenderTarget(lesePuffer); // zeichneSzene löscht selbst (autoClear + Hintergrundfarbe der Szene)
    this.zeichneSzene();
    this.nachZeichnen(lesePuffer);
  }
}

/**
 * GTAO mit fremder Tiefentextur (Normalen aus der Tiefe rekonstruiert). ⚠ setSize/dispose des Originals greifen auf einen
 * Normalen-Puffer zu, den es dann nicht gibt → Attrappe. `massstab` = Anteil der Gerätepixel (Tiefe wird per textureSize gelesen).
 */
class Verdeckung extends GTAOPass {
  constructor(szene, kamera) {
    super(szene, kamera, 1, 1, { depthTexture: new THREE.DepthTexture(1, 1) }, VERDECKUNG, ENTRAUSCHEN);
    this.massstab = 1;
    this.blendIntensity = VERDECKUNG_STAERKE;
  }

  /** läuft schon im super()-Konstruktor (und danach jedes Bild mit der Tiefe des aktuellen Composer-Puffers) */
  setGBuffer(tiefe) {
    this.normalRenderTarget ??= { setSize() {}, dispose() {}, depthTexture: null };
    super.setGBuffer(tiefe);
  }

  setSize(breite, hoehe) {
    super.setSize(Math.max(1, Math.round(breite * this.massstab)), Math.max(1, Math.round(hoehe * this.massstab)));
  }
}

/** Bloom in verkleinerter Auflösung (`massstab` = Anteil der Gerätepixel) – das Ergebnis wird beim Mischen hochskaliert. */
class Leuchten extends UnrealBloomPass {
  massstab = 1;

  setSize(breite, hoehe) {
    super.setSize(Math.max(2, Math.round(breite * this.massstab)), Math.max(2, Math.round(hoehe * this.massstab)));
  }
}

export class Nachbearbeitung {
  /**
   * @param gl           THREE.WebGLRenderer
   * @param zeichneSzene () => void – zeichnet ins aktuell gesetzte Render-Target (löscht selbst)
   * @param optionen     { ssao 0|0.5|1, bloom, fxaa }
   */
  constructor(gl, szene, kamera, zeichneSzene, { ssao, bloom, fxaa }) {
    this.gl = gl;
    this.optionen = { ssao, bloom, fxaa };
    const tiefe = new THREE.DepthTexture(1, 1, THREE.UnsignedInt248Type);
    tiefe.format = THREE.DepthStencilFormat;
    const puffer = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, depthBuffer: true, stencilBuffer: true, depthTexture: tiefe });
    this.composer = new EffectComposer(gl, puffer); // klont den Puffer als zweiten (eigene Tiefentextur)
    this.verdeckung = ssao > 0 ? new Verdeckung(szene, kamera) : null;
    // GTAO muss die Tiefe des Puffers lesen, in den die Szene gerade gezeichnet wurde (Composer tauscht die Puffer)
    this.composer.addPass(new SzenenPass(zeichneSzene, (lesePuffer) => this.verdeckung?.setGBuffer(lesePuffer.depthTexture)));
    if (this.verdeckung) this.composer.addPass(this.verdeckung);
    this.bloom = bloom ? new Leuchten(new THREE.Vector2(256, 256), BLOOM.staerke, BLOOM.radius, BLOOM.schwelleNacht) : null;
    if (this.bloom) this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    if (fxaa) this.composer.addPass(new FXAAPass());
  }

  /** Passen die Optionen noch zu diesem Aufbau? (sonst neu bauen) */
  passtZu({ ssao, bloom, fxaa }) {
    return this.optionen.ssao === ssao && this.optionen.bloom === bloom && this.optionen.fxaa === fxaa;
  }

  setzeGroesse(breite, hoehe, pixelVerhaeltnis) {
    // Effekte in CSS-Pixeln: der Composer reicht Gerätepixel (× pixelVerhaeltnis) an die Passes weiter
    if (this.verdeckung) this.verdeckung.massstab = this.optionen.ssao / pixelVerhaeltnis;
    if (this.bloom) this.bloom.massstab = BLOOM.aufloesung / pixelVerhaeltnis;
    this.composer.setPixelRatio(pixelVerhaeltnis);
    this.composer.setSize(breite, hoehe);
  }

  /** hell 0 (Nacht) … 1 (Mittag): Bloom-Schwelle – tagsüber würden sonst sonnige Flächen ausblühen */
  setzeHelligkeit(hell) {
    if (this.bloom) this.bloom.threshold = BLOOM.schwelleNacht + (BLOOM.schwelleTag - BLOOM.schwelleNacht) * hell;
  }

  zeichne(dt) {
    this.composer.render(dt);
  }

  freigeben() {
    for (const pass of this.composer.passes) pass.dispose?.();
    this.composer.renderTarget1.dispose();
    this.composer.renderTarget2.dispose();
  }
}
