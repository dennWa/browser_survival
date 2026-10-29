/**
 * Welt-gebundene HUD-Elemente (Runde 23), Position jedes Bild über kamera.weltZuBildschirm:
 *  - „+N <Icon>“ an der Abbaustelle (Baum/Stein/Eisen; Ereignis `abgebaut{menge,bonus}`) – steigt auf und blendet aus.
 *  - schmaler Fortschrittsbalken direkt über dem Baum/Stein, solange man abbaut (statt „Baum fällen …“-Text).
 */
const DAUER_MS = 2000;

export class WeltPopups {
  #popups = []; // { el, x, y, h, start }

  constructor(dokument, huelle, zeichneIcon) {
    this.dokument = dokument;
    this.huelle = huelle;
    this.zeichneIcon = zeichneIcon;
    this.balken = Object.assign(dokument.createElement('div'), { className: 'welt-balken', hidden: true });
    this.balken.append(Object.assign(dokument.createElement('div'), { className: 'welt-balken-fuellung' }));
    huelle.append(this.balken);
    this.balkenZiel = null; // { x, y, hoehe, fortschritt }
  }

  /** „+menge“ mit Item-Icon an Weltposition (x, y); hoehe = Weltmaß über dem Boden. */
  plus(defId, menge, x, y, hoehe = 40, versatz = 0) {
    const el = Object.assign(this.dokument.createElement('div'), { className: 'welt-plus' });
    el.append(Object.assign(this.dokument.createElement('b'), { textContent: `+${menge}` }));
    const icon = Object.assign(this.dokument.createElement('canvas'), { width: 64, height: 64 });
    this.zeichneIcon(icon, defId);
    el.append(icon);
    this.huelle.append(el);
    this.#popups.push({ el, x, y, h: hoehe, start: performance.now() + versatz });
  }

  /** Abbau-Fortschritt (0..1) an Weltposition oder null = ausblenden. */
  setzeBalken(ziel) {
    this.balkenZiel = ziel;
  }

  /** Jedes Bild: Positionen nachziehen, abgelaufene Popups entfernen. */
  aktualisiere(kamera, jetzt = performance.now()) {
    for (let i = this.#popups.length - 1; i >= 0; i--) {
      const p = this.#popups[i];
      const t = (jetzt - p.start) / DAUER_MS;
      if (t >= 1) {
        p.el.remove();
        this.#popups.splice(i, 1);
        continue;
      }
      const b = kamera.weltZuBildschirm(p.x, p.y, p.h);
      p.el.style.opacity = t < 0 ? '0' : String(Math.min(1, (1 - t) * 2.5));
      p.el.style.transform = `translate(${Math.round(b.x)}px, ${Math.round(b.y - Math.max(0, t) * 46)}px) translate(-50%, -100%) scale(${0.85 + Math.min(1, Math.max(0, t) * 6) * 0.15})`;
    }
    const z = this.balkenZiel;
    this.balken.hidden = !z;
    if (!z) return;
    const b = kamera.weltZuBildschirm(z.x, z.y, z.hoehe ?? 70);
    this.balken.style.transform = `translate(${Math.round(b.x)}px, ${Math.round(b.y)}px) translate(-50%, -100%)`;
    this.balken.firstChild.style.width = `${Math.round(Math.min(1, Math.max(0, z.fortschritt)) * 100)}%`;
  }
}
