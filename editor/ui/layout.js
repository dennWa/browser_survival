/**
 * Layout des Editors (Editor 2.0, Schritt 1.3): Seitenleisten links (Assets …), rechts (Inspektor …) und KI ein-/ausklappen,
 * Breite per Griff ziehen, Fokus-Modus (Tab: nur Karte). Auf schmalen Bildschirmen (≤ 900 px) sind die Leisten
 * Schubladen über der Karte – immer nur eine offen. Gemerkt in localStorage `browserSurvival.editorLayout`.
 */
const SPEICHER = 'browserSurvival.editorLayout';
const SCHMAL = window.matchMedia('(max-width: 900px)');
const GRENZEN = { links: [200, 480], rechts: [240, 560], ki: [280, 620] };

export class Layout {
  constructor({ leisten, beiAenderung }) {
    /** name → Seitenleiste (links, rechts, ki) */
    this.leisten = leisten;
    this.beiAenderung = beiAenderung;
    this.fokus = false;
    this.vorFokus = null;
    const g = lies();
    this.breiten = { links: 286, rechts: 300, ki: 360, ...g.breiten };
    const offen = { links: true, rechts: true, ki: false, ...g.offen };
    for (const [name, l] of Object.entries(leisten)) {
      l.wurzel.hidden = SCHMAL.matches ? true : !offen[name];
      this.#griff(name, l.wurzel);
    }
    this.#breitenSetzen();
    SCHMAL.addEventListener('change', () => {
      for (const l of Object.values(leisten)) l.wurzel.hidden = SCHMAL.matches ? true : l.wurzel.hidden;
      this.#melde();
    });
    // Handy: Tippen auf die Karte schließt die Schublade
    document.getElementById('flaeche').addEventListener('pointerdown', () => {
      if (SCHMAL.matches) for (const l of Object.values(leisten)) l.wurzel.hidden = true;
    });
  }

  sichtbar(name) {
    return !this.leisten[name]?.wurzel.hidden;
  }

  zeige(name) {
    const l = this.leisten[name];
    if (!l) return;
    if (SCHMAL.matches) for (const [n, x] of Object.entries(this.leisten)) if (n !== name) x.wurzel.hidden = true;
    if (l.wurzel.hidden) {
      l.wurzel.hidden = false;
      l.zeichne();
    }
    this.fokus = false;
    this.#melde();
  }

  verstecke(name) {
    const l = this.leisten[name];
    if (l) l.wurzel.hidden = true;
    this.#melde();
  }

  umschalten(name) {
    this.sichtbar(name) ? this.verstecke(name) : this.zeige(name);
  }

  /** Leiste zeigen und Reiter wählen */
  zeigeReiter(name, reiter) {
    this.zeige(name);
    this.leisten[name]?.zeige(reiter);
  }

  fokusUmschalten() {
    if (this.fokus) {
      for (const [n, offen] of Object.entries(this.vorFokus ?? {})) this.leisten[n].wurzel.hidden = !offen;
      this.fokus = false;
    } else {
      this.vorFokus = Object.fromEntries(Object.keys(this.leisten).map((n) => [n, this.sichtbar(n)]));
      for (const l of Object.values(this.leisten)) l.wurzel.hidden = true;
      this.fokus = true;
    }
    this.#melde();
  }

  #breitenSetzen() {
    const wurzel = document.documentElement.style;
    for (const [n, b] of Object.entries(this.breiten)) wurzel.setProperty(`--breite-${n}`, `${b}px`);
  }

  /** Ziehgriff an der Innenkante einer Leiste */
  #griff(name, wurzel) {
    const griff = document.createElement('div');
    griff.className = `ziehgriff ziehgriff-${name === 'links' ? 'rechts' : 'links'}`;
    griff.title = 'Breite ziehen (Doppelklick = Standard)';
    wurzel.append(griff);
    let start = null;
    griff.addEventListener('pointerdown', (e) => {
      griff.setPointerCapture(e.pointerId);
      start = { x: e.clientX, b: this.breiten[name] };
    });
    griff.addEventListener('pointermove', (e) => {
      if (!start) return;
      const d = (e.clientX - start.x) * (name === 'links' ? 1 : -1);
      const [min, max] = GRENZEN[name];
      this.breiten[name] = Math.round(Math.max(min, Math.min(max, start.b + d)));
      this.#breitenSetzen();
    });
    griff.addEventListener('pointerup', () => {
      start = null;
      this.#melde();
    });
    griff.addEventListener('dblclick', () => {
      this.breiten[name] = { links: 286, rechts: 300, ki: 360 }[name];
      this.#breitenSetzen();
      this.#melde();
    });
  }

  #melde() {
    if (!SCHMAL.matches && !this.fokus) schreibe({ breiten: this.breiten, offen: Object.fromEntries(Object.keys(this.leisten).map((n) => [n, this.sichtbar(n)])) });
    else schreibe({ ...lies(), breiten: this.breiten });
    this.beiAenderung?.();
  }
}

function lies() {
  try {
    return JSON.parse(localStorage.getItem(SPEICHER) ?? '{}') ?? {};
  } catch {
    return {};
  }
}

function schreibe(w) {
  try {
    localStorage.setItem(SPEICHER, JSON.stringify(w));
  } catch {
    /* gesperrter Speicher */
  }
}
