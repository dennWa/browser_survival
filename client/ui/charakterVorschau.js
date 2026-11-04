import * as THREE from 'three';

/**
 * Charakter-Vorschau im Inventar (Runde 23): die eigene Spielfigur (Quaternius-Adventurer, wie im Spiel) auf eigenem kleinen
 * WebGL-Kontext, Idle-Animation, mit Maus/Finger drehbar. Läuft nur, solange das Inventar offen ist (eigene RAF-Schleife).
 * Figur kommt vom Spiel-Renderer (`renderer.vorschauFigur(aussehen, kleidung)`, gleiche Modelle/Materialien/Kleidung).
 * Kein WebGL → Canvas bleibt leer (Ausrüstungs-Slots funktionieren trotzdem).
 * Runde 28: auch in der Charaktererstellung (Hauptmenü); `fotografiere()` = Standbild für die Spielstand-Karten.
 */
/** Szene mit Licht, Bodenschatten und Kamera (Figur ≈ 64 Einheiten hoch) – für Vorschau und Fotos. */
function baueBuehne() {
  const szene = new THREE.Scene();
  szene.add(new THREE.HemisphereLight(0xdfe8ff, 0x3a3226, 1.6));
  const sonne = new THREE.DirectionalLight(0xfff1dc, 2.4);
  sonne.position.set(60, 120, 90);
  szene.add(sonne);
  const rand = new THREE.DirectionalLight(0x9fc4ff, 1.2);
  rand.position.set(-80, 60, -70);
  szene.add(rand);
  // Boden-Schein unter der Figur
  const boden = new THREE.Mesh(new THREE.CircleGeometry(26, 32), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35 }));
  boden.rotation.x = -Math.PI / 2;
  szene.add(boden);
  const kamera = new THREE.PerspectiveCamera(28, 2 / 3, 1, 1000);
  kamera.position.set(0, 44, 150);
  kamera.lookAt(0, 32, 0);
  return { szene, kamera };
}

let foto = null; // { renderer, szene, kamera, canvas } – ein gemeinsamer Kontext für alle Fotos

/**
 * Runde 28: Standbild einer Figur (Spielstand-Karten im Hauptmenü) als Data-URL – oder null (3D noch nicht da / kein WebGL).
 */
export function fotografiere(spielRenderer, aussehen, breite = 240, hoehe = 320) {
  if (!spielRenderer?.vorschauFigur) return null;
  try {
    if (!foto) {
      const canvas = document.createElement('canvas');
      const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, preserveDrawingBuffer: true });
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      foto = { renderer, canvas, ...baueBuehne() };
    }
    const figur = spielRenderer.vorschauFigur(aussehen, null);
    if (!figur) return null;
    figur.mixer.update(0.4);
    figur.gruppe.rotation.y = -0.3;
    foto.szene.add(figur.gruppe);
    foto.renderer.setSize(breite, hoehe, false);
    foto.kamera.aspect = breite / hoehe;
    foto.kamera.updateProjectionMatrix();
    foto.renderer.render(foto.szene, foto.kamera);
    const url = foto.canvas.toDataURL('image/png');
    foto.szene.remove(figur.gruppe);
    return url;
  } catch {
    return null;
  }
}

export class CharakterVorschau {
  #renderer = null;
  #szene = null;
  #kamera = null;
  #figur = null;
  #stand = '';
  #laeuft = false;
  #letzte = 0;
  #drehung = -0.35;
  #ziehX = null;

  constructor(canvas) {
    this.canvas = canvas;
    /** Spiel-Renderer (main.js setzt ihn, sobald 3D geladen ist) */
    this.spielRenderer = null;
    canvas.addEventListener('pointerdown', (e) => {
      this.#ziehX = e.clientX;
      canvas.setPointerCapture?.(e.pointerId);
    });
    canvas.addEventListener('pointermove', (e) => {
      if (this.#ziehX === null) return;
      this.#drehung += (e.clientX - this.#ziehX) * 0.012;
      this.#ziehX = e.clientX;
    });
    const los = () => (this.#ziehX = null);
    canvas.addEventListener('pointerup', los);
    canvas.addEventListener('pointercancel', los);
  }

  #aufbauen() {
    if (this.#renderer) return true;
    try {
      this.#renderer = new THREE.WebGLRenderer({ canvas: this.canvas, alpha: true, antialias: true });
    } catch {
      return false;
    }
    this.#renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.#renderer.outputColorSpace = THREE.SRGBColorSpace;
    ({ szene: this.#szene, kamera: this.#kamera } = baueBuehne());
    return true;
  }

  /** Figur zeigen bzw. neu bauen, wenn sich Aussehen/Kleidung geändert hat. */
  setze(aussehen, kleidung) {
    const stand = JSON.stringify([aussehen ?? null, kleidung ?? null]);
    if (stand === this.#stand && this.#figur) return;
    if (!this.spielRenderer?.vorschauFigur || !this.#aufbauen()) return;
    const figur = this.spielRenderer.vorschauFigur(aussehen, kleidung);
    if (!figur) return;
    this.#stand = stand;
    if (this.#figur) this.#szene.remove(this.#figur.gruppe);
    this.#figur = figur;
    this.#szene.add(figur.gruppe);
    // Runde 32: Figur-Modell wird noch geladen → danach neu aufbauen
    figur.wartet?.then(() => {
      if (this.#stand !== stand) return;
      this.#stand = null;
      this.setze(aussehen, kleidung);
    });
  }

  start() {
    if (this.#laeuft) return;
    this.#laeuft = true;
    this.#letzte = performance.now();
    const schleife = (jetzt) => {
      if (!this.#laeuft) return;
      const dt = Math.min(0.1, (jetzt - this.#letzte) / 1000);
      this.#letzte = jetzt;
      this.#zeichne(dt);
      requestAnimationFrame(schleife);
    };
    requestAnimationFrame(schleife);
  }

  stop() {
    this.#laeuft = false;
  }

  #zeichne(dt) {
    if (!this.#renderer || !this.#figur) return;
    const b = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    if (b > 0 && h > 0 && (this.canvas.width !== Math.round(b * this.#renderer.getPixelRatio()) || this.canvas.height !== Math.round(h * this.#renderer.getPixelRatio()))) {
      this.#renderer.setSize(b, h, false);
      this.#kamera.aspect = b / h;
      this.#kamera.updateProjectionMatrix();
    }
    this.#figur.mixer.update(dt);
    this.#figur.gruppe.rotation.y = this.#drehung;
    this.#renderer.render(this.#szene, this.#kamera);
  }
}
