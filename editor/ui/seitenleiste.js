/**
 * Seitenleiste mit Reitern (links: Assets · Prefabs · Zonen · Räume, rechts: Inspektor · Ebenen · Prüfung, KI-Helfer).
 * Ein Reiter = Zeichenfunktion, die `this.el` füllt. Er wird neu gezeichnet, wenn eines seiner Ereignisse kommt
 * (Standard: 'zone', 'karte' – Kartenänderungen verzögert und nicht, solange man im Reiter tippt).
 *   registriere(name, zeichne, { ereignisse, beschriftung, ohneKarte, gruppe })
 * `gruppe` (Phase 10.7): mehrere Reiter teilen sich EINEN Knopf oben (z. B. „🗺 Projekt“ = Zonen · Räume · Prefabs); darunter
 * erscheint eine kleine Unter-Reiterleiste. Die Unter-Knöpfe tragen `data-reiter=<name>`, der Gruppenknopf `data-reiter=<gruppe>`.
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
    this.elUnter = document.createElement('div');
    this.elUnter.className = 'unterreiter';
    this.elUnter.setAttribute('role', 'tablist');
    this.elUnter.hidden = true;
    this.el.before(this.elUnter);
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
    return { ereignisse: ['zone', 'karte'], beschriftung: null, ohneKarte: false, gruppe: null, ...this.optionen.get(name) };
  }

  /** Knöpfe der oberen Leiste: Einzel-Reiter oder Gruppe (erster Reiter der Gruppe vertritt sie) */
  #oben() {
    const liste = [];
    for (const name of this.reiter.keys()) {
      const g = this.#optionen(name).gruppe;
      if (!g) liste.push({ name, ziel: name });
      else if (!liste.some((x) => x.name === g)) liste.push({ name: g, ziel: name, gruppe: g });
    }
    return liste;
  }

  /** Gruppe zeigen: zuletzt benutzter Reiter der Gruppe */
  #zeigeGruppe(g) {
    const mitglieder = [...this.reiter.keys()].filter((n) => this.#optionen(n).gruppe === g);
    this.zeige(mitglieder.includes(this.letzte?.[g]) ? this.letzte[g] : mitglieder[0]);
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
    if (!this.reiter.has(name)) {
      if (this.#oben().some((x) => x.gruppe === name)) this.#zeigeGruppe(name);
      return;
    }
    this.aktiv = name;
    const g = this.#optionen(name).gruppe;
    if (g) (this.letzte ??= {})[g] = name;
    this.zeichne();
  }

  /** Reiterleiste (neu) aufbauen bzw. nur die Texte aktualisieren */
  beschrifte(neu = false) {
    const oben = this.#oben();
    if (neu || this.elReiter.children.length !== oben.length) {
      this.elReiter.innerHTML = '';
      for (const x of oben) {
        const b = document.createElement('button');
        b.type = 'button';
        b.dataset.reiter = x.name;
        b.setAttribute('role', 'tab');
        b.addEventListener('click', () => (x.gruppe ? this.#zeigeGruppe(x.gruppe) : this.zeige(x.name)));
        this.elReiter.append(b);
      }
      this.elReiter.hidden = oben.length < 2;
    }
    const gruppe = this.aktiv ? this.#optionen(this.aktiv).gruppe : null;
    for (const b of this.elReiter.children) {
      const name = b.dataset.reiter;
      const an = name === this.aktiv || (gruppe && name === gruppe);
      b.textContent = this.reiter.has(name) ? (this.#optionen(name).beschriftung?.() ?? name) : name;
      b.classList.toggle('aktiv', !!an);
      b.setAttribute('aria-selected', String(!!an));
    }
    // Unter-Reiter der aktiven Gruppe
    this.elUnter.hidden = !gruppe;
    if (gruppe) {
      const mitglieder = [...this.reiter.keys()].filter((n) => this.#optionen(n).gruppe === gruppe);
      if (this.elUnter.dataset.gruppe !== gruppe || this.elUnter.children.length !== mitglieder.length) {
        this.elUnter.dataset.gruppe = gruppe;
        this.elUnter.innerHTML = '';
        for (const name of mitglieder) {
          const b = document.createElement('button');
          b.type = 'button';
          b.dataset.reiter = name;
          b.setAttribute('role', 'tab');
          b.addEventListener('click', () => this.zeige(name));
          this.elUnter.append(b);
        }
      }
      for (const b of this.elUnter.children) {
        b.textContent = this.#optionen(b.dataset.reiter).beschriftung?.() ?? b.dataset.reiter;
        b.classList.toggle('aktiv', b.dataset.reiter === this.aktiv);
      }
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
