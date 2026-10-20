/**
 * Seitenleiste mit Reitern (links: Assets · Prefabs · Zonen · Räume, rechts: Inspektor · Ebenen · Prüfung, KI-Helfer).
 * Ein Reiter = Zeichenfunktion, die `this.el` füllt. Er wird neu gezeichnet, wenn eines seiner Ereignisse kommt
 * (Standard: 'zone', 'karte' – Kartenänderungen verzögert und nicht, solange man im Reiter tippt).
 *   registriere(name, zeichne, { ereignisse, beschriftung, ohneKarte })
 *   zeige(name) · zeichne() · reiter (Map) · aktiv · el
 * `beschriftung` = Funktion für den Reiter-Text (z. B. Prüfung mit Fehlerzähler) – wird bei jedem Ereignis aktualisiert.
 */
const ALLE_EREIGNISSE = ['karte', 'auswahl', 'zone', 'werkzeug', 'pruefung', 'ebenen', 'eintrag', 'bibliothek', 'vorlagen'];

export class Seitenleiste {
  constructor({ wurzel, zustand }) {
    this.wurzel = wurzel;
    this.zustand = zustand;
    this.elReiter = wurzel.querySelector('.reiter');
    this.el = wurzel.querySelector('.inhalt');
    this.reiter = new Map();
    this.optionen = new Map();
    this.aktiv = null;
    this.#timer = null;
    for (const ereignis of ALLE_EREIGNISSE)
      zustand.bei(ereignis, () => {
        this.beschrifte();
        if (!this.aktiv || this.wurzel.hidden || !this.#optionen(this.aktiv).ereignisse.includes(ereignis)) return;
        if (ereignis === 'karte') this.#spaeter();
        else this.zeichne();
      });
  }

  #timer;

  #optionen(name) {
    return { ereignisse: ['zone', 'karte'], beschriftung: null, ohneKarte: false, ...this.optionen.get(name) };
  }

  registriere(name, zeichne, optionen = {}) {
    this.reiter.set(name, zeichne);
    this.optionen.set(name, optionen);
    this.aktiv ??= name;
    this.beschrifte(true);
  }

  entferne(name) {
    this.reiter.delete(name);
    this.optionen.delete(name);
    if (this.aktiv === name) this.aktiv = this.reiter.keys().next().value ?? null;
    this.zeichne();
  }

  #spaeter() {
    // Während man im Reiter tippt, nicht neu bauen (Fokus bliebe sonst nicht erhalten)
    clearTimeout(this.#timer);
    this.#timer = setTimeout(() => {
      // Nur beim Tippen (Text-/Zahlfeld) nicht neu bauen – nach Auswahllisten/Haken ruhig (neue Felder erscheinen sofort)
      const a = document.activeElement;
      const tippt = this.el.contains(a) && (a.tagName === 'TEXTAREA' || (a.tagName === 'INPUT' && !['checkbox', 'radio', 'range', 'color', 'button'].includes(a.type)));
      if (!tippt) this.zeichne();
    }, 120);
  }

  zeige(name) {
    if (!this.reiter.has(name)) return;
    this.aktiv = name;
    this.zeichne();
  }

  /** Reiterleiste (neu) aufbauen bzw. nur die Texte aktualisieren */
  beschrifte(neu = false) {
    if (neu || this.elReiter.children.length !== this.reiter.size) {
      this.elReiter.innerHTML = '';
      for (const name of this.reiter.keys()) {
        const b = document.createElement('button');
        b.type = 'button';
        b.dataset.reiter = name;
        b.setAttribute('role', 'tab');
        b.addEventListener('click', () => this.zeige(name));
        this.elReiter.append(b);
      }
      this.elReiter.hidden = this.reiter.size < 2;
    }
    for (const b of this.elReiter.children) {
      const name = b.dataset.reiter;
      b.textContent = this.#optionen(name).beschriftung?.() ?? name;
      b.classList.toggle('aktiv', name === this.aktiv);
      b.setAttribute('aria-selected', String(name === this.aktiv));
    }
  }

  zeichne() {
    this.beschrifte();
    const name = this.aktiv;
    if (!name) return;
    if (!this.zustand.karte && !this.#optionen(name).ohneKarte) {
      this.el.innerHTML = '<p class="leise">Keine Zone geöffnet – Datei → Neu oder Öffnen.</p>';
      return;
    }
    this.reiter.get(name)?.();
  }
}
