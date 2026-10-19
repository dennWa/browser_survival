/**
 * EGO-PROTOTYP (Ich-Perspektive) – reines Experiment, nur PC. Taste C schaltet um.
 * Komplett entfernbar: siehe EGO_PROTOTYP.md im Projektstamm (Liste aller berührten Stellen).
 *
 *   - Kamera: in Augenhöhe an der Spielerposition, Blick per Maus (Pointer Lock: Yaw + Pitch)
 *   - WASD relativ zur Blickrichtung (überschreibt eingabe.richtung / blickWinkel, solange aktiv)
 *   - Linksklick schießt/schlägt waagerecht in Blickrichtung (Server unverändert)
 *   - Alt gedrückt halten = Maus frei (HUD/Inventar anklicken), loslassen fängt sie wieder
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
  #altGehalten = false;
  #blickVersatz = 0; // im Auto: Kopfdrehung gegenüber der Fahrtrichtung (federt zurück)
  #fahrtWinkel = null;
  #letzteZeit = 0;

  /** @param holeRenderer () => Renderer|null · holeSpiel () => ClientSpiel|null */
  constructor({ eingabe, leinwand, holeRenderer, holeSpiel }) {
    this.eingabe = eingabe;
    this.leinwand = leinwand;
    this.holeRenderer = holeRenderer;
    this.holeSpiel = holeSpiel;
    this.fadenkreuz = Object.assign(document.createElement('div'), { id: 'ego-fadenkreuz', hidden: true });
    this.fadenkreuz.style.cssText = 'position:fixed;left:50%;top:50%;width:14px;height:14px;margin:-7px 0 0 -7px;pointer-events:none;z-index:5;' +
      'background:radial-gradient(circle,#fff 0 1.5px,transparent 2px),linear-gradient(#fff,#fff) center/1.5px 100% no-repeat,linear-gradient(#fff,#fff) center/100% 1.5px no-repeat;opacity:.8;mix-blend-mode:difference';
    this.hinweis = Object.assign(document.createElement('div'), { hidden: true, textContent: 'Ich-Perspektive: Klick = Maus fangen · Alt halten = Maus frei fürs HUD · C = zurück' });
    this.hinweis.style.cssText = 'position:fixed;left:50%;bottom:90px;transform:translateX(-50%);padding:6px 14px;background:rgba(0,0,0,.6);color:#fff;border-radius:14px;z-index:5;pointer-events:none;font-size:.85rem';
    document.body.append(this.fadenkreuz, this.hinweis);

    window.addEventListener('keydown', (e) => {
      if (e.code !== 'KeyC' || e.repeat || e.ctrlKey || e.metaKey || ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target?.tagName)) return;
      this.umschalten();
    });
    document.addEventListener('mousemove', (e) => {
      if (!this.#aktiv || document.pointerLockElement !== this.leinwand) return;
      if (this.#fahrtWinkel !== null) this.#blickVersatz = Math.max(-2, Math.min(2, this.#blickVersatz + e.movementX * EMPFINDLICHKEIT));
      else this.#yaw += e.movementX * EMPFINDLICHKEIT;
      this.#pitch = Math.max(-PITCH_MAX, Math.min(PITCH_MAX, this.#pitch - e.movementY * EMPFINDLICHKEIT));
    });
    document.addEventListener('pointerlockchange', () => {
      this.hinweis.hidden = !this.#aktiv || document.pointerLockElement === this.leinwand;
    });
    leinwand.addEventListener('click', () => {
      if (this.#aktiv && !this.#altGehalten && document.pointerLockElement !== this.leinwand) leinwand.requestPointerLock?.();
    });
    // ALT gedrückt halten: Maus wird frei (HUD, Inventar, Karte anklicken); loslassen fängt sie wieder ein
    window.addEventListener('keydown', (e) => {
      if (!this.#aktiv || (e.code !== 'AltLeft' && e.code !== 'AltRight')) return;
      e.preventDefault(); // Alt würde sonst die Menüleiste des Browsers fokussieren
      if (this.#altGehalten) return;
      this.#altGehalten = true;
      if (document.pointerLockElement === this.leinwand) document.exitPointerLock();
    });
    window.addEventListener('keyup', (e) => {
      if (e.code !== 'AltLeft' && e.code !== 'AltRight') return;
      this.#altGehalten = false;
      if (this.#aktiv && document.pointerLockElement !== this.leinwand) {
        // Manche Browser verlangen dafür eine Geste: dann reicht ein Klick aufs Spielfeld
        Promise.resolve(leinwand.requestPointerLock?.()).catch(() => {});
      }
    });
    window.addEventListener('blur', () => (this.#altGehalten = false));
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
    this.#blickVersatz = 0;
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
      // Im Auto: W/S = Gas/Bremse, A/D = Lenken (fahre() erwartet das Eingabe-Rohformat, nicht Blick-relative Weltrichtung)
      if (this.holeSpiel()?.lokal.fahrzeug) return o;
      const vor = -o.y;
      const seite = o.x;
      const x = Math.cos(this.#yaw) * vor - Math.sin(this.#yaw) * seite;
      const y = Math.sin(this.#yaw) * vor + Math.cos(this.#yaw) * seite;
      const l = Math.hypot(x, y);
      return l > 1 ? { x: x / l, y: y / l } : { x, y };
    };
    e.blickWinkel = () => this.#yaw;
    e.neigung = () => this.#pitch; // Server: Treffer auf Gelände nur, wenn die Höhe passt (nach oben zielen)
    this.#wiederherstellen = () => {
      delete e.richtung;
      delete e.blickWinkel;
      delete e.neigung;
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
    const jetzt = performance.now();
    const dt = Math.min(0.1, (jetzt - this.#letzteZeit) / 1000);
    this.#letzteZeit = jetzt;
    let augenX = fokus.x;
    let augenY = fokus.y;
    let hoehe = AUGENHOEHE;
    let fov = FOV_EGO;
    if (fokus.fahrzeugId && fokus.fahrzeugWinkel !== undefined) {
      // Im Auto: Kamera sitzt am Steuer und schaut in Fahrtrichtung; Maus dreht nur den Kopf (±2 rad) und federt zurück
      this.#fahrtWinkel = fokus.fahrzeugWinkel;
      this.#blickVersatz *= Math.max(0, 1 - 1.6 * dt);
      this.#yaw = this.#fahrtWinkel + this.#blickVersatz;
      augenX += Math.cos(this.#fahrtWinkel) * 6;
      augenY += Math.sin(this.#fahrtWinkel) * 6;
      hoehe = AUGENHOEHE - 8;
      fov += Math.min(1, Math.abs(fokus.fahrzeugTempo ?? 0) / 340) * 14; // schneller = weiteres Sichtfeld
    } else if (this.#fahrtWinkel !== null) {
      this.#yaw = this.#fahrtWinkel + this.#blickVersatz; // beim Aussteigen in der aktuellen Blickrichtung bleiben
      this.#fahrtWinkel = null;
      this.#blickVersatz = 0;
    }
    if (Math.abs(kamera.fov - fov) > 0.05) {
      kamera.fov += (fov - kamera.fov) * Math.min(1, dt * 4);
      kamera.updateProjectionMatrix();
    }
    const cp = Math.cos(this.#pitch);
    hoehe += renderer.bodenHoehe?.(augenX, augenY) ?? 0; // Gelände: Augen über dem Boden darunter
    kamera.position.set(augenX, hoehe, augenY);
    kamera.lookAt(augenX + Math.cos(this.#yaw) * cp * 100, hoehe + Math.sin(this.#pitch) * 100, augenY + Math.sin(this.#yaw) * cp * 100);
    const figur = renderer.figuren.get(fokus.id);
    if (figur) figur.gruppe.visible = false;
  }
}
