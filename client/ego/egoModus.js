/**
 * EGO-PROTOTYP (Ich-Perspektive) – reines Experiment, nur PC. Taste C schaltet um.
 * Komplett entfernbar: siehe EGO_PROTOTYP.md im Projektstamm (Liste aller berührten Stellen).
 *
 *   - Kamera: in Augenhöhe an der Spielerposition, Blick per Maus (Pointer Lock: Yaw + Pitch)
 *   - WASD relativ zur Blickrichtung (überschreibt eingabe.richtung / blickWinkel, solange aktiv)
 *   - Linksklick schießt/schlägt waagerecht in Blickrichtung (Server unverändert)
 *   - eigene Figur ausgeblendet, Wand-Schnitt aus, Fadenkreuz-Overlay
 * Der Renderer ruft nur `renderer.egoHaken(kamera, fokus)` auf (eine Zeile in renderer.zeichne).
 */
const AUGENHOEHE = 54;
const FOV_EGO = 78;
const NEAR_EGO = 2;
const PITCH_MAX = 1.25;
const EMPFINDLICHKEIT = 0.0024;

export class EgoModus {
  #aktiv = false;
  #yaw = 0;
  #pitch = 0;
  #original = null;

  /** @param holeRenderer () => Renderer|null · holeSpiel () => ClientSpiel|null */
  constructor({ eingabe, leinwand, holeRenderer, holeSpiel }) {
    this.eingabe = eingabe;
    this.leinwand = leinwand;
    this.holeRenderer = holeRenderer;
    this.holeSpiel = holeSpiel;
    this.fadenkreuz = Object.assign(document.createElement('div'), { id: 'ego-fadenkreuz', hidden: true });
    this.fadenkreuz.style.cssText = 'position:fixed;left:50%;top:50%;width:14px;height:14px;margin:-7px 0 0 -7px;pointer-events:none;z-index:5;' +
      'background:radial-gradient(circle,#fff 0 1.5px,transparent 2px),linear-gradient(#fff,#fff) center/1.5px 100% no-repeat,linear-gradient(#fff,#fff) center/100% 1.5px no-repeat;opacity:.8;mix-blend-mode:difference';
    this.hinweis = Object.assign(document.createElement('div'), { hidden: true, textContent: 'Ego-Prototyp: Klick = Maus fangen · C = zurück' });
    this.hinweis.style.cssText = 'position:fixed;left:50%;bottom:90px;transform:translateX(-50%);padding:6px 14px;background:rgba(0,0,0,.6);color:#fff;border-radius:14px;z-index:5;pointer-events:none;font-size:.85rem';
    document.body.append(this.fadenkreuz, this.hinweis);

    window.addEventListener('keydown', (e) => {
      if (e.code !== 'KeyC' || e.repeat || e.ctrlKey || e.metaKey || ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target?.tagName)) return;
      this.umschalten();
    });
    document.addEventListener('mousemove', (e) => {
      if (!this.#aktiv || document.pointerLockElement !== this.leinwand) return;
      this.#yaw += e.movementX * EMPFINDLICHKEIT;
      this.#pitch = Math.max(-PITCH_MAX, Math.min(PITCH_MAX, this.#pitch - e.movementY * EMPFINDLICHKEIT));
    });
    document.addEventListener('pointerlockchange', () => {
      this.hinweis.hidden = !this.#aktiv || document.pointerLockElement === this.leinwand;
    });
    leinwand.addEventListener('click', () => {
      if (this.#aktiv && document.pointerLockElement !== this.leinwand) leinwand.requestPointerLock?.();
    });
  }

  umschalten() {
    this.#aktiv ? this.#aus() : this.#an();
  }

  #an() {
    const renderer = this.holeRenderer();
    const spiel = this.holeSpiel();
    if (!renderer || !spiel) return;
    this.#aktiv = true;
    this.#yaw = spiel.lokal.blick ?? 0;
    this.#pitch = 0;
    const k = renderer.kamera3d;
    this.#original = { fov: k.fov, near: k.near, schnitt: renderer.schnitt.uRadius.value };
    k.fov = FOV_EGO;
    k.near = NEAR_EGO;
    k.updateProjectionMatrix();
    renderer.schnitt.uRadius.value = 0; // kein Wand-Aufschneiden
    renderer.egoHaken = (kamera, fokus) => this.#haken(renderer, kamera, fokus);

    // Steuerung: WASD relativ zur Blickrichtung, Blick = Maus-Yaw (am Eingabe-Objekt überschrieben)
    const e = this.eingabe;
    const richtungOriginal = e.richtung.bind(e);
    const blickOriginal = e.blickWinkel.bind(e);
    e.richtung = () => {
      const o = richtungOriginal();
      const vor = -o.y;
      const seite = o.x;
      const x = Math.cos(this.#yaw) * vor - Math.sin(this.#yaw) * seite;
      const y = Math.sin(this.#yaw) * vor + Math.cos(this.#yaw) * seite;
      const l = Math.hypot(x, y);
      return l > 1 ? { x: x / l, y: y / l } : { x, y };
    };
    e.blickWinkel = () => this.#yaw;
    this.#wiederherstellen = () => {
      delete e.richtung;
      delete e.blickWinkel;
      void richtungOriginal;
      void blickOriginal;
    };
    this.fadenkreuz.hidden = false;
    this.hinweis.hidden = false;
    this.leinwand.requestPointerLock?.();
  }

  #wiederherstellen = () => {};

  #aus() {
    const renderer = this.holeRenderer();
    this.#aktiv = false;
    this.#wiederherstellen();
    if (renderer && this.#original) {
      const k = renderer.kamera3d;
      k.fov = this.#original.fov;
      k.near = this.#original.near;
      k.updateProjectionMatrix();
      renderer.schnitt.uRadius.value = this.#original.schnitt;
      renderer.egoHaken = null;
      for (const f of renderer.figuren.values()) f.gruppe.visible = true;
    }
    this.fadenkreuz.hidden = true;
    this.hinweis.hidden = true;
    if (document.pointerLockElement === this.leinwand) document.exitPointerLock();
  }

  /** Pro Frame vom Renderer: Kamera ins Auge setzen, eigene Figur ausblenden. */
  #haken(renderer, kamera, fokus) {
    const cp = Math.cos(this.#pitch);
    kamera.position.set(fokus.x, AUGENHOEHE, fokus.y);
    kamera.lookAt(fokus.x + Math.cos(this.#yaw) * cp * 100, AUGENHOEHE + Math.sin(this.#pitch) * 100, fokus.y + Math.sin(this.#yaw) * cp * 100);
    const figur = renderer.figuren.get(fokus.id);
    if (figur) figur.gruppe.visible = false;
  }
}
